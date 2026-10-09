"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { formatLagosDate } from "@/lib/dates";
import { isOpenStatus, isOverdue, monthGrid, monthLabel, WEEKDAY_LABELS } from "../logic";
import type { TaskRow } from "../queries";
import { TaskCard, type TaskViewer } from "./task-card";

/** Month grid (date-fns, no calendar lib): dots per day, tap a day to list. */
export function TaskCalendar({
  month,
  tasks,
  viewer,
  today,
  prevHref,
  nextHref,
  todayHref,
}: {
  /** yyyy-MM */
  month: string;
  /** Tasks due inside the grid range. */
  tasks: TaskRow[];
  viewer: TaskViewer;
  /** Lagos yyyy-MM-dd */
  today: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
}) {
  const grid = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [tasks]);

  const [selected, setSelected] = useState<string | null>(
    today.startsWith(month) ? today : null,
  );
  // Selection from another month (after prev/next) is ignored.
  const selectedDay =
    selected && grid.days.some((d) => d.date === selected) ? selected : null;
  const selectedTasks = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="outline" size="icon" className="size-11">
          <Link href={prevHref} aria-label="Previous month">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <div className="flex flex-col items-center">
          <h2 className="text-base font-semibold">{monthLabel(month)}</h2>
          {!today.startsWith(month) ? (
            <Link href={todayHref} className="text-primary text-xs underline-offset-4 hover:underline">
              Back to this month
            </Link>
          ) : null}
        </div>
        <Button asChild variant="outline" size="icon" className="size-11">
          <Link href={nextHref} aria-label="Next month">
            <ChevronRight className="size-5" />
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border p-1">
        <div className="text-muted-foreground grid grid-cols-7 text-center text-xs font-medium">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label={monthLabel(month)}>
          {grid.days.map((d) => {
            const dayTasks = byDay.get(d.date) ?? [];
            const open = dayTasks.filter((t) => isOpenStatus(t.status));
            const late = open.some((t) => isOverdue(t, today));
            const isToday = d.date === today;
            const isSelected = d.date === selectedDay;
            return (
              <button
                key={d.date}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={`${formatLagosDate(d.date)}: ${dayTasks.length} task${dayTasks.length === 1 ? "" : "s"}`}
                onClick={() => setSelected(d.date)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-start gap-1 rounded-md pt-1.5 text-sm transition-colors",
                  d.inMonth ? "text-foreground" : "text-muted-foreground/60",
                  isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  isToday && !isSelected && "ring-primary ring-2 ring-inset",
                )}
              >
                <span className={cn(isToday && "font-semibold")}>{d.dayOfMonth}</span>
                {dayTasks.length > 0 ? (
                  <span className="flex items-center gap-0.5" aria-hidden>
                    {dayTasks.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className={cn(
                          "size-1.5 rounded-full",
                          isSelected
                            ? "bg-primary-foreground"
                            : !isOpenStatus(t.status)
                              ? "bg-status-success"
                              : late
                                ? "bg-status-danger"
                                : "bg-primary",
                        )}
                      />
                    ))}
                    {dayTasks.length > 3 ? (
                      <span className="text-xs leading-none">+</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay ? (
        <section aria-label={`Tasks due ${formatLagosDate(selectedDay)}`} className="space-y-2">
          <h3 className="text-sm font-medium">
            {formatLagosDate(selectedDay)} · {selectedTasks.length} task
            {selectedTasks.length === 1 ? "" : "s"}
          </h3>
          {selectedTasks.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              Nothing due this day.
            </p>
          ) : (
            <ul className="divide-border divide-y rounded-lg border">
              {selectedTasks.map((t) => (
                <TaskCard key={t.id} task={t} viewer={viewer} today={today} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-muted-foreground text-center text-sm">
          Tap a day to see its tasks.
        </p>
      )}
    </div>
  );
}
