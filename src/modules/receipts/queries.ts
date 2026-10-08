import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  itemBatches,
  items,
  receiptLines,
  receipts,
  stores,
  suppliers,
  user,
} from "@/db/schema";
import type { Ctx } from "@/lib/guard";

/**
 * Every query takes ctx and filters by ctx.orgId. Money columns are selected
 * ONLY when ctx.canSeeMoney (ARCHITECTURE §3 worker price redaction).
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** One receipt with its lines (success screen + reprint labels). */
export async function getReceipt(ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const [head] = await db
    .select({
      id: receipts.id,
      reference: receipts.reference,
      notes: receipts.notes,
      receivedAt: receipts.receivedAt,
      supplierName: suppliers.name,
      storeName: stores.name,
      receivedByName: user.name,
      totalCostKobo: receipts.totalCostKobo,
    })
    .from(receipts)
    .innerJoin(suppliers, eq(suppliers.id, receipts.supplierId))
    .innerJoin(stores, eq(stores.id, receipts.storeId))
    .leftJoin(user, eq(user.id, receipts.receivedBy))
    .where(and(eq(receipts.id, id), eq(receipts.organisationId, ctx.orgId)));
  if (!head) return null;

  const lineWhere = and(
    eq(receiptLines.organisationId, ctx.orgId),
    eq(receiptLines.receiptId, id),
  );
  const baseLine = {
    id: receiptLines.id,
    itemId: items.id,
    itemName: items.name,
    baseUnit: items.baseUnit,
    batchId: itemBatches.id,
    batchNumber: itemBatches.batchNumber,
    expiryDate: itemBatches.expiryDate,
    quantity: receiptLines.quantity,
  };

  let lines: {
    id: string;
    itemId: string;
    itemName: string;
    baseUnit: (typeof items.$inferSelect)["baseUnit"];
    batchId: string;
    batchNumber: string;
    expiryDate: string | null;
    quantity: number;
    unitCostKobo: number | null;
    lineCostKobo: number | null;
  }[];

  if (ctx.canSeeMoney) {
    const rows = await db
      .select({
        ...baseLine,
        unitCostKobo: receiptLines.unitCostKobo,
        lineCostKobo: receiptLines.lineCostKobo,
      })
      .from(receiptLines)
      .innerJoin(items, eq(items.id, receiptLines.itemId))
      .innerJoin(itemBatches, eq(itemBatches.id, receiptLines.itemBatchId))
      .where(lineWhere)
      .orderBy(asc(items.name), asc(itemBatches.batchNumber));
    lines = rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      unitCostKobo: Number(r.unitCostKobo),
    }));
  } else {
    const rows = await db
      .select(baseLine)
      .from(receiptLines)
      .innerJoin(items, eq(items.id, receiptLines.itemId))
      .innerJoin(itemBatches, eq(itemBatches.id, receiptLines.itemBatchId))
      .where(lineWhere)
      .orderBy(asc(items.name), asc(itemBatches.batchNumber));
    lines = rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      unitCostKobo: null,
      lineCostKobo: null,
    }));
  }

  return {
    id: head.id,
    reference: head.reference,
    notes: head.notes,
    receivedAt: head.receivedAt,
    supplierName: head.supplierName,
    storeName: head.storeName,
    receivedByName: head.receivedByName,
    totalCostKobo: ctx.canSeeMoney ? head.totalCostKobo : null,
    lines,
  };
}

export type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceipt>>>;

/** Latest receipts for the receive screen (reprint labels shortcut). */
export async function listRecentReceipts(ctx: Ctx, limit = 10) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 10, 1), 50);
  const lineCount = sql<number>`(select count(*)::int from ${receiptLines} where ${receiptLines.receiptId} = ${receipts.id} and ${receiptLines.organisationId} = ${ctx.orgId})`;
  const base = {
    id: receipts.id,
    reference: receipts.reference,
    receivedAt: receipts.receivedAt,
    supplierName: suppliers.name,
    storeName: stores.name,
    lineCount,
  };
  const where = eq(receipts.organisationId, ctx.orgId);

  if (ctx.canSeeMoney) {
    const rows = await db
      .select({ ...base, totalCostKobo: receipts.totalCostKobo })
      .from(receipts)
      .innerJoin(suppliers, eq(suppliers.id, receipts.supplierId))
      .innerJoin(stores, eq(stores.id, receipts.storeId))
      .where(where)
      .orderBy(desc(receipts.receivedAt))
      .limit(safeLimit);
    return rows.map((r) => ({
      ...r,
      totalCostKobo: r.totalCostKobo as number | null,
    }));
  }
  const rows = await db
    .select(base)
    .from(receipts)
    .innerJoin(suppliers, eq(suppliers.id, receipts.supplierId))
    .innerJoin(stores, eq(stores.id, receipts.storeId))
    .where(where)
    .orderBy(desc(receipts.receivedAt))
    .limit(safeLimit);
  return rows.map((r) => ({ ...r, totalCostKobo: null as number | null }));
}

export type RecentReceiptRow = Awaited<
  ReturnType<typeof listRecentReceipts>
>[number];
