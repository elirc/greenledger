import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  inventoryMovements,
  itemBatches,
  items,
  stores,
  suppliers,
  user,
} from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import { rateTimesQty } from "@/lib/money";
import { roundQty } from "@/modules/stock/logic";

/**
 * Every query takes ctx and filters by ctx.orgId. Cost columns are selected
 * ONLY when ctx.canSeeMoney (ARCHITECTURE §3 worker price redaction).
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;

export const MOVEMENTS_PAGE_SIZE = 50;

/** Active items for pickers (receive form combobox). No money. */
export async function listItemOptions(ctx: Ctx) {
  return db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      baseUnit: items.baseUnit,
    })
    .from(items)
    .where(and(eq(items.organisationId, ctx.orgId), eq(items.isActive, true)))
    .orderBy(asc(items.name));
}

export type ItemOption = Awaited<ReturnType<typeof listItemOptions>>[number];

/** Item master record (no money columns on items). */
export async function getItem(ctx: Ctx, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      baseUnit: items.baseUnit,
      reorderLevel: items.reorderLevel,
      activeIngredient: items.activeIngredient,
      phiDays: items.phiDays,
      reiHours: items.reiHours,
      nPct: items.nPct,
      pPct: items.pPct,
      kPct: items.kPct,
      isActive: items.isActive,
      notes: items.notes,
      createdAt: items.createdAt,
    })
    .from(items)
    .where(and(eq(items.id, id), eq(items.organisationId, ctx.orgId)));
  if (!row) return null;
  return {
    ...row,
    reorderLevel: Number(row.reorderLevel),
    nPct: row.nPct === null ? null : Number(row.nPct),
    pPct: row.pPct === null ? null : Number(row.pPct),
    kPct: row.kPct === null ? null : Number(row.kPct),
  };
}

export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItem>>>;

/** On-hand per store for one item (stores with non-zero stock only). */
export async function getItemOnHandByStore(ctx: Ctx, itemId: string) {
  if (!isUuid(itemId)) return [];
  const rows = await db
    .select({
      storeId: stores.id,
      storeName: stores.name,
      onHand: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
    })
    .from(inventoryMovements)
    .innerJoin(stores, eq(stores.id, inventoryMovements.storeId))
    .where(
      and(
        eq(inventoryMovements.organisationId, ctx.orgId),
        eq(inventoryMovements.itemId, itemId),
      ),
    )
    .groupBy(stores.id, stores.name)
    .having(sql`sum(${inventoryMovements.quantity}) <> 0`)
    .orderBy(asc(stores.name));
  return rows.map((r) => ({
    storeId: r.storeId,
    storeName: r.storeName,
    onHand: roundQty(Number(r.onHand)),
  }));
}

/**
 * Batches of an item with on-hand across all stores. Unit cost (kobo per
 * base unit) and stock value are null for roles that cannot see money.
 */
export async function listItemBatches(ctx: Ctx, itemId: string) {
  if (!isUuid(itemId)) return [];
  const onHandExpr = sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`;
  const where = and(
    eq(itemBatches.organisationId, ctx.orgId),
    eq(itemBatches.itemId, itemId),
  );
  const joinOn = and(
    eq(inventoryMovements.itemBatchId, itemBatches.id),
    eq(inventoryMovements.organisationId, ctx.orgId),
  );

  if (ctx.canSeeMoney) {
    const rows = await db
      .select({
        id: itemBatches.id,
        batchNumber: itemBatches.batchNumber,
        expiryDate: itemBatches.expiryDate,
        receivedAt: itemBatches.receivedAt,
        supplierName: suppliers.name,
        unitCostKobo: itemBatches.unitCostKobo,
        onHand: onHandExpr,
      })
      .from(itemBatches)
      .leftJoin(inventoryMovements, joinOn)
      .leftJoin(suppliers, eq(suppliers.id, itemBatches.supplierId))
      .where(where)
      .groupBy(itemBatches.id, suppliers.name)
      .orderBy(
        sql`${itemBatches.expiryDate} asc nulls last`,
        asc(itemBatches.receivedAt),
      );
    return rows.map((r) => {
      const onHand = roundQty(Number(r.onHand));
      return {
        id: r.id,
        batchNumber: r.batchNumber,
        expiryDate: r.expiryDate,
        receivedAt: r.receivedAt,
        supplierName: r.supplierName,
        onHand,
        unitCostKobo: Number(r.unitCostKobo) as number | null,
        stockValueKobo: rateTimesQty(r.unitCostKobo, onHand) as number | null,
      };
    });
  }

  const rows = await db
    .select({
      id: itemBatches.id,
      batchNumber: itemBatches.batchNumber,
      expiryDate: itemBatches.expiryDate,
      receivedAt: itemBatches.receivedAt,
      supplierName: suppliers.name,
      onHand: onHandExpr,
    })
    .from(itemBatches)
    .leftJoin(inventoryMovements, joinOn)
    .leftJoin(suppliers, eq(suppliers.id, itemBatches.supplierId))
    .where(where)
    .groupBy(itemBatches.id, suppliers.name)
    .orderBy(
      sql`${itemBatches.expiryDate} asc nulls last`,
      asc(itemBatches.receivedAt),
    );
  return rows.map((r) => ({
    id: r.id,
    batchNumber: r.batchNumber,
    expiryDate: r.expiryDate,
    receivedAt: r.receivedAt,
    supplierName: r.supplierName,
    onHand: roundQty(Number(r.onHand)),
    unitCostKobo: null as number | null,
    stockValueKobo: null as number | null,
  }));
}

export type ItemBatchRow = Awaited<ReturnType<typeof listItemBatches>>[number];

/** Latest movements for an item, newest first, paginated (no money). */
export async function listItemMovements(
  ctx: Ctx,
  itemId: string,
  page = 1,
) {
  if (!isUuid(itemId)) return { rows: [], page: 1, hasMore: false };
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const rows = await db
    .select({
      id: inventoryMovements.id,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      performedAt: inventoryMovements.performedAt,
      reason: inventoryMovements.reason,
      batchNumber: itemBatches.batchNumber,
      storeName: stores.name,
      performedByName: user.name,
    })
    .from(inventoryMovements)
    .innerJoin(itemBatches, eq(itemBatches.id, inventoryMovements.itemBatchId))
    .innerJoin(stores, eq(stores.id, inventoryMovements.storeId))
    .leftJoin(user, eq(user.id, inventoryMovements.performedBy))
    .where(
      and(
        eq(inventoryMovements.organisationId, ctx.orgId),
        eq(inventoryMovements.itemId, itemId),
      ),
    )
    .orderBy(desc(inventoryMovements.performedAt), desc(inventoryMovements.id))
    .limit(MOVEMENTS_PAGE_SIZE + 1)
    .offset((safePage - 1) * MOVEMENTS_PAGE_SIZE);
  return {
    rows: rows.slice(0, MOVEMENTS_PAGE_SIZE).map((r) => ({
      ...r,
      quantity: roundQty(Number(r.quantity)),
    })),
    page: safePage,
    hasMore: rows.length > MOVEMENTS_PAGE_SIZE,
  };
}

export type ItemMovementRow = Awaited<
  ReturnType<typeof listItemMovements>
>["rows"][number];
