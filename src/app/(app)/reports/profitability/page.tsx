import Link from "next/link";
import { Coins } from "lucide-react";
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
import { requireMember } from "@/lib/guard";
import { cn } from "@/lib/utils";
import { CycleStatusBadge } from "@/modules/cycles/components/cycle-status-badge";
import {
  ReportShell,
  SummaryTile,
  TableScroll,
} from "@/modules/reports/components/report-shell";
import { getProfitabilityReport } from "@/modules/reports/queries";

export const metadata = { title: "Crop cycle profitability" };

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });

function profitClass(kobo: number | null) {
  return cn(
    "font-semibold",
    kobo !== null && kobo < 0 ? "text-status-danger" : undefined,
  );
}

export default async function ProfitabilityReportPage() {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const data = await getProfitabilityReport(ctx);

  return (
    <ReportShell report="profitability" range={null}>
      {data.rows.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="No crop cycles yet"
          description="Profitability appears once a cycle is planted and starts using inputs."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile label="Revenue">
              <MoneyText kobo={data.totals.revenueKobo} />
            </SummaryTile>
            <SummaryTile label="Input cost">
              <MoneyText kobo={data.totals.inputCostKobo} />
            </SummaryTile>
            <SummaryTile label="Cycle expenses">
              <MoneyText kobo={data.totals.expensesKobo} />
            </SummaryTile>
            <SummaryTile label="Profit">
              <MoneyText
                kobo={data.totals.profitKobo}
                className={profitClass(data.totals.profitKobo)}
              />
            </SummaryTile>
          </div>

          <SectionCard title="By crop cycle">
            <TableScroll minWidth="min-w-[920px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cycle</TableHead>
                    <TableHead className="text-right">Harvested kg</TableHead>
                    <TableHead className="text-right">Sold kg</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Input cost</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Cost / kg sold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.cycleId}>
                      <TableCell>
                        <Link
                          href={`/cycles/${r.cycleId}`}
                          className="flex min-h-11 flex-col justify-center hover:underline"
                        >
                          <span className="flex items-center gap-2 font-medium">
                            {r.code} <CycleStatusBadge status={r.status} />
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {r.greenhouseName} · {r.cropName} {r.varietyName}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kgFmt.format(r.kgHarvested)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kgFmt.format(r.kgSold)}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyText kobo={r.revenueKobo} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyText kobo={r.inputCostKobo} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyText kobo={r.expensesKobo} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyText kobo={r.profitKobo} className={profitClass(r.profitKobo)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyText kobo={r.costPerKgKobo} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {kgFmt.format(data.totals.kgHarvested)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {kgFmt.format(data.totals.kgSold)}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText kobo={data.totals.revenueKobo} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText kobo={data.totals.inputCostKobo} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText kobo={data.totals.expensesKobo} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText
                        kobo={data.totals.profitKobo}
                        className={profitClass(data.totals.profitKobo)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText kobo={data.totals.costPerKgKobo} />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </TableScroll>
          </SectionCard>

          <SectionCard title="How this is calculated">
            <div className="text-muted-foreground space-y-2 text-sm">
              <p>
                Revenue is each sale line&apos;s total, shared by the kg that
                came from this cycle&apos;s harvests. Input cost is every input
                issued to the cycle at its batch cost. Expenses are only those
                tagged to the cycle.
              </p>
              <p>
                Farm-level expenses not tagged to a cycle are{" "}
                <strong className="text-foreground">excluded</strong> from cycle
                profit:{" "}
                <MoneyText
                  kobo={data.unallocatedExpensesKobo}
                  className="text-foreground font-medium"
                />{" "}
                to date.
              </p>
            </div>
          </SectionCard>
        </>
      )}
    </ReportShell>
  );
}
