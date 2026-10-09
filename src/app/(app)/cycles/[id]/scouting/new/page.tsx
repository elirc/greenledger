import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { ScoutingForm } from "@/modules/scouting/components/scouting-form";
import { getScoutingCycle } from "@/modules/scouting/queries";

export const metadata = { title: "Log scouting" };

export default async function NewScoutingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const cycle = await getScoutingCycle(ctx, id);
  if (!cycle || cycle.status === "closed") notFound();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Log scouting"
        description={`${cycle.code} · ${cycle.greenhouseName}`}
        backHref={`/cycles/${cycle.id}/scouting`}
      />
      <ScoutingForm cropCycleId={cycle.id} today={todayLagos()} />
    </div>
  );
}
