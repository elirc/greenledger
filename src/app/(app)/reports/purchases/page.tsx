import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyText } from "@/components/common/money-text";
import { SectionCard } from "@/components/common/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import {
  ReportShell,
  SummaryTile,
  TableScroll,
} from "@/modules/reports/components/report-shell";
import {
  getPurchasesReport,
  parseReportSearchParams,
} from "@/modules/reports/queries";

export const metadata = { title: "Purchases report" };

const intFmt = new Intl.NumberFormat("en-NG");
/** yyyy-MM → "Oct 2026" (mid-month noon UTC stays in the month in Lagos). */
const monthLabel = (m: string) => formatLagos(`${m}-15T12:00:00Z`, "MMM yyyy");

export default async function PurchasesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const { range } = parseReportSearchParams(await searchParams);
  const data = await getPurchasesReport(ctx, range);

  return (
    <ReportShell report="purchases" range={range}>
      {data.rows.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No purchases in this period"
          description="Stock received from suppliers shows up here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label="Total purchased">
              <MoneyText kobo={data.totalKobo} />
            </SummaryTile>
            <SummaryTile label="Receipts">{intFmt.format(data.receiptCount)}</SummaryTile>
          </div>

          <SectionCard title="By supplier">
            <ul className="divide-border divide-y">
              {data.bySupplier.map((s) => (
                <li key={s.supplierId}>
                  <Link
                    href={`/store/suppliers/${s.supplierId}`}
                    className="hover:bg-muted/50 -mx-2 flex min-h-12 items-center justify-between gap-3 rounded-md px-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.supplierName}</span>
                      <span className="text-muted-foreground text-xs">
                        {intFmt.format(s.receipts)} {s.receipts === 1 ? "receipt" : "receipts"}
                      </span>
                    </span>
                    <MoneyText kobo={s.totalKobo} className="font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="By month and supplier">
            <TableScroll minWidth="min-w-[480px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Receipts</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={`${r.month}:${r.supplierId}`} className="h-11">
                      <TableCell className="whitespace-nowrap">{monthLabel(r.month)}</TableCell>
                      <TableCell>{r.supplierName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {intFmt.format(r.receipts)}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyText kobo={r.totalKobo} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium" colSpan={2}>
                      Total
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {intFmt.format(data.receiptCount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText kobo={data.totalKobo} className="font-semibold" />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </TableScroll>
          </SectionCard>
        </>
      )}
    </ReportShell>
  );
}
