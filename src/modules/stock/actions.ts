"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  cropCycles,
  greenhouses,
  inventoryMovements,
  itemBatches,
  stockCountLines,
  stockCounts,
  stores,
} from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { todayLagos } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import type { Role } from "@/lib/permissions";
import { isExpired, orderFefo, roundQty } from "./logic";
import {
  assertBatchNotExpired,
  batchOnHand,
  fefoCandidates,
  issueFefo,
  lockBatch,
  postMovement,
  postTransfer,
} from "./movements";
import {
  createStockCountSchema,
  issueStockSchema,
  postStockCountSchema,
  returnStockSchema,
  saveStockCountSchema,
  transferStockSchema,
  type SaveStockCountInput,
} from "./schema";

const STOCK_ROLES: Role[] = ["owner", "manager", "storekeeper"];
/** Spec capability matrix: expired-issue overrides are owner/manager only. */
const OVERRIDE_ROLES: Role[] = ["owner", "manager"];

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "cause" in e &&
    (e as { cause?: { code?: string } }).cause?.code === "23505"
  );
}

function revalidateStock() {
  revalidatePath("/store", "layout");
}

// ------------------------------------------------------------- tenancy

/** FKs don't check the organisation — verify every referenced row is ours. */
async function assertRefs(
  tx: Tx,
  ctx: Ctx,
  refs: {
    storeIds?: string[];
    greenhouseId?: string;
    cropCycleId?: string;
  },
): Promise<void> {
  if (refs.storeIds?.length) {
    const ids = [...new Set(refs.storeIds)];
    const rows = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.organisationId, ctx.orgId), inArray(stores.id, ids)));
    if (rows.length !== ids.length) {
      throw new DomainError("NOT_FOUND", "Store not found.");
    }
  }
  if (refs.greenhouseId) {
    const [gh] = await tx
      .select({ id: greenhouses.id })
      .from(greenhouses)
      .where(
        and(
          eq(greenhouses.organisationId, ctx.orgId),
          eq(greenhouses.id, refs.greenhouseId),
        ),
      );
    if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
  }
  if (refs.cropCycleId) {
    const [cycle] = await tx
      .select({ id: cropCycles.id, greenhouseId: cropCycles.greenhouseId })
      .from(cropCycles)
      .where(
        and(
          eq(cropCycles.organisationId, ctx.orgId),
          eq(cropCycles.id, refs.cropCycleId),
        ),
      );
    if (!cycle) throw new DomainError("NOT_FOUND", "Crop cycle not found.");
    if (refs.greenhouseId && cycle.greenhouseId !== refs.greenhouseId) {
      throw new DomainError(
        "CYCLE_MISMATCH",
        "That crop cycle belongs to a different greenhouse.",
      );
    }
  }
}

/** Lock a batch and check it belongs to the item the user picked. */
async function lockItemBatch(tx: Tx, ctx: Ctx, batchId: string, itemId: string) {
  const batch = await lockBatch(tx, ctx, batchId);
  if (!batch) throw new DomainError("NOT_FOUND", "Batch not found.");
  if (batch.itemId !== itemId) {
    throw new DomainError("BATCH_MISMATCH", "That batch is for a different item.");
  }
  return batch;
}

// --------------------------------------------------------------- issue

/**
 * Issue stock to a greenhouse / crop cycle. FEFO auto-pick (may split
 * across batches) unless a batch is chosen. Expired stock needs an
 * owner/manager override with a reason (movement.reason + audit).
 * `clientId` becomes the first movement row's id (offline sync hook — full
 * sync_ops idempotency lands in Phase 6).
 */
export const issueStock = defineAction({
  name: "store.issueStock",
  schema: issueStockSchema,
  roles: STOCK_ROLES,
  handler: async (input, ctx) => {
    if (input.override && !OVERRIDE_ROLES.includes(ctx.role)) {
      throw new DomainError(
        "FORBIDDEN_OVERRIDE",
        "Only an owner or farm manager can issue expired stock.",
      );
    }
    try {
      return await db.transaction(async (tx) => {
        await assertRefs(tx, ctx, {
          storeIds: [input.storeId],
          greenhouseId: input.greenhouseId,
          cropCycleId: input.cropCycleId,
        });
        const overrideReason = input.override?.reason ?? null;
        let allocations: { batchId: string; quantity: number }[];
        let firstMovementId: string;
        let expiredUsed = false;

        if (input.batchId) {
          const batch = await lockItemBatch(tx, ctx, input.batchId, input.itemId);
          assertBatchNotExpired(batch, input.override);
          expiredUsed = isExpired(batch.expiryDate, todayLagos());
          const mv = await postMovement(tx, ctx, {
            id: input.clientId,
            batchId: batch.id,
            storeId: input.storeId,
            type: "issue",
            quantity: input.quantity,
            greenhouseId: input.greenhouseId,
            cropCycleId: input.cropCycleId,
            reason: expiredUsed ? overrideReason : null,
          });
          allocations = [{ batchId: batch.id, quantity: input.quantity }];
          firstMovementId = mv.id;
        } else {
          const result = await issueFefo(tx, ctx, {
            itemId: input.itemId,
            storeId: input.storeId,
            quantity: input.quantity,
            greenhouseId: input.greenhouseId,
            cropCycleId: input.cropCycleId,
            allowExpired: Boolean(input.override),
            reason: overrideReason,
            firstMovementId: input.clientId,
          });
          allocations = result.allocations;
          firstMovementId = result.movements[0].id;
          if (input.override) {
            const used = await tx
              .select({ expiryDate: itemBatches.expiryDate })
              .from(itemBatches)
              .where(
                and(
                  eq(itemBatches.organisationId, ctx.orgId),
                  inArray(
                    itemBatches.id,
                    allocations.map((a) => a.batchId),
                  ),
                ),
              );
            const today = todayLagos();
            expiredUsed = used.some((b) => isExpired(b.expiryDate, today));
          }
        }

        await writeAudit(tx, ctx, {
          action: expiredUsed ? "store.issueStock.override" : "store.issueStock",
          entityType: "inventory_movement",
          entityId: firstMovementId,
          after: {
            itemId: input.itemId,
            storeId: input.storeId,
            quantity: input.quantity,
            greenhouseId: input.greenhouseId ?? null,
            cropCycleId: input.cropCycleId ?? null,
            allocations,
            expiredOverride: expiredUsed,
          },
          reason: expiredUsed ? (overrideReason ?? undefined) : undefined,
        });
        revalidateStock();
        return {
          movementId: firstMovementId,
          allocations,
          expiredOverride: expiredUsed,
        };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError(
          "DUPLICATE",
          "This issue was already recorded.",
        );
      }
      throw e;
    }
  },
});

// ------------------------------------------------------------ transfer

/** Store → store move: transfer_out + transfer_in sharing one transferId. */
export const transferStock = defineAction({
  name: "store.transferStock",
  schema: transferStockSchema,
  roles: STOCK_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      await assertRefs(tx, ctx, {
        storeIds: [input.fromStoreId, input.toStoreId],
      });

      let batchId = input.batchId;
      if (batchId) {
        await lockItemBatch(tx, ctx, batchId, input.itemId);
      } else {
        // FEFO default: earliest-expiry, non-expired batch with stock at source.
        const ordered = orderFefo(
          await fefoCandidates(tx, ctx, input.itemId, input.fromStoreId),
          { today: todayLagos() },
        );
        const first = ordered[0];
        if (!first) {
          throw new DomainError(
            "NO_STOCK",
            "No usable stock of this item in the source store. Pick a batch to move expired stock.",
          );
        }
        await lockItemBatch(tx, ctx, first.id, input.itemId);
        const onHand = await batchOnHand(tx, ctx, first.id, input.fromStoreId);
        if (onHand < input.quantity) {
          throw new DomainError(
            "INSUFFICIENT_STOCK",
            `The earliest-expiry batch has only ${onHand} here. Pick a batch or move less.`,
          );
        }
        batchId = first.id;
      }

      const reason = input.reason ? input.reason : null;
      const { transferId } = await postTransfer(tx, ctx, {
        batchId,
        fromStoreId: input.fromStoreId,
        toStoreId: input.toStoreId,
        quantity: input.quantity,
        reason,
      });

      await writeAudit(tx, ctx, {
        action: "store.transferStock",
        entityType: "stock_transfer",
        entityId: transferId,
        after: {
          itemId: input.itemId,
          batchId,
          fromStoreId: input.fromStoreId,
          toStoreId: input.toStoreId,
          quantity: input.quantity,
        },
        reason: reason ?? undefined,
      });
      revalidateStock();
      return { transferId, batchId };
    }),
});

// ------------------------------------------------------------- returns

/** Unused stock coming back from a greenhouse: positive `return` movement. */
export const returnStock = defineAction({
  name: "store.returnStock",
  schema: returnStockSchema,
  roles: STOCK_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      await assertRefs(tx, ctx, {
        storeIds: [input.storeId],
        greenhouseId: input.greenhouseId,
        cropCycleId: input.cropCycleId,
      });
      await lockItemBatch(tx, ctx, input.batchId, input.itemId);
      const mv = await postMovement(tx, ctx, {
        batchId: input.batchId,
        storeId: input.storeId,
        type: "return",
        quantity: input.quantity,
        greenhouseId: input.greenhouseId,
        cropCycleId: input.cropCycleId,
        reason: input.reason,
      });
      await writeAudit(tx, ctx, {
        action: "store.returnStock",
        entityType: "inventory_movement",
        entityId: mv.id,
        after: {
          itemId: input.itemId,
          batchId: input.batchId,
          storeId: input.storeId,
          greenhouseId: input.greenhouseId,
          cropCycleId: input.cropCycleId ?? null,
          quantity: input.quantity,
        },
        reason: input.reason,
      });
      revalidateStock();
      return { movementId: mv.id };
    }),
});

// -------------------------------------------------------------- counts

export const createStockCount = defineAction({
  name: "store.createStockCount",
  schema: createStockCountSchema,
  roles: STOCK_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      await assertRefs(tx, ctx, { storeIds: [input.storeId] });
      const [row] = await tx
        .insert(stockCounts)
        .values({
          organisationId: ctx.orgId,
          storeId: input.storeId,
          countedBy: ctx.userId,
          notes: input.notes ? input.notes : null,
        })
        .returning({ id: stockCounts.id });
      await writeAudit(tx, ctx, {
        action: "store.createStockCount",
        entityType: "stock_count",
        entityId: row.id,
        after: { storeId: input.storeId },
      });
      revalidatePath("/store/counts");
      return { id: row.id };
    }),
});

/** Lock the count header; only drafts may change. */
async function lockDraftCount(tx: Tx, ctx: Ctx, id: string) {
  const [count] = await tx
    .select({
      id: stockCounts.id,
      storeId: stockCounts.storeId,
      status: stockCounts.status,
    })
    .from(stockCounts)
    .where(and(eq(stockCounts.id, id), eq(stockCounts.organisationId, ctx.orgId)))
    .for("update");
  if (!count) throw new DomainError("NOT_FOUND", "Stock count not found.");
  if (count.status !== "draft") {
    throw new DomainError("COUNT_POSTED", "This count is already posted.");
  }
  return count;
}

/**
 * Persist the sheet: counted lines are upserted with a provisional system
 * snapshot, cleared lines are removed. Only batches that have moved in the
 * count's store may appear on the sheet.
 */
async function saveLines(
  tx: Tx,
  ctx: Ctx,
  count: { id: string; storeId: string },
  lines: SaveStockCountInput["lines"],
): Promise<number> {
  const batchIds = [...new Set(lines.map((l) => l.batchId))];
  if (batchIds.length !== lines.length) {
    throw new DomainError("DUPLICATE_LINE", "A batch appears twice on the sheet.");
  }
  if (batchIds.length) {
    const known = await tx
      .selectDistinct({ batchId: inventoryMovements.itemBatchId })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.organisationId, ctx.orgId),
          eq(inventoryMovements.storeId, count.storeId),
          inArray(inventoryMovements.itemBatchId, batchIds),
        ),
      );
    if (known.length !== batchIds.length) {
      throw new DomainError(
        "NOT_FOUND",
        "A batch on the sheet has no stock history in this store.",
      );
    }
  }

  const counted = lines.filter(
    (l): l is { batchId: string; countedQuantity: number } =>
      l.countedQuantity !== undefined,
  );
  for (const line of counted) {
    const system = await batchOnHand(tx, ctx, line.batchId, count.storeId);
    const countedQty = roundQty(line.countedQuantity);
    const values = {
      countedQuantity: countedQty.toFixed(3),
      systemQuantity: system.toFixed(3),
      difference: roundQty(countedQty - system).toFixed(3),
    };
    await tx
      .insert(stockCountLines)
      .values({
        organisationId: ctx.orgId,
        stockCountId: count.id,
        itemBatchId: line.batchId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [stockCountLines.stockCountId, stockCountLines.itemBatchId],
        set: values,
      });
  }

  const keep = counted.map((l) => l.batchId);
  await tx
    .delete(stockCountLines)
    .where(
      and(
        eq(stockCountLines.organisationId, ctx.orgId),
        eq(stockCountLines.stockCountId, count.id),
        ...(keep.length ? [notInArray(stockCountLines.itemBatchId, keep)] : []),
      ),
    );
  return counted.length;
}

export const saveStockCount = defineAction({
  name: "store.saveStockCount",
  schema: saveStockCountSchema,
  roles: STOCK_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const count = await lockDraftCount(tx, ctx, input.id);
      const countedLines = await saveLines(tx, ctx, count, input.lines);
      await writeAudit(tx, ctx, {
        action: "store.saveStockCount",
        entityType: "stock_count",
        entityId: count.id,
        after: { countedLines },
      });
      revalidatePath("/store/counts");
      return { id: count.id, countedLines };
    }),
});

/**
 * Save the sheet, then in the SAME transaction: lock every counted batch
 * (stable id order — no deadlocks), snapshot the system qty, post one
 * `adjustment` movement per non-zero difference, and lock the count.
 */
export const postStockCount = defineAction({
  name: "store.postStockCount",
  schema: postStockCountSchema,
  roles: STOCK_ROLES,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const count = await lockDraftCount(tx, ctx, input.id);
      const countedLines = await saveLines(tx, ctx, count, input.lines);
      if (countedLines === 0) {
        throw new DomainError(
          "EMPTY_COUNT",
          "Enter at least one counted quantity before posting.",
        );
      }

      const lines = await tx
        .select({
          id: stockCountLines.id,
          batchId: stockCountLines.itemBatchId,
          countedQuantity: stockCountLines.countedQuantity,
        })
        .from(stockCountLines)
        .where(
          and(
            eq(stockCountLines.organisationId, ctx.orgId),
            eq(stockCountLines.stockCountId, count.id),
          ),
        )
        .orderBy(asc(stockCountLines.itemBatchId));

      for (const line of lines) {
        const batch = await lockBatch(tx, ctx, line.batchId);
        if (!batch) throw new DomainError("NOT_FOUND", "Batch not found.");
      }

      let adjustments = 0;
      for (const line of lines) {
        const system = await batchOnHand(tx, ctx, line.batchId, count.storeId);
        const counted = roundQty(Number(line.countedQuantity));
        const diff = roundQty(counted - system);
        await tx
          .update(stockCountLines)
          .set({
            systemQuantity: system.toFixed(3),
            difference: diff.toFixed(3),
          })
          .where(
            and(
              eq(stockCountLines.organisationId, ctx.orgId),
              eq(stockCountLines.id, line.id),
            ),
          );
        if (diff !== 0) {
          await postMovement(tx, ctx, {
            batchId: line.batchId,
            storeId: count.storeId,
            type: "adjustment",
            quantity: diff,
            stockCountId: count.id,
            reason: "Stock count adjustment",
          });
          adjustments += 1;
        }
      }

      const now = new Date();
      await tx
        .update(stockCounts)
        .set({ status: "posted", postedAt: now, postedBy: ctx.userId })
        .where(
          and(
            eq(stockCounts.id, count.id),
            eq(stockCounts.organisationId, ctx.orgId),
          ),
        );
      await writeAudit(tx, ctx, {
        action: "store.postStockCount",
        entityType: "stock_count",
        entityId: count.id,
        before: { status: "draft" },
        after: { status: "posted", countedLines, adjustments },
      });
      revalidateStock();
      return { id: count.id, adjustments };
    }),
});
