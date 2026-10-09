import Link from "next/link";
import { Sprout } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { listVarieties } from "@/modules/crops/queries";
import { NurseryBatchForm } from "@/modules/nursery/components/nursery-batch-form";
import { listSeedBatchOptions } from "@/modules/nursery/queries";

export const metadata = { title: "New nursery batch" };

export default async function NewNurseryBatchPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const [varieties, seedBatches] = await Promise.all([
    listVarieties(ctx, { activeOnly: true }),
    listSeedBatchOptions(ctx),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="New nursery batch" backHref="/nursery" />
      {varieties.length === 0 ? (
        <EmptyState
          icon={Sprout}
          title="No varieties yet"
          description="Add the tomato or pepper varieties you grow before starting a batch."
        >
          <Button asChild className="h-11">
            <Link href="/settings/varieties">Add varieties</Link>
          </Button>
        </EmptyState>
      ) : (
        <NurseryBatchForm
          varieties={varieties}
          seedBatches={seedBatches}
          today={todayLagos()}
        />
      )}
    </div>
  );
}
