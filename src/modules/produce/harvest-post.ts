/**
 * The transactional harvest-posting core (orchestrator-owned).
 * Spec rules enforced here:
 * - "Logging a harvest inside a pre-harvest interval triggers a warning and
 *   needs a manager's override with a reason."
 * - One lot per harvest line; best-before = harvest Lagos date + crop shelf
 *   life; stock enters via harvest_in movements.
 */

import { and, eq } from "drizzle-orm";
import {
  cropCycles,
  crops,
  greenhouses,
  harvestLines,
  harvests,
  produceLots,
  varieties,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { addDays, lagosDateOf } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import type { Tx } from "@/db";
import { roundQty } from "@/modules/stock/logic";
import { postProduceMovement } from "./movements";

export type Grade = "a" | "b" | "c" | "reject";

export interface HarvestLineInput {
  grade: Grade;
  crates: number;
  kg: number;
}

export interface PostHarvestInput {
  /** Client-generated UUID (offline idempotency; becomes the harvest PK). */
  id?: string;
  greenhouseId: string;
  cropCycleId: string;
  /** Store the produce lands in (default: packhouse — caller resolves). */
  storeId: string;
  harvestedAt: Date;
  lines: HarvestLineInput[];
  notes?: string | null;
  /** PHI override — caller must have verified the role is owner|manager. */
  override?: { reason: string } | null;
}

/**
 * Is harvesting blocked by the greenhouse's PHI window on `date` (Lagos)?
 * Blocked while harvest_safe_date is strictly in the future.
 */
export function isHarvestBlocked(
  harvestSafeDate: string | null,
  lagosDate: string,
): boolean {
  return harvestSafeDate !== null && harvestSafeDate > lagosDate;
}

export async function postHarvest(
  tx: Tx,
  ctx: Ctx,
  input: PostHarvestInput,
): Promise<{ harvestId: string; lotIds: string[]; overrideUsed: boolean }> {
  if (input.lines.length === 0) {
    throw new DomainError("NO_LINES", "Add at least one grade line.");
  }
  const grades = new Set(input.lines.map((l) => l.grade));
  if (grades.size !== input.lines.length) {
    throw new DomainError("DUPLICATE_GRADE", "One line per grade.");
  }

  const cycle = await tx.query.cropCycles.findFirst({
    where: and(
      eq(cropCycles.id, input.cropCycleId),
      eq(cropCycles.organisationId, ctx.orgId),
    ),
  });
  if (!cycle) throw new DomainError("NOT_FOUND", "Crop cycle not found.");
  if (cycle.greenhouseId !== input.greenhouseId) {
    throw new DomainError(
      "CYCLE_MISMATCH",
      "That cycle is not in the selected greenhouse.",
    );
  }
  if (cycle.status !== "growing" && cycle.status !== "harvesting") {
    throw new DomainError(
      "CYCLE_NOT_ACTIVE",
      "Harvests can only be logged on growing or harvesting cycles.",
    );
  }

  const gh = await tx.query.greenhouses.findFirst({
    where: and(
      eq(greenhouses.id, input.greenhouseId),
      eq(greenhouses.organisationId, ctx.orgId),
    ),
  });
  if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");

  // PHI gate (spec): warning + manager override with a reason.
  const harvestDate = lagosDateOf(input.harvestedAt);
  const blocked = isHarvestBlocked(gh.harvestSafeDate, harvestDate);
  if (blocked && !input.override) {
    throw new DomainError(
      "PHI_BLOCKED",
      `This greenhouse is inside a pre-harvest interval until ${gh.harvestSafeDate}. A manager override with a reason is required.`,
    );
  }

  const variety = await tx.query.varieties.findFirst({
    where: and(
      eq(varieties.id, cycle.varietyId),
      eq(varieties.organisationId, ctx.orgId),
    ),
  });
  if (!variety) throw new DomainError("NOT_FOUND", "Variety not found.");
  const crop = await tx.query.crops.findFirst({
    where: and(
      eq(crops.id, variety.cropId),
      eq(crops.organisationId, ctx.orgId),
    ),
  });
  if (!crop) throw new DomainError("NOT_FOUND", "Crop not found.");

  const overrideUsed = blocked && !!input.override;
  const [harvest] = await tx
    .insert(harvests)
    .values({
      ...(input.id ? { id: input.id } : {}),
      organisationId: ctx.orgId,
      greenhouseId: input.greenhouseId,
      cropCycleId: input.cropCycleId,
      harvestedAt: input.harvestedAt,
      harvestedBy: ctx.userId,
      phiOverride: overrideUsed,
      phiOverrideReason: overrideUsed ? input.override!.reason : null,
      phiOverrideBy: overrideUsed ? ctx.userId : null,
      notes: input.notes ?? null,
    })
    .returning({ id: harvests.id });

  const bestBefore = addDays(harvestDate, crop.shelfLifeDays);
  const lotIds: string[] = [];
  for (const line of input.lines) {
    const kg = roundQty(line.kg);
    if (kg <= 0) throw new DomainError("BAD_QTY", "Line weight must be positive.");
    await tx.insert(harvestLines).values({
      organisationId: ctx.orgId,
      harvestId: harvest.id,
      grade: line.grade,
      crates: line.crates.toFixed(2),
      kg: kg.toFixed(3),
    });
    const [lot] = await tx
      .insert(produceLots)
      .values({
        organisationId: ctx.orgId,
        cropId: crop.id,
        varietyId: variety.id,
        grade: line.grade,
        harvestId: harvest.id,
        harvestedAt: input.harvestedAt,
        bestBeforeDate: bestBefore,
      })
      .returning({ id: produceLots.id });
    lotIds.push(lot.id);
    await postProduceMovement(tx, ctx, {
      lotId: lot.id,
      storeId: input.storeId,
      type: "harvest_in",
      kg,
      performedAt: input.harvestedAt,
    });
  }

  // First harvest flips a growing cycle to harvesting.
  if (cycle.status === "growing") {
    await tx
      .update(cropCycles)
      .set({ status: "harvesting" })
      .where(eq(cropCycles.id, cycle.id));
  }

  await writeAudit(tx, ctx, {
    action: overrideUsed ? "harvest.create.phi_override" : "harvest.create",
    entityType: "harvest",
    entityId: harvest.id,
    after: {
      cycleId: input.cropCycleId,
      lines: input.lines,
      harvestSafeDate: gh.harvestSafeDate,
    },
    reason: overrideUsed ? input.override!.reason : undefined,
  });

  return { harvestId: harvest.id, lotIds, overrideUsed };
}
