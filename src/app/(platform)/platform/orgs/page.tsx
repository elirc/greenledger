import Link from "next/link";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { formatLagosDate } from "@/lib/dates";
import { requirePlatformAdmin } from "@/lib/guard";
import { OrgStatusBadge } from "@/modules/platform/components/org-status-badge";
import { listOrganisations } from "@/modules/platform/queries";

export const metadata = { title: "Organisations · Platform" };

export default async function PlatformOrgsPage() {
  const admin = await requirePlatformAdmin();
  const orgs = await listOrganisations(admin);

  return (
    <div className="space-y-4">
      <PageHeader title="Organisations" description={`${orgs.length} farms`} />
      {orgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organisations yet"
          description="Farms appear here as soon as an owner creates one."
        />
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link
                href={`/platform/orgs/${o.id}`}
                className="hover:bg-muted/50 flex min-h-16 flex-col gap-1 px-4 py-3"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{o.name}</span>
                  <OrgStatusBadge status={o.orgStatus} />
                </span>
                <span className="text-muted-foreground text-sm">
                  {o.planName ?? "No plan"} · {o.greenhouses} greenhouse
                  {o.greenhouses === 1 ? "" : "s"} · {o.users} user{o.users === 1 ? "" : "s"} ·
                  created {formatLagosDate(o.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
