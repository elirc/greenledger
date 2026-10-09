import type { ReactNode } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLagosDate } from "@/lib/dates";
import {
  REPORT_META,
  type ReportKey,
  type ReportRange,
} from "../queries";

/** Query string carried by the export / PDF buttons (same params as the page). */
function exportQuery(range: ReportRange | null, extra?: Record<string, string>) {
  const sp = new URLSearchParams();
  if (range) {
    sp.set("from", range.from);
    sp.set("to", range.to);
  }
  for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export function ExportButtons({
  report,
  range,
  extra,
}: {
  report: ReportKey;
  range: ReportRange | null;
  extra?: Record<string, string>;
}) {
  const q = exportQuery(range, extra);
  return (
    <div className="flex gap-2">
      <Button asChild variant="outline" className="h-11 px-4">
        <a href={`/api/export/${report}${q}`} download>
          <FileSpreadsheet aria-hidden />
          Excel
        </a>
      </Button>
      {REPORT_META[report].pdf ? (
        <Button asChild variant="outline" className="h-11 px-4">
          <a href={`/api/pdf/${report}${q}`} target="_blank" rel="noopener">
            <FileDown aria-hidden />
            PDF
          </a>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Date-range filter: a plain GET form (no client JS) that reloads the page
 * with ?from=&to=, keeping any extra params (e.g. input-use grouping).
 */
export function RangeForm({
  range,
  hidden,
}: {
  range: ReportRange;
  hidden?: Record<string, string>;
}) {
  return (
    <form
      method="get"
      className="bg-card grid grid-cols-2 items-end gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]"
    >
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="space-y-1">
        <Label htmlFor="report-from">From</Label>
        <Input
          id="report-from"
          type="date"
          name="from"
          defaultValue={range.from}
          className="h-11"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="report-to">To</Label>
        <Input
          id="report-to"
          type="date"
          name="to"
          defaultValue={range.to}
          className="h-11"
        />
      </div>
      <Button type="submit" className="col-span-2 h-11 px-5 sm:col-span-1">
        Apply
      </Button>
    </form>
  );
}

/** Header (title, description, back to hub, export buttons) + range filter. */
export function ReportShell({
  report,
  range,
  extra,
  description,
  children,
}: {
  report: ReportKey;
  /** null for as-of-today / whole-cycle reports. */
  range: ReportRange | null;
  extra?: Record<string, string>;
  description?: string;
  children: ReactNode;
}) {
  const meta = REPORT_META[report];
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title={meta.title}
        description={
          description ??
          (range
            ? `${meta.description} ${formatLagosDate(`${range.from}T12:00:00Z`)} – ${formatLagosDate(`${range.to}T12:00:00Z`)}.`
            : meta.description)
        }
        backHref="/reports"
        action={<ExportButtons report={report} range={range} extra={extra} />}
      />
      {range ? <RangeForm range={range} hidden={extra} /> : null}
      {children}
    </div>
  );
}

/** Horizontal-scroll wrapper so wide tables never break the 360px layout. */
export function TableScroll({
  minWidth = "min-w-[640px]",
  children,
}: {
  minWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <div className={minWidth}>{children}</div>
    </div>
  );
}

export function SummaryTile({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{children}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
