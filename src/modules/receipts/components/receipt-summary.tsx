import Link from "next/link";
import { MoneyText } from "@/components/common/money-text";
import { QtyText } from "@/components/common/qty-text";
import { SectionCard } from "@/components/common/section-card";
import { formatLagos } from "@/lib/dates";
import { ExpiryBadge } from "@/modules/items/components/expiry-badge";
import type { ReceiptDetail } from "../queries";

/** Receipt header + lines. Money renders only when `showMoney`. */
export function ReceiptSummary({
  receipt,
  showMoney,
}: {
  receipt: ReceiptDetail;
  showMoney: boolean;
}) {
  return (
    <SectionCard
      title={receipt.supplierName}
      action={
        showMoney ? (
          <MoneyText kobo={receipt.totalCostKobo} className="font-semibold" />
        ) : null
      }
    >
      <p className="text-muted-foreground mb-3 text-sm">
        {formatLagos(receipt.receivedAt)} · into {receipt.storeName}
        {receipt.reference ? ` · Ref ${receipt.reference}` : ""}
        {receipt.receivedByName ? ` · by ${receipt.receivedByName}` : ""}
      </p>
      <ul className="divide-border divide-y rounded-lg border">
        {receipt.lines.map((l) => (
          <li
            key={l.id}
            className="flex items-start justify-between gap-3 px-3 py-2.5"
          >
            <div className="min-w-0 space-y-1">
              <Link
                href={`/store/items/${l.itemId}`}
                className="block font-medium underline-offset-2 hover:underline"
              >
                {l.itemName}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Batch {l.batchNumber}
                </span>
                <ExpiryBadge expiryDate={l.expiryDate} />
              </div>
            </div>
            <div className="shrink-0 text-right text-sm">
              <QtyText qty={l.quantity} unit={l.baseUnit} className="font-medium" />
              {showMoney ? (
                <div>
                  <MoneyText kobo={l.lineCostKobo} className="text-muted-foreground" />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {receipt.notes ? (
        <p className="text-muted-foreground mt-3 text-sm whitespace-pre-line">
          {receipt.notes}
        </p>
      ) : null}
    </SectionCard>
  );
}
