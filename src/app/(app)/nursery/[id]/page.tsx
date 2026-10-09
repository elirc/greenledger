import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { formatLagosDate } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { todayForForms } from "@/modules/cycles/transplant";
import { listGreenhouses } from "@/modules/farm/queries";
import { NurseryBatchActions } from "@/modules/nursery/components/nursery-batch-actions";
import { NurseryCountersCard } from "@/modules/nursery/components/nursery-counters-card";
import { NurseryStatusBadge } from "@/modules/nursery/components/nursery-status-badge";
import { availableSeedlings } from "@/modules/nursery/logic";
import { getNurseryBatch } from "@/modules/nursery/queries";

export const metadata = { title: "Nursery batch" };

const numberFmt = new Intl.NumberFormat("en-NG");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-baseline justify-between gap-3">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function NurseryBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const batch = await getNurseryBatch(ctx, id);
  if (!batch) notFound();

  const isOpen = batch.status === "open";
  const available = availableSeedlings(batch);
  const greenhouses = isOpen
    ? (await listGreenhouses(ctx, { activeOnly: true })).map((g) => ({
        id: g.id,
        name: g.name,
        zones: g.zones.map((z) => ({ id: z.id, name: z.name })),
      }))
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={batch.varietyName}
        description={`${batch.cropName} · sown ${formatLagosDate(batch.sowDate)}`}
        backHref="/nursery"
        action={<NurseryStatusBadge status={batch.status} />}
      />

      {isOpen ? (
        <NurseryBatchActions
          batch={{
            id: batch.id,
            sowDate: batch.sowDate,
            seedsSown: batch.seedsSown,
            germinated: batch.germinated,
            ready: batch.ready,
          }}
          available={available}
          today={todayForForms()}
          greenhouses={greenhouses}
        />
      ) : null}

      <NurseryCountersCard batch={batch} />

      <SectionCard title="Details">
        <dl className="divide-border divide-y">
          {isOpen ? (
            <Fact label="Age">
              {batch.ageDays <= 0 ? "Sown today" : `${batch.ageDays} days`}
            </Fact>
          ) : null}
          <Fact label="Trays">
            {numberFmt.format(batch.trays)} × {numberFmt.format(batch.cellsPerTray)}{" "}
            cells
          </Fact>
          <Fact label="Seed batch">
            {batch.seed
              ? `${batch.seed.itemName} · ${batch.seed.batchNumber}`
              : "Not linked"}
          </Fact>
          <Fact label="Started by">{batch.createdByName ?? "—"}</Fact>
          <Fact label="Logged">{formatLagosDate(batch.createdAt)}</Fact>
        </dl>
        {batch.notes ? (
          <p className="text-muted-foreground mt-3 text-sm whitespace-pre-line">
            {batch.notes}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Transplanted to">
        {batch.cycles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {isOpen
              ? "Nothing transplanted yet. Use Transplant when seedlings are ready."
              : "No crop cycles from this batch."}
          </p>
        ) : (
          <ul className="divide-border -mx-2 divide-y">
            {batch.cycles.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cycles/${c.id}`}
                  className="hover:bg-muted/50 flex min-h-14 items-center gap-3 rounded-md px-2 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block font-medium">{c.code}</span>
                    <span className="text-muted-foreground text-sm">
                      {c.greenhouseName} ·{" "}
                      {numberFmt.format(c.plantsTransplanted)} plants
                      {c.transplantDate
                        ? ` · ${formatLagosDate(c.transplantDate)}`
                        : ""}
                    </span>
                  </div>
                  <ChevronRight className="text-muted-foreground size-5 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
