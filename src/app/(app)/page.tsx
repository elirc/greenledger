import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck2,
  Leaf,
  PackageOpen,
  Tent,
  Tractor,
  TriangleAlert,
  Wallet,
  Warehouse,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyText } from "@/components/common/money-text";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { BEST_BEFORE_WARN_DAYS, MAINTENANCE_WARN_DAYS } from "@/lib/alerts";
import { formatLagosDate } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { SafetyStrip } from "@/modules/dashboard/components/safety-strip";
import { StatTile, TileBreakdown } from "@/modules/dashboard/components/stat-tile";
import { FRESH_DAYS, getDashboard } from "@/modules/dashboard/queries";
import { weekLabel } from "@/modules/forecast/logic";

export const metadata: Metadata = { title: "Dashboard" };

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("en-NG");

function plural(n: number, one: string, many = `${one}s`) {
  return `${intFmt.format(n)} ${n === 1 ? one : many}`;
}

export default async function DashboardPage() {
  const ctx = await requireMember();
  const d = await getDashboard(ctx);
  const isWorker = d.role === "worker";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Dashboard"
        description={
          isWorker
            ? `Your tasks and greenhouses — ${formatLagosDate(`${d.today}T12:00:00Z`)}.`
            : `Farm overview — ${formatLagosDate(`${d.today}T12:00:00Z`)}.`
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {d.stock ? (
          <>
            <StatTile
              href="/store"
              icon={Warehouse}
              label="Input stock value"
              value={<MoneyText kobo={d.stock.valueKobo} />}
              hint="On hand × batch cost"
            />
            <StatTile
              href="/store/alerts"
              icon={TriangleAlert}
              label="Low & expiring stock"
              tone={
                d.stock.expired > 0
                  ? "danger"
                  : d.stock.lowStock + d.stock.expiringSoon > 0
                    ? "warning"
                    : "default"
              }
              value={plural(
                d.stock.lowStock + d.stock.expiringSoon + d.stock.expired,
                "alert",
              )}
            >
              <TileBreakdown
                items={[
                  { label: "Low stock", value: d.stock.lowStock, tone: d.stock.lowStock > 0 ? "warning" : undefined },
                  { label: "Expiring ≤60d", value: d.stock.expiringSoon, tone: d.stock.expiringSoon > 0 ? "warning" : undefined },
                  { label: "Expired", value: d.stock.expired, tone: d.stock.expired > 0 ? "danger" : undefined },
                ]}
              />
            </StatTile>
          </>
        ) : null}

        {d.produce ? (
          <StatTile
            href="/produce"
            icon={PackageOpen}
            label="Produce on hand"
            value={`${kgFmt.format(d.produce.totalKg)} kg`}
            hint={plural(d.produce.lots, "lot")}
            tone={d.produce.nearBestBeforeKg > 0 ? "warning" : "default"}
          >
            <TileBreakdown
              items={[
                { label: `Fresh <${FRESH_DAYS}d`, value: `${kgFmt.format(d.produce.freshKg)} kg` },
                { label: `${FRESH_DAYS}–7 days`, value: `${kgFmt.format(d.produce.agingKg)} kg` },
                {
                  label: `Best-before ≤${BEST_BEFORE_WARN_DAYS}d`,
                  value: `${kgFmt.format(d.produce.nearBestBeforeKg)} kg`,
                  tone: d.produce.nearBestBeforeKg > 0 ? "warning" : undefined,
                },
              ]}
            />
          </StatTile>
        ) : null}

        {d.harvestWeek ? (
          <StatTile
            href="/harvest/forecast"
            icon={Leaf}
            label="This week's harvest"
            value={`${kgFmt.format(d.harvestWeek.actualKg)} kg`}
            hint={`of ${kgFmt.format(d.harvestWeek.forecastKg)} kg forecast · week of ${weekLabel(d.harvestWeek.weekStart)}`}
          />
        ) : null}

        {d.sales ? (
          <StatTile
            href="/sales"
            icon={Wallet}
            label="Sales this month"
            value={<MoneyText kobo={d.sales.monthSalesKobo} />}
            hint={plural(d.sales.monthSalesCount, "sale")}
          >
            <Link
              href="/sales/receivables"
              className="text-primary flex min-h-11 items-center justify-between gap-2 border-t pt-2 text-sm font-medium"
            >
              <span>Unpaid · {plural(d.sales.unpaidCount, "invoice")}</span>
              <MoneyText kobo={d.sales.unpaidKobo} />
            </Link>
          </StatTile>
        ) : null}

        <StatTile
          href="/tasks"
          icon={CalendarCheck2}
          label="Tasks"
          tone={d.tasks.overdue > 0 ? "danger" : d.tasks.dueToday > 0 ? "warning" : "default"}
          value={plural(d.tasks.dueToday, "due today", "due today")}
          hint={`${plural(d.tasks.open, "open task")}`}
        >
          <TileBreakdown
            items={[
              { label: "Due today", value: d.tasks.dueToday },
              { label: "Overdue", value: d.tasks.overdue, tone: d.tasks.overdue > 0 ? "danger" : undefined },
              { label: "Open", value: d.tasks.open },
            ]}
          />
        </StatTile>

        {d.maintenance ? (
          <StatTile
            href="/equipment"
            icon={Tractor}
            label="Maintenance due"
            tone={d.maintenance.overdue > 0 ? "danger" : d.maintenance.dueSoon > 0 ? "warning" : "default"}
            value={plural(d.maintenance.dueSoon + d.maintenance.overdue, "schedule")}
            hint={`${intFmt.format(d.maintenance.overdue)} overdue · due within ${MAINTENANCE_WARN_DAYS} days`}
          />
        ) : null}
      </div>

      <SectionCard
        title={isWorker ? "Your greenhouses" : "Greenhouse safety"}
        action={
          <Link
            href="/greenhouses"
            className="text-primary flex min-h-11 items-center text-sm font-medium"
          >
            All greenhouses
          </Link>
        }
      >
        {d.safety.length === 0 ? (
          <EmptyState
            icon={Tent}
            title={isWorker ? "No greenhouses assigned" : "No greenhouses yet"}
            description={
              isWorker
                ? "Ask your farm manager to assign you to a greenhouse."
                : "Add greenhouses in setup to see entry and harvest safety here."
            }
          >
            {d.role === "owner" ? (
              <Button asChild className="h-11">
                <Link href="/setup">Open setup</Link>
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <SafetyStrip rows={d.safety} />
        )}
      </SectionCard>
    </div>
  );
}
