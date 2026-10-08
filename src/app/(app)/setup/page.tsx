import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { listCrops, listVarieties } from "@/modules/crops/queries";
import { SetupWizard } from "@/modules/farm/components/setup-wizard";
import { firstIncompleteStep } from "@/modules/farm/logic";
import { listGreenhouses, listSites, listStores } from "@/modules/farm/queries";

export const metadata = { title: "Farm setup" };

export default async function SetupPage() {
  const ctx = await requireMember();
  if (ctx.role !== "owner") {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Farm setup" />
        <EmptyState
          icon={ShieldAlert}
          title="Only the farm owner can run setup"
          description="Ask the owner to finish setting up the farm."
        >
          <Button asChild className="h-11">
            <Link href="/">Go to dashboard</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const [sites, greenhouses, stores, crops, varieties] = await Promise.all([
    listSites(ctx),
    listGreenhouses(ctx),
    listStores(ctx),
    listCrops(ctx),
    listVarieties(ctx),
  ]);
  const site = sites[0] ?? null;
  const initialStep = firstIncompleteStep({
    site,
    greenhouseCount: greenhouses.length,
    storeCount: stores.length,
    varietyCount: varieties.length,
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Farm setup"
        description={`Set up ${ctx.org.name} in a few short steps.`}
      />
      <SetupWizard
        initialStep={initialStep}
        data={{ site, greenhouses, stores, crops, varieties }}
      />
    </div>
  );
}
