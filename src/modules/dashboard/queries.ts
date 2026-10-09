import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  cropCycles,
  greenhouses,
  harvestLines,
  harvests,
  inventoryMovements,
  itemBatches,
  maintenanceSchedules,
  sales,
} from "@/db/schema";
import { MAINTENANCE_WARN_DAYS } from "@/lib/alerts";
import { addDays, todayLagos } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import { rateTimesQty } from "@/lib/money";
import { getHarvestForecast } from "@/modules/forecast/queries";
import {
  listGreenhouseSafety,
  type GreenhouseSafetyRow,
} from "@/modules/greenhouse-status/queries";
import { isoWeekStart } from "@/modules/produce/forecast";
import { listProduceLots } from "@/modules/produce/queries";
import { getReceivables } from "@/modules/sales/queries";
import { getStockAlerts, listStockItems } from "@/modules/stock/stock-queries";
import { roundQty } from "@/modules/stock/logic";
import { listTasks } from "@/modules/tasks/queries";

/**
 * Farm dashboard + greenhouse KPI reads. ctx-first and role-aware:
 *  - every statement filters organisation_id = ctx.orgId (directly or via the
 *    reused module queries, which do the same);
 *  - workers get tasks + their assigned greenhouses' safety only — every
 *    other tile is null and no money is selected (ARCHITECTURE §3, §5);
 *  - money tiles are OM (sales) / OMS (input stock value) and null otherwise.
 * Maintenance reads the equipment schema directly (no equipment module dep).
 */

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Produce age buckets for the on-hand tile. */
export const FRESH_DAYS = 3;

export interface DashboardData {
  today: string;
  role: Ctx["role"];
  canSeeMoney: boolean;
  stock: {
    /** Integer kobo; null when the role may not see money. */
    valueKobo: number | null;
    lowStock: number;
    expiringSoon: number;
    expired: number;
  } | null;
  produce: {
    totalKg: number;
    freshKg: number;
    agingKg: number;
    nearBestBeforeKg: number;
    lots: number;
  } | null;
  harvestWeek: {
    weekStart: string;
    actualKg: number;
    forecastKg: number;
  } | null;
  sales: {
    monthStart: string;
    monthSalesKobo: number | null;
    monthSalesCount: number;
    unpaidKobo: number | null;
    unpaidCount: number;
  } | null;
  tasks: { dueToday: number; overdue: number; open: number };
  maintenance: { dueSoon: number; overdue: number } | null;
  /** Active greenhouses, red (entry or harvest blocked) first. */
  safety: GreenhouseSafetyRow[];
}

const OMS = new Set<Ctx["role"]>(["owner", "manager", "storekeeper"]);
const OM = new Set<Ctx["role"]>(["owner", "manager"]);

async function stockTile(ctx: Ctx): Promise<DashboardData["stock"]> {
  if (!OMS.has(ctx.role)) return null;
  const [items, alerts] = await Promise.all([
    listStockItems(ctx),
    getStockAlerts(ctx),
  ]);
  return {
    valueKobo: ctx.canSeeMoney
      ? items.reduce((s, i) => s + (i.stockValueKobo ?? 0), 0)
      : null,
    lowStock: alerts.belowReorder.length,
    expiringSoon: alerts.expiringSoon.length + alerts.expiringLater.length,
    expired: alerts.expired.length,
  };
}

async function produceTile(ctx: Ctx): Promise<DashboardData["produce"]> {
  if (!OMS.has(ctx.role)) return null;
  const lots = await listProduceLots(ctx);
  let fresh = 0;
  let aging = 0;
  let near = 0;
  for (const l of lots) {
    const m = Math.round(l.onHandKg * 1000);
    if (l.nearBestBefore) near += m;
    else if (l.ageDays < FRESH_DAYS) fresh += m;
    else aging += m;
  }
  return {
    totalKg: (fresh + aging + near) / 1000,
    freshKg: fresh / 1000,
    agingKg: aging / 1000,
    nearBestBeforeKg: near / 1000,
    lots: lots.length,
  };
}

async function harvestTile(
  ctx: Ctx,
  today: string,
): Promise<DashboardData["harvestWeek"]> {
  if (!OM.has(ctx.role)) return null;
  const weekStart = isoWeekStart(today);
  const forecast = await getHarvestForecast(ctx);
  const week = forecast.farm.find((w) => w.weekStart === weekStart);
  return {
    weekStart,
    actualKg: week?.actualKg ?? 0,
    forecastKg: week?.forecastKg ?? 0,
  };
}

async function salesTile(
  ctx: Ctx,
  today: string,
): Promise<DashboardData["sales"]> {
  if (!OM.has(ctx.role)) return null;
  const monthStart = `${today.slice(0, 7)}-01`;
  const [[month], receivables] = await Promise.all([
    db
      .select({
        totalKobo: sql<string | null>`sum(${sales.totalKobo})`,
        count: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.organisationId, ctx.orgId),
          gte(sales.saleDate, monthStart),
          lte(sales.saleDate, today),
        ),
      ),
    getReceivables(ctx),
  ]);
  return {
    monthStart,
    monthSalesKobo: ctx.canSeeMoney ? Number(month?.totalKobo ?? 0) : null,
    monthSalesCount: month?.count ?? 0,
    unpaidKobo: ctx.canSeeMoney ? (receivables.totals.totalKobo ?? 0) : null,
    unpaidCount: receivables.totals.openSales,
  };
}

async function tasksTile(ctx: Ctx, today: string): Promise<DashboardData["tasks"]> {
  const { open } = await listTasks(ctx);
  return {
    dueToday: open.filter((t) => t.dueDate === today).length,
    overdue: open.filter((t) => t.dueDate !== null && t.dueDate < today).length,
    open: open.length,
  };
}

async function maintenanceTile(
  ctx: Ctx,
  today: string,
): Promise<DashboardData["maintenance"]> {
  if (!OMS.has(ctx.role)) return null;
  const horizon = addDays(today, MAINTENANCE_WARN_DAYS);
  const [row] = await db
    .select({
      dueSoon: sql<number>`count(*) filter (where ${maintenanceSchedules.nextDueDate} >= ${today}::date)::int`,
      overdue: sql<number>`count(*) filter (where ${maintenanceSchedules.nextDueDate} < ${today}::date)::int`,
    })
    .from(maintenanceSchedules)
    .where(
      and(
        eq(maintenanceSchedules.organisationId, ctx.orgId),
        eq(maintenanceSchedules.isActive, true),
        lte(maintenanceSchedules.nextDueDate, horizon),
      ),
    );
  return { dueSoon: row?.dueSoon ?? 0, overdue: row?.overdue ?? 0 };
}

async function safetyStrip(ctx: Ctx, now: Date): Promise<GreenhouseSafetyRow[]> {
  const rows = await listGreenhouseSafety(ctx, { now });
  const red = (r: GreenhouseSafetyRow) => (r.entrySafe && r.harvestSafe ? 1 : 0);
  return rows
    .filter((r) => r.isActive)
    .sort((a, b) => red(a) - red(b) || a.name.localeCompare(b.name));
}

/** Everything the `/` dashboard renders, in one round of parallel reads. */
export async function getDashboard(ctx: Ctx): Promise<DashboardData> {
  const now = new Date();
  const today = todayLagos();
  const [stock, produce, harvestWeek, salesData, tasks, maintenance, safety] =
    await Promise.all([
      stockTile(ctx),
      produceTile(ctx),
      harvestTile(ctx, today),
      salesTile(ctx, today),
      tasksTile(ctx, today),
      maintenanceTile(ctx, today),
      safetyStrip(ctx, now),
    ]);
  return {
    today,
    role: ctx.role,
    canSeeMoney: ctx.canSeeMoney,
    stock,
    produce,
    harvestWeek,
    sales: salesData,
    tasks,
    maintenance,
    safety,
  };
}

// ------------------------------------------------------------ greenhouse KPIs

const KPI_CYCLE_STATUSES = ["nursery", "growing", "harvesting"] as const;

export interface CycleKpis {
  cycleId: string;
  code: string;
  status: (typeof cropCycles.$inferSelect)["status"];
  plantsTransplanted: number;
  /** Σ harvest_lines.kg for the cycle. */
  yieldKg: number;
  /** yield ÷ greenhouse area; null without an area. */
  kgPerM2: number | null;
  /** yield ÷ plants transplanted; null before transplant. */
  kgPerPlant: number | null;
  /** Grade A kg ÷ total kg, 0–100 (1 dp); null before any harvest. */
  gradeAPct: number | null;
  /** Σ |issue| × batch rate (integer kobo); null for workers. */
  inputCostKobo: number | null;
  /** Input cost ÷ kg harvested (integer kobo); null for workers / no harvest. */
  costPerKgKobo: number | null;
}

/**
 * Yield and input-cost KPIs for a greenhouse's active cycles (or, when none
 * is active, its most recent closed cycle). Returns [] when the greenhouse is
 * missing, in another org, or not assigned to a worker.
 */
export async function getGreenhouseKpis(
  ctx: Ctx,
  greenhouseId: string,
): Promise<CycleKpis[]> {
  if (!isUuid(greenhouseId)) return [];
  if (
    ctx.assignedGreenhouseIds &&
    !ctx.assignedGreenhouseIds.includes(greenhouseId)
  ) {
    return [];
  }
  const [gh] = await db
    .select({ areaM2: greenhouses.areaM2 })
    .from(greenhouses)
    .where(
      and(
        eq(greenhouses.id, greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    );
  if (!gh) return [];
  const area = Number(gh.areaM2);

  const cycleCols = {
    cycleId: cropCycles.id,
    code: cropCycles.code,
    status: cropCycles.status,
    plantsTransplanted: cropCycles.plantsTransplanted,
  };
  const scope = and(
    eq(cropCycles.organisationId, ctx.orgId),
    eq(cropCycles.greenhouseId, greenhouseId),
  );
  let cycles = await db
    .select(cycleCols)
    .from(cropCycles)
    .where(and(scope, inArray(cropCycles.status, [...KPI_CYCLE_STATUSES])))
    .orderBy(desc(cropCycles.transplantDate), desc(cropCycles.createdAt));
  if (cycles.length === 0) {
    cycles = await db
      .select(cycleCols)
      .from(cropCycles)
      .where(and(scope, eq(cropCycles.status, "closed")))
      .orderBy(desc(cropCycles.closedAt), desc(cropCycles.createdAt))
      .limit(1);
  }
  if (cycles.length === 0) return [];
  const cycleIds = cycles.map((c) => c.cycleId);

  const [gradeRows, issueRows] = await Promise.all([
    db
      .select({
        cycleId: harvests.cropCycleId,
        grade: harvestLines.grade,
        kg: sql<string>`sum(${harvestLines.kg})`,
      })
      .from(harvestLines)
      .innerJoin(
        harvests,
        and(
          eq(harvests.id, harvestLines.harvestId),
          eq(harvests.organisationId, ctx.orgId),
        ),
      )
      .where(
        and(
          eq(harvestLines.organisationId, ctx.orgId),
          inArray(harvests.cropCycleId, cycleIds),
        ),
      )
      .groupBy(harvests.cropCycleId, harvestLines.grade),
    ctx.canSeeMoney
      ? db
          .select({
            cycleId: inventoryMovements.cropCycleId,
            quantity: inventoryMovements.quantity,
            unitCostKobo: itemBatches.unitCostKobo,
          })
          .from(inventoryMovements)
          .innerJoin(
            itemBatches,
            and(
              eq(itemBatches.id, inventoryMovements.itemBatchId),
              eq(itemBatches.organisationId, ctx.orgId),
            ),
          )
          .where(
            and(
              eq(inventoryMovements.organisationId, ctx.orgId),
              eq(inventoryMovements.type, "issue"),
              inArray(inventoryMovements.cropCycleId, cycleIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const kg = new Map<string, { totalMilli: number; aMilli: number }>();
  for (const r of gradeRows) {
    const acc = kg.get(r.cycleId) ?? { totalMilli: 0, aMilli: 0 };
    const m = Math.round(Number(r.kg) * 1000);
    acc.totalMilli += m;
    if (r.grade === "a") acc.aMilli += m;
    kg.set(r.cycleId, acc);
  }
  const cost = new Map<string, number>();
  for (const r of issueRows) {
    if (!r.cycleId) continue;
    cost.set(
      r.cycleId,
      (cost.get(r.cycleId) ?? 0) +
        rateTimesQty(r.unitCostKobo, Math.abs(Number(r.quantity))),
    );
  }

  return cycles.map((c) => {
    const k = kg.get(c.cycleId) ?? { totalMilli: 0, aMilli: 0 };
    const yieldKg = k.totalMilli / 1000;
    const inputCostKobo = ctx.canSeeMoney ? (cost.get(c.cycleId) ?? 0) : null;
    return {
      ...c,
      yieldKg,
      kgPerM2: area > 0 ? roundQty(yieldKg / area) : null,
      kgPerPlant:
        c.plantsTransplanted > 0 ? roundQty(yieldKg / c.plantsTransplanted) : null,
      gradeAPct:
        k.totalMilli > 0 ? Math.round((k.aMilli / k.totalMilli) * 1000) / 10 : null,
      inputCostKobo,
      costPerKgKobo:
        inputCostKobo !== null && yieldKg > 0
          ? Math.round(inputCostKobo / yieldKg)
          : null,
    };
  });
}
