import Link from "next/link";
import { MoneyText } from "@/components/common/money-text";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AGEING_BUCKET_LABELS } from "../logic";
import type { ReceivableRow } from "../queries";

type Totals = Omit<ReceivableRow, "customerId" | "customerName" | "oldestSaleDate">;

const COLS = [
  { key: "d0to7Kobo", label: AGEING_BUCKET_LABELS.d0to7 },
  { key: "d8to14Kobo", label: AGEING_BUCKET_LABELS.d8to14 },
  { key: "d15to30Kobo", label: AGEING_BUCKET_LABELS.d15to30 },
  { key: "over30Kobo", label: AGEING_BUCKET_LABELS.over30 },
] as const;

/** Ageing buckets per customer: cards on phones, a table from md: up. */
export function ReceivablesView({
  rows,
  totals,
}: {
  rows: ReceivableRow[];
  totals: Totals;
}) {
  return (
    <>
      {/* Bucket totals — always on top */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COLS.map((c) => (
          <div key={c.key} className="bg-card rounded-lg border p-3">
            <p className="text-muted-foreground text-xs">{c.label}</p>
            <MoneyText
              kobo={totals[c.key]}
              className={
                c.key === "over30Kobo" && (totals[c.key] ?? 0) > 0
                  ? "text-status-danger font-semibold"
                  : "font-semibold"
              }
            />
          </div>
        ))}
      </div>

      <ul className="divide-border divide-y rounded-lg border md:hidden">
        {rows.map((r) => (
          <li key={r.customerId}>
            <Link
              href={`/sales/customers/${r.customerId}`}
              className="hover:bg-muted/50 block space-y-2 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{r.customerName}</span>
                <MoneyText kobo={r.totalKobo} className="font-semibold" />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {COLS.map((c) => (
                  <div key={c.key} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{c.label}</dt>
                    <dd>
                      <MoneyText kobo={r[c.key]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              {COLS.map((c) => (
                <TableHead key={c.key} className="text-right">
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="text-right">Total due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.customerId}>
                <TableCell>
                  <Link
                    href={`/sales/customers/${r.customerId}`}
                    className="text-primary hover:underline"
                  >
                    {r.customerName}
                  </Link>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {r.openSales} open
                  </span>
                </TableCell>
                {COLS.map((c) => (
                  <TableCell key={c.key} className="text-right">
                    <MoneyText kobo={r[c.key]} />
                  </TableCell>
                ))}
                <TableCell className="text-right font-medium">
                  <MoneyText kobo={r.totalKobo} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              {COLS.map((c) => (
                <TableCell key={c.key} className="text-right font-semibold">
                  <MoneyText kobo={totals[c.key]} />
                </TableCell>
              ))}
              <TableCell className="text-right font-semibold">
                <MoneyText kobo={totals.totalKobo} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}
