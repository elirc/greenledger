import Link from "next/link";
import { Boxes, Printer } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyText } from "@/components/common/money-text";
import { QtyText } from "@/components/common/qty-text";
import { Button } from "@/components/ui/button";
import { formatLagosDate } from "@/lib/dates";
import type { BaseUnit } from "@/lib/units";
import { UNIT_LABELS } from "@/lib/units";
import type { ItemBatchRow } from "../queries";
import { ExpiryBadge } from "./expiry-badge";

/**
 * Batches of one item. Cost columns render only when `showMoney` (the query
 * already returns null for roles that cannot see money).
 */
export function ItemBatchesList({
  batches,
  baseUnit,
  showMoney,
}: {
  batches: ItemBatchRow[];
  baseUnit: BaseUnit;
  showMoney: boolean;
}) {
  if (batches.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="No batches yet"
        description="Batches appear here once stock of this item is received."
      >
        <Button asChild className="h-11">
          <Link href="/store/receive">Receive stock</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <ul className="divide-border divide-y rounded-lg border">
      {batches.map((b) => (
        <li
          key={b.id}
          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Batch {b.batchNumber}</span>
              <ExpiryBadge expiryDate={b.expiryDate} />
            </div>
            <p className="text-muted-foreground text-sm">
              Received {formatLagosDate(b.receivedAt)}
              {b.supplierName ? ` · ${b.supplierName}` : ""}
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <dl className="grid grid-cols-[auto_auto] gap-x-3 text-sm">
              <dt className="text-muted-foreground">On hand</dt>
              <dd className="text-right font-medium">
                <QtyText qty={b.onHand} unit={baseUnit} />
              </dd>
              {showMoney ? (
                <>
                  <dt className="text-muted-foreground">
                    Cost / {UNIT_LABELS[baseUnit]}
                  </dt>
                  <dd className="text-right">
                    <MoneyText kobo={b.unitCostKobo} />
                  </dd>
                  <dt className="text-muted-foreground">Value</dt>
                  <dd className="text-right">
                    <MoneyText kobo={b.stockValueKobo} />
                  </dd>
                </>
              ) : null}
            </dl>
            <Button asChild variant="outline" className="h-11 shrink-0">
              <a
                href={`/api/pdf/label?batchIds=${b.id}`}
                target="_blank"
                rel="noopener"
                aria-label={`Print labels for batch ${b.batchNumber}`}
              >
                <Printer className="size-4" />
                <span className="sr-only sm:not-sr-only">Labels</span>
              </a>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
