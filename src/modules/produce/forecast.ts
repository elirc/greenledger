/**
 * Pure harvest-forecast math (spec: "plants alive times expected yield per
 * plant, spread across the variety's harvest weeks"). Unit tested in
 * tests/unit/harvest-forecast.test.ts.
 */

import { roundQty } from "@/modules/stock/logic";

export interface ForecastCycle {
  cycleId: string;
  plantsAlive: number;
  expectedYieldKgPerPlant: number;
  harvestDurationWeeks: number;
  /** yyyy-MM-dd (Lagos) — start of the harvest window. */
  expectedFirstHarvest: string | null;
}

export interface ForecastWeek {
  /** Monday of the ISO week, yyyy-MM-dd. */
  weekStart: string;
  kg: number;
}

/** Monday (ISO week start) of the week containing a yyyy-MM-dd date. */
export function isoWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay(); // Mon=1..Sun=7
  dt.setUTCDate(dt.getUTCDate() - (dow - 1));
  return dt.toISOString().slice(0, 10);
}

export function addWeeks(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + weeks * 7);
  return dt.toISOString().slice(0, 10);
}

/**
 * Weekly forecast for one cycle: total expected kg spread evenly across the
 * variety's harvest weeks starting the week of expected_first_harvest.
 */
export function cycleForecast(cycle: ForecastCycle): ForecastWeek[] {
  if (
    !cycle.expectedFirstHarvest ||
    cycle.plantsAlive <= 0 ||
    cycle.harvestDurationWeeks <= 0 ||
    cycle.expectedYieldKgPerPlant <= 0
  ) {
    return [];
  }
  const total = cycle.plantsAlive * cycle.expectedYieldKgPerPlant;
  const perWeek = roundQty(total / cycle.harvestDurationWeeks);
  const start = isoWeekStart(cycle.expectedFirstHarvest);
  return Array.from({ length: cycle.harvestDurationWeeks }, (_, i) => ({
    weekStart: addWeeks(start, i),
    kg: perWeek,
  }));
}

/** Farm forecast = Σ cycle forecasts, merged by week. */
export function farmForecast(cycles: ForecastCycle[]): ForecastWeek[] {
  const byWeek = new Map<string, number>();
  for (const c of cycles) {
    for (const w of cycleForecast(c)) {
      byWeek.set(w.weekStart, roundQty((byWeek.get(w.weekStart) ?? 0) + w.kg));
    }
  }
  return [...byWeek.entries()]
    .map(([weekStart, kg]) => ({ weekStart, kg }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

/** Merge forecast and actual (kg summed per ISO week) for charting. */
export function forecastVsActual(
  forecast: ForecastWeek[],
  actual: ForecastWeek[],
): { weekStart: string; forecastKg: number; actualKg: number }[] {
  const weeks = new Map<string, { forecastKg: number; actualKg: number }>();
  for (const f of forecast) {
    weeks.set(f.weekStart, { forecastKg: f.kg, actualKg: 0 });
  }
  for (const a of actual) {
    const row = weeks.get(a.weekStart) ?? { forecastKg: 0, actualKg: 0 };
    row.actualKg = roundQty(row.actualKg + a.kg);
    weeks.set(a.weekStart, row);
  }
  return [...weeks.entries()]
    .map(([weekStart, v]) => ({ weekStart, ...v }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}
