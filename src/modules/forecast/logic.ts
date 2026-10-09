import { formatLagos } from "@/lib/dates";

/**
 * ISO-week label for charts/tables: a yyyy-MM-dd Monday (Lagos calendar
 * date) → 'dd MMM'. Noon UTC keeps the calendar day in Africa/Lagos.
 * Plain module (not 'use client') so server pages and the chart share it.
 */
export function weekLabel(weekStart: string): string {
  return formatLagos(`${weekStart}T12:00:00Z`, "dd MMM");
}
