"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  inventoryMovements,
  itemBatches,
  items,
  receiptLines,
  receipts,
  stores,
  suppliers,
} from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { newId } from "@/lib/ids";
import { nairaToKobo, rateTimesQty, sumKobo } from "@/lib/money";
import { postMovement } from "@/modules/stock/movements";
import { roundQty } from "@/modules/stock/logic";
import { receiveStockSchema } from "./schema";

/**
 * Upsert the item_batch for a receipt line (unique org+item+batch_number).
 * An existing batch is reused only while it has zero movements — then its
 * expiry/cost are refreshed from this receipt. A batch with history is
 * immutable from the receive flow: DomainError BATCH_EXISTS.
 */
async function upsertBatch(
  tx: Tx,
  ctx: Ctx,
  line: {
    itemId: string;
    itemName: string;
    batchNumber: string;
    expiryDate: string | null;
    unitCostKobo: string;
    supplierId: string;
  },
): Promise<string> {
  const [inserted] = await tx
    .insert(itemBatches)
    .values({
      organisationId: ctx.orgId,
      itemId: line.itemId,
      supplierId: line.supplierId,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      unitCostKobo: line.unitCostKobo,
    })
    .onConflictDoNothing({
      target: [
        itemBatches.organisationId,
        itemBatches.itemId,
        itemBatches.batchNumber,
      ],
    })
    .returning({ id: itemBatches.id });
  if (inserted) return inserted.id;

  // Conflict: lock the existing batch row, then check its history.
  const [existing] = await tx
    .select({ id: itemBatches.id })
    .from(itemBatches)
    .where(
      and(
        eq(itemBatches.organisationId, ctx.orgId),
        eq(itemBatches.itemId, line.itemId),
        eq(itemBatches.batchNumber, line.batchNumber),
      ),
    )
    .for("update");
  if (!existing) {
    throw new DomainError("CONFLICT", "Batch changed while saving — try again.");
  }
  const [movement] = await tx
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.organisationId, ctx.orgId),
        eq(inventoryMovements.itemBatchId, existing.id),
      ),
    )
    .limit(1);
  if (movement) {
    throw new DomainError(
      "BATCH_EXISTS",
      `Batch ${line.batchNumber} of ${line.itemName} was already received. Use a different batch number.`,
    );
  }
  await tx
    .update(itemBatches)
    .set({ expiryDate: line.expiryDate, unitCostKobo: line.unitCostKobo })
    .where(
      and(
        eq(itemBatches.id, existing.id),
        eq(itemBatches.organisationId, ctx.orgId),
      ),
    );
  return existing.id;
}

export const receiveStock = defineAction({
  name: "store.receiveStock",
  schema: receiveStockSchema,
  roles: ["owner", "manager", "storekeeper"],
  handler: async (input, ctx) => {
    const result = await db.transaction(async (tx) => {
      // Tenancy: supplier, store and every item must belong to this org.
      const [supplier] = await tx
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers)
        .where(
          and(
            eq(suppliers.id, input.supplierId),
            eq(suppliers.organisationId, ctx.orgId),
          ),
        );
      if (!supplier) throw new DomainError("NOT_FOUND", "Supplier not found.");
      const [store] = await tx
        .select({ id: stores.id })
        .from(stores)
        .where(
          and(
            eq(stores.id, input.storeId),
            eq(stores.organisationId, ctx.orgId),
          ),
        );
      if (!store) throw new DomainError("NOT_FOUND", "Store not found.");

      const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
      const itemRows = await tx
        .select({ id: items.id, name: items.name })
        .from(items)
        .where(
          and(eq(items.organisationId, ctx.orgId), inArray(items.id, itemIds)),
        );
      const itemNames = new Map(itemRows.map((r) => [r.id, r.name]));
      if (itemNames.size !== itemIds.length) {
        throw new DomainError("NOT_FOUND", "One of the items was not found.");
      }

      // Price every line first (exact kobo math) so the receipt total is known.
      const priced = input.lines.map((l) => {
        const quantity = roundQty(l.quantity);
        const unitCostKobo = String(nairaToKobo(l.unitCost));
        return {
          ...l,
          quantity,
          unitCostKobo,
          lineCostKobo: rateTimesQty(unitCostKobo, quantity),
          expiryDate: l.expiryDate ? l.expiryDate : null,
        };
      });
      const totalCostKobo = sumKobo(...priced.map((l) => l.lineCostKobo));

      const receiptId = newId();
      await tx.insert(receipts).values({
        id: receiptId,
        organisationId: ctx.orgId,
        supplierId: supplier.id,
        storeId: store.id,
        reference: input.reference ? input.reference : null,
        notes: input.notes ? input.notes : null,
        receivedBy: ctx.userId,
        totalCostKobo,
      });

      for (const line of priced) {
        const batchId = await upsertBatch(tx, ctx, {
          itemId: line.itemId,
          itemName: itemNames.get(line.itemId) ?? "item",
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate,
          unitCostKobo: line.unitCostKobo,
          supplierId: supplier.id,
        });
        const [rl] = await tx
          .insert(receiptLines)
          .values({
            organisationId: ctx.orgId,
            receiptId,
            itemId: line.itemId,
            itemBatchId: batchId,
            quantity: line.quantity.toFixed(3),
            unitCostKobo: line.unitCostKobo,
            lineCostKobo: line.lineCostKobo,
          })
          .returning({ id: receiptLines.id });
        await postMovement(tx, ctx, {
          batchId,
          storeId: store.id,
          type: "receive",
          quantity: line.quantity,
          receiptLineId: rl.id,
        });
      }

      await writeAudit(tx, ctx, {
        action: "store.receiveStock",
        entityType: "receipt",
        entityId: receiptId,
        after: {
          supplierId: supplier.id,
          storeId: store.id,
          reference: input.reference || null,
          totalCostKobo,
          lines: priced.map((l) => ({
            itemId: l.itemId,
            batchNumber: l.batchNumber,
            quantity: l.quantity,
            unitCostKobo: l.unitCostKobo,
          })),
        },
      });

      return { receiptId, lineCount: priced.length };
    });
    revalidatePath("/store");
    revalidatePath("/store/receive");
    return result;
  },
});
