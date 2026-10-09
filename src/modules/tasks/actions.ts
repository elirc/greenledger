"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { cropCycles, greenhouses, member, tasks } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { canCompleteTask } from "./logic";
import {
  taskCompleteSchema,
  taskCreateSchema,
  taskIdSchema,
  taskUpdateSchema,
  type TaskCreateInput,
} from "./schema";

const emptyToNull = (s: string | undefined) =>
  s && s.length > 0 ? s : null;

function revalidateTasks() {
  revalidatePath("/tasks");
  revalidatePath("/");
}

/**
 * Check the assignee / greenhouse / cycle all belong to this organisation.
 * A cycle without a greenhouse inherits the cycle's greenhouse; a mismatch
 * is rejected.
 */
async function resolveRefs(tx: Tx, ctx: Ctx, input: TaskCreateInput) {
  if (input.assignedTo) {
    const m = await tx.query.member.findFirst({
      where: and(
        eq(member.organizationId, ctx.orgId),
        eq(member.userId, input.assignedTo),
      ),
      columns: { id: true },
    });
    if (!m) {
      throw new DomainError("NOT_FOUND", "That person is not on this farm.");
    }
  }

  let greenhouseId = input.greenhouseId ?? null;
  if (greenhouseId) {
    const gh = await tx.query.greenhouses.findFirst({
      where: and(
        eq(greenhouses.id, greenhouseId),
        eq(greenhouses.organisationId, ctx.orgId),
      ),
      columns: { id: true },
    });
    if (!gh) throw new DomainError("NOT_FOUND", "Greenhouse not found.");
  }

  const cropCycleId = input.cropCycleId ?? null;
  if (cropCycleId) {
    const cycle = await tx.query.cropCycles.findFirst({
      where: and(
        eq(cropCycles.id, cropCycleId),
        eq(cropCycles.organisationId, ctx.orgId),
      ),
      columns: { id: true, greenhouseId: true },
    });
    if (!cycle) throw new DomainError("NOT_FOUND", "Crop cycle not found.");
    if (greenhouseId && greenhouseId !== cycle.greenhouseId) {
      throw new DomainError(
        "MISMATCH",
        "That crop cycle is in a different greenhouse.",
      );
    }
    greenhouseId = cycle.greenhouseId;
  }

  return {
    assignedTo: input.assignedTo ?? null,
    greenhouseId,
    cropCycleId,
  };
}

async function lockTask(tx: Tx, ctx: Ctx, id: string) {
  const [row] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.organisationId, ctx.orgId)))
    .for("update");
  if (!row) throw new DomainError("NOT_FOUND", "Task not found.");
  return row;
}

export const createTask = defineAction({
  name: "tasks.create",
  schema: taskCreateSchema,
  roles: ["owner", "manager"],
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const refs = await resolveRefs(tx, ctx, input);
      const [row] = await tx
        .insert(tasks)
        .values({
          organisationId: ctx.orgId,
          title: input.title,
          description: emptyToNull(input.description),
          dueDate: input.dueDate,
          ...refs,
          createdBy: ctx.userId,
        })
        .returning({ id: tasks.id });
      await writeAudit(tx, ctx, {
        action: "tasks.create",
        entityType: "task",
        entityId: row.id,
        after: { title: input.title, dueDate: input.dueDate, ...refs },
      });
      revalidateTasks();
      return { id: row.id };
    }),
});

export const updateTask = defineAction({
  name: "tasks.update",
  schema: taskUpdateSchema,
  roles: ["owner", "manager"],
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const before = await lockTask(tx, ctx, input.id);
      const refs = await resolveRefs(tx, ctx, input);
      await tx
        .update(tasks)
        .set({
          title: input.title,
          description: emptyToNull(input.description),
          dueDate: input.dueDate,
          ...refs,
        })
        .where(and(eq(tasks.id, input.id), eq(tasks.organisationId, ctx.orgId)));
      await writeAudit(tx, ctx, {
        action: "tasks.update",
        entityType: "task",
        entityId: input.id,
        before: {
          title: before.title,
          dueDate: before.dueDate,
          assignedTo: before.assignedTo,
          greenhouseId: before.greenhouseId,
          cropCycleId: before.cropCycleId,
        },
        after: { title: input.title, dueDate: input.dueDate, ...refs },
      });
      revalidateTasks();
      return { id: input.id };
    }),
});

/**
 * Any role, on tasks they may act on. Idempotent: completing a task that is
 * already done is a no-op success (safe to replay from the offline outbox).
 */
export const completeTask = defineAction({
  name: "tasks.complete",
  schema: taskCompleteSchema,
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const task = await lockTask(tx, ctx, input.taskId);
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
      revalidateTasks();
      return { id: task.id, duplicate: false };
    }),
});

export const reopenTask = defineAction({
  name: "tasks.reopen",
  schema: taskIdSchema,
  roles: ["owner", "manager"],
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const task = await lockTask(tx, ctx, input.id);
      if (task.status !== "done" && task.status !== "cancelled") {
        throw new DomainError("BAD_STATUS", "This task is already open.");
      }
      await tx
        .update(tasks)
        .set({ status: "open", completedAt: null, completedBy: null })
        .where(and(eq(tasks.id, task.id), eq(tasks.organisationId, ctx.orgId)));
      await writeAudit(tx, ctx, {
        action: "tasks.reopen",
        entityType: "task",
        entityId: task.id,
        before: { status: task.status, completedBy: task.completedBy },
        after: { status: "open" },
      });
      revalidateTasks();
      return { id: task.id };
    }),
});

export const cancelTask = defineAction({
  name: "tasks.cancel",
  schema: taskIdSchema,
  roles: ["owner", "manager"],
  handler: (input, ctx) =>
    db.transaction(async (tx) => {
      const task = await lockTask(tx, ctx, input.id);
      if (task.status !== "open" && task.status !== "in_progress") {
        throw new DomainError(
          "BAD_STATUS",
          "Only open tasks can be cancelled.",
        );
      }
      await tx
        .update(tasks)
        .set({ status: "cancelled" })
        .where(and(eq(tasks.id, task.id), eq(tasks.organisationId, ctx.orgId)));
      await writeAudit(tx, ctx, {
        action: "tasks.cancel",
        entityType: "task",
        entityId: task.id,
        before: { status: task.status },
        after: { status: "cancelled" },
      });
      revalidateTasks();
      return { id: task.id };
    }),
});
