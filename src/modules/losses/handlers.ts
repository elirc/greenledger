/**
 * Plant-loss handler, plain module (NOT 'use server') per DECISIONS §17 so
 * the Phase-6 /api/sync route and the seed can call the same code the
 * Server Action does. No revalidatePath here — callers outside a Next
 * request (seed, sync batch) must not trip over it.
 */

import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { cropCycles, plantLosses } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { todayLagos } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { assertGreenhouse, type Ctx } from "@/lib/guard";
import type { CycleStatus } from "@/modules/cycles/status";
import type { PlantLossCreateInput } from "./schema";

/** Losses are logged against cycles that have plants in the ground. */
const LOSS_STATUSES: CycleStatus[] = ["growing", "harvesting"];

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "cause" in e &&
    (e as { cause?: { code?: string } }).cause?.code === "23505"
  );
}

/**
 * Inside the caller's transaction: lock the cycle row FOR UPDATE, check the
 * worker is assigned to its greenhouse, reject counts above plants_alive
 * (BAD_COUNT — plants_alive never goes below 0), insert the loss with
 * id = clientId, decrement plants_alive, audit. Keeps the invariant
 * plants_alive = plants_transplanted − Σ plant_losses.count.
 */
export async function recordPlantLoss(
  tx: Tx,
  ctx: Ctx,
  input: PlantLossCreateInput,
): Promise<{ id: string; plantsAlive: number }> {
  const [cycle] = await tx
    .select({
      id: cropCycles.id,
      greenhouseId: cropCycles.greenhouseId,
      status: cropCycles.status,
      plantsAlive: cropCycles.plantsAlive,
      transplantDate: cropCycles.transplantDate,
    })
    .from(cropCycles)
    .where(
      and(
        eq(cropCycles.id, input.cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
    )
    .for("update");
  if (!cycle) throw new DomainError("NOT_FOUND", "Crop cycle not found.");
  assertGreenhouse(ctx, cycle.greenhouseId);

  if (!LOSS_STATUSES.includes(cycle.status)) {
    throw new DomainError(
      "CYCLE_NOT_GROWING",
      "Losses can only be logged on growing or harvesting cycles.",
    );
  }
  if (input.date > todayLagos()) {
    throw new DomainError("BAD_DATE", "The date cannot be in the future.");
  }
  if (cycle.transplantDate && input.date < cycle.transplantDate) {
    throw new DomainError(
      "BAD_DATE",
      "The date cannot be before the cycle was transplanted.",
    );
  }
  if (input.count > cycle.plantsAlive) {
    throw new DomainError(
      "BAD_COUNT",
      `Only ${cycle.plantsAlive} plants are alive in this cycle.`,
    );
  }

  const notes = input.notes && input.notes.length > 0 ? input.notes : null;
  await tx.insert(plantLosses).values({
    id: input.clientId,
    organisationId: ctx.orgId,
    cropCycleId: cycle.id,
    date: input.date,
    count: input.count,
    cause: input.cause,
    notes,
    createdBy: ctx.userId,
  });

  const [updated] = await tx
    .update(cropCycles)
    .set({ plantsAlive: sql`${cropCycles.plantsAlive} - ${input.count}` })
    .where(
      and(
        eq(cropCycles.id, cycle.id),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
    )
    .returning({ plantsAlive: cropCycles.plantsAlive });

  await writeAudit(tx, ctx, {
    action: "losses.create",
    entityType: "plant_loss",
    entityId: input.clientId,
    before: { plantsAlive: cycle.plantsAlive },
    after: {
      cropCycleId: cycle.id,
      date: input.date,
      count: input.count,
      cause: input.cause,
      notes,
      plantsAlive: updated.plantsAlive,
    },
  });

  return { id: input.clientId, plantsAlive: updated.plantsAlive };
}

/** (input, ctx) handler: own transaction + replay → DUPLICATE mapping. */
export async function logPlantLossHandler(
  input: PlantLossCreateInput,
  ctx: Ctx,
): Promise<{ id: string; cropCycleId: string; plantsAlive: number }> {
  try {
    const result = await db.transaction((tx) => recordPlantLoss(tx, ctx, input));
    return { ...result, cropCycleId: input.cropCycleId };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new DomainError("DUPLICATE", "This loss was already recorded.");
    }
    throw e;
  }
}
