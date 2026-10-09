import { and, eq, isNotNull } from "drizzle-orm";
import {
  cropCycles,
  equipment,
  expenses,
  maintenanceLogs,
  maintenanceSchedules,
} from "../schema";
import type { Ctx } from "../../lib/guard";
import { writeAudit } from "../../lib/audit";
import { addDays, lagosDateOf } from "../../lib/dates";
import type { Role } from "../../lib/permissions";
import { dateToLagosLocal } from "../../modules/applications/schema";
import { recordReading } from "../../modules/readings/handlers";
import { DEMO_ORG, DEMO_USERS } from "./02-org";
import { WORKER_GREENHOUSES } from "./03-structure";
import { bump, type SeedState, type SeedStep } from "./state";

/**
 * Phase 6 seed: equipment register + maintenance, weekly running expenses,
 * climate readings.
 *
 * - 8 equipment rows (pumps, tank, dosing unit, sprayers, cover, net);
 * - 3 maintenance schedules — the pump service is overdue by 5 days (the
 *   scan.maintenance job picks it up), the sprayer check is due in 4 days,
 *   the dosing calibration in 10 — and 4 work logs consistent with each
 *   schedule's last_done_date;
 * - expenses for the last 10 weeks: labour ₦180k–220k/wk split across the
 *   crop cycles that had plants in the ground that week (cycle-attributed →
 *   counts in profitability), power/diesel ₦40k–60k and water ₦8k–12k at
 *   site level, haulage every third week, two repairs;
 * - climate readings 3×/week for GH1–GH4 over 10 weeks via the same
 *   `recordReading` the action/sync route use (worker for assigned GH1–3,
 *   manager for GH4). Every ~5th reading is climate-only (no EC/pH).
 *
 * Fully deterministic: no RNG for values; every date derives from state.now.
 */

// ── Plan ───────────────────────────────────────────────────────────────

type EquipKey =
  | "pump1"
  | "borehole"
  | "tank"
  | "doser"
  | "knapsack"
  | "mistblower"
  | "cover4"
  | "net2";

const DEMO_EQUIPMENT: ReadonlyArray<{
  key: EquipKey;
  name: string;
  category: string;
  greenhouse: string | null;
  locationNote: string | null;
  serialNumber: string | null;
  purchasedDaysAgo: number;
  costNaira: number;
  status: "operational" | "needs_service" | "broken" | "retired";
  notes: string | null;
}> = [
  { key: "pump1", name: "Fertigation pump GH1–GH2", category: "pump", greenhouse: "GH1", locationNote: "Pump bay between GH1 and GH2", serialNumber: "PED-CPM158-22914", purchasedDaysAgo: 720, costNaira: 380_000, status: "operational", notes: "Pedrollo 1 HP centrifugal." },
  { key: "borehole", name: "Borehole submersible pump", category: "pump", greenhouse: null, locationNote: "Borehole beside the packhouse", serialNumber: "GRF-SP5A-7731", purchasedDaysAgo: 1100, costNaira: 650_000, status: "operational", notes: null },
  { key: "tank", name: "Main water tank 10,000 L", category: "tank", greenhouse: null, locationNote: "Tank stand, north fence", serialNumber: null, purchasedDaysAgo: 1100, costNaira: 420_000, status: "operational", notes: "Geepee vertical tank on 4 m stand." },
  { key: "doser", name: "Dosatron D25 dosing unit", category: "dosing_unit", greenhouse: "GH3", locationNote: "Fertigation head GH3", serialNumber: "DOS-D25RE2-0419", purchasedDaysAgo: 400, costNaira: 540_000, status: "operational", notes: null },
  { key: "knapsack", name: "Knapsack sprayer 16 L", category: "sprayer", greenhouse: null, locationNote: "Chemical store", serialNumber: null, purchasedDaysAgo: 210, costNaira: 38_000, status: "operational", notes: "Dedicated to fungicides." },
  { key: "mistblower", name: "Motorised mist blower", category: "sprayer", greenhouse: null, locationNote: "Chemical store", serialNumber: "STH-SR450-1187", purchasedDaysAgo: 560, costNaira: 285_000, status: "broken", notes: "Carburettor fault — awaiting parts from Lagos." },
  { key: "cover4", name: "UV poly cover GH4 (200 µm)", category: "cover", greenhouse: "GH4", locationNote: null, serialNumber: null, purchasedDaysAgo: 330, costNaira: 1_250_000, status: "operational", notes: "Rated for 3 seasons." },
  { key: "net2", name: "Insect net 50-mesh GH2", category: "net", greenhouse: "GH2", locationNote: "Side walls + vents", serialNumber: null, purchasedDaysAgo: 480, costNaira: 310_000, status: "needs_service", notes: "Several patches; plan replacement next dry season." },
];

type ScheduleKey = "pumpService" | "doserCal" | "sprayerCheck";

const DEMO_SCHEDULES: ReadonlyArray<{
  key: ScheduleKey;
  equipment: EquipKey;
  name: string;
  intervalDays: number;
  lastDoneDaysAgo: number;
}> = [
  // next due = last + 90 = 5 days ago → OVERDUE
  { key: "pumpService", equipment: "pump1", name: "Pump service — seals & impeller", intervalDays: 90, lastDoneDaysAgo: 95 },
  // next due in 10 days
  { key: "doserCal", equipment: "doser", name: "Dosing unit calibration", intervalDays: 30, lastDoneDaysAgo: 20 },
  // next due in 4 days → due soon
  { key: "sprayerCheck", equipment: "knapsack", name: "Nozzle & pressure check", intervalDays: 14, lastDoneDaysAgo: 10 },
];

const DEMO_LOGS: ReadonlyArray<{
  equipment: EquipKey;
  schedule: ScheduleKey | null;
  daysAgo: number;
  description: string;
  costNaira: number;
  by: Role;
}> = [
  { equipment: "pump1", schedule: "pumpService", daysAgo: 95, description: "Replaced mechanical seal, checked impeller and bearings", costNaira: 45_000, by: "manager" },
  { equipment: "net2", schedule: null, daysAgo: 40, description: "Patched torn insect net, east side wall", costNaira: 18_500, by: "manager" },
  { equipment: "doser", schedule: "doserCal", daysAgo: 20, description: "Calibrated injection ratio to 1:100, cleaned inlet filter", costNaira: 0, by: "manager" },
  { equipment: "knapsack", schedule: "sprayerCheck", daysAgo: 10, description: "Replaced cone nozzle and pressure gauge", costNaira: 6_500, by: "storekeeper" },
];

/** Repairs land as expenses too (category repairs, site level). */
const DEMO_REPAIRS: ReadonlyArray<{ daysAgo: number; naira: number; description: string }> = [
  { daysAgo: 40, naira: 18_500, description: "Insect net patching GH2" },
  { daysAgo: 12, naira: 32_000, description: "Mist blower carburettor (parts deposit)" },
];

const WEEKS = 10;
const READING_GREENHOUSES = ["GH1", "GH2", "GH3", "GH4"] as const;

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

/** hh:mm Lagos (UTC+1, no DST) on a Lagos calendar day. */
function lagosAt(date: string, hourLagos: number, minute = 0): Date {
  return new Date(
    `${date}T${String(hourLagos - 1).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
}

const naira = (n: number) => Math.round(n * 100);
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

// ── Step ───────────────────────────────────────────────────────────────

export const equipmentExpensesStep: SeedStep = {
  name: "equipment, maintenance, expenses & climate readings",
  async run(state) {
    const { db, orgId, siteId } = state;
    const manager = memberCtx(state, "manager");
    const today = lagosDateOf(state.now);

    // ── Equipment + schedules + logs ─────────────────────────────────
    const equipIds = new Map<EquipKey, string>();
    const scheduleIds = new Map<ScheduleKey, string>();

    await db.transaction(async (tx) => {
      for (const e of DEMO_EQUIPMENT) {
        const greenhouseId = e.greenhouse ? state.greenhouseIds[e.greenhouse] ?? null : null;
        const values = {
          name: e.name,
          category: e.category,
          siteId: siteId || null,
          greenhouseId,
          locationNote: e.locationNote,
          serialNumber: e.serialNumber,
          purchaseDate: addDays(today, -e.purchasedDaysAgo),
          costKobo: naira(e.costNaira),
          status: e.status,
          notes: e.notes,
        };
        const [row] = await tx
          .insert(equipment)
          .values({ organisationId: orgId, ...values })
          .returning({ id: equipment.id });
        equipIds.set(e.key, row.id);
        await writeAudit(tx, manager, {
          action: "equipment.create",
          entityType: "equipment",
          entityId: row.id,
          after: values,
        });
      }

      for (const s of DEMO_SCHEDULES) {
        const lastDoneDate = addDays(today, -s.lastDoneDaysAgo);
        const values = {
          equipmentId: equipIds.get(s.equipment)!,
          name: s.name,
          intervalDays: s.intervalDays,
          lastDoneDate,
          nextDueDate: addDays(lastDoneDate, s.intervalDays),
          isActive: true,
        };
        const [row] = await tx
          .insert(maintenanceSchedules)
          .values({ organisationId: orgId, ...values })
          .returning({ id: maintenanceSchedules.id });
        scheduleIds.set(s.key, row.id);
        await writeAudit(tx, manager, {
          action: "equipment.schedule_create",
          entityType: "maintenance_schedule",
          entityId: row.id,
          after: values,
        });
      }

      for (const l of DEMO_LOGS) {
        const actor = memberCtx(state, l.by);
        const doneDate = addDays(today, -l.daysAgo);
        const values = {
          equipmentId: equipIds.get(l.equipment)!,
          scheduleId: l.schedule ? scheduleIds.get(l.schedule)! : null,
          doneDate,
          description: l.description,
          costKobo: naira(l.costNaira),
          doneBy: actor.userId,
        };
        const [row] = await tx
          .insert(maintenanceLogs)
          .values({
            organisationId: orgId,
            ...values,
            createdAt: lagosAt(doneDate, 15),
          })
          .returning({ id: maintenanceLogs.id });
        await writeAudit(tx, actor, {
          action: "equipment.log_work",
          entityType: "maintenance_log",
          entityId: row.id,
          after: values,
        });
      }
    });
    bump(state, "equipment", DEMO_EQUIPMENT.length);
    bump(state, "maintenance_schedules", DEMO_SCHEDULES.length);
    bump(state, "maintenance_logs", DEMO_LOGS.length);

    // ── Expenses (last 10 weeks) ─────────────────────────────────────
    const cycles = await db
      .select({
        id: cropCycles.id,
        greenhouseId: cropCycles.greenhouseId,
        transplantDate: cropCycles.transplantDate,
        closedAt: cropCycles.closedAt,
      })
      .from(cropCycles)
      .where(and(eq(cropCycles.organisationId, orgId), isNotNull(cropCycles.transplantDate)));

    /** Cycles with plants in the ground on `date`. */
    const inGround = (date: string) =>
      cycles
        .filter(
          (c) =>
            (c.transplantDate as string) <= date &&
            (!c.closedAt || lagosDateOf(c.closedAt) >= date),
        )
        .sort((a, b) => a.id.localeCompare(b.id));

    type ExpenseSeed = {
      category: "labour" | "power" | "water" | "repairs" | "transport" | "other";
      amountKobo: number;
      incurredDate: string;
      siteId: string | null;
      greenhouseId: string | null;
      cropCycleId: string | null;
      description: string;
    };
    const rows: ExpenseSeed[] = [];
    const site = siteId || null;

    for (let w = 0; w < WEEKS; w++) {
      const date = addDays(today, -(7 * w + 2));

      // Labour ₦180k–220k, split across in-ground cycles (cycle-attributed).
      const labourNaira = 180_000 + ((w * 17) % 9) * 5_000;
      const active = inGround(date);
      if (active.length === 0) {
        rows.push({ category: "labour", amountKobo: naira(labourNaira), incurredDate: date, siteId: site, greenhouseId: null, cropCycleId: null, description: "Weekly wages" });
      } else {
        const share = Math.floor(labourNaira / active.length / 100) * 100;
        active.forEach((c, i) => {
          const amount = i === active.length - 1 ? labourNaira - share * (active.length - 1) : share;
          rows.push({
            category: "labour",
            amountKobo: naira(amount),
            incurredDate: date,
            siteId: site,
            greenhouseId: c.greenhouseId,
            cropCycleId: c.id,
            description: "Weekly wages (share for this cycle)",
          });
        });
      }

      // Power / diesel ₦40k–60k, site level.
      rows.push({
        category: "power",
        amountKobo: naira(40_000 + ((w * 7) % 5) * 5_000),
        incurredDate: addDays(date, -1),
        siteId: site,
        greenhouseId: null,
        cropCycleId: null,
        description: w % 2 === 0 ? "Diesel for generator" : "Prepaid electricity units",
      });

      // Water ₦8k–12k, site level.
      rows.push({
        category: "water",
        amountKobo: naira(8_000 + ((w * 3) % 5) * 1_000),
        incurredDate: addDays(date, -3),
        siteId: site,
        greenhouseId: null,
        cropCycleId: null,
        description: "Borehole treatment & tanker top-up",
      });

      // Haulage every third week, org level.
      if (w % 3 === 0) {
        rows.push({
          category: "transport",
          amountKobo: naira(15_000 + w * 500),
          incurredDate: addDays(date, -2),
          siteId: null,
          greenhouseId: null,
          cropCycleId: null,
          description: "Haulage to Mile 12 market",
        });
      }
    }
    for (const r of DEMO_REPAIRS) {
      rows.push({
        category: "repairs",
        amountKobo: naira(r.naira),
        incurredDate: addDays(today, -r.daysAgo),
        siteId: site,
        greenhouseId: null,
        cropCycleId: null,
        description: r.description,
      });
    }

    await db.transaction(async (tx) => {
      for (const r of rows) {
        const [row] = await tx
          .insert(expenses)
          .values({
            organisationId: orgId,
            ...r,
            createdBy: manager.userId,
            createdAt: lagosAt(r.incurredDate, 17),
          })
          .returning({ id: expenses.id });
        await writeAudit(tx, manager, {
          action: "expenses.create",
          entityType: "expense",
          entityId: row.id,
          after: r,
        });
      }
    });
    bump(state, "expenses", rows.length);

    // ── Climate readings (3×/week × 4 GHs × 10 weeks) ────────────────
    const worker = memberCtx(
      state,
      "worker",
      WORKER_GREENHOUSES.map((g) => state.greenhouseIds[g]).filter(Boolean),
    );
    let readings = 0;
    await db.transaction(async (tx) => {
      for (const [gi, gh] of READING_GREENHOUSES.entries()) {
        const greenhouseId = state.greenhouseIds[gh];
        if (!greenhouseId) continue;
        const actor = (WORKER_GREENHOUSES as readonly string[]).includes(gh) ? worker : manager;
        for (let d = WEEKS * 7 - 1; d >= 0; d--) {
          if (![0, 2, 4].includes(d % 7)) continue;
          const date = addDays(today, -(d + 1));
          const climateOnly = (d + gi) % 5 === 0;
          await recordReading(tx, actor, {
            clientId: crypto.randomUUID(),
            greenhouseId,
            recordedAt: dateToLagosLocal(lagosAt(date, 8, 30 + gi * 7)),
            temperatureC: round(26 + 8 * (((d * 7 + gi * 3) % 17) / 16), 1),
            humidityPct: round(55 + 30 * (((d * 5 + gi * 11) % 31) / 30), 0),
            ecMsCm: climateOnly ? undefined : round(1.8 + ((d * 3 + gi * 5) % 11) / 10, 2),
            ph: climateOnly ? undefined : round(5.6 + 0.8 * (((d * 11 + gi * 7) % 9) / 8), 2),
          });
          readings++;
        }
      }
    });
    bump(state, "climate_readings", readings);
  },
};
