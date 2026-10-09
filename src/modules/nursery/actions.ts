"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  itemBatches,
  items,
  nurseryBatches,
  varieties,
  zones,
} from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { assertGreenhouse, type Ctx } from "@/lib/guard";
import { transplantToCycle } from "@/modules/cycles/transplant";
import {
  availableSeedlings,
  checkCountsUpdate,
  statusWhenEmpty,
} from "./logic";
import {
  nurseryBatchCreateSchema,
  nurseryCountsSchema,
  nurseryDiscardSchema,
  nurseryTransplantSchema,
} from "./schema";

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

function revalidateNursery(id?: string) {
  revalidatePath("/nursery");
  if (id) revalidatePath(`/nursery/${id}`);
}

/** Locks the batch row (FOR UPDATE) inside the caller's transaction. */
async function lockBatch(tx: Tx, ctx: Ctx, id: string) {
  const [batch] = await tx
    .select()
    .from(nurseryBatches)
    .where(
      and(
        eq(nurseryBatches.id, id),
        eq(nurseryBatches.organisationId, ctx.orgId),
      ),
    )
    .for("update");
  if (!batch) throw new DomainError("NOT_FOUND", "Nursery batch not found.");
  if (batch.status !== "open") {
    throw new DomainError("BATCH_CLOSED", "This nursery batch is finished.");
  }
  return batch;
}

// -------------------------------------------------------------------- create

export const createNurseryBatch = defineAction({
  name: "nursery.create",
  schema: nurseryBatchCreateSchema,
  roles: ["owner", "manager"],
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const variety = await tx.query.varieties.findFirst({
        where: and(
          eq(varieties.id, input.varietyId),
          eq(varieties.organisationId, ctx.orgId),
        ),
        columns: { id: true, isActive: true },
      });
      if (!variety) throw new DomainError("NOT_FOUND", "Variety not found.");
      if (!variety.isActive) {
        throw new DomainError("INACTIVE", "This variety is inactive.");
      }

      const seedItemBatchId = emptyToNull(input.seedItemBatchId);
      if (seedItemBatchId) {
        const [seed] = await tx
          .select({ id: itemBatches.id, category: items.category })
          .from(itemBatches)
          .innerJoin(
            items,
            and(
              eq(items.id, itemBatches.itemId),
              eq(items.organisationId, ctx.orgId),
            ),
          )
          .where(
            and(
              eq(itemBatches.id, seedItemBatchId),
              eq(itemBatches.organisationId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!seed) throw new DomainError("NOT_FOUND", "Seed batch not found.");
        if (seed.category !== "seed") {
          throw new DomainError("NOT_SEED", "That batch is not a seed item.");
        }
      }

      const [row] = await tx
        .insert(nurseryBatches)
        .values({
          organisationId: ctx.orgId,
          varietyId: input.varietyId,
          seedItemBatchId,
          sowDate: input.sowDate,
          trays: input.trays,
          cellsPerTray: input.cellsPerTray,
          seedsSown: input.seedsSown,
          notes: emptyToNull(input.notes),
          createdBy: ctx.userId,
        })
        .returning({ id: nurseryBatches.id });
      await writeAudit(tx, ctx, {
        action: "nursery.create",
        entityType: "nursery_batch",
        entityId: row.id,
        after: { ...input, seedItemBatchId },
      });
      revalidateNursery();
      return { id: row.id };
    }),
});

// ------------------------------------------------------------- update counts

export const updateNurseryCounts = defineAction({
  name: "nursery.updateCounts",
  schema: nurseryCountsSchema,
  roles: ["owner", "manager", "worker"],
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const batch = await lockBatch(tx, ctx, input.id);
      const problem = checkCountsUpdate(batch, input);
      if (problem) throw new DomainError("BAD_COUNT", problem);

      const status = statusWhenEmpty({ ...batch, ...input });
      await tx
        .update(nurseryBatches)
        .set({ germinated: input.germinated, ready: input.ready, status })
        .where(
          and(
            eq(nurseryBatches.id, batch.id),
            eq(nurseryBatches.organisationId, ctx.orgId),
          ),
        );
      await writeAudit(tx, ctx, {
        action: "nursery.updateCounts",
        entityType: "nursery_batch",
        entityId: batch.id,
        before: { germinated: batch.germinated, ready: batch.ready },
        after: { germinated: input.germinated, ready: input.ready, status },
      });
      revalidateNursery(batch.id);
      return { id: batch.id, status };
    }),
});

// ------------------------------------------------------------------- discard

export const discardNurserySeedlings = defineAction({
  name: "nursery.discard",
  schema: nurseryDiscardSchema,
  roles: ["owner", "manager", "worker"],
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const batch = await lockBatch(tx, ctx, input.id);
      const available = availableSeedlings(batch);
      if (input.count > available) {
        throw new DomainError(
          "BAD_COUNT",
          `Only ${available} seedlings are left in this batch.`,
        );
      }
      const discarded = batch.discarded + input.count;
      const status = statusWhenEmpty({ ...batch, discarded });
      await tx
        .update(nurseryBatches)
        .set({ discarded, status })
        .where(
          and(
            eq(nurseryBatches.id, batch.id),
            eq(nurseryBatches.organisationId, ctx.orgId),
          ),
        );
      await writeAudit(tx, ctx, {
        action: "nursery.discard",
        entityType: "nursery_batch",
        entityId: batch.id,
        before: { discarded: batch.discarded, status: batch.status },
        after: { discarded, status, count: input.count },
        reason: input.reason,
      });
      revalidateNursery(batch.id);
      return { id: batch.id, status };
    }),
});

// ---------------------------------------------------------------- transplant

/**
 * Thin wrapper over THE transplant path (`transplantToCycle`), which creates
 * the cycle, updates batch counters and writes the audit row.
 */
export const transplantNurseryBatch = defineAction({
  name: "nursery.transplant",
  schema: nurseryTransplantSchema,
  roles: ["owner", "manager", "worker"],
  handler: async (input, ctx) => {
    assertGreenhouse(ctx, input.greenhouseId);
    const zoneId = emptyToNull(input.zoneId);
    return db.transaction(async (tx) => {
      const batch = await lockBatch(tx, ctx, input.nurseryBatchId);
      if (input.transplantDate < batch.sowDate) {
        throw new DomainError(
          "BAD_DATE",
          "Transplant date can't be before the sow date.",
        );
      }
      if (zoneId) {
        const zone = await tx.query.zones.findFirst({
          where: and(
            eq(zones.id, zoneId),
            eq(zones.organisationId, ctx.orgId),
            eq(zones.greenhouseId, input.greenhouseId),
          ),
          columns: { id: true },
        });
        if (!zone) {
          throw new DomainError(
            "NOT_FOUND",
            "That zone is not in the chosen greenhouse.",
          );
        }
      }
      const result = await transplantToCycle(tx, ctx, {
        nurseryBatchId: batch.id,
        greenhouseId: input.greenhouseId,
        zoneId,
        count: input.count,
        transplantDate: input.transplantDate,
        closeBatch: input.closeBatch,
      });
      revalidateNursery(batch.id);
      revalidatePath("/cycles");
      revalidatePath("/greenhouses");
      return result;
    });
  },
});
