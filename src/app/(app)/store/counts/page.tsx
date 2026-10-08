import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { formatLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { listStockCounts } from "@/modules/stock/queries";

export const metadata = { title: "Stock counts" };

export default async function CountsPage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const counts = await listStockCounts(ctx);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock counts"
        backHref="/store"
        action={
          <Button asChild className="h-11">
            <Link href="/store/counts/new">
              <Plus className="size-4" /> New count
            </Link>
          </Button>
        }
      />
      {counts.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No counts yet"
          description="Count what is physically on the shelf; differences post as adjustments."
        >
          <Button asChild className="h-11">
            <Link href="/store/counts/new">Start your first count</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {counts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/store/counts/${c.id}`}
                className="hover:bg-muted/50 flex min-h-16 items-center justify-between gap-3 px-4 py-2"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{c.storeName}</span>
                  <span className="text-muted-foreground text-sm">
                    {formatLagos(c.postedAt ?? c.countedAt)} · {c.countedByName}{" "}
                    · {c.lineCount} line{c.lineCount === 1 ? "" : "s"}
                  </span>
                </span>
                <StatusBadge variant={c.status === "posted" ? "success" : "info"}>
                  {c.status === "posted" ? "Posted" : "Draft"}
                </StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
