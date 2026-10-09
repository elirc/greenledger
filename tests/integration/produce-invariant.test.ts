/**
 * Produce invariant: on-hand(lot, store) === SUM(produce_movements.kg) and
 * never negative — checked after EVERY flow (harvest → PHI block/override →
 * FIFO sale → waste), plus the atomic refusal paths.
 *
 * Flows run through the produce engine (`src/modules/produce/harvest-post.ts`
 * + `movements.ts`) — the exact functions the harvest / sale / waste action
 * handlers call inside their db.transaction (`defineAction` needs a request
 * session, which integration tests bypass per ARCHITECTURE §14).
 *
 * Orchestrator-only (shared test DB): `pnpm test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  cropCycles,
  customers,
  greenhouses,
  harvests,
  produceLots,
  saleLines,
  sales,
} from "@/db/schema";
import { addDays, lagosDateOf } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { newId } from "@/lib/ids";
import { postHarvest } from "@/modules/produce/harvest-post";
import {
  allocateSale,
  lotOnHand,
  postProduceMovement,
} from "@/modules/produce/movements";
import { roundQty } from "@/modules/stock/logic";
import { closeTestDb, getTestDb, truncateAll } from "../helpers/db";
import { createTestOrg, type TestOrg } from "../factories";

let org: TestOrg;
let worker: Ctx;
let manager: Ctx;
let gh: string;
let cycleId: string;
let packhouse: string;
let coldRoom: string;
let customerId: string;

/** Lots by name for readable assertions. */
const lots: Record<string, string> = {};

/** The test's own ledger: what on-hand MUST be after each flow. */
const expected = new Map<string, number>();
const key = (lotId: string, storeId: string) => `${lotId}|${storeId}`;
function expect_(lotId: string, storeId: string, delta: number) {
  const k = key(lotId, storeId);
  expected.set(k, roundQty((expected.get(k) ?? 0) + delta));
}

/** 23:30 UTC = 00:30 Lagos NEXT day — exercises the Lagos best-before date. */
const HARVEST_1 = new Date("2026-03-02T23:30:00Z");
const HARVEST_2 = new Date("2026-03-05T06:00:00Z"); // 07:00 Lagos
const SALE_AT = new Date("2026-03-06T10:00:00Z");

async function rawSums(): Promise<Map<string, number>> {
  const res = await getTestDb().execute<{
    produce_lot_id: string;
    store_id: string;
    kg: string;
  }>(sql`
    select produce_lot_id, store_id, sum(kg)::text as kg
    from produce_movements
    where organisation_id = ${org.orgId}
    group by produce_lot_id, store_id
  `);
  return new Map(
    res.rows.map((r) => [key(r.produce_lot_id, r.store_id), Number(r.kg)]),
  );
}

type Counted =
  | "harvests"
  | "harvest_lines"
  | "produce_lots"
  | "produce_movements"
  | "audit_log";

async function count(table: Counted): Promise<number> {
  const res = await getTestDb().execute<{ n: string }>(
    sql`select count(*)::text as n from ${sql.identifier(table)} where organisation_id = ${org.orgId}`,
  );
  return Number(res.rows[0].n);
}

async function snapshot() {
  return {
    harvests: await count("harvests"),
    lines: await count("harvest_lines"),
    lots: await count("produce_lots"),
    movements: await count("produce_movements"),
    audit: await count("audit_log"),
  };
}

/** The invariant, asserted after every flow. */
async function assertInvariant(label: string): Promise<void> {
  const raw = await rawSums();

  // 1. Raw SUM(produce_movements) per (lot, store) equals the test ledger.
  for (const [k, kg] of expected) {
    expect(raw.get(k) ?? 0, `${label}: raw sum for ${k}`).toBeCloseTo(kg, 3);
  }
  for (const k of raw.keys()) {
    expect(expected.has(k), `${label}: unexpected movements at ${k}`).toBe(true);
  }

  // 2. Never negative anywhere (raw SQL HAVING, not our own math).
  const neg = await getTestDb().execute<{ n: string }>(sql`
    select count(*)::text as n from (
      select 1 from produce_movements
      where organisation_id = ${org.orgId}
      group by produce_lot_id, store_id
      having sum(kg) < 0
    ) t
  `);
  expect(Number(neg.rows[0].n), `${label}: negative on-hand rows`).toBe(0);

  // 3. The engine's lotOnHand agrees with the raw sum for every (lot, store).
  for (const lotId of Object.values(lots)) {
    for (const storeId of org.storeIds) {
      const engine = await db.transaction((tx) =>
        lotOnHand(tx, worker, lotId, storeId),
      );
      expect(engine, `${label}: lotOnHand ${lotId}@${storeId}`).toBeCloseTo(
        raw.get(key(lotId, storeId)) ?? 0,
        3,
      );
    }
  }
}

async function lotsOfHarvest(harvestId: string) {
  return getTestDb()
    .select({
      id: produceLots.id,
      grade: produceLots.grade,
      bestBeforeDate: produceLots.bestBeforeDate,
      harvestedAt: produceLots.harvestedAt,
      cropId: produceLots.cropId,
      varietyId: produceLots.varietyId,
    })
    .from(produceLots)
    .where(
      and(
        eq(produceLots.organisationId, org.orgId),
        eq(produceLots.harvestId, harvestId),
      ),
    );
}

async function setHarvestSafeDate(date: string | null) {
  await getTestDb()
    .update(greenhouses)
    .set({ harvestSafeDate: date })
    .where(eq(greenhouses.id, gh));
}

/** A sale + one line row, so allocateSale has a sale_line_id to tag. */
async function newSaleLine(grade: "a" | "b" | "c" | "reject", kg: number) {
  const [sale] = await getTestDb()
    .insert(sales)
    .values({
      organisationId: org.orgId,
      customerId,
      invoiceNumber: `INV-T-${newId().slice(0, 8)}`,
      saleDate: lagosDateOf(SALE_AT),
      createdBy: manager.userId,
    })
    .returning({ id: sales.id });
  const [line] = await getTestDb()
    .insert(saleLines)
    .values({
      organisationId: org.orgId,
      saleId: sale.id,
      cropId: org.cropId,
      grade,
      kg: kg.toFixed(3),
      unitPriceKobo: 150_000,
      lineTotalKobo: Math.round(kg * 150_000),
    })
    .returning({ id: saleLines.id });
  return line.id;
}

beforeAll(async () => {
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("app db is not pointed at a test database");
  }
  await truncateAll();
  const tdb = getTestDb();
  // inventory: false — this suite sweeps ALL org movements against its own ledger.
  org = await createTestOrg(tdb, { name: "Produce Farm", inventory: false });
  worker = org.ctx.worker;
  manager = org.ctx.manager;
  gh = org.greenhouseIds[0];
  [, coldRoom, packhouse] = org.storeIds;

  const [cycle] = await tdb
    .insert(cropCycles)
    .values({
      organisationId: org.orgId,
      greenhouseId: gh,
      varietyId: org.varietyId,
      code: `GH1-PRD-${newId().slice(0, 8)}`,
      transplantDate: "2025-12-15",
      plantsTransplanted: 1000,
      plantsAlive: 980,
      expectedFirstHarvest: "2026-02-28",
      status: "growing",
    })
    .returning({ id: cropCycles.id });
  cycleId = cycle.id;

  const [customer] = await tdb
    .insert(customers)
    .values({ organisationId: org.orgId, name: "Mile 12 Trader" })
    .returning({ id: customers.id });
  customerId = customer.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe("harvest posting", () => {
  it("3 grade lines → 3 lots with crop shelf-life best-before, harvest_in movements, cycle → harvesting", async () => {
    const out = await db.transaction((tx) =>
      postHarvest(tx, worker, {
        greenhouseId: gh,
        cropCycleId: cycleId,
        storeId: packhouse,
        harvestedAt: HARVEST_1,
        lines: [
          { grade: "a", crates: 2.5, kg: 55 },
          { grade: "b", crates: 1, kg: 25.25 },
          { grade: "c", crates: 0.5, kg: 12.125 },
        ],
      }),
    );
    expect(out.overrideUsed).toBe(false);
    expect(out.lotIds).toHaveLength(3);

    // Lagos date of 23:30Z is the next day → best-before = that + 7 (tomato).
    expect(lagosDateOf(HARVEST_1)).toBe("2026-03-03");
    const lotRows = await lotsOfHarvest(out.harvestId);
    expect(lotRows).toHaveLength(3);
    for (const l of lotRows) {
      expect(l.bestBeforeDate).toBe(addDays("2026-03-03", 7));
      expect(l.harvestedAt).toEqual(HARVEST_1);
      expect(l.cropId).toBe(org.cropId);
      expect(l.varietyId).toBe(org.varietyId);
    }
    const byGrade = (g: string) => lotRows.find((l) => l.grade === g)!.id;
    lots.a1 = byGrade("a");
    lots.b1 = byGrade("b");
    lots.c1 = byGrade("c");

    // One positive harvest_in per lot, into the chosen store, at harvest time.
    const mv = await getTestDb().execute<{
      lot: string;
      store: string;
      type: string;
      kg: string;
      at: Date;
    }>(sql`
      select produce_lot_id as lot, store_id as store, type::text as type,
             kg::text as kg, performed_at as at
      from produce_movements where organisation_id = ${org.orgId}
    `);
    expect(mv.rows).toHaveLength(3);
    for (const m of mv.rows) {
      expect(m.type).toBe("harvest_in");
      expect(m.store).toBe(packhouse);
      expect(new Date(m.at)).toEqual(HARVEST_1);
    }
    expect_(lots.a1, packhouse, 55);
    expect_(lots.b1, packhouse, 25.25);
    expect_(lots.c1, packhouse, 12.125);
    await assertInvariant("after first harvest");

    const [cyc] = await getTestDb()
      .select({ status: cropCycles.status })
      .from(cropCycles)
      .where(eq(cropCycles.id, cycleId));
    expect(cyc.status).toBe("harvesting");

    const [h] = await getTestDb()
      .select()
      .from(harvests)
      .where(eq(harvests.id, out.harvestId));
    expect(h.phiOverride).toBe(false);
    expect(h.phiOverrideReason).toBeNull();
    expect(h.phiOverrideBy).toBeNull();
    expect(h.harvestedBy).toBe(worker.userId);

    const audit = await getTestDb()
      .select({ action: auditLog.action, reason: auditLog.reason })
      .from(auditLog)
      .where(
        and(eq(auditLog.organisationId, org.orgId), eq(auditLog.entityId, out.harvestId)),
      );
    expect(audit).toEqual([{ action: "harvest.create", reason: null }]);
  });

  it("refuses duplicate grades and empty harvests, posting nothing", async () => {
    const before = await snapshot();
    await expect(
      db.transaction((tx) =>
        postHarvest(tx, worker, {
          greenhouseId: gh,
          cropCycleId: cycleId,
          storeId: packhouse,
          harvestedAt: HARVEST_1,
          lines: [
            { grade: "a", crates: 1, kg: 10 },
            { grade: "a", crates: 1, kg: 5 },
          ],
        }),
      ),
    ).rejects.toHaveProperty("code", "DUPLICATE_GRADE");
    await expect(
      db.transaction((tx) =>
        postHarvest(tx, worker, {
          greenhouseId: gh,
          cropCycleId: cycleId,
          storeId: packhouse,
          harvestedAt: HARVEST_1,
          lines: [],
        }),
      ),
    ).rejects.toHaveProperty("code", "NO_LINES");
    expect(await snapshot()).toEqual(before);
    await assertInvariant("after rejected harvests");
  });
});

describe("PHI guard", () => {
  it("inside the PHI window postHarvest throws PHI_BLOCKED and posts NOTHING", async () => {
    await setHarvestSafeDate(addDays(lagosDateOf(HARVEST_2), 5));
    const before = await snapshot();
    const err = await db
      .transaction((tx) =>
        postHarvest(tx, worker, {
          greenhouseId: gh,
          cropCycleId: cycleId,
          storeId: packhouse,
          harvestedAt: HARVEST_2,
          lines: [
            { grade: "a", crates: 2, kg: 40 },
            { grade: "reject", crates: 0, kg: 3 },
          ],
        }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("PHI_BLOCKED");
    expect(await snapshot()).toEqual(before);
    await assertInvariant("after PHI block");
  });

  it("with a manager override → phi_override fields set + audit harvest.create.phi_override", async () => {
    const reason = "Buyer collection could not wait — graded for processing only";
    const out = await db.transaction((tx) =>
      postHarvest(tx, manager, {
        greenhouseId: gh,
        cropCycleId: cycleId,
        storeId: packhouse,
        harvestedAt: HARVEST_2,
        lines: [
          { grade: "a", crates: 2, kg: 40 },
          { grade: "reject", crates: 0, kg: 3 },
        ],
        override: { reason },
      }),
    );
    expect(out.overrideUsed).toBe(true);

    const [h] = await getTestDb()
      .select()
      .from(harvests)
      .where(eq(harvests.id, out.harvestId));
    expect(h.phiOverride).toBe(true);
    expect(h.phiOverrideReason).toBe(reason);
    expect(h.phiOverrideBy).toBe(manager.userId);
    expect(h.harvestedBy).toBe(manager.userId);

    const audit = await getTestDb()
      .select({
        action: auditLog.action,
        reason: auditLog.reason,
        userId: auditLog.userId,
        entityType: auditLog.entityType,
      })
      .from(auditLog)
      .where(
        and(eq(auditLog.organisationId, org.orgId), eq(auditLog.entityId, out.harvestId)),
      );
    expect(audit).toEqual([
      {
        action: "harvest.create.phi_override",
        reason,
        userId: manager.userId,
        entityType: "harvest",
      },
    ]);

    const lotRows = await lotsOfHarvest(out.harvestId);
    lots.a2 = lotRows.find((l) => l.grade === "a")!.id;
    lots.r2 = lotRows.find((l) => l.grade === "reject")!.id;
    expect_(lots.a2, packhouse, 40);
    expect_(lots.r2, packhouse, 3);
    await assertInvariant("after override harvest");
  });

  it("an override supplied OUTSIDE a PHI window is not recorded as an override", async () => {
    // Harvest ON the harvest-safe date is allowed (blocked only while in the future).
    const onSafeDay = new Date("2026-03-10T06:00:00Z");
    await setHarvestSafeDate(lagosDateOf(onSafeDay));
    const out = await db.transaction((tx) =>
      postHarvest(tx, manager, {
        greenhouseId: gh,
        cropCycleId: cycleId,
        storeId: coldRoom,
        harvestedAt: onSafeDay,
        lines: [{ grade: "b", crates: 1, kg: 8 }],
        override: { reason: "not needed" },
      }),
    );
    expect(out.overrideUsed).toBe(false);
    const [h] = await getTestDb()
      .select({ o: harvests.phiOverride, r: harvests.phiOverrideReason })
      .from(harvests)
      .where(eq(harvests.id, out.harvestId));
    expect(h).toEqual({ o: false, r: null });
    lots.b3 = (await lotsOfHarvest(out.harvestId))[0].id;
    expect_(lots.b3, coldRoom, 8);
    await setHarvestSafeDate(null);
    await assertInvariant("after on-safe-date harvest");
  });
});

describe("FIFO sale allocation", () => {
  it("drains grade-A lots oldest harvest first, tagging each movement with the sale line", async () => {
    // A on hand: a1 = 55 (older), a2 = 40 (newer). Sell 70 → 55 from a1, 15 from a2.
    const saleLineId = await newSaleLine("a", 70);
    const out = await db.transaction((tx) =>
      allocateSale(tx, manager, {
        cropId: org.cropId,
        grade: "a",
        storeId: packhouse,
        kg: 70,
        saleLineId,
        performedAt: SALE_AT,
      }),
    );
    expect(out.allocations).toEqual([
      { lotId: lots.a1, kg: 55 },
      { lotId: lots.a2, kg: 15 },
    ]);
    const mv = await getTestDb().execute<{ lot: string; type: string; kg: string; sl: string }>(sql`
      select produce_lot_id as lot, type::text as type, kg::text as kg, sale_line_id as sl
      from produce_movements
      where organisation_id = ${org.orgId} and sale_line_id = ${saleLineId}
      order by produce_movements.kg
    `);
    expect(mv.rows.map((r) => [r.lot, r.type, Number(r.kg)])).toEqual([
      [lots.a1, "sale", -55],
      [lots.a2, "sale", -15],
    ]);
    expect_(lots.a1, packhouse, -55);
    expect_(lots.a2, packhouse, -15);
    await assertInvariant("after FIFO sale");
  });

  it("only sells from the named store", async () => {
    // b3 (8 kg) sits in the cold room; packhouse B is b1 = 25.25.
    const saleLineId = await newSaleLine("b", 20);
    const out = await db.transaction((tx) =>
      allocateSale(tx, manager, {
        cropId: org.cropId,
        grade: "b",
        storeId: packhouse,
        kg: 20,
        saleLineId,
        performedAt: SALE_AT,
      }),
    );
    expect(out.allocations).toEqual([{ lotId: lots.b1, kg: 20 }]);
    expect_(lots.b1, packhouse, -20);
    await assertInvariant("after store-scoped sale");
  });

  it("refuses a shortfall atomically — no partial allocation", async () => {
    // 25 kg A left (a2); ask for 25.001.
    const saleLineId = await newSaleLine("a", 25.001);
    const before = await snapshot();
    const err = await db
      .transaction((tx) =>
        allocateSale(tx, manager, {
          cropId: org.cropId,
          grade: "a",
          storeId: packhouse,
          kg: 25.001,
          saleLineId,
        }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("INSUFFICIENT_STOCK");
    expect(await snapshot()).toEqual(before);
    await assertInvariant("after rejected shortfall");
  });

  it("a multi-line sale whose second line is short rolls back the first line too", async () => {
    const lineA = await newSaleLine("a", 5);
    const lineC = await newSaleLine("c", 500);
    const before = await snapshot();
    await expect(
      db.transaction(async (tx) => {
        await allocateSale(tx, manager, {
          cropId: org.cropId,
          grade: "a",
          storeId: packhouse,
          kg: 5,
          saleLineId: lineA,
        });
        await allocateSale(tx, manager, {
          cropId: org.cropId,
          grade: "c",
          storeId: packhouse,
          kg: 500,
          saleLineId: lineC,
        });
      }),
    ).rejects.toHaveProperty("code", "INSUFFICIENT_STOCK");
    expect(await snapshot()).toEqual(before);
    await assertInvariant("after rolled-back multi-line sale");
  });

  it("a grade with no stock in the store throws NO_STOCK", async () => {
    const saleLineId = await newSaleLine("reject", 1);
    await expect(
      db.transaction((tx) =>
        allocateSale(tx, manager, {
          cropId: org.cropId,
          grade: "reject",
          storeId: coldRoom,
          kg: 1,
          saleLineId,
        }),
      ),
    ).rejects.toHaveProperty("code", "NO_STOCK");
    await assertInvariant("after NO_STOCK");
  });
});

describe("waste", () => {
  it("requires a reason and posts nothing without one", async () => {
    const before = await snapshot();
    await expect(
      db.transaction((tx) =>
        postProduceMovement(tx, worker, {
          lotId: lots.r2,
          storeId: packhouse,
          type: "waste",
          kg: 3,
        }),
      ),
    ).rejects.toHaveProperty("code", "REASON_REQUIRED");
    expect(await snapshot()).toEqual(before);
    await assertInvariant("after waste without reason");
  });

  it("with a reason posts one NEGATIVE waste movement carrying the reason", async () => {
    const mv = await db.transaction((tx) =>
      postProduceMovement(tx, worker, {
        lotId: lots.r2,
        storeId: packhouse,
        type: "waste",
        kg: 2.5,
        wasteReason: "Cracked fruit — composted",
      }),
    );
    expect(mv.type).toBe("waste");
    expect(Number(mv.kg)).toBe(-2.5);
    expect(mv.wasteReason).toBe("Cracked fruit — composted");
    expect_(lots.r2, packhouse, -2.5);
    await assertInvariant("after waste");
  });

  it("can never waste more than the lot holds in that store", async () => {
    const before = await snapshot();
    const onHand = expected.get(key(lots.c1, packhouse)) ?? 0;
    await expect(
      db.transaction((tx) =>
        postProduceMovement(tx, worker, {
          lotId: lots.c1,
          storeId: packhouse,
          type: "waste",
          kg: roundQty(onHand + 0.001),
          wasteReason: "Over-ripe",
        }),
      ),
    ).rejects.toHaveProperty("code", "INSUFFICIENT_STOCK");
    expect(await snapshot()).toEqual(before);
    await assertInvariant("after rejected over-waste");
  });
});

describe("lot on-hand is never negative", () => {
  it("SQL HAVING SUM(kg) < 0 finds nothing across every lot and store", async () => {
    const res = await getTestDb().execute<{ lot: string; store: string; kg: string }>(sql`
      select produce_lot_id as lot, store_id as store, sum(kg)::text as kg
      from produce_movements
      where organisation_id = ${org.orgId}
      group by produce_lot_id, store_id
      having sum(kg) < 0
    `);
    expect(res.rows).toEqual([]);
    await assertInvariant("final");
  });
});
