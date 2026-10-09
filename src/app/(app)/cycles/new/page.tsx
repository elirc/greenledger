import Link from "next/link";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { CyclePlanForm } from "@/modules/cycles/components/cycle-plan-form";
import { getCyclePlanRefs } from "@/modules/cycles/queries";

export const metadata = { title: "Plan a cycle" };

export default async function NewCyclePage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const refs = await getCyclePlanRefs(ctx);
  const missing =
    refs.greenhouses.length === 0
      ? "greenhouses"
      : refs.varieties.length === 0
        ? "varieties"
        : null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Plan a cycle" backHref="/cycles" />
      {missing ? (
        <EmptyState
          icon={Sprout}
          title={`No active ${missing} yet`}
          description={`Add ${missing} before planning a crop cycle.`}
        >
          <Button asChild className="h-11">
            <Link
              href={
                missing === "greenhouses"
                  ? "/settings/farm"
                  : "/settings/varieties"
              }
            >
              Set up {missing}
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <CyclePlanForm refs={refs} today={todayLagos()} />
      )}
    </div>
  );
}
