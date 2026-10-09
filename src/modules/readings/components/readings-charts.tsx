"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addDays, formatLagos, lagosDateOf } from "@/lib/dates";
import type { ReadingPoint } from "../queries";
import { METRICS, METRIC_META, type Metric } from "../schema";

/**
 * Per-greenhouse climate charts: one Recharts LineChart per metric that has
 * at least one value in the window (each metric has its own unit, so no
 * shared axis). Conventions follow forecast-chart.tsx:
 * - labelled axes; x = time with Lagos 'dd MMM' day ticks; recessive
 *   horizontal-only grid; one series per chart → no legend needed (the
 *   chart title names it).
 * - fixed token colour per metric (chart-1..4), never cycled.
 * - mobile: the plot keeps a minimum width and the wrapper scrolls
 *   horizontally instead of squeezing 14 days into 360 px.
 * - a table view (details) so values are never chart-only.
 */

const STROKES: Record<Metric, string> = {
  temperatureC: "var(--chart-1)",
  humidityPct: "var(--chart-2)",
  ecMsCm: "var(--chart-3)",
  ph: "var(--chart-4)",
};

/** Lagos is UTC+1 all year (no DST) — midnight of a Lagos calendar day. */
const lagosMidnight = (d: string) => Date.parse(`${d}T00:00:00+01:00`);

function dayTicks(startMs: number, endMs: number): number[] {
  const ticks: number[] = [];
  let d = lagosDateOf(new Date(startMs));
  for (let i = 0; i < 400; i++) {
    const t = lagosMidnight(d);
    if (t > endMs) break;
    if (t >= startMs) ticks.push(t);
    d = addDays(d, 1);
  }
  return ticks;
}

function fmt(m: Metric, v: number): string {
  const meta = METRIC_META[m];
  const s = v.toFixed(meta.decimals);
  return meta.unit ? `${s} ${meta.unit}` : s;
}

function MetricChart({
  metric,
  points,
  startMs,
  endMs,
  ticks,
}: {
  metric: Metric;
  points: ReadingPoint[];
  startMs: number;
  endMs: number;
  ticks: number[];
}) {
  const meta = METRIC_META[metric];
  const data = points
    .filter((p) => p[metric] !== null)
    .map((p) => ({ t: p.t, value: p[metric] as number }));

  return (
    <figure
      className="space-y-1"
      aria-label={`${meta.label} over the last 14 days`}
    >
      <figcaption className="text-sm font-medium">
        {meta.label}
        {meta.unit ? (
          <span className="text-muted-foreground font-normal"> ({meta.unit})</span>
        ) : null}
      </figcaption>
      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="h-52 min-w-[640px] px-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="0"
              />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[startMs, endMs]}
                ticks={ticks}
                tickFormatter={(v: number) => formatLagos(v, "dd MMM")}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval="preserveStartEnd"
                minTickGap={12}
                label={{
                  value: "Date (Lagos)",
                  position: "insideBottom",
                  offset: -16,
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />
              <YAxis
                width={48}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => v.toFixed(meta.decimals === 0 ? 0 : 1)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: meta.axis,
                  angle: -90,
                  position: "insideLeft",
                  offset: 4,
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = payload[0].payload as { t: number; value: number };
                  return (
                    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-sm">
                      <p className="text-muted-foreground">
                        {formatLagos(row.t, "dd MMM HH:mm")}
                      </p>
                      <p className="font-medium tabular-nums">
                        {meta.label} {fmt(metric, row.value)}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={meta.label}
                stroke={STROKES[metric]}
                strokeWidth={2}
                dot={{ r: 3, fill: STROKES[metric], strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
}

export function ReadingsCharts({
  points,
  startMs,
  endMs,
}: {
  points: ReadingPoint[];
  /** Window bounds (epoch ms) from the server — keeps render pure. */
  startMs: number;
  endMs: number;
}) {
  const present = METRICS.filter((m) => points.some((p) => p[m] !== null));
  const ticks = dayTicks(startMs, endMs);
  const newestFirst = [...points].reverse();

  return (
    <div className="space-y-6">
      {present.map((m) => (
        <MetricChart
          key={m}
          metric={m}
          points={points}
          startMs={startMs}
          endMs={endMs}
          ticks={ticks}
        />
      ))}
      <details className="text-sm">
        <summary className="text-muted-foreground flex min-h-11 cursor-pointer items-center">
          Show as table ({points.length} readings)
        </summary>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                {present.map((m) => (
                  <TableHead key={m} className="text-right">
                    {METRIC_META[m].label}
                  </TableHead>
                ))}
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {newestFirst.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatLagos(p.t, "dd MMM HH:mm")}
                  </TableCell>
                  {present.map((m) => (
                    <TableCell key={m} className="text-right tabular-nums">
                      {p[m] === null ? "—" : fmt(m, p[m] as number)}
                    </TableCell>
                  ))}
                  <TableCell className="text-muted-foreground">
                    {p.recordedByName ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  );
}
