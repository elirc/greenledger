import { PackageX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { GRADE_SHORT } from "@/modules/harvest/schema";
import {
  ReportShell,
  SummaryTile,
  TableScroll,
} from "@/modules/reports/components/report-shell";
import {
  getWasteReport,
  parseReportSearchParams,
} from "@/modules/reports/queries";

export const metadata = { title: "Waste report" };

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });

export default async function WasteReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const { range } = parseReportSearchParams(await searchParams);
  const data = await getWasteReport(ctx, range);

  return (
    <ReportShell report="waste" range={range}>
      {data.rows.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title="No waste recorded in this period"
          description="Waste written off on the Produce screen shows up here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile label="Total wasted">{kgFmt.format(data.totalKg)} kg</SummaryTile>
            {data.byReason.slice(0, 3).map((r) => (
              <SummaryTile
                key={r.reason}
                label={r.reason}
                hint={`${r.entries} ${r.entries === 1 ? "entry" : "entries"}`}
              >
                {kgFmt.format(r.kg)} kg
              </SummaryTile>
            ))}
          </div>

          <SectionCard title="Waste entries">
            <TableScroll minWidth="min-w-[640px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Produce</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead className="text-right">Kg</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.id} className="h-11">
                      <TableCell className="whitespace-nowrap">
                        {formatLagos(r.performedAt, "dd MMM HH:mm")}
                      </TableCell>
                      <TableCell>
                        {r.cropName} {r.varietyName} · {GRADE_SHORT[r.grade]}
                      </TableCell>
                      <TableCell>{r.storeName}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {kgFmt.format(r.kg)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {r.reason}
                        {r.note ? (
                          <span className="text-muted-foreground block text-xs">
                            {r.note}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          </SectionCard>
        </>
      )}
    </ReportShell>
  );
}
