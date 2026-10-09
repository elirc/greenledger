import Link from "next/link";
import { MoneyText } from "@/components/common/money-text";
import { formatLagosDate } from "@/lib/dates";
import type { SaleListRow } from "../queries";
import { SaleStatusBadge } from "./sale-status-badge";

/** Touch-friendly sales rows: date · invoice · customer · total · status. */
export function SaleList({
  sales,
  showCustomer = true,
}: {
  sales: SaleListRow[];
  showCustomer?: boolean;
}) {
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {sales.map((s) => (
        <li key={s.id}>
          <Link
            href={`/sales/${s.id}`}
            className="hover:bg-muted/50 flex min-h-16 items-center justify-between gap-3 px-4 py-2"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {showCustomer ? s.customerName : s.invoiceNumber}
              </p>
              <p className="text-muted-foreground text-sm">
                {formatLagosDate(s.saleDate)}
                {showCustomer ? ` · ${s.invoiceNumber}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <MoneyText kobo={s.totalKobo} className="font-medium" />
              <SaleStatusBadge status={s.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
