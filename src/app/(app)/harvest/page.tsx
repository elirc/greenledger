import Link from "next/link";
import { Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { dateToLagosLocal } from "@/modules/applications/schema";
import { HarvestForm } from "@/modules/harvest/components/harvest-form";
import {
  getHarvestFormRefs,
  listHarvests,
  type HarvestSummary,
} from "@/modules/harvest/queries";

export const metadata = { title: "Harvest" };

export default async function HarvestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const raw = await searchParams;
  const ghParam = Array.isArray(raw.gh) ? raw.gh[0] : raw.gh;
  const refs = await getHarvestFormRefs(ctx);
  const canOverride = ctx.role === "owner" || ctx.role === "manager";
  const canManage = canOverride;

  // Only greenhouses the form offers (worker: assigned) are accepted.
  const greenhouseId = refs.greenhouses.some((g) => g.id === ghParam)
    ? (ghParam as string)
    : refs.greenhouses.length === 1
      ? refs.greenhouses[0].id
      : "";
  // Latest harvests per offered greenhouse, so the list below the form
  // follows the greenhouse picker without a navigation.
  const recentLists = await Promise.all(
    refs.greenhouses.map((g) => listHarvests(ctx, { greenhouseId: g.id, limit: 8 })),
  );
  const recent: Record<string, HarvestSummary[]> = Object.fromEntries(
    refs.greenhouses.map((g, i) => [g.id, recentLists[i]]),
  );

  const missing =
    refs.greenhouses.length === 0
      ? {
          title: ctx.role === "worker" ? "No greenhouses assigned" : "No greenhouses yet",
          description:
            ctx.role === "worker"
              ? "Ask your farm manager to assign you to a greenhouse."
              : "Add a greenhouse before logging harvests.",
          href: canManage ? "/settings/farm" : null,
          cta: "Set up greenhouses",
        }
      : refs.cycles.length === 0
        ? {
            title: "No crop cycle is being harvested",
            description:
              "Harvests are logged against a growing or harvesting crop cycle.",
            href: canManage ? "/cycles" : null,
            cta: "Open crop cycles",
          }
        : refs.stores.length === 0
          ? {
              title: "No packhouse or cold room",
              description:
                "Harvested produce goes into a packhouse or cold room. Set one up first.",
              href: canManage ? "/settings/farm" : null,
              cta: "Set up stores",
            }
          : null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Harvest"
        description="Log picked produce by grade — it goes straight into produce stock."
        action={
          canManage ? (
            <Button asChild variant="outline" className="h-11">
              <Link href="/harvest/forecast">Forecast</Link>
            </Button>
          ) : undefined
        }
      />
      {missing ? (
        <EmptyState icon={Leaf} title={missing.title} description={missing.description}>
          {missing.href ? (
            <Button asChild className="h-11">
              <Link href={missing.href}>{missing.cta}</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <HarvestForm
          refs={refs}
          nowLocal={dateToLagosLocal(new Date())}
          initialGreenhouseId={greenhouseId}
          canOverride={canOverride}
          recent={recent}
        />
      )}
    </div>
  );
}
