/**
 * The nursery → crop-cycle coupling point (spec: "Transplanting moves
 * seedlings into a crop cycle and sets its plant count"). Shared by the
 * nursery UI (P3-A) and the cycles module (P3-B); orchestrator-owned.
 */

import { and, eq, like } from "drizzle-orm";
import { cropCycles, greenhouses, nurseryBatches, varieties } from "@/db/schema";
import { addDays, lagosDateOf } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { Ctx } from "@/lib/guard";
import type { Tx } from "@/db";

export interface TransplantInput {
  nurseryBatchId: string;
  greenhouseId: string;
  zoneId?: string | null;
  /** Seedlings moved into the greenhouse. */
  count: number;
  /** yyyy-MM-dd Lagos date. */
  transplantDate: string;
  /** Mark the nursery batch finished even if seedlings remain. */
  closeBatch?: boolean;
}

/**
 * Creates the crop cycle (status growing), sets plant counts, computes
 * expected dates from the variety, and updates the nursery batch counters —
 * all inside the caller's transaction. Returns the new cycle id.
 */
export async function transplantToCycle(
  tx: Tx,
  ctx: Ctx,
  input: TransplantInput,
): Promise<{ cycleId: string; code: string }> {
  if (input.count <= 0) {
    throw new DomainError("BAD_COUNT", "Transplant count must be positive.");
  }

  const [batch] = await tx
    .select()
    .from(nurseryBatches)
    .where(
      and(
        eq(nurseryBatches.id, input.nurseryBatchId),
        eq(nurseryBatches.organisationId, ctx.orgId),
      ),
    )
    .for("update");
  if (!batch) throw new DomainError("NOT_FOUND", "Nursery batch not found.");
  if (batch.status !== "open") {
    throw new DomainError("BATCH_CLOSED", "This nursery batch is finished.");
  }

  const available =
    (batch.germinated || batch.seedsSown) - batch.transplanted - batch.discarded;
  if (input.count > available) {
    throw new DomainError(
      "BAD_COUNT",
      `Only ${available} seedlings are available in this batch.`,
    );
  }

  const gh = await tx.query.greenhouses.findFirst({
    where: and(
      eq(greenhouses.id, input.greenhouseId),
      eq(greenhouses.organisationId, ctx.orgId),
    ),
  });
  if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");

  const variety = await tx.query.varieties.findFirst({
    where: and(
      eq(varieties.id, batch.varietyId),
      eq(varieties.organisationId, ctx.orgId),
    ),
  });
  if (!variety) throw new DomainError("NOT_FOUND", "Variety not found.");

  const expectedFirstHarvest = addDays(
    input.transplantDate,
    variety.daysToFirstHarvest,
  );
  const expectedEnd = addDays(
    expectedFirstHarvest,
    variety.harvestDurationWeeks * 7,
  );

  // Cycle code "GH1-2026-02": greenhouse name + year + per-greenhouse
  // sequence. Max existing suffix + 1 (a bare count collides after deletes).
  const year = input.transplantDate.slice(0, 4);
  const prefix = `${gh.name}-${year}-`;
  const existing = await tx
    .select({ code: cropCycles.code })
    .from(cropCycles)
    .where(
      and(
        eq(cropCycles.organisationId, ctx.orgId),
        eq(cropCycles.greenhouseId, input.greenhouseId),
        like(cropCycles.code, `${prefix}%`),
      ),
    );
  const maxSeq = existing.reduce((m, r) => {
    const n = Number(r.code.slice(prefix.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  const code = `${prefix}${String(maxSeq + 1).padStart(2, "0")}`;

  const [cycle] = await tx
    .insert(cropCycles)
    .values({
      organisationId: ctx.orgId,
      greenhouseId: input.greenhouseId,
      zoneId: input.zoneId ?? null,
      varietyId: batch.varietyId,
      nurseryBatchId: batch.id,
      code,
      sowDate: batch.sowDate,
      transplantDate: input.transplantDate,
      plantsTransplanted: input.count,
      plantsAlive: input.count,
      expectedFirstHarvest,
      expectedEnd,
      status: "growing",
    })
    .returning({ id: cropCycles.id, code: cropCycles.code });

  const newTransplanted = batch.transplanted + input.count;
  const exhausted =
    newTransplanted + batch.discarded >=
    (batch.germinated || batch.seedsSown);
  await tx
    .update(nurseryBatches)
    .set({
      transplanted: newTransplanted,
      status: input.closeBatch || exhausted ? "transplanted" : "open",
    })
    .where(eq(nurseryBatches.id, batch.id));

  await writeAudit(tx, ctx, {
    action: "nursery.transplant",
    entityType: "crop_cycle",
    entityId: cycle.id,
    after: {
      code: cycle.code,
      count: input.count,
      nurseryBatchId: batch.id,
      greenhouseId: input.greenhouseId,
    },
  });

  return { cycleId: cycle.id, code: cycle.code };
}

/** Re-derives expected dates when a transplant date is edited. */
export function expectedDates(
  transplantDate: string,
  daysToFirstHarvest: number,
  harvestWeeks: number,
): { expectedFirstHarvest: string; expectedEnd: string } {
  const expectedFirstHarvest = addDays(transplantDate, daysToFirstHarvest);
  return {
    expectedFirstHarvest,
    expectedEnd: addDays(expectedFirstHarvest, harvestWeeks * 7),
  };
}

/** Today's Lagos date — convenience for forms' default values. */
export function todayForForms(): string {
  return lagosDateOf(new Date());
}
