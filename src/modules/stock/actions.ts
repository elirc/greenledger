"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  inventoryMovements,
  stockCountLines,
  stockCounts,
} from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { todayLagos } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { assertRefs, issueStockHandler, lockItemBatch, STOCK_ROLES } from "./handlers";
import { orderFefo, roundQty } from "./logic";
import {
  batchOnHand,
  fefoCandidates,
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

function revalidateStock() {
  revalidatePath("/store", "layout");
}

// --------------------------------------------------------------- issue

/**
 * Issue stock — delegates to issueStockHandler (src/modules/stock/handlers.ts),
 * the same code the /api/sync route runs for "stock.issue".
 */
export const issueStock = defineAction({
  name: "store.issueStock",
  schema: issueStockSchema,
  roles: STOCK_ROLES,
  handler: async (input, ctx) => {
    const result = await issueStockHandler(input, ctx);
    revalidateStock();
    return result;
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
