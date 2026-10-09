import { and, eq, inArray, lte, sql } from "drizzle-orm";
import {
  applications,
  cropCycles,
  crops,
  customers,
  greenhouses,
  harvestLines,
  harvests,
  paymentsReceived,
  produceLots,
  produceMovements,
  saleLines,
  sales,
  varieties,
} from "../schema";
import type { Db, Tx } from "../index";
import type { Ctx } from "../../lib/guard";
import { writeAudit } from "../../lib/audit";
import { addDays, lagosDateOf } from "../../lib/dates";
import type { Role } from "../../lib/permissions";
import { isHarvestBlocked, postHarvest, type Grade } from "../../modules/produce/harvest-post";
import { fifoLotCandidates, postProduceMovement } from "../../modules/produce/movements";
import { createSaleHandler, recordPaymentHandler } from "../../modules/sales/handlers";
import { roundQty } from "../../modules/stock/logic";
import { DEMO_ORG, DEMO_USERS } from "./02-org";
import { bump, type SeedState, type SeedStep } from "./state";

/**
 * Phase 5 seed: harvests → produce lots → FIFO sales → payments + waste,
 * all through the service functions the app uses:
 * - harvests via `postHarvest` (lots, harvest_in movements, best-before,
 *   growing→harvesting flip, audit) into the Packhouse;
 * - sales via P5-B's `createSaleHandler` (counter → INV-000123, sale +
 *   lines, `allocateSale` FIFO movements, audit);
 * - payments via `recordPaymentHandler` (status recompute, audit);
 * - waste via `postProduceMovement` + the same audit row `produce.waste`
 *   writes.
 *
 * Fully deterministic: no RNG; every date derives from `state.now` and each
 * cycle's expected_first_harvest. Events are posted strictly in time order
 * (harvest 07:00 → sale ~12:00 → waste sweep 16:00 Lagos, day by day), so
 * FIFO only ever sees produce that existed at that moment.
 *
 * PHI history: the harvest guard reads the greenhouse's CURRENT
 * harvest_safe_date (the GREATEST over all sprays 06 posted). Replaying the
 * past against today's value would block every historic harvest, so each
 * harvest transaction sets the column to its value AT harvest time
 * (MAX(applications.harvest_safe_date) of sprays applied before the
 * harvest), posts, and restores the final value in the SAME transaction —
 * the stored state after the seed is exactly what 06 left. Days inside a
 * spray's PHI are simply not harvested (the crop ripens on and the next
 * pick is heavier), except the ONE deliberate PHI-override harvest in GH2
 * yesterday (its imidacloprid PHI runs until seed day + 11).
 *
 * Harvesting age: first light picks start 7 days before a cycle's nominal
 * expected_first_harvest. That gives GH3 ≈ 5 weeks, GH2 ≈ 3 weeks and GH1
 * its first pick (GH1 flips growing → harvesting). GH4 (Habanero, still
 * growing per the DATA-MODEL story) is not harvested.
 */

// ── Plan ───────────────────────────────────────────────────────────────

/** Harvested cycles, by greenhouse (GH1 joins once it reaches harvest age). */
const HARVEST_GREENHOUSES = ["GH1", "GH2", "GH3"] as const;
type HarvestGh = (typeof HARVEST_GREENHOUSES)[number];

/** First picks this many days before expected_first_harvest. */
const EARLY_PICK_DAYS = 7;
/** Minimum days between picks in the same greenhouse. */
const PICK_INTERVAL_DAYS = 2;
/** Packing weights for crate counts (kg per crate). */
const KG_PER_CRATE: Record<string, number> = { Tomato: 22, Pepper: 14 };

const OVERRIDE = {
  greenhouse: "GH2" as HarvestGh,
  daysAgo: 1,
  reason: "Buyer collection could not wait — graded for processing only",
};

type CustomerKey = "mile12" | "freshmart" | "greenfield" | "hotel" | "exporter";

/** Share of the available kg (per crop/grade) each buyer takes per sale. */
type Appetite = Partial<Record<`${"Tomato" | "Pepper"}:${Grade}`, number>>;

const DEMO_CUSTOMERS: ReadonlyArray<{
  key: CustomerKey;
  name: string;
  phone: string;
  email: string | null;
  notes: string;
  /** Price multiplier vs the farm's base A-grade price. */
  priceFactor: number;
  appetite: Appetite;
}> = [
  {
    key: "mile12",
    name: "Iya Bose Produce (Mile 12 Market)",
    phone: "+2348031234501",
    email: null,
    notes: "Mile 12 trader — takes B/C grades and rejects for the market. Cash on collection.",
    priceFactor: 0.85,
    appetite: { "Tomato:b": 0.6, "Tomato:c": 1, "Tomato:reject": 1, "Pepper:b": 0.5, "Pepper:c": 1, "Pepper:reject": 1 },
  },
  {
    key: "freshmart",
    name: "FreshMart Supermarket, Lekki",
    phone: "+2348031234502",
    email: "buying@freshmart.example",
    notes: "Supermarket — A grade only, delivery Tuesdays.",
    priceFactor: 1.05,
    appetite: { "Tomato:a": 0.55, "Pepper:a": 0.5 },
  },
  {
    key: "greenfield",
    name: "Greenfield Stores, Ikeja",
    phone: "+2348031234503",
    email: "produce@greenfield.example",
    notes: "Supermarket — A grade tomato, A/B pepper.",
    priceFactor: 1,
    appetite: { "Tomato:a": 0.5, "Pepper:a": 0.45, "Pepper:b": 0.4 },
  },
  {
    key: "hotel",
    name: "Lagoon View Hotel",
    phone: "+2348031234504",
    email: "kitchen@lagoonview.example",
    notes: "Hotel kitchen — A and B grade, pays by transfer.",
    priceFactor: 1.1,
    appetite: { "Tomato:a": 0.4, "Tomato:b": 0.5, "Pepper:a": 0.35 },
  },
  {
    key: "exporter",
    name: "AfroFresh Exports Ltd",
    phone: "+2348031234505",
    email: "sourcing@afrofresh.example",
    notes: "Exporter — bell pepper A grade; strict on best-before.",
    priceFactor: 1.15,
    appetite: { "Pepper:a": 0.8, "Tomato:a": 0.3 },
  },
];

/** Base A-grade ₦/kg; lower grades scale down. A-grade stays ₦1,200–2,000. */
const BASE_A_NAIRA: Record<string, number> = { Tomato: 1400, Pepper: 1750 };
const GRADE_PRICE: Record<Grade, number> = { a: 1, b: 0.7, c: 0.45, reject: 0.2 };

/** Sales go out on Tuesdays and Fridays (UTC day numbers). */
const SALE_WEEKDAYS = new Set([2, 5]);

// ── Helpers ────────────────────────────────────────────────────────────

/** A member's request context, built directly (no session in a script). */
function memberCtx(state: SeedState, role: Role, assigned: string[] | null = null): Ctx {
  const u = DEMO_USERS.find((x) => x.role === role)!;
  const userId = state.userIds[role];
  return {
    userId,
    orgId: state.orgId,
    role,
    user: { id: userId, name: u.name, phoneNumber: u.phoneNumber, isPlatformAdmin: false },
    org: { id: state.orgId, name: DEMO_ORG.name, status: "trial" },
    assignedGreenhouseIds: assigned,
    canSeeMoney: role !== "worker",
  };
}

/** Whole days from a to b (both yyyy-MM-dd). */
function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

/** hh:mm Lagos (UTC+1, no DST) on a Lagos calendar day. */
function lagosAt(date: string, hourLagos: number, minute = 0): Date {
  return new Date(
    `${date}T${String(hourLagos - 1).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Greenhouse PHI state as it stood at `at`: MAX safe date of earlier sprays. */
async function historicSafeDate(
  db: Db | Tx,
  orgId: string,
  greenhouseId: string,
  at: Date,
): Promise<string | null> {
  const [row] = await db
    .select({ d: sql<string | null>`max(${applications.harvestSafeDate})::text` })
    .from(applications)
    .where(
      and(
        eq(applications.organisationId, orgId),
        eq(applications.greenhouseId, greenhouseId),
        lte(applications.appliedAt, at),
      ),
    );
  return row?.d ?? null;
}

/** Deterministic 0.88–1.12 wobble per (cycle, pick). */
const wobble = (c: number, k: number) => 0.88 + 0.024 * ((7 * k + 3 * c) % 11);

/** Yield ramp around the nominal first-harvest date. */
function rampFactor(daysFromFirstHarvest: number): number {
  if (daysFromFirstHarvest < 0) return 0.4;
  if (daysFromFirstHarvest < 14) return 0.75;
  return 1;
}

function gradeSplit(totalKg: number, k: number, kgPerCrate: number, processingOnly: boolean) {
  const shares: [Grade, number][] = processingOnly
    ? [
        ["c", 0.85],
        ["reject", 0.15],
      ]
    : (() => {
        const s = ((k % 5) - 2) * 0.01; // −2%…+2%
        return [
          ["a", 0.55 + s],
          ["b", 0.25 - s / 2],
          ["c", 0.12 - s / 2],
          ["reject", 0.08],
        ];
      })();
  return shares
    .map(([grade, share]) => {
      const kg = r1(totalKg * share);
      const crates = grade === "reject" ? 0 : Math.round((kg / kgPerCrate) * 2) / 2;
      return { grade, kg, crates };
    })
    .filter((l) => l.kg > 0);
}

// ── Step ───────────────────────────────────────────────────────────────

interface HarvestCycle {
  gh: HarvestGh;
  index: number;
  cycleId: string;
  greenhouseId: string;
  cropName: string;
  plantsAlive: number;
  dailyKg: number;
  firstHarvest: string;
  startDate: string;
  lastPick: string | null;
  picks: number;
}

export const harvestsSalesStep: SeedStep = {
  name: "harvests & sales (postHarvest lots, PHI override, FIFO sales, payments, waste)",
  async run(state) {
    const { db, orgId } = state;
    const manager = memberCtx(state, "manager");
    const today = lagosDateOf(state.now);
    const packhouse = state.storeIds["Packhouse"];
    if (!packhouse) throw new Error("seed 07: Packhouse store missing");
    const worker = memberCtx(
      state,
      "worker",
      ["GH1", "GH2", "GH3"].map((g) => state.greenhouseIds[g]).filter(Boolean),
    );

    // ── Cycles to harvest ────────────────────────────────────────────
    const cycleRows = await db
      .select({
        id: cropCycles.id,
        greenhouseId: cropCycles.greenhouseId,
        greenhouse: greenhouses.name,
        plantsAlive: cropCycles.plantsAlive,
        expectedFirstHarvest: cropCycles.expectedFirstHarvest,
        yieldPerPlant: varieties.expectedYieldKgPerPlant,
        weeks: varieties.harvestDurationWeeks,
        cropName: crops.name,
      })
      .from(cropCycles)
      .innerJoin(
        greenhouses,
        and(eq(greenhouses.id, cropCycles.greenhouseId), eq(greenhouses.organisationId, orgId)),
      )
      .innerJoin(
        varieties,
        and(eq(varieties.id, cropCycles.varietyId), eq(varieties.organisationId, orgId)),
      )
      .innerJoin(crops, and(eq(crops.id, varieties.cropId), eq(crops.organisationId, orgId)))
      .where(
        and(
          eq(cropCycles.organisationId, orgId),
          inArray(cropCycles.status, ["growing", "harvesting"]),
          inArray(greenhouses.name, [...HARVEST_GREENHOUSES]),
        ),
      );

    const plan: HarvestCycle[] = [];
    HARVEST_GREENHOUSES.forEach((gh, index) => {
      const c = cycleRows.find((r) => r.greenhouse === gh);
      if (!c || !c.expectedFirstHarvest) {
        console.warn(`[seed] 07: no active cycle with a first-harvest date in ${gh} — skipped`);
        return;
      }
      const startDate = addDays(c.expectedFirstHarvest, -EARLY_PICK_DAYS);
      if (startDate >= today) {
        console.warn(`[seed] 07: ${gh} not yet at harvest age (starts ${startDate}) — skipped`);
        return;
      }
      plan.push({
        gh,
        index,
        cycleId: c.id,
        greenhouseId: c.greenhouseId,
        cropName: c.cropName,
        plantsAlive: c.plantsAlive,
        dailyKg: (c.plantsAlive * Number(c.yieldPerPlant)) / (c.weeks * 7),
        firstHarvest: c.expectedFirstHarvest,
        startDate,
        lastPick: null,
        picks: 0,
      });
    });
    if (plan.length === 0) {
      console.warn("[seed] 07: nothing to harvest — step skipped");
      return;
    }

    // Final (post-06) greenhouse safety values, restored after each harvest.
    const finalSafe = new Map<string, string | null>();
    for (const p of plan) {
      const [g] = await db
        .select({ d: greenhouses.harvestSafeDate })
        .from(greenhouses)
        .where(and(eq(greenhouses.id, p.greenhouseId), eq(greenhouses.organisationId, orgId)));
      finalSafe.set(p.greenhouseId, g?.d ?? null);
    }

    // ── Customers (direct insert — createCustomer is a defineAction) ──
    const customerIds = new Map<CustomerKey, string>();
    await db.transaction(async (tx) => {
      for (const c of DEMO_CUSTOMERS) {
        const [row] = await tx
          .insert(customers)
          .values({
            organisationId: orgId,
            name: c.name,
            phone: c.phone,
            email: c.email,
            notes: c.notes,
          })
          .returning({ id: customers.id });
        await writeAudit(tx, manager, {
          action: "customers.create",
          entityType: "customer",
          entityId: row.id,
          after: { name: c.name },
        });
        customerIds.set(c.key, row.id);
      }
    });
    bump(state, "customers", DEMO_CUSTOMERS.length);
    bump(state, "audit_log", DEMO_CUSTOMERS.length);

    const cropIdByName = new Map(
      (
        await db
          .select({ id: crops.id, name: crops.name })
          .from(crops)
          .where(eq(crops.organisationId, orgId))
      ).map((r) => [r.name, r.id]),
    );

    // ── Day-by-day replay ────────────────────────────────────────────
    const firstDay = plan.map((p) => p.startDate).sort()[0];
    const lastDay = addDays(today, -1);
    let harvestCount = 0;
    let overrideCount = 0;
    let wasteCount = 0;
    let saleIndex = 0;
    const postedSales: { id: string; saleDate: string; totalKobo: number }[] = [];

    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      // 1. Harvests at 07:00 (one cycle after another, 10 min apart).
      for (const p of plan) {
        if (day < p.startDate) continue;
        const isOverride =
          p.gh === OVERRIDE.greenhouse && day === addDays(today, -OVERRIDE.daysAgo);
        const since = p.lastPick ? daysBetween(p.lastPick, day) : PICK_INTERVAL_DAYS;
        if (!isOverride && since < PICK_INTERVAL_DAYS) continue;

        const at = lagosAt(day, 7, 10 * p.index);
        const historic = await historicSafeDate(db, orgId, p.greenhouseId, at);
        const blocked = isHarvestBlocked(historic, day);
        if (blocked && !isOverride) continue; // inside a PHI — wait it out
        if (isOverride && !blocked) {
          console.warn(`[seed] 07: ${p.gh} is not inside a PHI on ${day}; override harvest posted as normal`);
        }

        const totalKg =
          p.dailyKg *
          Math.min(since, 7) *
          rampFactor(daysBetween(p.firstHarvest, day)) *
          wobble(p.index, p.picks);
        const lines = gradeSplit(totalKg, p.picks, KG_PER_CRATE[p.cropName] ?? 20, isOverride);
        const ctx = isOverride ? manager : worker;

        const out = await db.transaction(async (tx) => {
          // Time-travel the denormalised PHI column to its historic value…
          await tx
            .update(greenhouses)
            .set({ harvestSafeDate: historic })
            .where(and(eq(greenhouses.id, p.greenhouseId), eq(greenhouses.organisationId, orgId)));
          const res = await postHarvest(tx, ctx, {
            greenhouseId: p.greenhouseId,
            cropCycleId: p.cycleId,
            storeId: packhouse,
            harvestedAt: at,
            lines,
            notes: isOverride ? "Picked inside PHI on manager override — processing grade only." : null,
            override: isOverride ? { reason: OVERRIDE.reason } : null,
          });
          // …and restore today's value before committing.
          await tx
            .update(greenhouses)
            .set({ harvestSafeDate: finalSafe.get(p.greenhouseId) ?? null })
            .where(and(eq(greenhouses.id, p.greenhouseId), eq(greenhouses.organisationId, orgId)));
          return res;
        });
        if (out.overrideUsed) overrideCount += 1;
        harvestCount += 1;
        p.lastPick = day;
        p.picks += 1;
      }

      // 2. Sales on Tue/Fri at midday (createSaleHandler stamps 12:00 Lagos).
      if (SALE_WEEKDAYS.has(weekday(day)) && day > firstDay) {
        const customer = DEMO_CUSTOMERS[saleIndex % DEMO_CUSTOMERS.length];
        const saleLinesIn: {
          cropId: string;
          grade: Grade;
          kg: number;
          priceBasis: "per_kg";
          unitPrice: string;
        }[] = [];
        await db.transaction(async (tx) => {
          for (const [k, share] of Object.entries(customer.appetite)) {
            const [cropName, grade] = k.split(":") as ["Tomato" | "Pepper", Grade];
            const cropId = cropIdByName.get(cropName);
            if (!cropId || !share) continue;
            const lots = await fifoLotCandidates(tx, manager, { cropId, grade, storeId: packhouse });
            const available = roundQty(lots.reduce((s, l) => s + l.onHand, 0));
            // Whole half-kilos, never more than is on hand.
            const kg = Math.floor(available * share * 2) / 2;
            if (kg < 2) continue;
            const naira =
              grade === "a"
                ? Math.min(2000, Math.max(1200, BASE_A_NAIRA[cropName] * customer.priceFactor))
                : BASE_A_NAIRA[cropName] * customer.priceFactor * GRADE_PRICE[grade];
            saleLinesIn.push({
              cropId,
              grade,
              kg,
              priceBasis: "per_kg",
              unitPrice: String(Math.round(naira / 50) * 50),
            });
          }
        });
        if (saleLinesIn.length > 0) {
          const res = await createSaleHandler(
            {
              customerId: customerIds.get(customer.key)!,
              saleDate: day,
              storeId: packhouse,
              notes: "",
              lines: saleLinesIn,
            },
            manager,
          );
          postedSales.push({ id: res.id, saleDate: day, totalKobo: res.totalKobo });
          bump(state, "sale_lines", saleLinesIn.length);
          saleIndex += 1;
        }

        // 3. Packhouse sort at 16:00: anything past best-before is wasted.
        await db.transaction(async (tx) => {
          const stale = await tx
            .select({
              lotId: produceLots.id,
              grade: produceLots.grade,
              onHand: sql<string>`sum(${produceMovements.kg})`,
            })
            .from(produceLots)
            .innerJoin(
              produceMovements,
              and(
                eq(produceMovements.produceLotId, produceLots.id),
                eq(produceMovements.organisationId, orgId),
                eq(produceMovements.storeId, packhouse),
              ),
            )
            .where(
              and(
                eq(produceLots.organisationId, orgId),
                sql`${produceLots.bestBeforeDate} < ${day}`,
              ),
            )
            .groupBy(produceLots.id, produceLots.grade)
            .having(sql`sum(${produceMovements.kg}) > 0`);
          for (const s of stale) {
            const kg = roundQty(Number(s.onHand));
            const wasteReason =
              s.grade === "reject"
                ? "Rejects not collected before best-before — composted"
                : "Past best-before at packhouse sort — overripe";
            const mv = await postProduceMovement(tx, manager, {
              lotId: s.lotId,
              storeId: packhouse,
              type: "waste",
              kg,
              wasteReason,
              performedAt: lagosAt(day, 16),
            });
            await writeAudit(tx, manager, {
              action: "produce.waste",
              entityType: "produce_movement",
              entityId: mv.id,
              after: { lotId: s.lotId, storeId: packhouse, kg, wasteReason },
              reason: wasteReason,
            });
            wasteCount += 1;
          }
        });
      }
    }

    // ── Payments: ~30% left unpaid / part-paid, spread across ageing ──
    // One open sale per ageing bucket (0-7, 8-14, 15-30, >30 days) where the
    // bucket has a sale; statuses alternate unpaid / part-paid. Then top up
    // to ~30% with the most recent sales (typical: recent invoices open).
    const age = (d: string) => daysBetween(d, today);
    const buckets: [number, number][] = [
      [31, 10_000],
      [15, 30],
      [8, 14],
      [0, 7],
    ];
    const open = new Map<string, "unpaid" | "part_paid">();
    let flip = 0;
    for (const [lo, hi] of buckets) {
      const s = postedSales.find((x) => age(x.saleDate) >= lo && age(x.saleDate) <= hi && !open.has(x.id));
      if (s) open.set(s.id, flip++ % 2 === 0 ? "unpaid" : "part_paid");
    }
    const target = Math.round(postedSales.length * 0.3);
    for (const s of [...postedSales].reverse()) {
      if (open.size >= target) break;
      if (!open.has(s.id)) open.set(s.id, flip++ % 2 === 0 ? "unpaid" : "part_paid");
    }

    let paymentCount = 0;
    for (const [i, s] of postedSales.entries()) {
      const openAs = open.get(s.id);
      if (openAs === "unpaid" || s.totalKobo <= 0) continue;
      const lag = [0, 3, 7, 2][i % 4];
      const receivedDate = [addDays(s.saleDate, lag), lastDay].sort()[0];
      if (openAs === "part_paid") {
        const part = Math.floor((s.totalKobo * (i % 2 === 0 ? 0.5 : 0.4)) / 100);
        if (part <= 0) continue;
        await recordPaymentHandler(
          {
            saleId: s.id,
            amount: String(part),
            method: "transfer",
            receivedDate: [addDays(s.saleDate, 2), lastDay].sort()[0],
            notes: "Part payment — balance promised next delivery.",
          },
          manager,
        );
        paymentCount += 1;
        continue;
      }
      // Paid in full: one payment, or two instalments for every third sale.
      const amounts =
        i % 3 === 2
          ? [Math.floor(s.totalKobo / 2), s.totalKobo - Math.floor(s.totalKobo / 2)]
          : [s.totalKobo];
      for (const [j, kobo] of amounts.entries()) {
        await recordPaymentHandler(
          {
            saleId: s.id,
            amount: (kobo / 100).toFixed(2),
            method: lag === 0 && j === 0 ? "cash" : "transfer",
            receivedDate: j === 0 ? receivedDate : [addDays(receivedDate, 3), lastDay].sort()[0],
            notes: "",
          },
          manager,
        );
        paymentCount += 1;
      }
    }

    // ── Row counts ───────────────────────────────────────────────────
    const countOf = async (table: typeof harvestLines | typeof produceLots | typeof produceMovements) => {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(table.organisationId, orgId));
      return n;
    };
    const [{ n: openSales }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sales)
      .where(and(eq(sales.organisationId, orgId), inArray(sales.status, ["unpaid", "part_paid"])));
    const [{ n: paymentRows }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(paymentsReceived)
      .where(eq(paymentsReceived.organisationId, orgId));
    const [{ n: harvestRows }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(harvests)
      .where(eq(harvests.organisationId, orgId));
    const [{ n: saleLineRows }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(saleLines)
      .where(eq(saleLines.organisationId, orgId));

    bump(state, "harvests", harvestRows);
    bump(state, "harvest_lines", await countOf(harvestLines));
    bump(state, "produce_lots", await countOf(produceLots));
    bump(state, "produce_movements", await countOf(produceMovements));
    bump(state, "sales", postedSales.length);
    bump(state, "payments_received", paymentRows);
    bump(state, "audit_log", harvestCount + postedSales.length + paymentCount + wasteCount);
    // sale_lines were bumped per sale; keep the count honest if they differ.
    const bumped = state.counts["sale_lines"] ?? 0;
    if (bumped !== saleLineRows) state.counts["sale_lines"] = saleLineRows;

    console.log(
      `[seed] 07: ${harvestCount} harvests (${overrideCount} PHI override), ` +
        `${postedSales.length} sales (${openSales} unpaid/part-paid), ` +
        `${paymentCount} payments, ${wasteCount} waste movements`,
    );
    if (overrideCount !== 1) {
      console.warn(`[seed] 07: expected exactly 1 PHI-override harvest, got ${overrideCount}`);
    }
  },
};
