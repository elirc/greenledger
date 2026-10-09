/** Pure task helpers (client- and server-safe; no db). */

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { OPEN_TASK_STATUSES, type TaskStatus } from "./schema";

/** Calendar weeks start on Monday. */
const WEEK_STARTS_ON = 1 as const;

/** Local-calendar Date for a "yyyy-MM" month (day 1, no timezone shifts). */
function monthDate(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** "yyyy-MM" of a Lagos calendar date string "yyyy-MM-dd". */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  return format(addMonths(monthDate(month), delta), "yyyy-MM");
}

export function monthLabel(month: string): string {
  return format(monthDate(month), "MMMM yyyy");
}

/**
 * Month grid as yyyy-MM-dd strings, padded to whole Monday-first weeks.
 * Calendar math only — days are plain calendar dates (Lagos days).
 */
export function monthGrid(month: string): {
  days: { date: string; inMonth: boolean; dayOfMonth: number }[];
  from: string;
  to: string;
} {
  const start = startOfMonth(monthDate(month));
  const end = endOfMonth(start);
  const gridStart = startOfWeek(start, { weekStartsOn: WEEK_STARTS_ON });
  const gridEnd = endOfWeek(end, { weekStartsOn: WEEK_STARTS_ON });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map(
    (d) => ({
      date: format(d, "yyyy-MM-dd"),
      inMonth: d.getMonth() === start.getMonth(),
      dayOfMonth: d.getDate(),
    }),
  );
  return {
    days,
    from: days[0].date,
    to: days[days.length - 1].date,
  };
}

/** /tasks URL for a view/filter combination (omits defaults). */
export function tasksHref(p: {
  view?: "list" | "calendar";
  scope?: "mine" | "all";
  gh?: string;
  month?: string;
}): string {
  const q = new URLSearchParams();
  if (p.view === "calendar") q.set("view", "calendar");
  if (p.scope) q.set("scope", p.scope);
  if (p.gh) q.set("gh", p.gh);
  if (p.view === "calendar" && p.month) q.set("month", p.month);
  const s = q.toString();
  return s ? `/tasks?${s}` : "/tasks";
}

/** Weekday headers matching monthGrid's week start. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function isOpenStatus(status: TaskStatus): boolean {
  return OPEN_TASK_STATUSES.includes(status);
}

/** Open task whose due date (Lagos day) is before today (Lagos day). */
export function isOverdue(
  task: { status: TaskStatus; dueDate: string | null },
  today: string,
): boolean {
  return isOpenStatus(task.status) && task.dueDate !== null && task.dueDate < today;
}

/** Open tasks: due date ascending (overdue naturally first), undated last. */
export function compareOpenTasks(
  a: { dueDate: string | null; title: string },
  b: { dueDate: string | null; title: string },
): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

/**
 * Who may complete a task: owner/manager any visible task; others only tasks
 * assigned to them, or (workers) tasks in their assigned greenhouses.
 */
export function canCompleteTask(
  actor: {
    userId: string;
    role: string;
    assignedGreenhouseIds: string[] | null;
  },
  task: { assignedTo: string | null; greenhouseId: string | null },
): boolean {
  if (actor.role === "owner" || actor.role === "manager") return true;
  if (task.assignedTo === actor.userId) return true;
  return Boolean(
    actor.assignedGreenhouseIds &&
      task.greenhouseId &&
      actor.assignedGreenhouseIds.includes(task.greenhouseId),
  );
}
