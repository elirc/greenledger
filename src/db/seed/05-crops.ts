import { and, eq } from "drizzle-orm";
import {
  cropCycles,
  crops,
  nurseryBatches,
  scoutingLogs,
  tasks,
  varieties,
} from "../schema";
import type { Ctx } from "../../lib/guard";
import { writeAudit } from "../../lib/audit";
import { addDays, lagosDateOf } from "../../lib/dates";
import { newId } from "../../lib/ids";
import type { Role } from "../../lib/permissions";
import { assertTransition, type CycleStatus } from "../../modules/cycles/status";
import { expectedDates, transplantToCycle } from "../../modules/cycles/transplant";
import { recordPlantLoss } from "../../modules/losses/handlers";
import type { LossCause } from "../../modules/losses/schema";
import type { TaskStatus } from "../../modules/tasks/schema";
import type { ScoutingSeverity } from "../../modules/scouting/schema";
import { DEMO_ORG, DEMO_USERS } from "./02-org";
import { bump, type SeedState, type SeedStep } from "./state";

/**
 * Phase 3 seed (DATA-MODEL §6): crops + 6 varieties, nursery history, the
 * 4 active cycles (created through `transplantToCycle`, losses through
 * `recordPlantLoss` so plants_alive = transplanted − Σ losses holds),
 * 2 planned cycles, 1 closed historic cycle, scouting logs and ~16 tasks.
 *
 * Fully deterministic: no RNG; every date is derived from `state.now`.
 */

// ── Crops & varieties ──────────────────────────────────────────────────

export const DEMO_CROPS = [
  { key: "tomato", name: "Tomato", shelfLifeDays: 7 },
  { key: "pepper", name: "Pepper", shelfLifeDays: 10 },
] as const;
type CropKey = (typeof DEMO_CROPS)[number]["key"];

export const DEMO_VARIETIES: ReadonlyArray<{
  crop: CropKey;
  name: string;
  daysToFirstHarvest: number;
  harvestDurationWeeks: number;
  expectedYieldKgPerPlant: string;
  notes: string;
}> = [
  { crop: "tomato", name: "Padma F1", daysToFirstHarvest: 75, harvestDurationWeeks: 10, expectedYieldKgPerPlant: "4.50", notes: "Indeterminate; good TYLCV tolerance." },
  { crop: "tomato", name: "Cobra F1", daysToFirstHarvest: 75, harvestDurationWeeks: 10, expectedYieldKgPerPlant: "4.50", notes: "Firm round fruit, travels well to Lagos." },
  { crop: "pepper", name: "California Wonder", daysToFirstHarvest: 70, harvestDurationWeeks: 12, expectedYieldKgPerPlant: "2.00", notes: "Bell pepper." },
  { crop: "pepper", name: "Habanero Red", daysToFirstHarvest: 70, harvestDurationWeeks: 12, expectedYieldKgPerPlant: "2.00", notes: "Hot pepper (ata rodo type)." },
  { crop: "pepper", name: "Tatashe", daysToFirstHarvest: 70, harvestDurationWeeks: 12, expectedYieldKgPerPlant: "2.00", notes: "Red bell-type, sweet." },
  { crop: "pepper", name: "Chilli Long Slim", daysToFirstHarvest: 70, harvestDurationWeeks: 12, expectedYieldKgPerPlant: "2.00", notes: "Long cayenne-type chilli." },
];

// ── Cycles ─────────────────────────────────────────────────────────────

interface TransplantedCyclePlan {
  key: string;
  greenhouse: string;
  zone: "A" | "B";
  variety: string;
  /** Transplant date = seed day − transplantDaysAgo. */
  transplantDaysAgo: number;
  /** Days seedlings spent in the nursery before transplant. */
  nurseryDays: number;
  seedsSown: number;
  germinated: number;
  transplanted: number;
  /** Final status after creation (transplantToCycle creates 'growing'). */
  finalStatus: Extract<CycleStatus, "growing" | "harvesting" | "closed">;
  /** [days after transplant, plants lost, cause, note] */
  losses: ReadonlyArray<[number, number, LossCause, string]>;
}

/**
 * Historic GH1 cycle first so it takes code GH1-<yr>-01 and the live GH1
 * cycle gets -02. Live transplants are 10–14 weeks ago; alive ≈ 950–990.
 */
export const DEMO_TRANSPLANTED_CYCLES: ReadonlyArray<TransplantedCyclePlan> = [
  {
    key: "gh1-historic",
    greenhouse: "GH1",
    zone: "A",
    variety: "Padma F1",
    transplantDaysAgo: 245,
    nurseryDays: 28,
    seedsSown: 1100,
    germinated: 1052,
    transplanted: 1000,
    finalStatus: "closed",
    losses: [
      [9, 14, "disease", "Damping-off after transplant"],
      [40, 22, "pest", "Tuta absoluta damage"],
      [95, 18, "heat", "Heat stress during dry spell"],
    ],
  },
  {
    key: "gh1",
    greenhouse: "GH1",
    zone: "A",
    variety: "Padma F1",
    transplantDaysAgo: 72,
    nurseryDays: 28,
    seedsSown: 1100,
    germinated: 1061,
    transplanted: 1000,
    finalStatus: "growing",
    losses: [
      [6, 9, "physical", "Stems snapped during trellising"],
      [30, 7, "pest", "Tuta absoluta — plants removed"],
    ],
  },
  {
    key: "gh2",
    greenhouse: "GH2",
    zone: "A",
    variety: "Cobra F1",
    transplantDaysAgo: 91,
    nurseryDays: 28,
    seedsSown: 1100,
    germinated: 1047,
    transplanted: 1000,
    finalStatus: "harvesting",
    losses: [
      [5, 12, "physical", "Transplant shock"],
      [33, 15, "disease", "Early blight"],
      [70, 9, "heat", "Wilted during power outage (fans off)"],
    ],
  },
  {
    key: "gh3",
    greenhouse: "GH3",
    zone: "A",
    variety: "California Wonder",
    transplantDaysAgo: 98,
    nurseryDays: 35,
    seedsSown: 1100,
    germinated: 1039,
    transplanted: 1000,
    finalStatus: "harvesting",
    losses: [
      [8, 10, "disease", "Damping-off"],
      [45, 14, "pest", "Aphid-spread virus — rogued"],
      [80, 6, "other", "Rodent damage at base"],
    ],
  },
  {
    key: "gh4",
    greenhouse: "GH4",
    zone: "A",
    variety: "Habanero Red",
    transplantDaysAgo: 70,
    nurseryDays: 35,
    seedsSown: 1100,
    germinated: 1044,
    transplanted: 1000,
    finalStatus: "growing",
    losses: [
      [4, 8, "physical", "Transplant shock"],
      [38, 11, "pest", "Spider mites"],
    ],
  },
];

/** Planned cycles (no plants yet). sowDate = seed day + sowInDays. */
export const DEMO_PLANNED_CYCLES = [
  { greenhouse: "GH5", variety: "Tatashe", sowInDays: 7, notes: "Next Tatashe block for the dry season." },
  { greenhouse: "GH6", variety: "Chilli Long Slim", sowInDays: 21, notes: "Export chilli trial." },
] as const;

/** The open nursery batch (Tatashe, sown 12 days ago). */
const OPEN_BATCH = {
  variety: "Tatashe",
  sowDaysAgo: 12,
  trays: 11,
  cellsPerTray: 104,
  seedsSown: 1100,
  germinated: 1012,
} as const;

// ── Scouting & tasks ───────────────────────────────────────────────────

const DEMO_SCOUTING: ReadonlyArray<{
  cycle: string;
  daysAgo: number;
  pestOrDisease: string;
  severity: ScoutingSeverity;
  actionTaken: string | null;
  by: Role;
}> = [
  { cycle: "gh1", daysAgo: 12, pestOrDisease: "Whitefly", severity: "low", actionTaken: "Yellow sticky traps replaced", by: "worker" },
  { cycle: "gh1", daysAgo: 5, pestOrDisease: "Tuta absoluta", severity: "medium", actionTaken: "Removed mined leaves; pheromone traps set", by: "worker" },
  { cycle: "gh2", daysAgo: 9, pestOrDisease: "Early blight", severity: "high", actionTaken: "Copper oxychloride spray scheduled", by: "worker" },
  { cycle: "gh3", daysAgo: 15, pestOrDisease: "Bacterial spot", severity: "medium", actionTaken: "Infected fruit removed", by: "worker" },
  { cycle: "gh3", daysAgo: 3, pestOrDisease: "Aphids", severity: "low", actionTaken: null, by: "worker" },
  { cycle: "gh4", daysAgo: 2, pestOrDisease: "Spider mites", severity: "medium", actionTaken: "Abamectin spray planned", by: "manager" },
];

const DEMO_TASKS: ReadonlyArray<{
  title: string;
  description?: string;
  /** due = seed day + dueInDays (negative = past) */
  dueInDays: number;
  status: TaskStatus;
  assignee: Role | null;
  greenhouse?: string;
  /** key from DEMO_TRANSPLANTED_CYCLES */
  cycle?: string;
  createdBy: Role;
}> = [
  { title: "Scout GH1 for Tuta absoluta", dueInDays: -3, status: "open", assignee: "worker", greenhouse: "GH1", cycle: "gh1", createdBy: "manager" },
  { title: "Replace yellow sticky traps GH2", dueInDays: -1, status: "open", assignee: "worker", greenhouse: "GH2", cycle: "gh2", createdBy: "manager" },
  { title: "Order CalNit and MKP", description: "Both below reorder level after this week's fertigation.", dueInDays: -2, status: "open", assignee: "storekeeper", createdBy: "manager" },
  { title: "Clean disc filters GH3", dueInDays: 0, status: "open", assignee: "worker", greenhouse: "GH3", createdBy: "manager" },
  { title: "Calibrate EC/pH meter", dueInDays: 1, status: "in_progress", assignee: "manager", createdBy: "manager" },
  { title: "Prune and train GH4 Habanero", dueInDays: 2, status: "open", assignee: "manager", greenhouse: "GH4", cycle: "gh4", createdBy: "manager" },
  { title: "Pot up Tatashe seedlings", description: "Nursery batch sown 12 days ago — check germination first.", dueInDays: 3, status: "open", assignee: "worker", createdBy: "manager" },
  { title: "Stock count — agrochemicals shelf", dueInDays: 5, status: "open", assignee: "storekeeper", createdBy: "manager" },
  { title: "Weekly greenhouse walk-through", dueInDays: 7, status: "open", assignee: "owner", createdBy: "owner" },
  { title: "Prepare GH5 beds for Tatashe", dueInDays: 9, status: "open", assignee: "manager", greenhouse: "GH5", createdBy: "manager" },
  { title: "Disinfect GH6 before planting", dueInDays: 14, status: "open", assignee: null, greenhouse: "GH6", createdBy: "owner" },
  { title: "Harvest GH2 Cobra — morning pick", dueInDays: -4, status: "done", assignee: "worker", greenhouse: "GH2", cycle: "gh2", createdBy: "manager" },
  { title: "Spray GH3 copper oxychloride", description: "Bacterial spot control. Observe REI before entry.", dueInDays: -6, status: "done", assignee: "manager", greenhouse: "GH3", cycle: "gh3", createdBy: "manager" },
  { title: "Fix drip leak GH1 zone B", dueInDays: -8, status: "done", assignee: "worker", greenhouse: "GH1", createdBy: "manager" },
  { title: "Service fertigation pump", dueInDays: -10, status: "done", assignee: "manager", createdBy: "owner" },
  { title: "Generator diesel top-up", description: "Cancelled — grid supply restored.", dueInDays: -5, status: "cancelled", assignee: "storekeeper", createdBy: "manager" },
];

// ── Helpers ────────────────────────────────────────────────────────────

/** A member's request context, built directly (no session in a script). */
function memberCtx(state: SeedState, role: Role): Ctx {
  const u = DEMO_USERS.find((x) => x.role === role)!;
  const userId = state.userIds[role];
  return {
    userId,
    orgId: state.orgId,
    role,
    user: { id: userId, name: u.name, phoneNumber: u.phoneNumber, isPlatformAdmin: false },
    org: { id: state.orgId, name: DEMO_ORG.name, status: "trial" },
    assignedGreenhouseIds: null,
    canSeeMoney: role !== "worker",
  };
}

/** 10:00 Lagos (09:00 UTC) on a Lagos calendar day. */
function lagosMorning(date: string): Date {
  return new Date(`${date}T09:00:00Z`);
}

// ── Step ───────────────────────────────────────────────────────────────

export const cropsStep: SeedStep = {
  name: "crops (varieties, nursery, cycles via transplant, losses, scouting, tasks)",
  async run(state) {
    const { db, orgId } = state;
    const manager = memberCtx(state, "manager");
    const today = lagosDateOf(state.now);

    // Crops + varieties
    const cropRows = await db
      .insert(crops)
      .values(DEMO_CROPS.map((c) => ({ organisationId: orgId, name: c.name, shelfLifeDays: c.shelfLifeDays })))
      .returning({ id: crops.id, name: crops.name });
    const cropIdByKey = new Map<CropKey, string>(
      DEMO_CROPS.map((c) => [c.key, cropRows.find((r) => r.name === c.name)!.id]),
    );
    bump(state, "crops", cropRows.length);

    const varietyRows = await db
      .insert(varieties)
      .values(
        DEMO_VARIETIES.map((v) => ({
          organisationId: orgId,
          cropId: cropIdByKey.get(v.crop)!,
          name: v.name,
          daysToFirstHarvest: v.daysToFirstHarvest,
          harvestDurationWeeks: v.harvestDurationWeeks,
          expectedYieldKgPerPlant: v.expectedYieldKgPerPlant,
          notes: v.notes,
        })),
      )
      .returning({ id: varieties.id, name: varieties.name });
    const varietyId = new Map(varietyRows.map((r) => [r.name, r.id]));
    bump(state, "varieties", varietyRows.length);

    // Transplanted cycles: nursery batch → transplantToCycle → losses → status.
    const cycleIdByKey = new Map<string, string>();
    for (const plan of DEMO_TRANSPLANTED_CYCLES) {
      const transplantDate = addDays(today, -plan.transplantDaysAgo);
      const sowDate = addDays(transplantDate, -plan.nurseryDays);
      const vId = varietyId.get(plan.variety)!;

      await db.transaction(async (tx) => {
        // Direct insert: no nursery service callable outside a request
        // (createNurseryBatch is a defineAction). Counters satisfy the CHECKs.
        const [batch] = await tx
          .insert(nurseryBatches)
          .values({
            organisationId: orgId,
            varietyId: vId,
            sowDate,
            trays: 11,
            cellsPerTray: 104,
            seedsSown: plan.seedsSown,
            germinated: plan.germinated,
            ready: plan.germinated,
            status: "open",
            notes: `Seedlings for ${plan.greenhouse}.`,
            createdBy: manager.userId,
            createdAt: lagosMorning(sowDate),
          })
          .returning({ id: nurseryBatches.id });
        bump(state, "nursery_batches");

        const { cycleId } = await transplantToCycle(tx, manager, {
          nurseryBatchId: batch.id,
          greenhouseId: state.greenhouseIds[plan.greenhouse],
          zoneId: state.zoneIds[`${plan.greenhouse}/${plan.zone}`] ?? null,
          count: plan.transplanted,
          transplantDate,
          closeBatch: true,
        });
        cycleIdByKey.set(plan.key, cycleId);
        bump(state, "crop_cycles");

        for (const [afterDays, count, cause, notes] of plan.losses) {
          await recordPlantLoss(tx, manager, {
            clientId: newId(),
            cropCycleId: cycleId,
            date: addDays(transplantDate, afterDays),
            count,
            cause,
            notes,
          });
          bump(state, "plant_losses");
        }

        // Status bumps (direct update; transitions checked by the machine).
        let status: CycleStatus = "growing";
        if (plan.finalStatus === "harvesting" || plan.finalStatus === "closed") {
          assertTransition(status, "harvesting");
          status = "harvesting";
        }
        let closedAt: Date | null = null;
        if (plan.finalStatus === "closed") {
          assertTransition(status, "closed");
          status = "closed";
          const v = DEMO_VARIETIES.find((x) => x.name === plan.variety)!;
          const { expectedEnd } = expectedDates(
            transplantDate,
            v.daysToFirstHarvest,
            v.harvestDurationWeeks,
          );
          closedAt = lagosMorning(addDays(expectedEnd, 2));
        }
        if (status !== "growing") {
          await tx
            .update(cropCycles)
            .set({ status, closedAt })
            .where(and(eq(cropCycles.id, cycleId), eq(cropCycles.organisationId, orgId)));
          await writeAudit(tx, manager, {
            action: "cycles.transition",
            entityType: "crop_cycle",
            entityId: cycleId,
            before: { status: "growing" },
            after: { status },
          });
        }
      });
    }

    // The open nursery batch.
    await db.insert(nurseryBatches).values({
      organisationId: orgId,
      varietyId: varietyId.get(OPEN_BATCH.variety)!,
      sowDate: addDays(today, -OPEN_BATCH.sowDaysAgo),
      trays: OPEN_BATCH.trays,
      cellsPerTray: OPEN_BATCH.cellsPerTray,
      seedsSown: OPEN_BATCH.seedsSown,
      germinated: OPEN_BATCH.germinated,
      status: "open",
      notes: "Tatashe for GH5.",
      createdBy: manager.userId,
      createdAt: lagosMorning(addDays(today, -OPEN_BATCH.sowDaysAgo)),
    });
    bump(state, "nursery_batches");

    // Planned cycles (direct insert — planCycle is a defineAction).
    for (const p of DEMO_PLANNED_CYCLES) {
      const sowDate = addDays(today, p.sowInDays);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(cropCycles)
          .values({
            organisationId: orgId,
            greenhouseId: state.greenhouseIds[p.greenhouse],
            varietyId: varietyId.get(p.variety)!,
            code: `${p.greenhouse}-${sowDate.slice(0, 4)}-01`,
            sowDate,
            status: "planned",
            notes: p.notes,
          })
          .returning({ id: cropCycles.id, code: cropCycles.code });
        await writeAudit(tx, manager, {
          action: "cycles.plan",
          entityType: "crop_cycle",
          entityId: row.id,
          after: { code: row.code, sowDate },
        });
      });
      bump(state, "crop_cycles");
    }

    // Scouting logs (no photos in the seed — files need real uploads).
    await db.transaction(async (tx) => {
      for (const s of DEMO_SCOUTING) {
        const ctx = memberCtx(state, s.by);
        const id = newId();
        const date = addDays(today, -s.daysAgo);
        await tx.insert(scoutingLogs).values({
          id,
          organisationId: orgId,
          cropCycleId: cycleIdByKey.get(s.cycle)!,
          date,
          pestOrDisease: s.pestOrDisease,
          severity: s.severity,
          actionTaken: s.actionTaken,
          createdBy: ctx.userId,
          createdAt: lagosMorning(date),
        });
        await writeAudit(tx, ctx, {
          action: "scouting.create",
          entityType: "scouting_log",
          entityId: id,
          after: { pestOrDisease: s.pestOrDisease, severity: s.severity, date },
        });
      }
    });
    bump(state, "scouting_logs", DEMO_SCOUTING.length);

    // Tasks (direct insert; mixed states incl. overdue).
    await db.transaction(async (tx) => {
      for (const t of DEMO_TASKS) {
        const creator = memberCtx(state, t.createdBy);
        const dueDate = addDays(today, t.dueInDays);
        const assignedTo = t.assignee ? state.userIds[t.assignee] : null;
        const done = t.status === "done";
        const [row] = await tx
          .insert(tasks)
          .values({
            organisationId: orgId,
            title: t.title,
            description: t.description ?? null,
            greenhouseId: t.greenhouse ? state.greenhouseIds[t.greenhouse] : null,
            cropCycleId: t.cycle ? cycleIdByKey.get(t.cycle)! : null,
            assignedTo,
            dueDate,
            status: t.status,
            completedAt: done ? lagosMorning(dueDate) : null,
            completedBy: done ? assignedTo : null,
            createdBy: creator.userId,
            createdAt: lagosMorning(addDays(dueDate, -7)),
          })
          .returning({ id: tasks.id });
        await writeAudit(tx, creator, {
          action: "tasks.create",
          entityType: "task",
          entityId: row.id,
          after: { title: t.title, dueDate, status: t.status },
        });
      }
    });
    bump(state, "tasks", DEMO_TASKS.length);
  },
};
