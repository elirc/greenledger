import { PageHeader } from "@/components/shell/page-header";
import { requirePlatformAdmin } from "@/lib/guard";
import { HealthCard } from "@/modules/platform/components/health-card";
import { getSystemHealth } from "@/modules/platform/queries";

export const metadata = { title: "Health · Platform" };

export default async function PlatformHealthPage() {
  const admin = await requirePlatformAdmin();
  const health = await getSystemHealth(admin);
  return (
    <div className="space-y-4">
      <PageHeader title="System health" description="Database, webhooks and background jobs." />
      <HealthCard health={health} />
    </div>
  );
}
