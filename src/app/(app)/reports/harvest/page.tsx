import { ChartColumn } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
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
import { weekLabel } from "@/modules/forecast/logic";
import { GRADES, GRADE_LABELS } from "@/modules/harvest/schema";
import {
  ReportShell,
  SummaryTile,
  TableScroll,
} from "@/modules/reports/components/report-shell";
import {
  getHarvestReport,
  parseReportSearchParams,
} from "@/modules/reports/queries";

export const metadata = { title: "Harvest report" };

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });
const pctText = (p: number | null) => (p === null ? "—" : `${kgFmt.format(p)}%`);

export default async function HarvestReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const { range } = parseReportSearchParams(await searchParams);
  const data = await getHarvestReport(ctx, range);

  return (
    <ReportShell report="harvest" range={range}>
      {data.rows.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="No harvests in this period"
          description="Pick a wider date range, or log harvests on the Harvest screen."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SummaryTile label="Total harvested">
              {kgFmt.format(data.totals.totalKg)} kg
            </SummaryTile>
            <SummaryTile label="Grade A share">
              {pctText(data.totals.gradeAPct)}
            </SummaryTile>
            <SummaryTile label="Weeks">{data.rows.length}</SummaryTile>
          </div>
          <SectionCard title="kg by ISO week and grade">
            <TableScroll minWidth="min-w-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week of</TableHead>
                    {GRADES.map((g) => (
                      <TableHead key={g} className="text-right">
                        {GRADE_LABELS[g]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">A share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.weekStart} className="h-11">
                      <TableCell className="font-medium">
                        {weekLabel(r.weekStart)}
                      </TableCell>
                      {GRADES.map((g) => (
                        <TableCell key={g} className="text-right tabular-nums">
                          {kgFmt.format(r.kg[g])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium tabular-nums">
                        {kgFmt.format(r.totalKg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pctText(r.gradeAPct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    {GRADES.map((g) => (
                      <TableCell key={g} className="text-right tabular-nums">
                        {kgFmt.format(data.totals.kg[g])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {kgFmt.format(data.totals.totalKg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pctText(data.totals.gradeAPct)}
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
