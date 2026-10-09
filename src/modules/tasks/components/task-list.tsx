"use client";

import { ChevronDown } from "lucide-react";
import type { TaskRow } from "../queries";
import { isOverdue } from "../logic";
import { TaskCard, type TaskViewer } from "./task-card";

/** Open tasks by due date (overdue first); finished ones collapsed below. */
export function TaskList({
  open,
  closed,
  viewer,
  today,
}: {
  open: TaskRow[];
  closed: TaskRow[];
  viewer: TaskViewer;
  today: string;
}) {
  const overdueCount = open.filter((t) => isOverdue(t, today)).length;

  return (
    <div className="space-y-4">
      {open.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          No open tasks. Nice work.
        </p>
      ) : (
        <section aria-label="Open tasks" className="space-y-2">
          <h2 className="text-sm font-medium">
            Open ({open.length})
            {overdueCount > 0 ? (
              <span className="text-status-danger"> · {overdueCount} overdue</span>
            ) : null}
          </h2>
          <ul className="divide-border divide-y rounded-lg border">
            {open.map((t) => (
              <TaskCard key={t.id} task={t} viewer={viewer} today={today} />
            ))}
          </ul>
        </section>
      )}

      {closed.length > 0 ? (
        <details className="group rounded-lg border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium">
            Done &amp; cancelled ({closed.length})
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-border divide-y border-t">
            {closed.map((t) => (
              <TaskCard key={t.id} task={t} viewer={viewer} today={today} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
