import { z } from "zod";

/** Shared between client forms (zodResolver) and the server actions. */

export const TASK_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

/** Statuses shown in the "open" part of the list. */
export const OPEN_TASK_STATUSES: TaskStatus[] = ["open", "in_progress"];

export const TASK_SCOPES = ["mine", "all"] as const;
export type TaskScope = (typeof TASK_SCOPES)[number];

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

/** Create/edit form (owner/manager). */
export const taskCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Give the task a short title")
    .max(160, "Keep the title under 160 characters"),
  description: optionalText(2000),
  /** user.id (text) of the assignee; absent = unassigned. */
  assignedTo: z.string().trim().min(1).max(64).optional(),
  greenhouseId: z.uuid().optional(),
  cropCycleId: z.uuid().optional(),
  dueDate: z.iso.date({ error: "Pick a due date" }),
});
export const taskUpdateSchema = taskCreateSchema.extend({ id: z.uuid() });
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

/** Complete (any role, own/assigned tasks). clientId = offline idempotency key. */
export const taskCompleteSchema = z.object({
  clientId: z.uuid(),
  taskId: z.uuid(),
});
export type TaskCompleteInput = z.infer<typeof taskCompleteSchema>;

/** Reopen / cancel (owner/manager). */
export const taskIdSchema = z.object({ id: z.uuid() });
export type TaskIdInput = z.infer<typeof taskIdSchema>;

/** /tasks search params. */
export const taskListParamsSchema = z.object({
  view: z.enum(["list", "calendar"]).catch("list"),
  scope: z.enum(TASK_SCOPES).optional().catch(undefined),
  gh: z.uuid().optional().catch(undefined),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
});
export type TaskListParams = z.infer<typeof taskListParamsSchema>;
