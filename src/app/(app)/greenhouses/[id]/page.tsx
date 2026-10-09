import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { formatLagosDate, todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { CycleStatusBadge } from "@/modules/cycles/components/cycle-status-badge";
import { SafetyChips } from "@/modules/cycles/components/safety-chips";
import {
  getGreenhouseCard,
  listCycles,
  type CycleListRow,
} from "@/modules/cycles/queries";
import { GREENHOUSE_TYPE_LABELS } from "@/modules/farm/schema";

export const metadata = { title: "Greenhouse" };

const numberFmt = new Intl.NumberFormat("en-NG");

function CycleRow({ c, linked }: { c: CycleListRow; linked: boolean }) {
  const when =
    c.status === "planned"
      ? c.sowDate
        ? `Sow ${formatLagosDate(c.sowDate)}`
        : "Planned"
      : c.transplantDate
        ? `Planted ${formatLagosDate(c.transplantDate)}`
        : "";
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{c.code}</span>
          <CycleStatusBadge status={c.status} />
        </div>
        <p className="text-muted-foreground truncate text-sm">
          {c.cropName} · {c.varietyName}
          {when ? ` — ${when}` : ""}
          {c.status !== "planned"
            ? ` · ${numberFmt.format(c.plantsAlive)} alive`
            : ""}
        </p>
      </div>
      {linked ? (
        <ChevronRight className="text-muted-foreground size-5 shrink-0" />
      ) : null}
    </>
  );
  return (
    <li>
      {linked ? (
        <Link
          href={`/cycles/${c.id}`}
          className="hover:bg-muted/50 -mx-2 flex min-h-14 items-center gap-3 rounded-md px-2 py-2"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-h-14 items-center gap-3 py-2">{body}</div>
      )}
    </li>
  );
}

export default async function GreenhouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember();
  const gh = await getGreenhouseCard(ctx, id);
  if (!gh) notFound();
  const cycles = await listCycles(ctx, { greenhouseId: id });

  // Storekeepers can see greenhouses but not the cycles screens (route map).
  const linkCycles = ctx.role !== "storekeeper";
  const active = cycles.filter(
    (c) => c.status !== "closed" && c.status !== "planned",
  );
  const plantsAlive = active.reduce((sum, c) => sum + c.plantsAlive, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={gh.name}
        description={`${GREENHOUSE_TYPE_LABELS[gh.type]} · ${numberFmt.format(gh.areaM2)} m² · capacity ${numberFmt.format(gh.plantCapacity)} plants${gh.isActive ? "" : " · inactive"}`}
        backHref="/greenhouses"
      />

      <SafetyChips
        entrySafeAt={gh.entrySafeAt}
        harvestSafeDate={gh.harvestSafeDate}
        now={new Date().toISOString()}
        today={todayLagos()}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="bg-card rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">Active cycles</p>
          <p className="text-lg font-semibold tabular-nums">
            {gh.activeCycles.length}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">Plants alive</p>
          <p className="text-lg font-semibold tabular-nums">
            {numberFmt.format(plantsAlive)}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">Cycles on record</p>
          <p className="text-lg font-semibold tabular-nums">{cycles.length}</p>
        </div>
      </div>

      {ctx.canSeeMoney ? (
        <SectionCard title="Money">
          <p className="text-muted-foreground text-sm">
            Input cost, revenue and margin for this greenhouse arrive with
            harvest and sales (Phase 5).
          </p>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Cycle history"
        action={
          linkCycles && cycles.length > 0 ? (
            <Link
              href={`/cycles?greenhouse=${gh.id}`}
              className="text-primary flex min-h-11 items-center text-sm font-medium"
            >
              Open in cycles
            </Link>
          ) : null
        }
      >
        {cycles.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No crop cycles in this greenhouse yet.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {cycles.map((c) => (
              <CycleRow key={c.id} c={c} linked={linkCycles} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
