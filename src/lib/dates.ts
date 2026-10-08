import { formatInTimeZone } from "date-fns-tz";

/** Timestamps are stored UTC and displayed in Africa/Lagos (spec). */
export const LAGOS_TZ = "Africa/Lagos";

type DateInput = Date | string | number;

export function formatLagos(d: DateInput, fmt = "dd MMM yyyy HH:mm"): string {
  return formatInTimeZone(new Date(d), LAGOS_TZ, fmt);
}

export function formatLagosDate(d: DateInput): string {
  return formatInTimeZone(new Date(d), LAGOS_TZ, "dd MMM yyyy");
}

/** The Lagos calendar date (yyyy-MM-dd) of a moment in time. */
export function lagosDateOf(d: Date): string {
  return formatInTimeZone(d, LAGOS_TZ, "yyyy-MM-dd");
}

/** Today as a Lagos calendar date (yyyy-MM-dd). */
export function todayLagos(): string {
  return lagosDateOf(new Date());
}

/** Pure calendar math on yyyy-MM-dd strings (no timezones involved). */
export function addDays(dateStr: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) throw new Error(`Not a yyyy-MM-dd date: ${dateStr}`);
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
  return dt.toISOString().slice(0, 10);
}

/** Date-only comparison against today in Lagos. */
export function isPastLagos(dateStr: string): boolean {
  return dateStr < todayLagos();
}
