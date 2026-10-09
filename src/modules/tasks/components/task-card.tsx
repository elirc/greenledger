"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import type { ActionResult } from "@/lib/action";
import { formatLagos, formatLagosDate } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { cancelTask, completeTask, reopenTask } from "../actions";
import { canCompleteTask, isOpenStatus, isOverdue } from "../logic";
import type { TaskRow } from "../queries";
import { TASK_STATUS_LABELS } from "../schema";

export interface TaskViewer {
  userId: string;
  role: string;
  assignedGreenhouseIds: string[] | null;
  /** owner/manager: edit, reopen, cancel. */
  canManage: boolean;
}

export function TaskCard({
  task,
  viewer,
  today,
}: {
  task: TaskRow;
  viewer: TaskViewer;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const open = isOpenStatus(task.status);
  const overdue = isOverdue(task, today);
  const canComplete = open && canCompleteTask(viewer, task);

  function run(
    label: string,
    call: () => Promise<ActionResult<{ id: string; duplicate?: boolean }>>,
  ) {
    startTransition(async () => {
      try {
        const result = await call();
        if (result.ok) {
          toast.success(label);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Could not reach the server. Try again.");
      }
    });
  }

  const meta = [
    task.greenhouseName,
    task.cycleCode,
    task.assigneeName ? `→ ${task.isMine ? "You" : task.assigneeName}` : "Unassigned",
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p
            className={
              open
                ? "font-medium break-words"
                : "text-muted-foreground font-medium break-words line-through"
            }
          >
            {task.title}
          </p>
          <p className="text-muted-foreground text-sm">{meta.join(" · ")}</p>
          {task.description ? (
            <p className="text-sm break-words">{task.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {overdue ? (
            <StatusBadge variant="danger">Overdue</StatusBadge>
          ) : task.status === "in_progress" ? (
            <StatusBadge variant="info">{TASK_STATUS_LABELS.in_progress}</StatusBadge>
          ) : !open ? (
            <StatusBadge variant={task.status === "done" ? "success" : "neutral"}>
              {TASK_STATUS_LABELS[task.status]}
            </StatusBadge>
          ) : null}
          <span
            className={
              overdue ? "text-status-danger text-xs font-medium" : "text-muted-foreground text-xs"
            }
          >
            {task.status === "done" && task.completedAt
              ? `Done ${formatLagos(task.completedAt, "dd MMM HH:mm")}`
              : task.dueDate
                ? `Due ${formatLagosDate(task.dueDate)}`
                : "No due date"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canComplete ? (
          <Button
            className="h-11 flex-1"
            disabled={pending}
            onClick={() =>
              run("Task done", () =>
                completeTask({ clientId: newId(), taskId: task.id }),
              )
            }
          >
            <Check className="size-4" /> Mark done
          </Button>
        ) : null}
        {viewer.canManage && open ? (
          <>
            <Button asChild variant="outline" className="h-11">
              <Link href={`/tasks/${task.id}/edit`} aria-label="Edit task">
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="outline" className="h-11" disabled={pending}>
                  <X className="size-4" /> Cancel
                </Button>
              }
              title="Cancel this task?"
              description="It moves to the finished list. You can reopen it later."
              confirmLabel="Cancel task"
              destructive
              onConfirm={() =>
                run("Task cancelled", () => cancelTask({ id: task.id }))
              }
            />
          </>
        ) : null}
        {viewer.canManage && !open ? (
          <Button
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={() => run("Task reopened", () => reopenTask({ id: task.id }))}
          >
            <RotateCcw className="size-4" /> Reopen
          </Button>
        ) : null}
      </div>
    </li>
  );
}
