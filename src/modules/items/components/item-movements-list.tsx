import Link from "next/link";
import { History } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/common/empty-state";
import { QtyText } from "@/components/common/qty-text";
import { Button } from "@/components/ui/button";
import { formatLagos } from "@/lib/dates";
import type { BaseUnit } from "@/lib/units";
import type { ItemMovementRow } from "../queries";
import { MOVEMENT_TYPE_LABELS } from "../schema";

/** Signed movement ledger for one item, newest first, page links below. */
export function ItemMovementsList({
  rows,
  baseUnit,
  page,
  hasMore,
  pageHref,
}: {
  rows: ItemMovementRow[];
  baseUnit: BaseUnit;
  page: number;
  hasMore: boolean;
  pageHref: (page: number) => string;
}) {
  if (rows.length === 0 && page === 1) {
    return (
      <EmptyState
        icon={History}
        title="No movements yet"
        description="Receipts, issues, transfers and adjustments for this item show up here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border px-4 py-6 text-center text-sm">
          No more movements.
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {rows.map((m) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">
                  {MOVEMENT_TYPE_LABELS[m.type]}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {m.storeName}
                  </span>
                </p>
                <p className="text-muted-foreground text-sm">
                  Batch {m.batchNumber} · {formatLagos(m.performedAt)}
                  {m.performedByName ? ` · ${m.performedByName}` : ""}
                </p>
                {m.reason ? (
                  <p className="text-muted-foreground text-sm italic">
                    {m.reason}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 font-medium",
                  m.quantity > 0 ? "text-status-success" : "text-status-danger",
                )}
              >
                {m.quantity > 0 ? "+" : "−"}
                <QtyText qty={Math.abs(m.quantity)} unit={baseUnit} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {page > 1 || hasMore ? (
        <nav
          aria-label="Movement pages"
          className="flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={pageHref(page - 1)}>Newer</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-sm">Page {page}</span>
          {hasMore ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={pageHref(page + 1)}>Older</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
