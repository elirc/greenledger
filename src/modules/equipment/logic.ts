import { MAINTENANCE_WARN_DAYS } from "@/lib/alerts";
import { addDays } from "@/lib/dates";
import type { StatusVariant } from "@/components/common/status-badge";
import type { EquipmentStatus } from "./schema";

/** Pure helpers (no DB) — shared by the equipment pages and badges. */

export type DueState = "overdue" | "due_soon" | "ok" | "inactive";

/**
 * Schedule due state against a Lagos calendar date (yyyy-MM-dd):
 * overdue when next_due < today, due soon within MAINTENANCE_WARN_DAYS.
 */
export function scheduleDueState(
  nextDueDate: string,
  today: string,
  isActive = true,
): DueState {
  if (!isActive) return "inactive";
  if (nextDueDate < today) return "overdue";
  if (nextDueDate <= addDays(today, MAINTENANCE_WARN_DAYS)) return "due_soon";
  return "ok";
}

/** Whole days from a to b (both yyyy-MM-dd). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

export function dueBadge(
  nextDueDate: string,
  today: string,
  isActive = true,
): { variant: StatusVariant; label: string } {
  const state = scheduleDueState(nextDueDate, today, isActive);
  const days = daysBetween(today, nextDueDate);
  switch (state) {
    case "inactive":
      return { variant: "neutral", label: "Paused" };
    case "overdue":
      return {
        variant: "danger",
        label: `Overdue ${-days} day${-days === 1 ? "" : "s"}`,
      };
    case "due_soon":
      return {
        variant: "warning",
        label:
          days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`,
      };
    default:
      return { variant: "success", label: `In ${days} days` };
  }
}

export const EQUIPMENT_STATUS_VARIANTS: Record<EquipmentStatus, StatusVariant> = {
  operational: "success",
  needs_service: "warning",
  broken: "danger",
  retired: "neutral",
};

/**
 * Next due after logging work: done + interval (DATA-MODEL §4.9). A
 * back-dated log older than the schedule's last_done_date must not move the
 * schedule backwards — returns null in that case (schedule untouched).
 */
export function advanceSchedule(
  schedule: { intervalDays: number; lastDoneDate: string | null },
  doneDate: string,
): { lastDoneDate: string; nextDueDate: string } | null {
  if (schedule.lastDoneDate && doneDate < schedule.lastDoneDate) return null;
  return {
    lastDoneDate: doneDate,
    nextDueDate: addDays(doneDate, schedule.intervalDays),
  };
}
