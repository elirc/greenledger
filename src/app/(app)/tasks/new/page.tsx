import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { createTask } from "@/modules/tasks/actions";
import { TaskForm } from "@/modules/tasks/components/task-form";
import { getTaskFormRefs } from "@/modules/tasks/queries";

export const metadata = { title: "New task" };

export default async function NewTaskPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const refs = await getTaskFormRefs(ctx);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="New task" backHref="/tasks" />
      <TaskForm refs={refs} onSubmitAction={createTask} submitLabel="Create task" />
    </div>
  );
}
