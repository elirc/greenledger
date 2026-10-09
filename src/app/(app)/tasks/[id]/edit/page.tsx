import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import type { ActionResult } from "@/lib/action";
import { requireMember } from "@/lib/guard";
import { updateTask } from "@/modules/tasks/actions";
import { TaskForm } from "@/modules/tasks/components/task-form";
import { getTask, getTaskFormRefs } from "@/modules/tasks/queries";
import type { TaskCreateInput } from "@/modules/tasks/schema";

export const metadata = { title: "Edit task" };

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const [task, refs] = await Promise.all([getTask(ctx, id), getTaskFormRefs(ctx)]);
  if (!task) notFound();

  async function submit(
    input: TaskCreateInput,
  ): Promise<ActionResult<{ id: string }>> {
    "use server";
    return updateTask({ ...input, id });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Edit task" backHref="/tasks" />
      <TaskForm
        refs={refs}
        defaultValues={{
          title: task.title,
          description: task.description ?? "",
          assignedTo: task.assignedTo ?? undefined,
          greenhouseId: task.greenhouseId ?? undefined,
          cropCycleId: task.cropCycleId ?? undefined,
          dueDate: task.dueDate ?? "",
        }}
        onSubmitAction={submit}
        submitLabel="Save changes"
      />
    </div>
  );
}
