import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  cropCycles,
  crops,
  greenhouses,
  harvests,
  produceLots,
  produceMovements,
  stores,
  varieties,
} from "@/db/schema";
import { BEST_BEFORE_WARN_DAYS } from "@/lib/alerts";
import { lagosDateOf, todayLagos } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import { PRODUCE_STORE_TYPES } from "@/modules/harvest/queries";
import type { Grade } from "@/modules/harvest/schema";
import { roundQty } from "@/modules/stock/logic";
import { daysBetween } from "./schema";

/**
 * Produce stock reads. Every query takes ctx and filters by ctx.orgId.
 * On-hand is always SUM(produce_movements.kg) per (lot, store). No money —
 * produce carries no cost until it is sold.
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;

export interface ProduceStoreOption {
  id: string;
  name: string;
  type: "packhouse" | "cold_room";
}

/** Packhouses + cold rooms, packhouse first. */
export async function listProduceStores(ctx: Ctx): Promise<ProduceStoreOption[]> {
  const rows = await db
    .select({ id: stores.id, name: stores.name, type: stores.type })
    .from(stores)
    .where(
      and(eq(stores.organisationId, ctx.orgId), inArray(stores.type, PRODUCE_STORE_TYPES)),
    )
    .orderBy(
      sql`case when ${stores.type} = 'packhouse' then 0 else 1 end`,
      desc(stores.isDefault),
      asc(stores.name),
    );
  return rows.map((r) => ({ ...r, type: r.type as ProduceStoreOption["type"] }));
}

export interface ProduceLotRow {
  /** `${lotId}:${storeId}` — one row per lot per store holding stock. */
  key: string;
  lotId: string;
  storeId: string;
  storeName: string;
  cropId: string;
  cropName: string;
  varietyName: string;
  grade: Grade;
  harvestId: string | null;
  harvestedAt: string;
  /** Lagos date of harvest. */
  harvestDate: string;
  ageDays: number;
  bestBeforeDate: string;
  /** Negative once past best-before. */
  daysToBestBefore: number;
  /** ≤ BEST_BEFORE_WARN_DAYS to go, or past. */
  nearBestBefore: boolean;
  onHandKg: number;
  cycleId: string | null;
  cycleCode: string | null;
  greenhouseName: string | null;
}

/**
 * Lots with stock, one row per (lot, store), oldest harvest first (FIFO
 * order). Optional store / grade filters.
 */
export async function listProduceLots(
  ctx: Ctx,
  filters?: { storeId?: string; grade?: Grade },
): Promise<ProduceLotRow[]> {
  const where: SQL[] = [eq(produceMovements.organisationId, ctx.orgId)];
  if (filters?.storeId) {
    if (!isUuid(filters.storeId)) return [];
    where.push(eq(produceMovements.storeId, filters.storeId));
  }

  const stock = await db
    .select({
      lotId: produceMovements.produceLotId,
      storeId: produceMovements.storeId,
      onHand: sql<string>`sum(${produceMovements.kg})`,
    })
    .from(produceMovements)
    .where(and(...where))
    .groupBy(produceMovements.produceLotId, produceMovements.storeId)
    .having(sql`sum(${produceMovements.kg}) > 0`);
  if (stock.length === 0) return [];

  const lotIds = [...new Set(stock.map((s) => s.lotId))];
  const storeIds = [...new Set(stock.map((s) => s.storeId))];
  const lotWhere: SQL[] = [
    eq(produceLots.organisationId, ctx.orgId),
    inArray(produceLots.id, lotIds),
  ];
  if (filters?.grade) lotWhere.push(eq(produceLots.grade, filters.grade));

  const [lots, storeRows] = await Promise.all([
    db
      .select({
        id: produceLots.id,
        cropId: produceLots.cropId,
        cropName: crops.name,
        varietyName: varieties.name,
        grade: produceLots.grade,
        harvestId: produceLots.harvestId,
        harvestedAt: produceLots.harvestedAt,
        bestBeforeDate: produceLots.bestBeforeDate,
        cycleId: harvests.cropCycleId,
        cycleCode: cropCycles.code,
        greenhouseName: greenhouses.name,
      })
      .from(produceLots)
      .innerJoin(
        crops,
        and(eq(crops.id, produceLots.cropId), eq(crops.organisationId, ctx.orgId)),
      )
      .innerJoin(
        varieties,
        and(
          eq(varieties.id, produceLots.varietyId),
          eq(varieties.organisationId, ctx.orgId),
        ),
      )
      .leftJoin(
        harvests,
        and(eq(harvests.id, produceLots.harvestId), eq(harvests.organisationId, ctx.orgId)),
      )
      .leftJoin(
        cropCycles,
        and(
          eq(cropCycles.id, harvests.cropCycleId),
          eq(cropCycles.organisationId, ctx.orgId),
        ),
      )
      .leftJoin(
        greenhouses,
        and(
          eq(greenhouses.id, harvests.greenhouseId),
          eq(greenhouses.organisationId, ctx.orgId),
        ),
      )
      .where(and(...lotWhere)),
    db
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .where(and(eq(stores.organisationId, ctx.orgId), inArray(stores.id, storeIds))),
  ]);

  const lotById = new Map(lots.map((l) => [l.id, l]));
  const storeName = new Map(storeRows.map((s) => [s.id, s.name]));
  const today = todayLagos();

  const rows: ProduceLotRow[] = [];
  for (const s of stock) {
    const lot = lotById.get(s.lotId);
    if (!lot) continue; // grade-filtered out (or not ours)
    const harvestDate = lagosDateOf(lot.harvestedAt);
    const daysToBestBefore = daysBetween(today, lot.bestBeforeDate);
    rows.push({
      key: `${s.lotId}:${s.storeId}`,
      lotId: s.lotId,
      storeId: s.storeId,
      storeName: storeName.get(s.storeId) ?? "Unknown store",
      cropId: lot.cropId,
      cropName: lot.cropName,
      varietyName: lot.varietyName,
      grade: lot.grade,
      harvestId: lot.harvestId,
      harvestedAt: lot.harvestedAt.toISOString(),
      harvestDate,
      ageDays: Math.max(0, daysBetween(harvestDate, today)),
      bestBeforeDate: lot.bestBeforeDate,
      daysToBestBefore,
      nearBestBefore: daysToBestBefore <= BEST_BEFORE_WARN_DAYS,
      onHandKg: roundQty(Number(s.onHand)),
      cycleId: lot.cycleId,
      cycleCode: lot.cycleCode,
      greenhouseName: lot.greenhouseName,
    });
  }
  return rows.sort(
    (a, b) =>
      a.harvestedAt.localeCompare(b.harvestedAt) || a.storeName.localeCompare(b.storeName),
  );
}
