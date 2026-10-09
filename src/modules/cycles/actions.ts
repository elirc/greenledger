"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  cropCycles,
  expenses,
  greenhouses,
  inventoryMovements,
  varieties,
} from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import type { Role } from "@/lib/permissions";
import {
  cycleIdSchema,
  cyclePlanSchema,
  cyclePlanUpdateSchema,
  cycleStartGrowingSchema,
  cycleTransitionSchema,
  cycleTransplantDateSchema,
} from "./schema";
import { assertTransition } from "./status";
import { expectedDates } from "./transplant";

/** Planning and status changes are owner/manager decisions. */
const PLAN_ROLES: Role[] = ["owner", "manager"];

function pgCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const direct = (e as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  return (e as { cause?: { code?: string } }).cause?.code;
}

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

function revalidateCycles(id?: string) {
  revalidatePath("/cycles");
  if (id) revalidatePath(`/cycles/${id}`);
  revalidatePath("/greenhouses", "layout");
}

/** Lock a cycle row in this org (SELECT … FOR UPDATE). */
async function lockCycle(tx: Tx, ctx: Ctx, id: string) {
  const [row] = await tx
    .select()
    .from(cropCycles)
    .where(and(eq(cropCycles.id, id), eq(cropCycles.organisationId, ctx.orgId)))
    .for("update");
  if (!row) throw new DomainError("NOT_FOUND", "Crop cycle not found.");
  return row;
}

/** FKs don't check the organisation — verify both refs are ours. */
async function loadPlanRefs(
  tx: Tx,
  ctx: Ctx,
  greenhouseId: string,
  varietyId: string,
) {
  const [gh] = await tx
    .select({
      id: greenhouses.id,
      name: greenhouses.name,
      isActive: greenhouses.isActive,
    })
    .from(greenhouses)
    .where(
      and(
        eq(greenhouses.id, greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    );
  if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
  const [variety] = await tx
    .select({ id: varieties.id })
    .from(varieties)
    .where(
      and(eq(varieties.id, varietyId), eq(varieties.organisationId, ctx.orgId)),
    );
  if (!variety) throw new DomainError("NOT_FOUND", "Variety not found.");
  return gh;
}

async function loadVariety(tx: Tx, ctx: Ctx, varietyId: string) {
  const variety = await tx.query.varieties.findFirst({
    where: and(
      eq(varieties.id, varietyId),
      eq(varieties.organisationId, ctx.orgId),
    ),
  });
  if (!variety) throw new DomainError("NOT_FOUND", "Variety not found.");
  return variety;
}

/**
 * Next free code "GH1-2026-03" — same shape as transplantToCycle (greenhouse
 * name + year + per-greenhouse sequence), skipping codes already taken.
 */
async function nextCycleCode(
  tx: Tx,
  ctx: Ctx,
  greenhouseId: string,
  greenhouseName: string,
  year: string,
): Promise<string> {
  const [count] = await tx
    .select({ n: sql<string>`count(*)` })
    .from(cropCycles)
    .where(
      and(
        eq(cropCycles.organisationId, ctx.orgId),
        eq(cropCycles.greenhouseId, greenhouseId),
      ),
    );
  // Codes are unique per org: collect every code with this prefix.
  const prefix = `${greenhouseName}-${year}-`;
  const rows = await tx
    .select({ code: cropCycles.code })
    .from(cropCycles)
    .where(
      and(
        eq(cropCycles.organisationId, ctx.orgId),
        sql`starts_with(${cropCycles.code}, ${prefix})`,
      ),
    );
  const taken = new Set(rows.map((r) => r.code));
  let n = Number(count?.n ?? 0) + 1;
  const make = () => `${prefix}${String(n).padStart(2, "0")}`;
  while (taken.has(make())) n += 1;
  return make();
}

// ------------------------------------------------------------ planning

export const planCycle = defineAction({
  name: "cycles.plan",
  schema: cyclePlanSchema,
  roles: PLAN_ROLES,
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const gh = await loadPlanRefs(
          tx,
          ctx,
          input.greenhouseId,
          input.varietyId,
        );
        if (!gh.isActive) {
          throw new DomainError(
            "INACTIVE_GREENHOUSE",
            "This greenhouse is marked inactive.",
          );
        }
        const code = await nextCycleCode(
          tx,
          ctx,
          gh.id,
          gh.name,
          input.sowDate.slice(0, 4),
        );
        const [row] = await tx
          .insert(cropCycles)
          .values({
            organisationId: ctx.orgId,
            greenhouseId: input.greenhouseId,
            varietyId: input.varietyId,
            code,
            sowDate: input.sowDate,
            status: "planned",
            notes: emptyToNull(input.notes),
          })
          .returning({ id: cropCycles.id, code: cropCycles.code });
        await writeAudit(tx, ctx, {
          action: "cycles.plan",
          entityType: "crop_cycle",
          entityId: row.id,
          after: {
            code: row.code,
            greenhouseId: input.greenhouseId,
            varietyId: input.varietyId,
            sowDate: input.sowDate,
          },
        });
        revalidateCycles(row.id);
        return { id: row.id, code: row.code };
      });
    } catch (e) {
      if (pgCode(e) === "23505") {
        throw new DomainError(
          "DUPLICATE",
          "Another cycle took that code just now — please try again.",
        );
      }
      throw e;
    }
  },
});

export const updatePlannedCycle = defineAction({
  name: "cycles.updatePlan",
  schema: cyclePlanUpdateSchema,
  roles: PLAN_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const before = await lockCycle(tx, ctx, input.id);
      if (before.status !== "planned") {
        throw new DomainError(
          "NOT_PLANNED",
          "Only planned cycles can be edited here.",
        );
      }
      await loadPlanRefs(tx, ctx, input.greenhouseId, input.varietyId);
      await tx
        .update(cropCycles)
        .set({
          greenhouseId: input.greenhouseId,
          varietyId: input.varietyId,
          sowDate: input.sowDate,
          notes: emptyToNull(input.notes),
        })
        .where(
          and(
            eq(cropCycles.id, input.id),
            eq(cropCycles.organisationId, ctx.orgId),
          ),
        );
      await writeAudit(tx, ctx, {
        action: "cycles.updatePlan",
        entityType: "crop_cycle",
        entityId: input.id,
        before: {
          greenhouseId: before.greenhouseId,
          varietyId: before.varietyId,
          sowDate: before.sowDate,
          notes: before.notes,
        },
        after: {
          greenhouseId: input.greenhouseId,
          varietyId: input.varietyId,
          sowDate: input.sowDate,
          notes: emptyToNull(input.notes),
        },
      });
      revalidateCycles(input.id);
      return { id: input.id };
    }),
});

export const deletePlannedCycle = defineAction({
  name: "cycles.deletePlan",
  schema: cycleIdSchema,
  roles: PLAN_ROLES,
  handler: async (input, ctx) => {
    try {
      return await db.transaction(async (tx) => {
        const before = await lockCycle(tx, ctx, input.id);
        if (before.status !== "planned") {
          throw new DomainError(
            "NOT_PLANNED",
            "Only planned cycles can be deleted. Close it instead.",
          );
        }
        // Stock issues / expenses use ON DELETE SET NULL — deleting would
        // silently strip their cycle attribution (profitability), so refuse.
        const [mv] = await tx
          .select({ id: inventoryMovements.id })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.organisationId, ctx.orgId),
              eq(inventoryMovements.cropCycleId, input.id),
            ),
          )
          .limit(1);
        const [exp] = await tx
          .select({ id: expenses.id })
          .from(expenses)
          .where(
            and(
              eq(expenses.organisationId, ctx.orgId),
              eq(expenses.cropCycleId, input.id),
            ),
          )
          .limit(1);
        if (mv || exp) {
          throw new DomainError(
            "IN_USE",
            "Stock or expenses are already recorded against this cycle — close it instead.",
          );
        }
        await tx
          .delete(cropCycles)
          .where(
            and(
              eq(cropCycles.id, input.id),
              eq(cropCycles.organisationId, ctx.orgId),
              eq(cropCycles.status, "planned"),
            ),
          );
        await writeAudit(tx, ctx, {
          action: "cycles.deletePlan",
          entityType: "crop_cycle",
          entityId: input.id,
          before: {
            code: before.code,
            greenhouseId: before.greenhouseId,
            varietyId: before.varietyId,
            sowDate: before.sowDate,
          },
        });
        revalidateCycles();
        return { id: input.id };
      });
    } catch (e) {
      if (pgCode(e) === "23503") {
        throw new DomainError(
          "IN_USE",
          "Stock or records already point at this cycle — close it instead.",
        );
      }
      throw e;
    }
  },
});

// --------------------------------------------------------- transitions

/** Planned / in-nursery → growing with a transplant date and plant count. */
export const startCycleGrowing = defineAction({
  name: "cycles.startGrowing",
  schema: cycleStartGrowingSchema,
  roles: PLAN_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const before = await lockCycle(tx, ctx, input.id);
      assertTransition(before.status, "growing");
      if (before.sowDate && input.transplantDate < before.sowDate) {
        throw new DomainError(
          "BAD_DATE",
          "The transplant date cannot be before the sow date.",
        );
      }
      const variety = await loadVariety(tx, ctx, before.varietyId);
      const dates = expectedDates(
        input.transplantDate,
        variety.daysToFirstHarvest,
        variety.harvestDurationWeeks,
      );
      await tx
        .update(cropCycles)
        .set({
          status: "growing",
          transplantDate: input.transplantDate,
          plantsTransplanted: input.plantCount,
          plantsAlive: input.plantCount,
          expectedFirstHarvest: dates.expectedFirstHarvest,
          expectedEnd: dates.expectedEnd,
        })
        .where(
          and(
            eq(cropCycles.id, input.id),
            eq(cropCycles.organisationId, ctx.orgId),
          ),
        );
      await writeAudit(tx, ctx, {
        action: "cycles.startGrowing",
        entityType: "crop_cycle",
        entityId: input.id,
        before: { status: before.status },
        after: {
          status: "growing",
          transplantDate: input.transplantDate,
          plantCount: input.plantCount,
          ...dates,
        },
      });
      revalidateCycles(input.id);
      return { id: input.id };
    }),
});

/** nursery / harvesting / closed — validated by the status machine. */
export const transitionCycle = defineAction({
  name: "cycles.transition",
  schema: cycleTransitionSchema,
  roles: PLAN_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const before = await lockCycle(tx, ctx, input.id);
      assertTransition(before.status, input.to);
      const closedAt = input.to === "closed" ? new Date() : null;
      await tx
        .update(cropCycles)
        .set({ status: input.to, ...(closedAt ? { closedAt } : {}) })
        .where(
          and(
            eq(cropCycles.id, input.id),
            eq(cropCycles.organisationId, ctx.orgId),
          ),
        );
      await writeAudit(tx, ctx, {
        action: "cycles.transition",
        entityType: "crop_cycle",
        entityId: input.id,
        before: { status: before.status },
        after: { status: input.to },
      });
      revalidateCycles(input.id);
      return { id: input.id, status: input.to };
    }),
});

/** Edit the transplant date; expected first harvest / end are re-derived. */
export const updateCycleTransplantDate = defineAction({
  name: "cycles.updateTransplantDate",
  schema: cycleTransplantDateSchema,
  roles: PLAN_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const before = await lockCycle(tx, ctx, input.id);
      const editable: (typeof before.status)[] = ["growing", "harvesting"];
      if (!editable.includes(before.status) || !before.transplantDate) {
        throw new DomainError(
          "NOT_EDITABLE",
          "Only growing or harvesting cycles have a transplant date to edit.",
        );
      }
      if (before.sowDate && input.transplantDate < before.sowDate) {
        throw new DomainError(
          "BAD_DATE",
          "The transplant date cannot be before the sow date.",
        );
      }
      const variety = await loadVariety(tx, ctx, before.varietyId);
      const dates = expectedDates(
        input.transplantDate,
        variety.daysToFirstHarvest,
        variety.harvestDurationWeeks,
      );
      await tx
        .update(cropCycles)
        .set({ transplantDate: input.transplantDate, ...dates })
        .where(
          and(
            eq(cropCycles.id, input.id),
            eq(cropCycles.organisationId, ctx.orgId),
          ),
        );
      await writeAudit(tx, ctx, {
        action: "cycles.updateTransplantDate",
        entityType: "crop_cycle",
        entityId: input.id,
        before: {
          transplantDate: before.transplantDate,
          expectedFirstHarvest: before.expectedFirstHarvest,
          expectedEnd: before.expectedEnd,
        },
        after: { transplantDate: input.transplantDate, ...dates },
      });
      revalidateCycles(input.id);
      return { id: input.id, ...dates };
    }),
});
