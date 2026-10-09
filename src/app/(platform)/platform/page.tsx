import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { requirePlatformAdmin } from "@/lib/guard";
import { HealthCard } from "@/modules/platform/components/health-card";
import { getSystemHealth, getUsageCounts } from "@/modules/platform/queries";

export const metadata = { title: "Platform admin" };

export default async function PlatformOverviewPage() {
  const admin = await requirePlatformAdmin();
  const [usage, health] = await Promise.all([getUsageCounts(admin), getSystemHealth(admin)]);

  const tiles: Array<{ label: string; value: number; href?: string }> = [
    { label: "Organisations", value: usage.organisations, href: "/platform/orgs" },
    { label: "On trial", value: usage.byStatus.trial },
    { label: "Active (paid)", value: usage.byStatus.active },
    { label: "Read-only", value: usage.byStatus.read_only },
    { label: "Users", value: usage.users },
    { label: "Greenhouses", value: usage.greenhouses },
    { label: "Stock movements", value: usage.inventoryMovements },
    { label: "Harvests", value: usage.harvests },
    { label: "Sales", value: usage.sales },
    { label: "Webhooks (7 days)", value: usage.webhookEvents7d },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Overview" description="Usage across every farm on GreenLedger." />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const body = (
            <>
              <span className="text-muted-foreground text-xs">{t.label}</span>
              <span className="text-2xl font-semibold tabular-nums">
                {t.value.toLocaleString("en-NG")}
              </span>
            </>
          );
          return (
            <li key={t.label}>
              {t.href ? (
                <Link
                  href={t.href}
                  className="bg-card hover:bg-muted/50 flex min-h-20 flex-col justify-center gap-1 rounded-xl border p-4"
                >
                  {body}
                </Link>
              ) : (
                <div className="bg-card flex min-h-20 flex-col justify-center gap-1 rounded-xl border p-4">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <HealthCard health={health} />
    </div>
  );
}
