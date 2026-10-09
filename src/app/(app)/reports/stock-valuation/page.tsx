import Link from "next/link";
import { Warehouse } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyText } from "@/components/common/money-text";
import { QtyText } from "@/components/common/qty-text";
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
import { formatLagosDate } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { UNIT_LABELS } from "@/lib/units";
import { ITEM_CATEGORY_LABELS } from "@/modules/items/schema";
import {
  ReportShell,
  SummaryTile,
  TableScroll,
} from "@/modules/reports/components/report-shell";
import { getStockValuationReport } from "@/modules/reports/queries";

export const metadata = { title: "Stock valuation" };

export default async function StockValuationReportPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const data = await getStockValuationReport(ctx);

  return (
    <ReportShell
      report="stock-valuation"
      range={null}
      description={`Input stock on hand × batch cost, as of ${formatLagosDate(`${data.asOf}T12:00:00Z`)}.`}
    >
      {data.rows.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No stock on hand"
          description="Receive stock into the store to see its value here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label="Total value">
              <MoneyText kobo={data.totalValueKobo} />
            </SummaryTile>
            <SummaryTile label="Items in stock">{data.rows.length}</SummaryTile>
          </div>
          <SectionCard title="By item">
            <TableScroll minWidth="min-w-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Avg cost / unit</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.itemId}>
                      <TableCell>
                        <Link
                          href={`/store/items/${r.itemId}`}
                          className="flex min-h-11 flex-col justify-center hover:underline"
                        >
                          <span className="font-medium">{r.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {ITEM_CATEGORY_LABELS[r.category]}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <QtyText qty={r.onHand} unit={r.baseUnit} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyText kobo={r.avgCostKobo} />
                        <span className="text-muted-foreground text-xs">
                          {" "}/ {UNIT_LABELS[r.baseUnit]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <MoneyText kobo={r.valueKobo} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium" colSpan={3}>
                      Total
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText kobo={data.totalValueKobo} className="font-semibold" />
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
