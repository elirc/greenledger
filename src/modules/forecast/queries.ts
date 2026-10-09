import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cropCycles,
  crops,
  greenhouses,
  harvestLines,
  harvests,
  varieties,
} from "@/db/schema";
import { LAGOS_TZ } from "@/lib/dates";
import type { Ctx } from "@/lib/guard";
import {
  cycleForecast,
  farmForecast,
  forecastVsActual,
  type ForecastCycle,
  type ForecastWeek,
} from "@/modules/produce/forecast";
import { roundQty } from "@/modules/stock/logic";

/**
 * Harvest forecast vs actual (ARCHITECTURE §15.6, DATA-MODEL §5):
 * forecast per week = plants_alive × expected_yield_kg_per_plant ÷
 * harvest_duration_weeks for each ISO week from the week of
 * expected_first_harvest; actual = Σ harvest_lines.kg grouped by ISO week
 * (Lagos). Every statement filters organisation_id = ctx.orgId. Workers see
 * only assigned greenhouses (the page itself is owner/manager only — the
 * numbers imply yields). No money columns are selected.
 */

const FORECAST_STATUSES = ["growing", "harvesting"] as const;

export interface ForecastChartRow {
  /** Monday of the ISO week, yyyy-MM-dd. */
  weekStart: string;
  forecastKg: number;
  actualKg: number;
}

export interface CycleForecastRow {
  cycleId: string;
  code: string;
  status: (typeof FORECAST_STATUSES)[number];
  greenhouseName: string;
  cropName: string;
  varietyName: string;
  plantsAlive: number;
  expectedYieldKgPerPlant: number;
  harvestDurationWeeks: number;
  expectedFirstHarvest: string | null;
  /** plants × yield ÷ weeks (0 when the cycle has no forecast). */
  weeklyKg: number;
  /** plants × yield. */
  totalKg: number;
  /** First / last forecast week (Monday), null without a forecast. */
  firstWeek: string | null;
  lastWeek: string | null;
  actualTotalKg: number;
  weeks: ForecastChartRow[];
}

export interface HarvestForecast {
  farm: ForecastChartRow[];
  farmForecastTotalKg: number;
  farmActualTotalKg: number;
  cycles: CycleForecastRow[];
}

/** Σ harvest_lines.kg per (cycle, ISO week in Lagos). */
export async function actualKgByCycleWeek(
  ctx: Ctx,
  cycleIds: string[],
): Promise<Map<string, ForecastWeek[]>> {
  const out = new Map<string, ForecastWeek[]>();
  if (cycleIds.length === 0) return out;
  // date_trunc('week', …) is the ISO Monday; the timestamptz is shifted to
  // Lagos wall time first so a 00:30 Lagos Monday harvest lands in its week.
  // The zone is inlined (constant), not a bind param: Postgres would treat
  // the SELECT and GROUP BY copies ($1 vs $2) as different expressions.
  const week = sql<string>`to_char(date_trunc('week', ${harvests.harvestedAt} at time zone ${sql.raw(`'${LAGOS_TZ}'`)}), 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      cycleId: harvests.cropCycleId,
      weekStart: week,
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
    .groupBy(harvests.cropCycleId, week)
    .orderBy(asc(week));
  for (const r of rows) {
    const list = out.get(r.cycleId) ?? [];
    list.push({ weekStart: r.weekStart, kg: roundQty(Number(r.kg)) });
    out.set(r.cycleId, list);
  }
  return out;
}

/** Farm + per-cycle forecast vs actual for every growing/harvesting cycle. */
export async function getHarvestForecast(ctx: Ctx): Promise<HarvestForecast> {
  const filters = [
    eq(cropCycles.organisationId, ctx.orgId),
    inArray(cropCycles.status, [...FORECAST_STATUSES]),
  ];
  if (ctx.assignedGreenhouseIds) {
    if (ctx.assignedGreenhouseIds.length === 0) {
      return { farm: [], farmForecastTotalKg: 0, farmActualTotalKg: 0, cycles: [] };
    }
    filters.push(inArray(cropCycles.greenhouseId, ctx.assignedGreenhouseIds));
  }

  const rows = await db
    .select({
      cycleId: cropCycles.id,
      code: cropCycles.code,
      status: cropCycles.status,
      greenhouseName: greenhouses.name,
      cropName: crops.name,
      varietyName: varieties.name,
      plantsAlive: cropCycles.plantsAlive,
      expectedYieldKgPerPlant: varieties.expectedYieldKgPerPlant,
      harvestDurationWeeks: varieties.harvestDurationWeeks,
      expectedFirstHarvest: cropCycles.expectedFirstHarvest,
    })
    .from(cropCycles)
    .innerJoin(
      greenhouses,
      and(
        eq(greenhouses.id, cropCycles.greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      varieties,
      and(
        eq(varieties.id, cropCycles.varietyId),
        eq(varieties.organisationId, ctx.orgId),
      ),
    )
    .innerJoin(
      crops,
      and(eq(crops.id, varieties.cropId), eq(crops.organisationId, ctx.orgId)),
    )
    .where(and(...filters))
    .orderBy(asc(greenhouses.name), asc(cropCycles.code));

  const actual = await actualKgByCycleWeek(
    ctx,
    rows.map((r) => r.cycleId),
  );

  const inputs: ForecastCycle[] = [];
  const cycles: CycleForecastRow[] = rows.map((r) => {
    const input: ForecastCycle = {
      cycleId: r.cycleId,
      plantsAlive: r.plantsAlive,
      expectedYieldKgPerPlant: Number(r.expectedYieldKgPerPlant),
      harvestDurationWeeks: r.harvestDurationWeeks,
      expectedFirstHarvest: r.expectedFirstHarvest,
    };
    inputs.push(input);
    const forecast = cycleForecast(input);
    const cycleActual = actual.get(r.cycleId) ?? [];
    return {
      cycleId: r.cycleId,
      code: r.code,
      status: r.status as CycleForecastRow["status"],
      greenhouseName: r.greenhouseName,
      cropName: r.cropName,
      varietyName: r.varietyName,
      plantsAlive: r.plantsAlive,
      expectedYieldKgPerPlant: input.expectedYieldKgPerPlant,
      harvestDurationWeeks: r.harvestDurationWeeks,
      expectedFirstHarvest: r.expectedFirstHarvest,
      weeklyKg: forecast[0]?.kg ?? 0,
      totalKg:
        forecast.length > 0
          ? roundQty(input.plantsAlive * input.expectedYieldKgPerPlant)
          : 0,
      firstWeek: forecast[0]?.weekStart ?? null,
      lastWeek: forecast.at(-1)?.weekStart ?? null,
      actualTotalKg: roundQty(cycleActual.reduce((s, w) => s + w.kg, 0)),
      weeks: forecastVsActual(forecast, cycleActual),
    };
  });

  const farm = forecastVsActual(
    farmForecast(inputs),
    [...actual.values()].flat(),
  );
  return {
    farm,
    farmForecastTotalKg: roundQty(farm.reduce((s, w) => s + w.forecastKg, 0)),
    farmActualTotalKg: roundQty(farm.reduce((s, w) => s + w.actualKg, 0)),
    cycles,
  };
}
