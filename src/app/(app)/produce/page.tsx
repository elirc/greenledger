import Link from "next/link";
import { CalendarClock, Leaf, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { BEST_BEFORE_WARN_DAYS } from "@/lib/alerts";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { HarvestList } from "@/modules/harvest/components/harvest-list";
import { listHarvests } from "@/modules/harvest/queries";
import {
  ProduceStockFilters,
  ProduceTabs,
} from "@/modules/produce/components/produce-filters";
import { ProduceLotList } from "@/modules/produce/components/produce-lot-list";
import { listProduceLots, listProduceStores } from "@/modules/produce/queries";
import { produceListParamsSchema } from "@/modules/produce/schema";

export const metadata = { title: "Produce" };

const kgFmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 });

export default async function ProducePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager", "storekeeper"] });
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]);
  const params = produceListParamsSchema.parse({
    tab: one("tab"),
    store: one("store"),
    grade: one("grade"),
  });
  const today = todayLagos();

  if (params.tab === "harvests") {
    const harvests = await listHarvests(ctx, { limit: 100 });
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Produce" description="Harvested produce in your stores." />
        <ProduceTabs tab="harvests" />
        {harvests.length === 0 ? (
          <EmptyState
            icon={Leaf}
            title="No harvests yet"
            description="Harvests logged on the Harvest screen show up here."
          />
        ) : (
          <HarvestList harvests={harvests} />
        )}
      </div>
    );
  }

  const stores = await listProduceStores(ctx);
  const storeId = stores.some((s) => s.id === params.store) ? params.store : undefined;
  const rows = await listProduceLots(ctx, { storeId, grade: params.grade });
  const near = rows.filter((r) => r.nearBestBefore);
  const totalKg = rows.reduce((a, r) => a + r.onHandKg, 0);
  const filtered = Boolean(storeId || params.grade);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Produce"
        description={
          rows.length > 0
            ? `${kgFmt.format(totalKg)} kg on hand${filtered ? " (filtered)" : ""} — oldest first.`
            : "Harvested produce in your stores."
        }
      />
      <ProduceTabs tab="stock" />
      <ProduceStockFilters storeId={storeId} grade={params.grade} stores={stores} />

      {near.length > 0 ? (
        <SectionCard
          title={`Near best-before (${near.length})`}
          action={<CalendarClock className="text-status-danger size-5" aria-hidden />}
        >
          <p className="text-muted-foreground mb-3 text-sm">
            Past best-before or within {BEST_BEFORE_WARN_DAYS} days — sell, move or
            write off first.
          </p>
          <ProduceLotList rows={near} stores={stores} today={today} grouped={false} />
        </SectionCard>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title={filtered ? "No matching produce" : "No produce in stock"}
          description={
            filtered
              ? "Try another store or grade."
              : "Harvests land here by grade. Log a harvest to add produce stock."
          }
        >
          <Button asChild className="h-11">
            <Link href={filtered ? "/produce" : "/harvest"}>
              {filtered ? "Clear filters" : "Log a harvest"}
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <ProduceLotList rows={rows} stores={stores} today={today} />
      )}
    </div>
  );
}
