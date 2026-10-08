/**
 * Aggregate stock queries: on-hand per item, stock value, reorder / expiry
 * alerts, label-sheet batch picker. Read-only.
 *
 * Every function takes ctx and filters by ctx.orgId. Money (stock value,
 * unit cost) is only SELECTED when ctx.canSeeMoney — workers never receive
 * cost columns (two explicit select objects, never spread rows).
 *
 * Kept separate from queries.ts (issue/transfer/count flows) on purpose.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryMovements, itemBatches, items } from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import { EXPIRY_WARN_DAYS } from "@/lib/alerts";
import { addDays, todayLagos } from "@/lib/dates";
import { rateTimesQty } from "@/lib/money";
import type { BaseUnit } from "@/lib/units";
import { roundQty } from "./logic";

type ItemCategory = (typeof items.$inferSelect)["category"];

/** Per-batch on-hand across all stores (no cost — workers may call this). */
function batchStockSubquery(ctx: Ctx) {
  return db
    .select({
      itemBatchId: inventoryMovements.itemBatchId,
      onHand: sql<string>`sum(${inventoryMovements.quantity})`.as("on_hand"),
    })
    .from(inventoryMovements)
    .where(eq(inventoryMovements.organisationId, ctx.orgId))
    .groupBy(inventoryMovements.itemBatchId)
    .as("batch_stock");
}

interface BatchStock {
  batchId: string;
  itemId: string;
  batchNumber: string;
  expiryDate: string | null;
  receivedAt: Date;
  onHand: number;
  /** kobo per base unit (rate) — null for workers */
  unitCostKobo: string | null;
}

/** Every batch of the org with its total on-hand (0 when no movements). */
async function batchStock(ctx: Ctx): Promise<BatchStock[]> {
  const bs = batchStockSubquery(ctx);
  const base = {
    batchId: itemBatches.id,
    itemId: itemBatches.itemId,
    batchNumber: itemBatches.batchNumber,
    expiryDate: itemBatches.expiryDate,
    receivedAt: itemBatches.receivedAt,
    onHand: sql<string>`coalesce(${bs.onHand}, 0)`,
  };
  const where = eq(itemBatches.organisationId, ctx.orgId);

  if (ctx.canSeeMoney) {
    const rows = await db
      .select({ ...base, unitCostKobo: itemBatches.unitCostKobo })
      .from(itemBatches)
      .leftJoin(bs, eq(bs.itemBatchId, itemBatches.id))
      .where(where);
    return rows.map((r) => ({ ...r, onHand: roundQty(Number(r.onHand)) }));
  }
  const rows = await db
    .select(base)
    .from(itemBatches)
    .leftJoin(bs, eq(bs.itemBatchId, itemBatches.id))
    .where(where);
  return rows.map((r) => ({
    ...r,
    onHand: roundQty(Number(r.onHand)),
    unitCostKobo: null,
  }));
}

function daysUntil(dateStr: string, today: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Spec: reorder flag when on-hand(item) ≤ reorder_level (level 0 = not tracked). */
function isBelowReorder(onHand: number, reorderLevel: number): boolean {
  return reorderLevel > 0 && onHand <= reorderLevel;
}

export interface StockListRow {
  id: string;
  name: string;
  category: ItemCategory;
  baseUnit: BaseUnit;
  reorderLevel: number;
  onHand: number;
  belowReorder: boolean;
  /** Earliest expiry among batches that still hold stock (yyyy-MM-dd). */
  nextExpiryDate: string | null;
  /** Integer kobo; null for workers. */
  stockValueKobo: number | null;
}

/** /store stock list: one row per active item. */
export async function listStockItems(ctx: Ctx): Promise<StockListRow[]> {
  const [itemRows, batches] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
        category: items.category,
        baseUnit: items.baseUnit,
        reorderLevel: items.reorderLevel,
      })
      .from(items)
      .where(and(eq(items.organisationId, ctx.orgId), eq(items.isActive, true)))
      .orderBy(asc(items.name)),
    batchStock(ctx),
  ]);

  const byItem = new Map<string, BatchStock[]>();
  for (const b of batches) {
    const list = byItem.get(b.itemId);
    if (list) list.push(b);
    else byItem.set(b.itemId, [b]);
  }

  return itemRows.map((it) => {
    const own = (byItem.get(it.id) ?? []).filter((b) => b.onHand > 0);
    const onHand = roundQty(own.reduce((s, b) => s + b.onHand, 0));
    const expiries = own
      .map((b) => b.expiryDate)
      .filter((d): d is string => d !== null)
      .sort();
    const reorderLevel = Number(it.reorderLevel);
    return {
      id: it.id,
      name: it.name,
      category: it.category,
      baseUnit: it.baseUnit,
      reorderLevel,
      onHand,
      belowReorder: isBelowReorder(onHand, reorderLevel),
      nextExpiryDate: expiries[0] ?? null,
      stockValueKobo: ctx.canSeeMoney
        ? own.reduce(
            (s, b) => s + rateTimesQty(b.unitCostKobo ?? "0", b.onHand),
            0,
          )
        : null,
    };
  });
}

export interface ReorderAlertRow {
  itemId: string;
  name: string;
  baseUnit: BaseUnit;
  onHand: number;
  reorderLevel: number;
}

export interface ExpiryAlertRow {
  batchId: string;
  batchNumber: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  expiryDate: string;
  /** Negative when already expired. */
  daysToExpiry: number;
  onHand: number;
}

export interface StockAlerts {
  today: string;
  belowReorder: ReorderAlertRow[];
  /** Expiring within 30 days (not yet expired). */
  expiringSoon: ExpiryAlertRow[];
  /** Expiring in 31..60 days. */
  expiringLater: ExpiryAlertRow[];
  /** Past expiry and still holding stock. */
  expired: ExpiryAlertRow[];
}

/** /store/alerts: below reorder, expiring 30d / 60d, expired with stock. */
export async function getStockAlerts(ctx: Ctx): Promise<StockAlerts> {
  const today = todayLagos();
  const [warnFar, warnNear] = [
    Math.max(...EXPIRY_WARN_DAYS),
    Math.min(...EXPIRY_WARN_DAYS),
  ];
  const farLimit = addDays(today, warnFar);

  const [itemRows, batches] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
        baseUnit: items.baseUnit,
        reorderLevel: items.reorderLevel,
      })
      .from(items)
      .where(and(eq(items.organisationId, ctx.orgId), eq(items.isActive, true)))
      .orderBy(asc(items.name)),
    batchStock(ctx),
  ]);
  const itemById = new Map(itemRows.map((i) => [i.id, i]));

  const onHandByItem = new Map<string, number>();
  for (const b of batches) {
    if (b.onHand <= 0) continue;
    onHandByItem.set(b.itemId, (onHandByItem.get(b.itemId) ?? 0) + b.onHand);
  }

  const belowReorder: ReorderAlertRow[] = [];
  for (const it of itemRows) {
    const onHand = roundQty(onHandByItem.get(it.id) ?? 0);
    const reorderLevel = Number(it.reorderLevel);
    if (isBelowReorder(onHand, reorderLevel)) {
      belowReorder.push({
        itemId: it.id,
        name: it.name,
        baseUnit: it.baseUnit,
        onHand,
        reorderLevel,
      });
    }
  }

  const expiringSoon: ExpiryAlertRow[] = [];
  const expiringLater: ExpiryAlertRow[] = [];
  const expired: ExpiryAlertRow[] = [];
  for (const b of batches) {
    if (b.onHand <= 0 || b.expiryDate === null) continue;
    if (b.expiryDate > farLimit) continue;
    const item = itemById.get(b.itemId);
    if (!item) continue; // inactive item
    const row: ExpiryAlertRow = {
      batchId: b.batchId,
      batchNumber: b.batchNumber,
      itemId: b.itemId,
      itemName: item.name,
      baseUnit: item.baseUnit,
      expiryDate: b.expiryDate,
      daysToExpiry: daysUntil(b.expiryDate, today),
      onHand: b.onHand,
    };
    if (row.daysToExpiry < 0) expired.push(row);
    else if (row.daysToExpiry <= warnNear) expiringSoon.push(row);
    else expiringLater.push(row);
  }
  const byExpiry = (a: ExpiryAlertRow, b: ExpiryAlertRow) =>
    a.expiryDate === b.expiryDate
      ? a.itemName.localeCompare(b.itemName)
      : a.expiryDate < b.expiryDate
        ? -1
        : 1;
  expiringSoon.sort(byExpiry);
  expiringLater.sort(byExpiry);
  expired.sort(byExpiry);

  return { today, belowReorder, expiringSoon, expiringLater, expired };
}

export interface LabelBatchRow {
  batchId: string;
  batchNumber: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  expiryDate: string | null;
  receivedAt: Date;
  onHand: number;
}

/** /store/labels picker: every batch, stocked ones first, newest first. */
export async function listLabelBatches(ctx: Ctx): Promise<LabelBatchRow[]> {
  const bs = batchStockSubquery(ctx);
  const rows = await db
    .select({
      batchId: itemBatches.id,
      batchNumber: itemBatches.batchNumber,
      itemId: items.id,
      itemName: items.name,
      baseUnit: items.baseUnit,
      expiryDate: itemBatches.expiryDate,
      receivedAt: itemBatches.receivedAt,
      onHand: sql<string>`coalesce(${bs.onHand}, 0)`,
    })
    .from(itemBatches)
    .innerJoin(
      items,
      and(
        eq(items.id, itemBatches.itemId),
        eq(items.organisationId, ctx.orgId),
      ),
    )
    .leftJoin(bs, eq(bs.itemBatchId, itemBatches.id))
    .where(eq(itemBatches.organisationId, ctx.orgId))
    .orderBy(desc(itemBatches.receivedAt), asc(items.name))
    .limit(500);
  return rows
    .map((r) => ({ ...r, onHand: roundQty(Number(r.onHand)) }))
    .sort((a, b) => Number(b.onHand > 0) - Number(a.onHand > 0));
}
