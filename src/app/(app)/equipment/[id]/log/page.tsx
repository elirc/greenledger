import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { LogWorkForm } from "@/modules/equipment/components/log-work-form";
import { getEquipmentDetail } from "@/modules/equipment/queries";

export const metadata = { title: "Log maintenance work" };

export default async function LogWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const scheduleParam = Array.isArray(raw.schedule) ? raw.schedule[0] : raw.schedule;
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const eq = await getEquipmentDetail(ctx, id);
  if (!eq) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Log work"
        description={eq.name}
        backHref={`/equipment/${id}`}
      />
      <LogWorkForm
        equipmentId={eq.id}
        schedules={eq.schedules
          .filter((s) => s.isActive)
          .map((s) => ({ id: s.id, name: s.name, intervalDays: s.intervalDays }))}
        today={todayLagos()}
        initialScheduleId={scheduleParam}
        canSeeMoney={ctx.canSeeMoney}
      />
    </div>
  );
}
