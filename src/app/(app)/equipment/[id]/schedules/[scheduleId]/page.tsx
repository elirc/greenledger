import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import type { ActionResult } from "@/lib/action";
import { requireMember } from "@/lib/guard";
import { updateSchedule } from "@/modules/equipment/actions";
import { ScheduleForm } from "@/modules/equipment/components/schedule-form";
import { getEquipment, getSchedule } from "@/modules/equipment/queries";
import type { ScheduleCreateInput } from "@/modules/equipment/schema";

export const metadata = { title: "Edit maintenance schedule" };

export default async function EditSchedulePage({
  params,
}: {
  params: Promise<{ id: string; scheduleId: string }>;
}) {
  const { id, scheduleId } = await params;
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const [eq, schedule] = await Promise.all([
    getEquipment(ctx, id),
    getSchedule(ctx, id, scheduleId),
  ]);
  if (!eq || !schedule) notFound();

  async function submit(
    input: ScheduleCreateInput,
  ): Promise<ActionResult<{ id: string; equipmentId: string }>> {
    "use server";
    return updateSchedule({ ...input, id: scheduleId, equipmentId: id });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Edit schedule"
        description={eq.name}
        backHref={`/equipment/${id}`}
      />
      <ScheduleForm
        equipmentId={eq.id}
        defaultValues={{
          name: schedule.name,
          intervalDays: schedule.intervalDays,
          nextDueDate: schedule.nextDueDate,
          isActive: schedule.isActive,
        }}
        onSubmitAction={submit}
        submitLabel="Save changes"
      />
    </div>
  );
}
