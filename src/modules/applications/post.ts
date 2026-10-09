/**
 * The transactional application-posting core (orchestrator-owned).
 * One transaction: insert application → FEFO-issue every line through the
 * Phase-2 movement engine → application_items with PHI/REI snapshots →
 * GREATEST-update the greenhouse safety columns → audit.
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  applicationItems,
  applications,
  cropCycles,
  greenhouses,
  items,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import type { Tx } from "@/db";
import { issueFefo } from "@/modules/stock/movements";
import { computeSafety, laterDate, laterInstant } from "./logic";

export interface PostApplicationInput {
  /** Client-generated UUID (offline idempotency; becomes the application PK). */
  id?: string;
  greenhouseId: string;
  cropCycleId: string;
  type: "fertigation" | "spray";
  recipeId?: string | null;
  /** Final per-item quantities in base units (already recipe-scaled). */
  lines: { itemId: string; quantity: number }[];
  waterVolumeLitres: number;
  /** Store to draw inputs from. */
  storeId: string;
  appliedAt: Date;
  notes?: string | null;
}

export async function postApplication(
  tx: Tx,
  ctx: Ctx,
  input: PostApplicationInput,
): Promise<{ applicationId: string; entrySafeAt: Date | null; harvestSafeDate: string | null }> {
  if (input.lines.length === 0) {
    throw new DomainError("NO_LINES", "Add at least one input to apply.");
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

  const itemIds = input.lines.map((l) => l.itemId);
  const itemRows = await tx
    .select({
      id: items.id,
      category: items.category,
      phiDays: items.phiDays,
      reiHours: items.reiHours,
    })
    .from(items)
    .where(
      and(eq(items.organisationId, ctx.orgId), inArray(items.id, itemIds)),
    );
  if (itemRows.length !== itemIds.length) {
    throw new DomainError("NOT_FOUND", "An input on this application no longer exists.");
  }
  const byId = new Map(itemRows.map((r) => [r.id, r]));

  const safety = computeSafety(
    input.type,
    input.appliedAt,
    itemRows.map((r) => ({ phiDays: r.phiDays, reiHours: r.reiHours })),
  );

  const [app] = await tx
    .insert(applications)
    .values({
      ...(input.id ? { id: input.id } : {}),
      organisationId: ctx.orgId,
      greenhouseId: input.greenhouseId,
      cropCycleId: input.cropCycleId,
      type: input.type,
      recipeId: input.recipeId ?? null,
      waterVolumeLitres: input.waterVolumeLitres.toFixed(1),
      appliedAt: input.appliedAt,
      operatorId: ctx.userId,
      entrySafeAt: safety.entrySafeAt,
      harvestSafeDate: safety.harvestSafeDate,
      notes: input.notes ?? null,
    })
    .returning({ id: applications.id });

  // Issue stock per line (FEFO splits allowed) and snapshot label intervals
  // per allocation so the spray record never drifts with item edits.
  for (const line of input.lines) {
    const item = byId.get(line.itemId)!;
    const { allocations } = await issueFefo(tx, ctx, {
      itemId: line.itemId,
      storeId: input.storeId,
      quantity: line.quantity,
      greenhouseId: input.greenhouseId,
      cropCycleId: input.cropCycleId,
      applicationId: app.id,
      performedAt: input.appliedAt,
    });
    await tx.insert(applicationItems).values(
      allocations.map((a) => ({
        organisationId: ctx.orgId,
        applicationId: app.id,
        itemId: line.itemId,
        itemBatchId: a.batchId,
        quantity: a.quantity.toFixed(3),
        phiDaysSnapshot: item.phiDays,
        reiHoursSnapshot: item.reiHours,
      })),
    );
  }

  // Denormalized greenhouse safety state: GREATEST(existing, new).
  if (safety.entrySafeAt || safety.harvestSafeDate) {
    const [gh] = await tx
      .select({
        entrySafeAt: greenhouses.entrySafeAt,
        harvestSafeDate: greenhouses.harvestSafeDate,
      })
      .from(greenhouses)
      .where(
        and(
          eq(greenhouses.id, input.greenhouseId),
          eq(greenhouses.organisationId, ctx.orgId),
        ),
      )
      .for("update");
    if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
    await tx
      .update(greenhouses)
      .set({
        entrySafeAt: laterInstant(gh.entrySafeAt, safety.entrySafeAt),
        harvestSafeDate: laterDate(gh.harvestSafeDate, safety.harvestSafeDate),
      })
      .where(eq(greenhouses.id, input.greenhouseId));
  }

  await writeAudit(tx, ctx, {
    action: `applications.${input.type}`,
    entityType: "application",
    entityId: app.id,
    after: {
      cycleId: input.cropCycleId,
      volumeLitres: input.waterVolumeLitres,
      lines: input.lines,
      entrySafeAt: safety.entrySafeAt?.toISOString() ?? null,
      harvestSafeDate: safety.harvestSafeDate,
    },
  });

  return {
    applicationId: app.id,
    entrySafeAt: safety.entrySafeAt,
    harvestSafeDate: safety.harvestSafeDate,
  };
}
