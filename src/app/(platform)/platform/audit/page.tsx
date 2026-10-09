import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requirePlatformAdmin } from "@/lib/guard";
import { AuditList } from "@/modules/platform/components/audit-list";
import { listAuditLog, listOrganisationOptions } from "@/modules/platform/queries";
import { auditFilterSchema } from "@/modules/platform/schema";

export const metadata = { title: "Audit log · Platform" };

/** Cross-org audit log, latest 200, filterable by org / action prefix / entity type. */
export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePlatformAdmin();
  const sp = await searchParams;
  const pick = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const filter = auditFilterSchema.parse({
    org: pick("org"),
    action: pick("action"),
    entity: pick("entity"),
  });
  const [rows, orgs] = await Promise.all([
    listAuditLog(admin, filter),
    listOrganisationOptions(admin),
  ]);
  const filtered = Boolean(filter.org || filter.action || filter.entity);

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="Latest 200 entries across all farms." />

      <form method="get" className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="sr-only" htmlFor="org">Organisation</label>
        <select
          id="org"
          name="org"
          defaultValue={filter.org ?? ""}
          className="border-input bg-background h-11 rounded-md border px-3 text-sm"
        >
          <option value="">All organisations</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <Input
          name="action"
          aria-label="Action starts with"
          placeholder="Action, e.g. harvest."
          defaultValue={filter.action ?? ""}
          className="h-11"
        />
        <Input
          name="entity"
          aria-label="Entity type"
          placeholder="Entity, e.g. subscription"
          defaultValue={filter.entity ?? ""}
          className="h-11"
        />
        <div className="flex gap-2">
          <Button type="submit" className="h-11 flex-1">
            Filter
          </Button>
          {filtered ? (
            <Button asChild variant="outline" className="h-11">
              <Link href="/platform/audit">Clear</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filtered ? "No matching entries" : "No audit entries yet"}
          description={filtered ? "Try a broader filter." : "Every create, update and override is recorded here."}
        />
      ) : (
        <AuditList rows={rows} />
      )}
    </div>
  );
}
