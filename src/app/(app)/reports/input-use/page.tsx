import Link from "next/link";
import { FlaskConical } from "lucide-react";
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
import { requireMember } from "@/lib/guard";
import { cn } from "@/lib/utils";
import {
  ReportShell,
  SummaryTile,
  TableScroll,
} from "@/modules/reports/components/report-shell";
import {
  getInputUseReport,
  INPUT_USE_GROUPS,
  parseReportSearchParams,
  type InputUseGroup,
} from "@/modules/reports/queries";

export const metadata = { title: "Input use report" };

const GROUP_LABELS: Record<InputUseGroup, string> = {
  item: "By item",
  greenhouse: "By greenhouse",
  cycle: "By cycle",
};

const intFmt = new Intl.NumberFormat("en-NG");

export default async function InputUseReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const { params, range } = parseReportSearchParams(await searchParams);
  const data = await getInputUseReport(ctx, range, params.by);
  const firstCol =
    params.by === "item" ? "Item" : params.by === "greenhouse" ? "Greenhouse" : "Crop cycle";

  return (
    <ReportShell report="input-use" range={range} extra={{ by: params.by }}>
      <nav className="bg-muted flex gap-1 rounded-lg p-1" aria-label="Group by">
        {INPUT_USE_GROUPS.map((g) => (
          <Link
            key={g}
            href={`/reports/input-use?by=${g}&from=${range.from}&to=${range.to}`}
            aria-current={g === params.by ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center rounded-md px-2 text-sm font-medium",
              g === params.by
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {GROUP_LABELS[g]}
          </Link>
        ))}
      </nav>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No inputs issued in this period"
          description="Issues from the store and fertigation/spray applications show up here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label="Issues">{intFmt.format(data.totalIssues)}</SummaryTile>
            <SummaryTile label="Input cost">
              <MoneyText kobo={data.totalCostKobo} />
            </SummaryTile>
          </div>
          <SectionCard title={GROUP_LABELS[params.by]}>
            <TableScroll minWidth="min-w-[560px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{firstCol}</TableHead>
                    {params.by === "item" ? (
                      <TableHead className="text-right">Quantity</TableHead>
                    ) : (
                      <TableHead className="text-right">Items</TableHead>
                    )}
                    <TableHead className="text-right">Issues</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>
                        <div className="flex min-h-11 flex-col justify-center">
                          <span className="font-medium">{r.label}</span>
                          {r.sublabel ? (
                            <span className="text-muted-foreground text-xs">
                              {r.sublabel}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.quantity !== null && r.baseUnit ? (
                          <QtyText qty={r.quantity} unit={r.baseUnit} />
                        ) : (
                          <span className="tabular-nums">{intFmt.format(r.itemCount)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {intFmt.format(r.issues)}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyText kobo={r.costKobo} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">
                      {intFmt.format(data.totalIssues)}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText kobo={data.totalCostKobo} className="font-semibold" />
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
