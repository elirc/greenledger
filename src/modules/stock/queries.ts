import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cropCycles,
  greenhouses,
  inventoryMovements,
  itemBatches,
  items,
  stockCountLines,
  stockCounts,
  stores,
  user,
} from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import type { BaseUnit } from "@/lib/units";
import { roundQty } from "./logic";

/**
 * Reads for the issue / transfer / count / return / scan flows.
 * Every query takes ctx and filters by ctx.orgId. No money columns are ever
 * selected here (these screens never show values).
 */

// ------------------------------------------------------------ form refs

export interface RefItem {
  id: string;
  name: string;
  category: string;
  baseUnit: BaseUnit;
}

export interface RefBatch {
  id: string;
  itemId: string;
  batchNumber: string;
  /** yyyy-MM-dd Lagos date or null. */
  expiryDate: string | null;
  /** ISO timestamp (FEFO tie-break). */
  receivedAt: string;
  /** storeId → on-hand in base units (only non-zero stores listed). */
  stock: Record<string, number>;
}

export interface StockFormRefs {
  items: RefItem[];
  stores: { id: string; name: string; isDefault: boolean }[];
  batches: RefBatch[];
  greenhouses: { id: string; name: string }[];
  cycles: { id: string; code: string; greenhouseId: string }[];
}

/**
 * Everything the stock entry forms need in one round trip. FEFO previews
 * are computed client-side from `batches` with the same pure logic
 * (logic.ts allocateFefo) the server re-runs under lock when posting.
 */
export async function getStockFormRefs(ctx: Ctx): Promise<StockFormRefs> {
  const [itemRows, storeRows, batchRows, stockRows, ghRows, cycleRows] =
    await Promise.all([
      db
        .select({
          id: items.id,
          name: items.name,
          category: items.category,
          baseUnit: items.baseUnit,
        })
        .from(items)
        .where(and(eq(items.organisationId, ctx.orgId), eq(items.isActive, true)))
        .orderBy(asc(items.name)),
      db
        .select({
          id: stores.id,
          name: stores.name,
          isDefault: stores.isDefault,
        })
        .from(stores)
        .where(eq(stores.organisationId, ctx.orgId))
        .orderBy(desc(stores.isDefault), asc(stores.name)),
      db
        .select({
          id: itemBatches.id,
          itemId: itemBatches.itemId,
          batchNumber: itemBatches.batchNumber,
          expiryDate: itemBatches.expiryDate,
          receivedAt: itemBatches.receivedAt,
        })
        .from(itemBatches)
        .where(eq(itemBatches.organisationId, ctx.orgId))
        .orderBy(
          sql`${itemBatches.expiryDate} asc nulls last`,
          asc(itemBatches.receivedAt),
        ),
      db
        .select({
          batchId: inventoryMovements.itemBatchId,
          storeId: inventoryMovements.storeId,
          onHand: sql<string>`sum(${inventoryMovements.quantity})`,
        })
        .from(inventoryMovements)
        .where(eq(inventoryMovements.organisationId, ctx.orgId))
        .groupBy(inventoryMovements.itemBatchId, inventoryMovements.storeId)
        .having(sql`sum(${inventoryMovements.quantity}) <> 0`),
      db
        .select({ id: greenhouses.id, name: greenhouses.name })
        .from(greenhouses)
        .where(
          and(
            eq(greenhouses.organisationId, ctx.orgId),
            eq(greenhouses.isActive, true),
          ),
        )
        .orderBy(asc(greenhouses.name)),
      db
        .select({
          id: cropCycles.id,
          code: cropCycles.code,
          greenhouseId: cropCycles.greenhouseId,
        })
        .from(cropCycles)
        .where(
          and(
            eq(cropCycles.organisationId, ctx.orgId),
            ne(cropCycles.status, "closed"),
          ),
        )
        .orderBy(asc(cropCycles.code)),
    ]);

  const stockByBatch = new Map<string, Record<string, number>>();
  for (const s of stockRows) {
    const rec = stockByBatch.get(s.batchId) ?? {};
    rec[s.storeId] = roundQty(Number(s.onHand));
    stockByBatch.set(s.batchId, rec);
  }

  return {
    items: itemRows,
    stores: storeRows,
    batches: batchRows.map((b) => ({
      id: b.id,
      itemId: b.itemId,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      receivedAt: b.receivedAt.toISOString(),
      stock: stockByBatch.get(b.id) ?? {},
    })),
    greenhouses: ghRows,
    cycles: cycleRows,
  };
}

// ----------------------------------------------------------------- scan

export async function getBatchSummary(ctx: Ctx, batchId: string) {
  const [batch] = await db
    .select({
      id: itemBatches.id,
      itemId: itemBatches.itemId,
      itemName: items.name,
      baseUnit: items.baseUnit,
      batchNumber: itemBatches.batchNumber,
      expiryDate: itemBatches.expiryDate,
    })
    .from(itemBatches)
    .innerJoin(items, eq(items.id, itemBatches.itemId))
    .where(
      and(
        eq(itemBatches.id, batchId),
        eq(itemBatches.organisationId, ctx.orgId),
      ),
    );
  if (!batch) return null;

  const perStore = await db
    .select({
      storeId: inventoryMovements.storeId,
      storeName: stores.name,
      onHand: sql<string>`sum(${inventoryMovements.quantity})`,
    })
    .from(inventoryMovements)
    .innerJoin(stores, eq(stores.id, inventoryMovements.storeId))
    .where(
      and(
        eq(inventoryMovements.organisationId, ctx.orgId),
        eq(inventoryMovements.itemBatchId, batchId),
      ),
    )
    .groupBy(inventoryMovements.storeId, stores.name)
    .having(sql`sum(${inventoryMovements.quantity}) <> 0`)
    .orderBy(asc(stores.name));

  const stock = perStore.map((s) => ({
    storeId: s.storeId,
    storeName: s.storeName,
    onHand: roundQty(Number(s.onHand)),
  }));
  return {
    ...batch,
    stock,
    totalOnHand: roundQty(stock.reduce((a, s) => a + s.onHand, 0)),
  };
}

export type BatchSummary = NonNullable<
  Awaited<ReturnType<typeof getBatchSummary>>
>;

// --------------------------------------------------------------- counts

export async function listStockCounts(ctx: Ctx) {
  const lineCounts = db
    .select({
      stockCountId: stockCountLines.stockCountId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(stockCountLines)
    .where(eq(stockCountLines.organisationId, ctx.orgId))
    .groupBy(stockCountLines.stockCountId)
    .as("line_counts");

  return db
    .select({
      id: stockCounts.id,
      storeName: stores.name,
      status: stockCounts.status,
      countedAt: stockCounts.countedAt,
      postedAt: stockCounts.postedAt,
      countedByName: user.name,
      lineCount: sql<number>`coalesce(${lineCounts.n}, 0)`,
    })
    .from(stockCounts)
    .innerJoin(stores, eq(stores.id, stockCounts.storeId))
    .innerJoin(user, eq(user.id, stockCounts.countedBy))
    .leftJoin(lineCounts, eq(lineCounts.stockCountId, stockCounts.id))
    .where(eq(stockCounts.organisationId, ctx.orgId))
    .orderBy(desc(stockCounts.countedAt))
    .limit(200);
}

export type StockCountRow = Awaited<ReturnType<typeof listStockCounts>>[number];

export interface StockCountSheetLine {
  batchId: string;
  itemName: string;
  baseUnit: BaseUnit;
  batchNumber: string;
  expiryDate: string | null;
  /** Draft: live on-hand now. Posted: snapshot taken at posting. */
  systemQuantity: number;
  countedQuantity: number | null;
  /** Posted only (snapshot). */
  difference: number | null;
}

/**
 * Count header + sheet. Draft: one line per batch that has ever moved in the
 * count's store, with live system qty and any saved counted qty. Posted: the
 * stored lines with their posting-time snapshots.
 */
export async function getStockCount(ctx: Ctx, id: string) {
  const [count] = await db
    .select({
      id: stockCounts.id,
      storeId: stockCounts.storeId,
      storeName: stores.name,
      status: stockCounts.status,
      countedAt: stockCounts.countedAt,
      postedAt: stockCounts.postedAt,
      notes: stockCounts.notes,
      countedByName: user.name,
    })
    .from(stockCounts)
    .innerJoin(stores, eq(stores.id, stockCounts.storeId))
    .innerJoin(user, eq(user.id, stockCounts.countedBy))
    .where(
      and(eq(stockCounts.id, id), eq(stockCounts.organisationId, ctx.orgId)),
    );
  if (!count) return null;

  const saved = await db
    .select({
      batchId: stockCountLines.itemBatchId,
      countedQuantity: stockCountLines.countedQuantity,
      systemQuantity: stockCountLines.systemQuantity,
      difference: stockCountLines.difference,
    })
    .from(stockCountLines)
    .where(
      and(
        eq(stockCountLines.organisationId, ctx.orgId),
        eq(stockCountLines.stockCountId, id),
      ),
    );
  const savedByBatch = new Map(saved.map((s) => [s.batchId, s]));

  let lines: StockCountSheetLine[];
  if (count.status === "posted") {
    const batchIds = saved.map((s) => s.batchId);
    const meta = batchIds.length
      ? await batchMeta(ctx, batchIds)
      : [];
    lines = meta.map((m) => {
      const s = savedByBatch.get(m.batchId)!;
      return {
        ...m,
        systemQuantity: roundQty(Number(s.systemQuantity)),
        countedQuantity: roundQty(Number(s.countedQuantity)),
        difference: roundQty(Number(s.difference)),
      };
    });
  } else {
    const live = await db
      .select({
        batchId: itemBatches.id,
        itemName: items.name,
        baseUnit: items.baseUnit,
        batchNumber: itemBatches.batchNumber,
        expiryDate: itemBatches.expiryDate,
        onHand: sql<string>`sum(${inventoryMovements.quantity})`,
      })
      .from(inventoryMovements)
      .innerJoin(itemBatches, eq(itemBatches.id, inventoryMovements.itemBatchId))
      .innerJoin(items, eq(items.id, itemBatches.itemId))
      .where(
        and(
          eq(inventoryMovements.organisationId, ctx.orgId),
          eq(inventoryMovements.storeId, count.storeId),
        ),
      )
      .groupBy(
        itemBatches.id,
        items.name,
        items.baseUnit,
        itemBatches.batchNumber,
        itemBatches.expiryDate,
      )
      .orderBy(asc(items.name), sql`${itemBatches.expiryDate} asc nulls last`);
    lines = live.map((l) => {
      const s = savedByBatch.get(l.batchId);
      return {
        batchId: l.batchId,
        itemName: l.itemName,
        baseUnit: l.baseUnit,
        batchNumber: l.batchNumber,
        expiryDate: l.expiryDate,
        systemQuantity: roundQty(Number(l.onHand)),
        countedQuantity: s ? roundQty(Number(s.countedQuantity)) : null,
        difference: null,
      };
    });
  }

  return { ...count, lines };
}

export type StockCountDetail = NonNullable<
  Awaited<ReturnType<typeof getStockCount>>
>;

async function batchMeta(ctx: Ctx, batchIds: string[]) {
  return db
    .select({
      batchId: itemBatches.id,
      itemName: items.name,
      baseUnit: items.baseUnit,
      batchNumber: itemBatches.batchNumber,
      expiryDate: itemBatches.expiryDate,
    })
    .from(itemBatches)
    .innerJoin(items, eq(items.id, itemBatches.itemId))
    .where(
      and(
        eq(itemBatches.organisationId, ctx.orgId),
        inArray(itemBatches.id, batchIds),
      ),
    )
    .orderBy(asc(items.name), sql`${itemBatches.expiryDate} asc nulls last`);
}

/** Stores for the "new count" form. */
export async function listCountStores(ctx: Ctx) {
  return db
    .select({ id: stores.id, name: stores.name, isDefault: stores.isDefault })
    .from(stores)
    .where(eq(stores.organisationId, ctx.orgId))
    .orderBy(desc(stores.isDefault), asc(stores.name));
}
