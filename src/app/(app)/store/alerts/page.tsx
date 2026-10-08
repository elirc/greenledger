import Link from "next/link";
import { BellOff, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { QtyText } from "@/components/common/qty-text";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { formatLagosDate } from "@/lib/dates";
import {
  getStockAlerts,
  type ExpiryAlertRow,
} from "@/modules/stock/stock-queries";

export const metadata = { title: "Stock alerts" };

function dateLabel(d: string): string {
  return formatLagosDate(`${d}T12:00:00Z`);
}

function AlertRow({
  href,
  title,
  subtitle,
  right,
}: {
  href: string;
  title: ReactNode;
  subtitle: ReactNode;
  right: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-muted/50 flex min-h-14 items-center gap-3 px-1 py-2"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="text-muted-foreground text-sm">{subtitle}</div>
        </div>
        <div className="shrink-0 text-right">{right}</div>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
      </Link>
    </li>
  );
}

function ExpiryList({
  rows,
  variant,
  empty,
}: {
  rows: ExpiryAlertRow[];
  variant: "danger" | "warning";
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  return (
    <ul className="divide-border divide-y">
      {rows.map((r) => (
        <AlertRow
          key={r.batchId}
          href={`/store/items/${r.itemId}`}
          title={r.itemName}
          subtitle={`Batch ${r.batchNumber} · expires ${dateLabel(r.expiryDate)}`}
          right={
            <div className="flex flex-col items-end gap-1">
              <QtyText qty={r.onHand} unit={r.baseUnit} className="text-sm" />
              <StatusBadge variant={variant}>
                {r.daysToExpiry < 0
                  ? `Expired ${-r.daysToExpiry}d ago`
                  : r.daysToExpiry === 0
                    ? "Expires today"
                    : `${r.daysToExpiry}d left`}
              </StatusBadge>
            </div>
          }
        />
      ))}
    </ul>
  );
}

export default async function StockAlertsPage() {
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper"],
  });
  const alerts = await getStockAlerts(ctx);
  const total =
    alerts.belowReorder.length +
    alerts.expiringSoon.length +
    alerts.expiringLater.length +
    alerts.expired.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock alerts"
        description="Low stock, batches nearing expiry and expired stock still on the shelf."
        backHref="/store"
      />

      {total === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nothing needs attention"
          description="No items below reorder level and no batches expiring in the next 60 days."
        />
      ) : (
        <>
          <SectionCard
            title="Expired with stock"
            action={
              <StatusBadge variant="danger">{alerts.expired.length}</StatusBadge>
            }
          >
            <ExpiryList
              rows={alerts.expired}
              variant="danger"
              empty="No expired stock on hand."
            />
          </SectionCard>

          <SectionCard
            title="Expiring within 30 days"
            action={
              <StatusBadge variant="danger">
                {alerts.expiringSoon.length}
              </StatusBadge>
            }
          >
            <ExpiryList
              rows={alerts.expiringSoon}
              variant="danger"
              empty="Nothing expires in the next 30 days."
            />
          </SectionCard>

          <SectionCard
            title="Expiring in 31–60 days"
            action={
              <StatusBadge variant="warning">
                {alerts.expiringLater.length}
              </StatusBadge>
            }
          >
            <ExpiryList
              rows={alerts.expiringLater}
              variant="warning"
              empty="Nothing expires in 31–60 days."
            />
          </SectionCard>

          <SectionCard
            title="Below reorder level"
            action={
              <StatusBadge variant="warning">
                {alerts.belowReorder.length}
              </StatusBadge>
            }
          >
            {alerts.belowReorder.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Every item is above its reorder level.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {alerts.belowReorder.map((r) => (
                  <AlertRow
                    key={r.itemId}
                    href={`/store/items/${r.itemId}`}
                    title={r.name}
                    subtitle={
                      <>
                        Reorder at{" "}
                        <QtyText qty={r.reorderLevel} unit={r.baseUnit} />
                      </>
                    }
                    right={
                      <QtyText
                        qty={r.onHand}
                        unit={r.baseUnit}
                        className="text-status-warning text-sm font-medium"
                      />
                    }
                  />
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
