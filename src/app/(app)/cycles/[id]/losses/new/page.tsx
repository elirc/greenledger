import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { getCycle } from "@/modules/cycles/queries";
import { LossForm } from "@/modules/losses/components/loss-form";

export const metadata = { title: "Log plant loss" };

export default async function NewLossPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  // getCycle hides unassigned greenhouses from workers → 404.
  const cycle = await getCycle(ctx, id);
  if (!cycle) notFound();

  const open =
    (cycle.status === "growing" || cycle.status === "harvesting") &&
    cycle.plantsAlive > 0;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Log plant loss"
        description={`${cycle.code} · ${cycle.cropName} ${cycle.varietyName} — ${cycle.greenhouseName}`}
        backHref={`/cycles/${id}`}
      />
      {open ? (
        <LossForm
          cropCycleId={cycle.id}
          plantsAlive={cycle.plantsAlive}
          today={todayLagos()}
          minDate={cycle.transplantDate}
        />
      ) : (
        <EmptyState
          icon={Ban}
          title="Losses can't be logged on this cycle"
          description="Only growing or harvesting cycles with plants alive take losses."
        >
          <Button asChild className="h-11">
            <Link href={`/cycles/${id}`}>Back to cycle</Link>
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
