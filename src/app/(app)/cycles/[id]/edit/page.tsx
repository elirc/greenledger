import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { CyclePlanForm } from "@/modules/cycles/components/cycle-plan-form";
import { getCycle, getCyclePlanRefs } from "@/modules/cycles/queries";

export const metadata = { title: "Edit planned cycle" };

export default async function EditCyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const [cycle, refs] = await Promise.all([
    getCycle(ctx, id),
    getCyclePlanRefs(ctx),
  ]);
  if (!cycle) notFound();

  // Keep the current greenhouse/variety selectable even if since deactivated.
  const formRefs = {
    greenhouses: refs.greenhouses.some((g) => g.id === cycle.greenhouseId)
      ? refs.greenhouses
      : [
          { id: cycle.greenhouseId, name: cycle.greenhouseName },
          ...refs.greenhouses,
        ],
    varieties: refs.varieties.some((v) => v.id === cycle.varietyId)
      ? refs.varieties
      : [
          {
            id: cycle.varietyId,
            name: cycle.varietyName,
            cropName: cycle.cropName,
          },
          ...refs.varieties,
        ],
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title={`Edit ${cycle.code}`} backHref={`/cycles/${id}`} />
      {cycle.status !== "planned" ? (
        <EmptyState
          icon={Lock}
          title="This cycle is already under way"
          description="Only planned cycles can be edited. Use the cycle page to change its transplant date or status."
        >
          <Button asChild className="h-11">
            <Link href={`/cycles/${id}`}>Back to cycle</Link>
          </Button>
        </EmptyState>
      ) : (
        <CyclePlanForm
          refs={formRefs}
          cycleId={id}
          today={todayLagos()}
          defaultValues={{
            greenhouseId: cycle.greenhouseId,
            varietyId: cycle.varietyId,
            sowDate: cycle.sowDate ?? todayLagos(),
            notes: cycle.notes ?? "",
          }}
        />
      )}
    </div>
  );
}
