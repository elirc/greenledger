import Link from "next/link";
import { MoneyText } from "@/components/common/money-text";
import { formatLagos } from "@/lib/dates";
import type { RecentReceiptRow } from "../queries";

/** Compact list of the latest receipts → receipt page (reprint labels). */
export function RecentReceipts({
  receipts,
  showMoney,
}: {
  receipts: RecentReceiptRow[];
  showMoney: boolean;
}) {
  if (receipts.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
        No receipts yet. Your first delivery will show up here.
      </p>
    );
  }
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {receipts.map((r) => (
        <li key={r.id}>
          <Link
            href={`/store/receive/${r.id}`}
            className="hover:bg-muted/50 flex min-h-14 items-center justify-between gap-3 px-4 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {r.supplierName}
              </span>
              <span className="text-muted-foreground block text-sm">
                {formatLagos(r.receivedAt)} · {r.lineCount}{" "}
                {r.lineCount === 1 ? "line" : "lines"} · {r.storeName}
                {r.reference ? ` · ${r.reference}` : ""}
              </span>
            </span>
            {showMoney ? (
              <MoneyText kobo={r.totalCostKobo} className="shrink-0 text-sm" />
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
