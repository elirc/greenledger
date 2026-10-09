import Link from "next/link";
import { ShieldAlert, SprayCan } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { QtyText } from "@/components/common/qty-text";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { formatLagos, formatLagosDate } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { UNIT_LABELS } from "@/lib/units";
import {
  ReportShell,
  SummaryTile,
} from "@/modules/reports/components/report-shell";
import {
  getSprayRecord,
  parseReportSearchParams,
  SPRAY_FOLLOW_UP_DAYS,
} from "@/modules/reports/queries";

export const metadata = { title: "Spray record" };

const qtyFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });
const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });

export default async function SprayRecordReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager"] });
  const { range } = parseReportSearchParams(await searchParams);
  const data = await getSprayRecord(ctx, range);

  return (
    <ReportShell report="spray-record" range={range}>
      {data.rows.length === 0 ? (
        <EmptyState
          icon={SprayCan}
          title="No sprays in this period"
          description="Spray applications logged on the Applications screen show up here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label="Sprays">{data.rows.length}</SummaryTile>
            <SummaryTile
              label="Harvests inside a PHI window"
              hint={`Listed up to ${SPRAY_FOLLOW_UP_DAYS} days after harvest-safe`}
            >
              <span className={data.totalViolations > 0 ? "text-status-danger" : undefined}>
                {data.totalViolations}
              </span>
            </SummaryTile>
          </div>

          {data.rows.map((a) => (
            <SectionCard
              key={a.applicationId}
              title={`${formatLagos(a.appliedAt, "dd MMM yyyy HH:mm")} · ${a.greenhouseName}`}
              action={
                a.phiViolations > 0 ? (
                  <StatusBadge variant="danger">
                    <ShieldAlert className="size-3.5" aria-hidden />
                    {a.phiViolations} within PHI
                  </StatusBadge>
                ) : null
              }
            >
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  <Link href={`/cycles/${a.cycleId}`} className="text-foreground font-medium hover:underline">
                    {a.cycleCode}
                  </Link>{" "}
                  · {a.cropName} {a.varietyName} · {a.operatorName} ·{" "}
                  {qtyFmt.format(a.waterVolumeLitres)} L water
                  {a.recipeName ? ` · ${a.recipeName}` : ""}
                </p>

                {a.products.length === 0 ? (
                  <p className="text-muted-foreground">No products recorded.</p>
                ) : (
                  <ul className="divide-border divide-y rounded-lg border">
                    {a.products.map((p) => (
                      <li key={p.itemId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
                        <span className="min-w-0">
                          <span className="font-medium">{p.name}</span>
                          {p.activeIngredient ? (
                            <span className="text-muted-foreground"> · {p.activeIngredient}</span>
                          ) : null}
                          <span className="text-muted-foreground block text-xs">
                            Batch {p.batchNumbers.join(", ")} · PHI{" "}
                            {p.phiDays ?? "—"} d · REI {p.reiHours ?? "—"} h
                          </span>
                        </span>
                        <span className="text-right">
                          <QtyText qty={p.quantity} unit={p.baseUnit} className="font-medium" />
                          <span className="text-muted-foreground block text-xs tabular-nums">
                            {qtyFmt.format(p.ratePer1000L)} {UNIT_LABELS[p.baseUnit]} / 1000 L
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <dl className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-muted-foreground text-xs">Entry-safe from</dt>
                    <dd className="font-medium">
                      {a.entrySafeAt ? formatLagos(a.entrySafeAt, "dd MMM HH:mm") : "No REI"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Harvest-safe from</dt>
                    <dd className="font-medium">
                      {a.harvestSafeDate ? formatLagosDate(a.harvestSafeDate) : "No PHI"}
                    </dd>
                  </div>
                </dl>

                <div>
                  <p className="text-muted-foreground mb-1 text-xs">Harvests that followed</p>
                  {a.following.length === 0 ? (
                    <p className="text-muted-foreground">None recorded.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {a.following.map((h) => (
                        <li key={h.harvestId}>
                          <Link href={`/harvest/${h.harvestId}`} className="inline-flex min-h-11 items-center">
                            <StatusBadge
                              variant={h.withinPhi ? "danger" : "neutral"}
                              className="px-3 py-1 text-sm"
                            >
                              {formatLagos(h.harvestedAt, "dd MMM")} · {kgFmt.format(h.kg)} kg
                              {h.withinPhi
                                ? h.phiOverride
                                  ? " · within PHI (override)"
                                  : " · within PHI"
                                : ""}
                            </StatusBadge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </SectionCard>
          ))}
        </>
      )}
    </ReportShell>
  );
}
