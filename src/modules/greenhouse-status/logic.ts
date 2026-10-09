/**
 * Pure "safe to enter / safe to harvest" predicates over the greenhouse's
 * denormalized safety columns (DECISIONS §7). No DB — importable from client
 * components and the Phase-5 harvest guard alike.
 */

import { lagosDateOf } from "@/lib/dates";

/** Entry is blocked while entry_safe_at is strictly in the future. */
export function isEntrySafe(
  entrySafeAt: Date | string | null,
  now: Date | string,
): boolean {
  if (entrySafeAt === null) return true;
  return new Date(entrySafeAt).getTime() <= new Date(now).getTime();
}

/**
 * Harvest is allowed ON harvest_safe_date (yyyy-MM-dd Lagos) — blocked only
 * while that date is after today (Lagos).
 */
export function isHarvestSafe(
  harvestSafeDate: string | null,
  today: string,
): boolean {
  if (harvestSafeDate === null) return true;
  return harvestSafeDate <= today;
}

export interface SafetyStatus {
  entrySafe: boolean;
  harvestSafe: boolean;
  entrySafeAt: Date | null;
  harvestSafeDate: string | null;
}

/** Both booleans for one greenhouse at `now` (today = Lagos date of now). */
export function safetyStatus(
  gh: { entrySafeAt: Date | null; harvestSafeDate: string | null },
  now: Date = new Date(),
): SafetyStatus {
  return {
    entrySafe: isEntrySafe(gh.entrySafeAt, now),
    harvestSafe: isHarvestSafe(gh.harvestSafeDate, lagosDateOf(now)),
    entrySafeAt: gh.entrySafeAt,
    harvestSafeDate: gh.harvestSafeDate,
  };
}
