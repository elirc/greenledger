import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { CycleList } from "@/modules/cycles/components/cycle-list";
import { listCycles } from "@/modules/cycles/queries";

export const metadata = { title: "Crop cycles" };

export default async function CyclesPage({
  searchParams,
}: {
  searchParams: Promise<{ greenhouse?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const rows = await listCycles(ctx);
  const canPlan = ctx.role === "owner" || ctx.role === "manager";

  const greenhouses = [
    ...new Map(rows.map((r) => [r.greenhouseId, r.greenhouseName])).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Crop cycles"
        description="What is planted where, how many plants are alive, and when harvest starts."
        action={
          canPlan ? (
            <Button asChild className="h-11">
              <Link href="/cycles/new">
                <Plus className="size-4" /> Plan a cycle
              </Link>
            </Button>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No crop cycles yet"
          description={
            canPlan
              ? "Plan a cycle for a greenhouse, or transplant a nursery batch to start one."
              : "Cycles for your greenhouses will appear here once they are planted."
          }
        >
          {canPlan ? (
            <Button asChild className="h-11">
              <Link href="/cycles/new">Plan your first cycle</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <CycleList
          rows={rows}
          greenhouses={greenhouses}
          initialGreenhouseId={sp.greenhouse}
        />
      )}
    </div>
  );
}
