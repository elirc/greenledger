import type { ReactNode } from "react";
import { MoneyText } from "@/components/common/money-text";
import { SectionCard } from "@/components/common/section-card";
import type { Ctx } from "@/lib/guard";
import { CYCLE_STATUS_LABELS } from "@/modules/cycles/status";
import { getGreenhouseKpis } from "../queries";

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });
const ratioFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 });

function Kpi({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{children}</p>
    </div>
  );
}

/**
 * Greenhouse detail KPI section (server component; fetches its own data):
 * per active cycle — yield to date, kg/m², kg/plant, grade-A share and, for
 * roles that may see money, input cost to date and input cost per kg.
 */
export async function GreenhouseKpis({
  ctx,
  greenhouseId,
}: {
  ctx: Ctx;
  greenhouseId: string;
}) {
  const cycles = await getGreenhouseKpis(ctx, greenhouseId);

  if (cycles.length === 0) {
    return (
      <SectionCard title="Yield & cost">
        <p className="text-muted-foreground py-2 text-center text-sm">
          No active crop cycle — KPIs appear once a cycle is planted.
        </p>
      </SectionCard>
    );
  }

  return (
    <>
      {cycles.map((c) => (
        <SectionCard
          key={c.cycleId}
          title={`Yield & cost — ${c.code}`}
          action={
            <span className="text-muted-foreground text-xs">
              {CYCLE_STATUS_LABELS[c.status]}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi label="Yield to date">{kgFmt.format(c.yieldKg)} kg</Kpi>
            <Kpi label="kg per m²">
              {c.kgPerM2 === null ? "—" : ratioFmt.format(c.kgPerM2)}
            </Kpi>
            <Kpi label="kg per plant">
              {c.kgPerPlant === null ? "—" : ratioFmt.format(c.kgPerPlant)}
            </Kpi>
            <Kpi label="Grade A share">
              {c.gradeAPct === null ? "—" : `${kgFmt.format(c.gradeAPct)}%`}
            </Kpi>
            {ctx.canSeeMoney ? (
              <>
                <Kpi label="Input cost to date">
                  <MoneyText kobo={c.inputCostKobo} />
                </Kpi>
                <Kpi label="Input cost per kg">
                  <MoneyText kobo={c.costPerKgKobo} />
                </Kpi>
              </>
            ) : null}
          </div>
        </SectionCard>
      ))}
    </>
  );
}
