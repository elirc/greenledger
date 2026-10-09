import Link from "next/link";
import { notFound } from "next/navigation";
import { Bug, ChevronRight, Plus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { formatLagos, formatLagosDate, todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { APPLICATION_TYPE_LABELS } from "@/modules/applications/schema";
import { listApplications } from "@/modules/applications/queries";
import { CycleStatusActions } from "@/modules/cycles/components/cycle-status-actions";
import { CycleStatusBadge } from "@/modules/cycles/components/cycle-status-badge";
import { getCycle } from "@/modules/cycles/queries";
import { HarvestList } from "@/modules/harvest/components/harvest-list";
import { listHarvests } from "@/modules/harvest/queries";
import { LossList } from "@/modules/losses/components/loss-list";
import { listPlantLosses } from "@/modules/losses/queries";

export const metadata = { title: "Crop cycle" };

const numberFmt = new Intl.NumberFormat("en-NG");

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export default async function CycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const cycle = await getCycle(ctx, id);
  if (!cycle) notFound();
  const losses = await listPlantLosses(ctx, id);
  const [cycleApplications, cycleHarvests] = await Promise.all([
    listApplications(ctx, { greenhouseId: cycle.greenhouseId }).then((rows) =>
      rows.filter((a) => a.cropCycleId === cycle.id).slice(0, 5),
    ),
    listHarvests(ctx, { cycleId: cycle.id, limit: 5 }),
  ]);

  const canManage = ctx.role === "owner" || ctx.role === "manager";
  const canLogLoss =
    (cycle.status === "growing" || cycle.status === "harvesting") &&
    cycle.plantsAlive > 0;
  const today = todayLagos();
  const survival =
    cycle.plantsTransplanted > 0
      ? `${Math.round((cycle.plantsAlive / cycle.plantsTransplanted) * 100)}% survival`
      : undefined;
  const fmtDate = (d: string | null) => (d ? formatLagosDate(d) : "—");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={cycle.code}
        description={`${cycle.cropName} · ${cycle.varietyName} — ${cycle.greenhouseName}${cycle.zoneName ? ` / ${cycle.zoneName}` : ""}`}
        backHref="/cycles"
        action={<CycleStatusBadge status={cycle.status} />}
      />

      {canManage ? (
        <CycleStatusActions
          cycle={{
            id: cycle.id,
            code: cycle.code,
            status: cycle.status,
            transplantDate: cycle.transplantDate,
          }}
          today={today}
        />
      ) : null}

      {cycle.status === "planned" || cycle.status === "nursery" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Kpi label="Sow date" value={fmtDate(cycle.sowDate)} />
          <Kpi
            label="Days to first harvest"
            value={`${cycle.daysToFirstHarvest} d`}
            hint="from transplant"
          />
          <Kpi
            label="Harvest period"
            value={`${cycle.harvestDurationWeeks} wk`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Kpi
            label="Transplanted"
            value={numberFmt.format(cycle.plantsTransplanted)}
            hint={fmtDate(cycle.transplantDate)}
          />
          <Kpi
            label="Alive"
            value={numberFmt.format(cycle.plantsAlive)}
            hint={survival}
          />
          <Kpi label="Losses" value={numberFmt.format(cycle.lossesTotal)} />
          <Kpi
            label="Expected first harvest"
            value={fmtDate(cycle.expectedFirstHarvest)}
          />
          <Kpi label="Expected end" value={fmtDate(cycle.expectedEnd)} />
          {cycle.closedAt ? (
            <Kpi label="Closed" value={formatLagosDate(cycle.closedAt)} />
          ) : null}
        </div>
      )}

      {cycle.notes ? (
        <p className="text-muted-foreground rounded-lg border px-3 py-2 text-sm whitespace-pre-line">
          {cycle.notes}
        </p>
      ) : null}

      <SectionCard
        title={`Plant losses (${losses.length})`}
        action={
          canLogLoss ? (
            <Button asChild className="h-11">
              <Link href={`/cycles/${cycle.id}/losses/new`}>
                <Plus className="size-4" /> Log loss
              </Link>
            </Button>
          ) : null
        }
      >
        <LossList rows={losses} />
      </SectionCard>

      <SectionCard title="Scouting">
        <Link
          href={`/cycles/${cycle.id}/scouting`}
          className="hover:bg-muted/50 -mx-2 flex min-h-11 items-center gap-3 rounded-md px-2"
        >
          <Bug className="text-muted-foreground size-5" aria-hidden />
          <span className="flex-1">Pest &amp; disease scouting log</span>
          <ChevronRight className="text-muted-foreground size-5" />
        </Link>
      </SectionCard>

      <SectionCard
        title="Applications"
        action={
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/applications">View all</Link>
          </Button>
        }
      >
        {cycleApplications.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No fertigation or sprays logged for this cycle yet.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {cycleApplications.map((a) => (
              <li key={a.id} className="flex min-h-11 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {APPLICATION_TYPE_LABELS[a.type]} ·{" "}
                    {a.recipeName ?? "Custom mix"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatLagos(a.appliedAt, "dd MMM yyyy HH:mm")} ·{" "}
                    {a.waterVolumeLitres} L · {a.operatorName}
                  </p>
                </div>
                {a.harvestSafeDate && a.harvestSafeDate > today ? (
                  <span className="text-status-danger text-xs font-medium">
                    PHI to {formatLagosDate(a.harvestSafeDate)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Harvests"
        action={
          canLogLoss ? (
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href="/harvest">Log harvest</Link>
            </Button>
          ) : undefined
        }
      >
        {cycleHarvests.length === 0 ? (
          <EmptyState
            icon={Plus}
            title="No harvests yet"
            description="Picks logged on the Harvest screen appear here."
          />
        ) : (
          <HarvestList harvests={cycleHarvests} showGreenhouse={false} />
        )}
      </SectionCard>
    </div>
  );
}
