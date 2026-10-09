import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { addDays, todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { createSchedule } from "@/modules/equipment/actions";
import { ScheduleForm } from "@/modules/equipment/components/schedule-form";
import { getEquipment } from "@/modules/equipment/queries";

export const metadata = { title: "Add maintenance schedule" };

export default async function NewSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const eq = await getEquipment(ctx, id);
  if (!eq) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Add schedule"
        description={eq.name}
        backHref={`/equipment/${id}`}
      />
      <ScheduleForm
        equipmentId={eq.id}
        defaultValues={{ nextDueDate: addDays(todayLagos(), 30) }}
        onSubmitAction={createSchedule}
        submitLabel="Add schedule"
      />
    </div>
  );
}
