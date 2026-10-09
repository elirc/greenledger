import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLagos, formatLagosDate, todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { PhiOverrideBadge } from "@/modules/harvest/components/harvest-list";
import { getHarvest } from "@/modules/harvest/queries";
import { GRADE_LABELS } from "@/modules/harvest/schema";
import { BestBeforeChip } from "@/modules/produce/components/best-before-chip";

export const metadata = { title: "Harvest" };

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });
const cratesFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 });

export default async function HarvestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({
    roles: ["owner", "manager", "storekeeper", "worker"],
  });
  const harvest = await getHarvest(ctx, id);
  if (!harvest) notFound();
  const today = todayLagos();
  const backHref = ctx.role === "storekeeper" ? "/produce?tab=harvests" : "/harvest";

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title={`Harvest · ${formatLagos(harvest.harvestedAt, "dd MMM yyyy HH:mm")}`}
        description={`${harvest.greenhouseName} · ${harvest.cycleCode} · ${harvest.cropName} ${harvest.varietyName}`}
        backHref={backHref}
      />

      {harvest.phiOverride ? (
        <SectionCard title="Pre-harvest interval override" action={<PhiOverrideBadge />}>
          <p className="text-sm">{harvest.phiOverrideReason}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Approved by {harvest.phiOverrideByName ?? "unknown user"}
          </p>
        </SectionCard>
      ) : null}

      <SectionCard title={`Grades · ${kgFmt.format(harvest.totalKg)} kg`}>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Crates</TableHead>
                <TableHead className="text-right">Kg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {harvest.lines.map((l) => (
                <TableRow key={l.grade}>
                  <TableCell>{GRADE_LABELS[l.grade]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {cratesFmt.format(l.crates)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {kgFmt.format(l.kg)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Harvested by</dt>
          <dd>{harvest.harvestedByName ?? "—"}</dd>
          <dt className="text-muted-foreground">Crop cycle</dt>
          <dd>
            <Link
              href={`/cycles/${harvest.cropCycleId}`}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              {harvest.cycleCode}
            </Link>
          </dd>
        </dl>
        {harvest.notes ? (
          <p className="bg-muted/50 mt-3 rounded-lg p-3 text-sm">{harvest.notes}</p>
        ) : null}
      </SectionCard>

      <SectionCard title="Produce lots">
        {harvest.lots.length === 0 ? (
          <p className="text-muted-foreground text-sm">No lots recorded.</p>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {harvest.lots.map((lot) => (
              <li key={lot.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{GRADE_LABELS[lot.grade]}</span>
                  <BestBeforeChip bestBeforeDate={lot.bestBeforeDate} today={today} />
                </div>
                <p className="text-muted-foreground text-sm">
                  {lot.stock.length === 0
                    ? "No stock left (sold, moved or wasted)."
                    : lot.stock
                        .map((s) => `${kgFmt.format(s.kg)} kg in ${s.storeName}`)
                        .join(" · ")}
                </p>
                <p className="text-muted-foreground text-xs">
                  Best before {formatLagosDate(lot.bestBeforeDate)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
