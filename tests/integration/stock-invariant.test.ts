/**
 * Stock invariant: on-hand(batch, store) === SUM(inventory_movements.quantity)
 * and never negative — checked after EVERY flow (receive → issue → transfer →
 * count adjustment → return), plus the no-negative guard on over-issue.
 *
 * Flows run through the movement engine (`src/modules/stock/movements.ts`) —
 * the exact functions every stock action handler calls inside its
 * db.transaction. (`defineAction` wrappers need a request session, which
 * integration tests bypass per ARCHITECTURE §14.)
 *
 * Orchestrator-only (shared test DB): `pnpm test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { itemBatches, items, suppliers } from "@/db/schema";
import { addDays, todayLagos } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import {
  batchOnHand,
  issueFefo,
  postMovement,
  postTransfer,
} from "@/modules/stock/movements";
import { roundQty } from "@/modules/stock/logic";
import { listStockItems } from "@/modules/stock/stock-queries";
import { closeTestDb, getTestDb, truncateAll } from "../helpers/db";
import { createTestOrg, type TestOrg } from "../factories";

let org: TestOrg;
let ctx: Ctx;
let itemId: string;
/** expiry today+200 */
let batchA: string;
/** expiry today+20 — FEFO picks it first */
let batchB: string;
let storeMain: string;
let storeCold: string;

/** The test's own ledger: what on-hand MUST be after each flow. */
const expected = new Map<string, number>();
const key = (batchId: string, storeId: string) => `${batchId}|${storeId}`;
function expect_(batchId: string, storeId: string, delta: number) {
  const k = key(batchId, storeId);
  expected.set(k, roundQty((expected.get(k) ?? 0) + delta));
}

async function rawSums(): Promise<Map<string, number>> {
  const res = await getTestDb().execute<{
    item_batch_id: string;
    store_id: string;
    qty: string;
  }>(sql`
    select item_batch_id, store_id, sum(quantity)::text as qty
    from inventory_movements
    where organisation_id = ${org.orgId}
    group by item_batch_id, store_id
  `);
  return new Map(
    res.rows.map((r) => [key(r.item_batch_id, r.store_id), Number(r.qty)]),
  );
}

async function movementCount(): Promise<number> {
  const res = await getTestDb().execute<{ n: string }>(sql`
    select count(*)::text as n from inventory_movements
    where organisation_id = ${org.orgId}
  `);
  return Number(res.rows[0].n);
}

/** The invariant, asserted after every flow. */
async function assertInvariant(label: string): Promise<void> {
  const raw = await rawSums();

  // 1. Raw SUM(movements) per (batch, store) equals the test ledger.
  for (const [k, qty] of expected) {
    expect(raw.get(k) ?? 0, `${label}: raw sum for ${k}`).toBeCloseTo(qty, 3);
  }
  for (const k of raw.keys()) {
    expect(expected.has(k), `${label}: unexpected movements at ${k}`).toBe(true);
  }

  // 2. Never negative anywhere (raw SQL, not our own math).
  const neg = await getTestDb().execute<{ n: string }>(sql`
    select count(*)::text as n from (
      select 1 from inventory_movements
      where organisation_id = ${org.orgId}
      group by item_batch_id, store_id
      having sum(quantity) < 0
    ) t
  `);
  expect(Number(neg.rows[0].n), `${label}: negative on-hand rows`).toBe(0);

  // 3. The engine's on-hand agrees with the raw sum for every (batch, store).
  for (const batchId of [batchA, batchB]) {
    for (const storeId of org.storeIds) {
      const engine = await db.transaction((tx) =>
        batchOnHand(tx, ctx, batchId, storeId),
      );
      expect(engine, `${label}: batchOnHand ${batchId}@${storeId}`).toBeCloseTo(
        raw.get(key(batchId, storeId)) ?? 0,
        3,
      );
    }
  }

  // 4. The stock list aggregate (per item, all stores) agrees too.
  const rawItemTotal = roundQty([...raw.values()].reduce((s, q) => s + q, 0));
  const list = await listStockItems(ctx);
  const row = list.find((r) => r.id === itemId);
  expect(row, `${label}: item missing from stock list`).toBeDefined();
  expect(row!.onHand, `${label}: stock list on-hand`).toBeCloseTo(
    rawItemTotal,
    3,
  );
}

beforeAll(async () => {
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("app db is not pointed at a test database");
  }
  await truncateAll();
  const tdb = getTestDb();
  // inventory: false — this suite sweeps ALL org movements against its own
  // ledger, so the factory's baseline receive movement must not exist.
  org = await createTestOrg(tdb, { name: "Invariant Farm", inventory: false });
  ctx = org.ctx.storekeeper;
  [storeMain, storeCold] = org.storeIds;

  const [supplier] = await tdb
    .insert(suppliers)
    .values({ organisationId: org.orgId, name: "Agro Supplies Ltd" })
    .returning({ id: suppliers.id });
  const [item] = await tdb
    .insert(items)
    .values({
      organisationId: org.orgId,
      name: "Calcium Nitrate",
      category: "fertiliser",
      baseUnit: "kg",
      reorderLevel: "5",
      nPct: "15.50",
      pPct: "0.00",
      kPct: "0.00",
    })
    .returning({ id: items.id });
  itemId = item.id;
  const today = todayLagos();
  const batches = await tdb
    .insert(itemBatches)
    .values([
      {
        organisationId: org.orgId,
        itemId,
        supplierId: supplier.id,
        batchNumber: "CN-A",
        expiryDate: addDays(today, 200),
        unitCostKobo: "150.000000",
        receivedAt: new Date("2026-01-10T09:00:00Z"),
      },
      {
        organisationId: org.orgId,
        itemId,
        supplierId: supplier.id,
        batchNumber: "CN-B",
        expiryDate: addDays(today, 20),
        unitCostKobo: "140.000000",
        receivedAt: new Date("2026-02-10T09:00:00Z"),
      },
    ])
    .returning({ id: itemBatches.id, batchNumber: itemBatches.batchNumber });
  batchA = batches.find((b) => b.batchNumber === "CN-A")!.id;
  batchB = batches.find((b) => b.batchNumber === "CN-B")!.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe("stock invariant across every flow", () => {
  it("receive", async () => {
    await db.transaction(async (tx) => {
      await postMovement(tx, ctx, {
        batchId: batchA,
        storeId: storeMain,
        type: "receive",
        quantity: 10,
      });
      await postMovement(tx, ctx, {
        batchId: batchB,
        storeId: storeMain,
        type: "receive",
        quantity: 5.5,
      });
    });
    expect_(batchA, storeMain, 10);
    expect_(batchB, storeMain, 5.5);
    await assertInvariant("after receive");
  });

  it("issue (FEFO splits earliest expiry first)", async () => {
    const out = await db.transaction((tx) =>
      issueFefo(tx, ctx, {
        itemId,
        storeId: storeMain,
        quantity: 7,
        greenhouseId: org.greenhouseIds[0],
      }),
    );
    expect(out.allocations).toEqual([
      { batchId: batchB, quantity: 5.5 },
      { batchId: batchA, quantity: 1.5 },
    ]);
    for (const m of out.movements) expect(Number(m.quantity)).toBeLessThan(0);
    expect_(batchB, storeMain, -5.5);
    expect_(batchA, storeMain, -1.5);
    await assertInvariant("after issue");
  });

  it("transfer (paired rows share one transferId)", async () => {
    const { transferId } = await db.transaction((tx) =>
      postTransfer(tx, ctx, {
        batchId: batchA,
        fromStoreId: storeMain,
        toStoreId: storeCold,
        quantity: 3,
      }),
    );
    const pair = await getTestDb().execute<{ type: string; qty: string }>(sql`
      select type::text as type, quantity::text as qty from inventory_movements
      where organisation_id = ${org.orgId} and transfer_id = ${transferId}
      order by type::text
    `);
    expect(pair.rows.map((r) => [r.type, Number(r.qty)])).toEqual([
      ["transfer_in", 3],
      ["transfer_out", -3],
    ]);
    expect_(batchA, storeMain, -3);
    expect_(batchA, storeCold, 3);
    await assertInvariant("after transfer");
  });

  it("count adjustment (both directions, reason required)", async () => {
    await db.transaction(async (tx) => {
      await postMovement(tx, ctx, {
        batchId: batchA,
        storeId: storeMain,
        type: "adjustment",
        quantity: -0.25,
        reason: "Stock count: spillage",
      });
      await postMovement(tx, ctx, {
        batchId: batchA,
        storeId: storeCold,
        type: "adjustment",
        quantity: 0.5,
        reason: "Stock count: found extra",
      });
    });
    expect_(batchA, storeMain, -0.25);
    expect_(batchA, storeCold, 0.5);
    await assertInvariant("after count adjustment");

    await expect(
      db.transaction((tx) =>
        postMovement(tx, ctx, {
          batchId: batchA,
          storeId: storeMain,
          type: "adjustment",
          quantity: -1,
        }),
      ),
    ).rejects.toHaveProperty("code", "REASON_REQUIRED");
    await assertInvariant("after rejected adjustment");
  });

  it("return to store", async () => {
    await db.transaction((tx) =>
      postMovement(tx, ctx, {
        batchId: batchB,
        storeId: storeMain,
        type: "return",
        quantity: 1.25,
        greenhouseId: org.greenhouseIds[0],
        reason: "Unused after fertigation",
      }),
    );
    expect_(batchB, storeMain, 1.25);
    await assertInvariant("after return");
  });

  it("an adjustment can never take a batch below zero", async () => {
    const before = await movementCount();
    const onHand = expected.get(key(batchA, storeCold)) ?? 0;
    await expect(
      db.transaction((tx) =>
        postMovement(tx, ctx, {
          batchId: batchA,
          storeId: storeCold,
          type: "adjustment",
          quantity: -(onHand + 0.001),
          reason: "Over-correction",
        }),
      ),
    ).rejects.toHaveProperty("code", "INSUFFICIENT_STOCK");
    expect(await movementCount()).toBe(before);
    await assertInvariant("after rejected negative adjustment");
  });
});

describe("issuing more than on-hand", () => {
  it("FEFO issue throws INSUFFICIENT_STOCK and posts nothing", async () => {
    const before = await movementCount();
    const raw = await rawSums();
    const inMain =
      (raw.get(key(batchA, storeMain)) ?? 0) +
      (raw.get(key(batchB, storeMain)) ?? 0);

    const err = await db
      .transaction((tx) =>
        issueFefo(tx, ctx, {
          itemId,
          storeId: storeMain,
          quantity: roundQty(inMain + 1),
        }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("INSUFFICIENT_STOCK");
    expect(await movementCount()).toBe(before);
    await assertInvariant("after rejected FEFO issue");
  });

  it("issue from a named batch throws INSUFFICIENT_STOCK and posts nothing", async () => {
    const before = await movementCount();
    const onHand = expected.get(key(batchB, storeMain)) ?? 0;
    await expect(
      db.transaction((tx) =>
        postMovement(tx, ctx, {
          batchId: batchB,
          storeId: storeMain,
          type: "issue",
          quantity: roundQty(onHand + 0.5),
        }),
      ),
    ).rejects.toHaveProperty("code", "INSUFFICIENT_STOCK");
    expect(await movementCount()).toBe(before);
    await assertInvariant("after rejected batch issue");
  });

  it("a partially failing multi-line transaction rolls back every line", async () => {
    const before = await movementCount();
    await expect(
      db.transaction(async (tx) => {
        // First line is fine on its own...
        await postMovement(tx, ctx, {
          batchId: batchA,
          storeId: storeMain,
          type: "issue",
          quantity: 0.25,
        });
        // ...second line overdraws an empty (batch, store) pair.
        await postMovement(tx, ctx, {
          batchId: batchB,
          storeId: storeCold,
          type: "issue",
          quantity: 1,
        });
      }),
    ).rejects.toHaveProperty("code", "INSUFFICIENT_STOCK");
    expect(await movementCount()).toBe(before);
    await assertInvariant("after rolled-back multi-line issue");
  });

  it("a transfer larger than on-hand posts neither side", async () => {
    const before = await movementCount();
    const onHand = expected.get(key(batchA, storeCold)) ?? 0;
    await expect(
      db.transaction((tx) =>
        postTransfer(tx, ctx, {
          batchId: batchA,
          fromStoreId: storeCold,
          toStoreId: storeMain,
          quantity: roundQty(onHand + 1),
        }),
      ),
    ).rejects.toHaveProperty("code", "INSUFFICIENT_STOCK");
    expect(await movementCount()).toBe(before);
    await assertInvariant("after rejected transfer");
  });
});
