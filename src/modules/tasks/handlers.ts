/**
 * Task-complete handler, plain module (NOT 'use server') per DECISIONS §17
 * so the /api/sync route ("task.complete") can dispatch to the same code the
 * Server Action runs. No revalidatePath here — actions.ts revalidates.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { canCompleteTask } from "./logic";
import type { TaskCompleteInput } from "./schema";

export type CompleteTaskResult = { id: string; duplicate: boolean };

/**
 * Any role, on tasks they may act on (canCompleteTask — the role/assignment
 * gate, so the sync route needs no per-op roles). Idempotent: completing a
 * task that is already done is a no-op `{ duplicate: true }` (safe to replay
 * from the offline outbox).
 */
export async function completeTaskHandler(
  input: TaskCompleteInput,
  ctx: Ctx,
): Promise<CompleteTaskResult> {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.organisationId, ctx.orgId)))
      .for("update");
    if (!task) throw new DomainError("NOT_FOUND", "Task not found.");
    if (!canCompleteTask(ctx, task)) {
      // Not visible to this user — same answer as a missing task.
      throw new DomainError("NOT_FOUND", "Task not found.");
    }
    if (task.status === "done") return { id: task.id, duplicate: true };
    if (task.status === "cancelled") {
      throw new DomainError(
        "TASK_CANCELLED",
        "This task was cancelled. Ask a manager to reopen it.",
      );
    }
    const completedAt = new Date();
    await tx
      .update(tasks)
      .set({ status: "done", completedAt, completedBy: ctx.userId })
      .where(and(eq(tasks.id, task.id), eq(tasks.organisationId, ctx.orgId)));
    await writeAudit(tx, ctx, {
      action: "tasks.complete",
      entityType: "task",
      entityId: task.id,
      before: { status: task.status },
      after: {
        status: "done",
        completedAt: completedAt.toISOString(),
        clientId: input.clientId,
      },
    });
    return { id: task.id, duplicate: false };
  });
}
