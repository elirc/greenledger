import { notFound } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { formatLagos, formatLagosDate } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { formatQty } from "@/lib/units";
import { CountSheet } from "@/modules/stock/components/count-sheet";
import { getStockCount } from "@/modules/stock/queries";

export const metadata = { title: "Stock count" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const count = await getStockCount(ctx, id);
  if (!count) notFound();

  const posted = count.status === "posted";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Count · ${count.storeName}`}
        description={
          posted && count.postedAt
            ? `Posted ${formatLagos(count.postedAt)} · started by ${count.countedByName}`
            : `Started ${formatLagos(count.countedAt)} by ${count.countedByName}`
        }
        backHref="/store/counts"
        action={
          <StatusBadge variant={posted ? "success" : "info"}>
            {posted ? "Posted" : "Draft"}
          </StatusBadge>
        }
      />
      {count.notes ? (
        <p className="text-muted-foreground text-sm">{count.notes}</p>
      ) : null}

      {count.lines.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={posted ? "No lines were counted" : "Nothing to count here"}
          description={
            posted
              ? "This count was posted without lines."
              : "No batch has ever moved through this store."
          }
        />
      ) : posted ? (
        <ul className="divide-border divide-y rounded-lg border">
          {count.lines.map((l) => (
            <li
              key={l.batchId}
              className="flex min-h-16 items-center justify-between gap-3 px-4 py-2"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">{l.itemName}</span>
                <span className="text-muted-foreground text-sm">
                  Batch {l.batchNumber}
                  {l.expiryDate ? ` · exp ${formatLagosDate(l.expiryDate)}` : ""}
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  System {formatQty(l.systemQuantity, l.baseUnit)} → counted{" "}
                  {formatQty(l.countedQuantity ?? 0, l.baseUnit)}
                </span>
              </span>
              {l.difference ? (
                <StatusBadge variant={l.difference < 0 ? "danger" : "warning"}>
                  {l.difference > 0 ? "+" : ""}
                  {formatQty(l.difference, l.baseUnit)}
                </StatusBadge>
              ) : (
                <StatusBadge variant="success">Matched</StatusBadge>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <CountSheet
          // Re-mount if the sheet's batch set changes (form state is index-based).
          key={count.lines.map((l) => l.batchId).join(",")}
          countId={count.id}
          lines={count.lines}
        />
      )}
    </div>
  );
}
