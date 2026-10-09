import Link from "next/link";
import { Plus, Sprout } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/guard";
import { NurseryBatchList } from "@/modules/nursery/components/nursery-batch-list";
import { listNurseryBatches } from "@/modules/nursery/queries";

export const metadata = { title: "Nursery" };

export default async function NurseryPage() {
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const batches = await listNurseryBatches(ctx);
  const canCreate = ctx.role === "owner" || ctx.role === "manager";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Nursery"
        description="Seedling batches from sowing to transplant."
        action={
          canCreate && batches.length > 0 ? (
            <Button asChild className="h-11">
              <Link href="/nursery/new">
                <Plus className="size-4" /> New batch
              </Link>
            </Button>
          ) : null
        }
      />
      {batches.length === 0 ? (
        <EmptyState
          icon={Sprout}
          title="No nursery batches yet"
          description={
            canCreate
              ? "Start a batch when you sow seed trays. Germination and transplants are logged against it."
              : "Your manager starts nursery batches. They will show up here."
          }
        >
          {canCreate ? (
            <Button asChild className="h-11">
              <Link href="/nursery/new">Start your first batch</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <NurseryBatchList batches={batches} />
      )}
    </div>
  );
}
