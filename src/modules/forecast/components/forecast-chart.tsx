"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { weekLabel } from "../logic";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Forecast vs actual kg per ISO week (Recharts BarChart).
 *
 * Dataviz conventions applied here:
 * - one y-axis (kg), labelled; x-axis labelled "Week starting (Mon)" with
 *   Lagos 'dd MMM' ticks; recessive horizontal-only grid.
 * - two series → legend always shown; fixed colour order from the design
 *   tokens (actual = chart-1, forecast = chart-2), never cycled.
 * - thin bars, 4px rounded data-ends, 2px gap between adjacent bars.
 * - hover tooltip per week; a table view (details) so identity/values are
 *   never colour-only.
 * - mobile: the plot keeps a minimum width per week and the wrapper scrolls
 *   horizontally instead of squeezing bars.
 */

export interface ForecastChartRow {
  weekStart: string;
  forecastKg: number;
  actualKg: number;
}

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const kgFmt1 = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });


/** Static width classes (Tailwind needs literal strings) by week count. */
function minWidthClass(weeks: number): string {
  if (weeks <= 6) return "min-w-[320px]";
  if (weeks <= 10) return "min-w-[480px]";
  if (weeks <= 14) return "min-w-[640px]";
  if (weeks <= 20) return "min-w-[880px]";
  return "min-w-[1100px]";
}

/** Series swatches use the same token classes as the bar fills. */
const SERIES = [
  { key: "actualKg", name: "Actual", swatch: "bg-chart-1" },
  { key: "forecastKg", name: "Forecast", swatch: "bg-chart-2" },
] as const;

function ForecastLegend() {
  return (
    <ul className="text-muted-foreground flex justify-end gap-4 text-xs">
      {SERIES.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className={`${s.swatch} inline-block size-2.5 rounded-sm`} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function ForecastTooltip({
  label,
  rows,
}: {
  label: string;
  rows: { key: string; name: string; value: number }[];
}) {
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium">Week of {weekLabel(label)}</p>
      {rows.map((r) => {
        const swatch = SERIES.find((s) => s.key === r.key)?.swatch ?? "bg-muted";
        return (
          <p key={r.key} className="flex items-center gap-1.5">
            <span className={`${swatch} inline-block size-2 rounded-sm`} aria-hidden />
            <span className="text-muted-foreground">{r.name}</span>
            <span className="ml-auto pl-3 tabular-nums">
              {kgFmt1.format(r.value)} kg
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function ForecastChart({
  rows,
  title,
  currentWeek,
  height = "md",
}: {
  rows: ForecastChartRow[];
  /** Accessible name for the figure (e.g. "Farm total"). */
  title: string;
  /** Monday of this week (yyyy-MM-dd) — marked with a reference line. */
  currentWeek?: string;
  height?: "sm" | "md";
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No forecast weeks yet — the cycle needs an expected first-harvest date
        and plants alive.
      </p>
    );
  }
  const showNow =
    currentWeek !== undefined && rows.some((r) => r.weekStart === currentWeek);

  return (
    <figure className="space-y-2" aria-label={`${title}: forecast vs actual kg per week`}>
      <div className="-mx-1 overflow-x-auto pb-1">
        <div
          className={`${minWidthClass(rows.length)} ${height === "sm" ? "h-56" : "h-72"} px-1`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 8, right: 8, bottom: 24, left: 8 }}
              barGap={2}
              barCategoryGap="20%"
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="0"
              />
              <XAxis
                dataKey="weekStart"
                tickFormatter={weekLabel}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval="preserveStartEnd"
                minTickGap={8}
                label={{
                  value: "Week starting (Mon)",
                  position: "insideBottom",
                  offset: -16,
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />
              <YAxis
                width={48}
                tickFormatter={(v: number) => kgFmt.format(v)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: "kg",
                  angle: -90,
                  position: "insideLeft",
                  offset: 4,
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={({ active, label, payload }) =>
                  active && payload && payload.length > 0 ? (
                    <ForecastTooltip
                      label={String(label)}
                      rows={payload.map((p) => ({
                        key: String(p.dataKey),
                        name: String(p.name),
                        value: Number(p.value ?? 0),
                      }))}
                    />
                  ) : null
                }
              />
              <Legend
                verticalAlign="top"
                align="right"
                height={28}
                content={() => <ForecastLegend />}
              />
              {showNow ? (
                <ReferenceLine
                  x={currentWeek}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: "This week",
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                />
              ) : null}
              <Bar
                dataKey="actualKg"
                name="Actual"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="forecastKg"
                name="Forecast"
                fill="var(--chart-2)"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <details className="text-sm">
        <summary className="text-muted-foreground flex min-h-11 cursor-pointer items-center">
          Show as table
        </summary>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week of</TableHead>
              <TableHead className="text-right">Forecast kg</TableHead>
              <TableHead className="text-right">Actual kg</TableHead>
              <TableHead className="text-right">Actual vs forecast</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.weekStart}>
                <TableCell>{weekLabel(r.weekStart)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {kgFmt1.format(r.forecastKg)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {kgFmt1.format(r.actualKg)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.forecastKg > 0
                    ? `${Math.round((r.actualKg / r.forecastKg) * 100)}%`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </figure>
  );
}
