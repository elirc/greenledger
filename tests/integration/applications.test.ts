/**
 * Application posting (src/modules/applications/post.ts) end to end against
 * the test DB: fertigation scaling → FEFO issue movements → application_items
 * → greenhouse safety columns (spray only, GREATEST semantics), full rollback
 * on INSUFFICIENT_STOCK, and the replayed-client-id DUPLICATE path (pg 23505).
 *
 * postApplication is the exact function the application action runs inside
 * its db.transaction (defineAction needs a request session, which
 * integration tests bypass per ARCHITECTURE §14).
 *
 * Orchestrator-only (shared test DB): `pnpm test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  applicationItems,
  applications,
  cropCycles,
  greenhouses,
  itemBatches,
  items,
  recipeLines,
  recipes,
  suppliers,
} from "@/db/schema";
import { addDays, lagosDateOf, todayLagos } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { newId } from "@/lib/ids";
import { scaleRecipe } from "@/modules/applications/logic";
import { postApplication } from "@/modules/applications/post";
import { getGreenhouseSafety } from "@/modules/greenhouse-status/queries";
import { roundQty } from "@/modules/stock/logic";
import { postMovement } from "@/modules/stock/movements";
import { closeTestDb, getTestDb } from "../helpers/db";
import { createTestOrg, type TestOrg } from "../factories";

const HOUR = 3600_000;

let org: TestOrg;
let ctx: Ctx;
let gh: string;
let cycleId: string;
let store: string;

/** item ids */
let calnit: string;
let mkp: string;
/** PHI 7 d / REI 24 h */
let chemA: string;
/** PHI 14 d / REI 12 h */
let chemB: string;
/** PHI 1 d / REI 4 h — the "weaker" spray */
let chemC: string;

/** CalNit batches: early expiry holds only 1 kg so a 1.625 kg draw splits. */
let calnitEarly: string;
let calnitLate: string;

let fertRecipeId: string;
const FERT_LINES = () => [
  { itemId: calnit, quantityPer1000l: 2.5 },
  { itemId: mkp, quantityPer1000l: 1.2 },
];

function pgCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const direct = (e as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (e as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === "string" ? cause.code : undefined;
}

async function itemOnHand(itemId: string): Promise<number> {
  const res = await getTestDb().execute<{ qty: string | null }>(sql`
    select coalesce(sum(quantity), 0)::text as qty from inventory_movements
    where organisation_id = ${org.orgId} and item_id = ${itemId}
  `);
  return Number(res.rows[0].qty ?? 0);
}

async function count(table: "applications" | "application_items" | "inventory_movements"): Promise<number> {
  const res = await getTestDb().execute<{ n: string }>(
    sql`select count(*)::text as n from ${sql.identifier(table)} where organisation_id = ${org.orgId}`,
  );
  return Number(res.rows[0].n);
}

async function ghSafety() {
  const [row] = await getTestDb()
    .select({
      entrySafeAt: greenhouses.entrySafeAt,
      harvestSafeDate: greenhouses.harvestSafeDate,
    })
    .from(greenhouses)
    .where(eq(greenhouses.id, gh));
  return row;
}

async function receive(batchId: string, quantity: number) {
  await db.transaction((tx) =>
    postMovement(tx, ctx, { batchId, storeId: store, type: "receive", quantity }),
  );
}

beforeAll(async () => {
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("app db is not pointed at a test database");
  }
  const tdb = getTestDb();
  // inventory: false — this suite asserts exact per-item sums.
  org = await createTestOrg(tdb, { name: "Spray Farm", inventory: false });
  ctx = org.ctx.manager;
  gh = org.greenhouseIds[0];
  store = org.storeIds[0];

  const [cycle] = await tdb
    .insert(cropCycles)
    .values({
      organisationId: org.orgId,
      greenhouseId: gh,
      varietyId: org.varietyId,
      code: `GH1-APP-${newId().slice(0, 8)}`,
      transplantDate: addDays(todayLagos(), -40),
      plantsTransplanted: 1000,
      plantsAlive: 1000,
      status: "growing",
    })
    .returning({ id: cropCycles.id });
  cycleId = cycle.id;

  const [supplier] = await tdb
    .insert(suppliers)
    .values({ organisationId: org.orgId, name: "Spray Farm Supplies" })
    .returning({ id: suppliers.id });

  const itemRows = await tdb
    .insert(items)
    .values([
      { organisationId: org.orgId, name: "Calcium Nitrate", category: "fertiliser" as const, baseUnit: "kg" as const, nPct: "15.50", pPct: "0.00", kPct: "0.00" },
      { organisationId: org.orgId, name: "MKP 0-52-34", category: "fertiliser" as const, baseUnit: "kg" as const, nPct: "0.00", pPct: "52.00", kPct: "34.00" },
      { organisationId: org.orgId, name: "Chem A (PHI 7 / REI 24)", category: "agrochemical" as const, baseUnit: "l" as const, phiDays: 7, reiHours: 24 },
      { organisationId: org.orgId, name: "Chem B (PHI 14 / REI 12)", category: "agrochemical" as const, baseUnit: "l" as const, phiDays: 14, reiHours: 12 },
      { organisationId: org.orgId, name: "Chem C (PHI 1 / REI 4)", category: "agrochemical" as const, baseUnit: "l" as const, phiDays: 1, reiHours: 4 },
    ])
    .returning({ id: items.id, name: items.name });
  const byName = (n: string) => itemRows.find((r) => r.name === n)!.id;
  calnit = byName("Calcium Nitrate");
  mkp = byName("MKP 0-52-34");
  chemA = byName("Chem A (PHI 7 / REI 24)");
  chemB = byName("Chem B (PHI 14 / REI 12)");
  chemC = byName("Chem C (PHI 1 / REI 4)");

  const today = todayLagos();
  const batchRows = await tdb
    .insert(itemBatches)
    .values(
      [
        { itemId: calnit, batchNumber: "CN-EARLY", expiryDate: addDays(today, 20) },
        { itemId: calnit, batchNumber: "CN-LATE", expiryDate: addDays(today, 200) },
        { itemId: mkp, batchNumber: "MKP-1", expiryDate: addDays(today, 120) },
        { itemId: chemA, batchNumber: "CA-1", expiryDate: addDays(today, 300) },
        { itemId: chemB, batchNumber: "CB-1", expiryDate: addDays(today, 300) },
        { itemId: chemC, batchNumber: "CC-1", expiryDate: addDays(today, 300) },
      ].map((b) => ({
        organisationId: org.orgId,
        supplierId: supplier.id,
        unitCostKobo: "100.000000",
        ...b,
      })),
    )
    .returning({ id: itemBatches.id, batchNumber: itemBatches.batchNumber });
  const batch = (n: string) => batchRows.find((b) => b.batchNumber === n)!.id;
  calnitEarly = batch("CN-EARLY");
  calnitLate = batch("CN-LATE");
  await receive(calnitEarly, 1);
  await receive(calnitLate, 10);
  await receive(batch("MKP-1"), 5);
  await receive(batch("CA-1"), 2);
  await receive(batch("CB-1"), 2);
  await receive(batch("CC-1"), 2);

  const [recipe] = await tdb
    .insert(recipes)
    .values({ organisationId: org.orgId, name: "Veg Feed", type: "fertigation" })
    .returning({ id: recipes.id });
  fertRecipeId = recipe.id;
  await tdb.insert(recipeLines).values(
    FERT_LINES().map((l) => ({
      organisationId: org.orgId,
      recipeId: recipe.id,
      itemId: l.itemId,
      quantityPer1000L: l.quantityPer1000l.toFixed(3),
    })),
  );
});

afterAll(async () => {
  await closeTestDb();
});

describe("fertigation", () => {
  it("draws the recipe scaled to the volume, records allocations, leaves safety untouched", async () => {
    const lines = scaleRecipe(FERT_LINES(), 650);
    expect(lines).toEqual([
      { itemId: calnit, quantity: 1.625 },
      { itemId: mkp, quantity: 0.78 },
    ]);
    const calBefore = await itemOnHand(calnit);
    const mkpBefore = await itemOnHand(mkp);
    const safetyBefore = await ghSafety();

    const out = await db.transaction((tx) =>
      postApplication(tx, ctx, {
        greenhouseId: gh,
        cropCycleId: cycleId,
        type: "fertigation",
        recipeId: fertRecipeId,
        lines,
        waterVolumeLitres: 650,
        storeId: store,
        appliedAt: new Date(Date.now() - 2 * HOUR),
      }),
    );
    expect(out.entrySafeAt).toBeNull();
    expect(out.harvestSafeDate).toBeNull();

    // Stock fell by exactly the scaled amounts (SUM of movements).
    expect(await itemOnHand(calnit)).toBeCloseTo(calBefore - 1.625, 3);
    expect(await itemOnHand(mkp)).toBeCloseTo(mkpBefore - 0.78, 3);

    // Issue movements are linked to the application, negative, and tagged.
    const mv = await getTestDb().execute<{
      item_id: string;
      item_batch_id: string;
      type: string;
      qty: string;
      gh: string | null;
      cyc: string | null;
    }>(sql`
      select item_id, item_batch_id, type::text as type, quantity::text as qty,
             greenhouse_id as gh, crop_cycle_id as cyc
      from inventory_movements
      where organisation_id = ${org.orgId} and application_id = ${out.applicationId}
    `);
    expect(mv.rows.length).toBe(3); // CalNit split over 2 batches + MKP
    for (const m of mv.rows) {
      expect(m.type).toBe("issue");
      expect(Number(m.qty)).toBeLessThan(0);
      expect(m.gh).toBe(gh);
      expect(m.cyc).toBe(cycleId);
    }

    // application_items mirror the FEFO allocations (early batch first).
    const ai = await getTestDb()
      .select({
        itemId: applicationItems.itemId,
        batchId: applicationItems.itemBatchId,
        quantity: applicationItems.quantity,
        phi: applicationItems.phiDaysSnapshot,
        rei: applicationItems.reiHoursSnapshot,
      })
      .from(applicationItems)
      .where(eq(applicationItems.applicationId, out.applicationId));
    const calRows = ai
      .filter((r) => r.itemId === calnit)
      .map((r) => [r.batchId, Number(r.quantity)])
      .sort((a, b) => Number(a[1]) - Number(b[1]));
    expect(calRows).toEqual([
      [calnitLate, 0.625],
      [calnitEarly, 1],
    ]);
    const mkpRows = ai.filter((r) => r.itemId === mkp);
    expect(mkpRows.map((r) => Number(r.quantity))).toEqual([0.78]);
    for (const r of ai) {
      expect(r.phi).toBeNull();
      expect(r.rei).toBeNull();
    }

    // Every application_items row has a matching movement (batch + |qty|).
    for (const r of ai) {
      const match = mv.rows.find(
        (m) =>
          m.item_batch_id === r.batchId &&
          roundQty(-Number(m.qty)) === roundQty(Number(r.quantity)),
      );
      expect(match, `movement for ${r.batchId}`).toBeDefined();
    }

    const [app] = await getTestDb()
      .select()
      .from(applications)
      .where(eq(applications.id, out.applicationId));
    expect(app.type).toBe("fertigation");
    expect(app.recipeId).toBe(fertRecipeId);
    expect(Number(app.waterVolumeLitres)).toBe(650);
    expect(app.entrySafeAt).toBeNull();
    expect(app.harvestSafeDate).toBeNull();

    // Greenhouse safety columns UNCHANGED by fertigation.
    expect(await ghSafety()).toEqual(safetyBefore);
  });
});

describe("spray safety windows", () => {
  // 23:30 Lagos on a fixed day (22:30Z) — Lagos date = UTC date here.
  const applied1 = new Date("2026-03-10T22:30:00Z");

  it("two chemicals → entry = applied + max REI (24 h), harvest = Lagos date + max PHI (14 d)", async () => {
    const out = await db.transaction((tx) =>
      postApplication(tx, ctx, {
        greenhouseId: gh,
        cropCycleId: cycleId,
        type: "spray",
        lines: [
          { itemId: chemA, quantity: 0.25 },
          { itemId: chemB, quantity: 0.1 },
        ],
        waterVolumeLitres: 500,
        storeId: store,
        appliedAt: applied1,
      }),
    );
    const expectedEntry = new Date(applied1.getTime() + 24 * HOUR);
    const expectedHarvest = addDays(lagosDateOf(applied1), 14);
    expect(expectedHarvest).toBe("2026-03-24");
    expect(out.entrySafeAt).toEqual(expectedEntry);
    expect(out.harvestSafeDate).toBe(expectedHarvest);

    const [app] = await getTestDb()
      .select()
      .from(applications)
      .where(eq(applications.id, out.applicationId));
    expect(app.entrySafeAt).toEqual(expectedEntry);
    expect(app.harvestSafeDate).toBe(expectedHarvest);

    // Label snapshots per allocation.
    const ai = await getTestDb()
      .select({
        itemId: applicationItems.itemId,
        phi: applicationItems.phiDaysSnapshot,
        rei: applicationItems.reiHoursSnapshot,
      })
      .from(applicationItems)
      .where(eq(applicationItems.applicationId, out.applicationId));
    expect(ai.find((r) => r.itemId === chemA)).toMatchObject({ phi: 7, rei: 24 });
    expect(ai.find((r) => r.itemId === chemB)).toMatchObject({ phi: 14, rei: 12 });

    expect(await ghSafety()).toEqual({
      entrySafeAt: expectedEntry,
      harvestSafeDate: expectedHarvest,
    });

    // The status query reports the same spray and its products.
    const status = await getGreenhouseSafety(ctx, gh, {
      now: new Date("2026-03-11T12:00:00Z"),
    });
    expect(status?.entrySafe).toBe(false);
    expect(status?.harvestSafe).toBe(false);
    expect(status?.latestSpray?.applicationId).toBe(out.applicationId);
    expect(status?.latestSpray?.products.map((p) => p.itemId).sort()).toEqual(
      [chemA, chemB].sort(),
    );
  });

  it("a later, weaker spray keeps the greenhouse at GREATEST(existing, new)", async () => {
    const before = await ghSafety();
    const applied2 = new Date(applied1.getTime() + 3 * HOUR);
    const out = await db.transaction((tx) =>
      postApplication(tx, ctx, {
        greenhouseId: gh,
        cropCycleId: cycleId,
        type: "spray",
        lines: [{ itemId: chemC, quantity: 0.2 }],
        waterVolumeLitres: 400,
        storeId: store,
        appliedAt: applied2,
      }),
    );
    // The application stores its OWN (weaker) windows…
    expect(out.entrySafeAt).toEqual(new Date(applied2.getTime() + 4 * HOUR));
    expect(out.harvestSafeDate).toBe(addDays(lagosDateOf(applied2), 1));
    // …but the greenhouse never shortens.
    expect(await ghSafety()).toEqual(before);

    // Latest spray is the weaker one; greenhouse status still red.
    const status = await getGreenhouseSafety(ctx, gh, {
      now: new Date("2026-03-11T12:00:00Z"),
    });
    expect(status?.latestSpray?.applicationId).toBe(out.applicationId);
    expect(status?.entrySafe).toBe(false);
    expect(status?.harvestSafe).toBe(false);
  });

  it("a later, stronger spray extends the greenhouse windows", async () => {
    const applied3 = new Date("2026-03-20T08:00:00Z");
    await db.transaction((tx) =>
      postApplication(tx, ctx, {
        greenhouseId: gh,
        cropCycleId: cycleId,
        type: "spray",
        lines: [{ itemId: chemB, quantity: 0.1 }],
        waterVolumeLitres: 400,
        storeId: store,
        appliedAt: applied3,
      }),
    );
    expect(await ghSafety()).toEqual({
      entrySafeAt: new Date(applied3.getTime() + 12 * HOUR),
      harvestSafeDate: "2026-04-03",
    });
  });
});

describe("rollback and replay", () => {
  it("INSUFFICIENT_STOCK rolls back the application row, its items and every movement", async () => {
    const id = newId();
    const before = {
      apps: await count("applications"),
      items: await count("application_items"),
      mv: await count("inventory_movements"),
      chemA: await itemOnHand(chemA),
      safety: await ghSafety(),
    };
    const err = await db
      .transaction((tx) =>
        postApplication(tx, ctx, {
          id,
          greenhouseId: gh,
          cropCycleId: cycleId,
          type: "spray",
          lines: [
            // First line alone would succeed…
            { itemId: chemA, quantity: 0.1 },
            // …the second overdraws.
            { itemId: chemB, quantity: 999 },
          ],
          waterVolumeLitres: 600,
          storeId: store,
          appliedAt: new Date("2026-04-10T08:00:00Z"),
        }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("INSUFFICIENT_STOCK");

    const rows = await getTestDb()
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, id), eq(applications.organisationId, org.orgId)));
    expect(rows).toEqual([]);
    expect(await count("applications")).toBe(before.apps);
    expect(await count("application_items")).toBe(before.items);
    expect(await count("inventory_movements")).toBe(before.mv);
    expect(await itemOnHand(chemA)).toBeCloseTo(before.chemA, 3);
    expect(await ghSafety()).toEqual(before.safety);
  });

  it("replaying the same application id hits the PK (pg 23505 → DUPLICATE path) and draws nothing twice", async () => {
    const id = newId();
    const input = {
      id,
      greenhouseId: gh,
      cropCycleId: cycleId,
      type: "fertigation" as const,
      recipeId: fertRecipeId,
      lines: scaleRecipe(FERT_LINES(), 400),
      waterVolumeLitres: 400,
      storeId: store,
      appliedAt: new Date(Date.now() - HOUR),
    };
    const first = await db.transaction((tx) => postApplication(tx, ctx, input));
    expect(first.applicationId).toBe(id);

    const after = {
      apps: await count("applications"),
      items: await count("application_items"),
      mv: await count("inventory_movements"),
      calnit: await itemOnHand(calnit),
    };

    const err = await db
      .transaction((tx) => postApplication(tx, ctx, input))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).not.toBeNull();
    expect(pgCode(err)).toBe("23505");

    expect(await count("applications")).toBe(after.apps);
    expect(await count("application_items")).toBe(after.items);
    expect(await count("inventory_movements")).toBe(after.mv);
    expect(await itemOnHand(calnit)).toBeCloseTo(after.calnit, 3);
  });
});
