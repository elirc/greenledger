import Link from "next/link";
import { ChartColumn } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLagosDate, todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { ForecastChart } from "@/modules/forecast/components/forecast-chart";
import { weekLabel } from "@/modules/forecast/logic";
import { getHarvestForecast } from "@/modules/forecast/queries";
import { isoWeekStart } from "@/modules/produce/forecast";

export const metadata = { title: "Harvest forecast" };

const intFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export default async function HarvestForecastPage() {
  // Owner/manager only: forecast numbers imply yields (spec route map).
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const data = await getHarvestForecast(ctx);
  const currentWeek = isoWeekStart(todayLagos());
  const thisWeek = data.farm.find((w) => w.weekStart === currentWeek);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Harvest forecast"
        description="Plants alive × expected yield per plant, spread over each variety's harvest weeks — compared with what was actually harvested."
        backHref="/harvest"
      />

      {data.cycles.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="No active cycles to forecast"
          description="Forecasts appear once a cycle is transplanted and growing."
        >
          <Button asChild className="h-11">
            <Link href="/cycles">Go to crop cycles</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi
              label="This week forecast"
              value={`${kgFmt.format(thisWeek?.forecastKg ?? 0)} kg`}
              hint={`week of ${weekLabel(currentWeek)}`}
            />
            <Kpi
              label="This week actual"
              value={`${kgFmt.format(thisWeek?.actualKg ?? 0)} kg`}
            />
            <Kpi
              label="Forecast (all weeks)"
              value={`${intFmt.format(data.farmForecastTotalKg)} kg`}
            />
            <Kpi
              label="Harvested to date"
              value={`${intFmt.format(data.farmActualTotalKg)} kg`}
            />
          </div>

          <SectionCard title="Farm total — forecast vs actual">
            <ForecastChart
              rows={data.farm}
              title="Farm total"
              currentWeek={currentWeek}
            />
          </SectionCard>

          <SectionCard title="Forecast by cycle">
            <div className="-mx-1 overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Cycle</TableHead>
                    <TableHead className="text-right">Plants alive</TableHead>
                    <TableHead className="text-right">Yield / plant</TableHead>
                    <TableHead className="text-right">Weeks</TableHead>
                    <TableHead className="text-right">kg / week</TableHead>
                    <TableHead className="text-right">Total kg</TableHead>
                    <TableHead>Window</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.cycles.map((c) => (
                    <TableRow key={c.cycleId}>
                      <TableCell>
                        <Link
                          href={`/cycles/${c.cycleId}`}
                          className="flex min-h-11 flex-col justify-center hover:underline"
                        >
                          <span className="font-medium">{c.code}</span>
                          <span className="text-muted-foreground text-xs">
                            {c.greenhouseName} · {c.varietyName}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {intFmt.format(c.plantsAlive)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {kgFmt.format(c.expectedYieldKgPerPlant)} kg
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.harvestDurationWeeks}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {kgFmt.format(c.weeklyKg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {intFmt.format(c.totalKg)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.firstWeek && c.lastWeek
                          ? `${weekLabel(c.firstWeek)} – ${formatLagosDate(`${c.lastWeek}T12:00:00Z`)}`
                          : "No first-harvest date"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          {data.cycles.map((c) => (
            <SectionCard
              key={c.cycleId}
              title={`${c.code} — ${c.cropName} ${c.varietyName}`}
              action={
                <span className="text-muted-foreground text-xs tabular-nums">
                  {intFmt.format(c.actualTotalKg)} / {intFmt.format(c.totalKg)} kg
                </span>
              }
            >
              <ForecastChart
                rows={c.weeks}
                title={c.code}
                currentWeek={currentWeek}
                height="sm"
              />
            </SectionCard>
          ))}
        </>
      )}
    </div>
  );
}
