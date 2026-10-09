import Link from "next/link";
import { Plus, SprayCan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { ApplicationFilters } from "@/modules/applications/components/application-filters";
import { ApplicationList } from "@/modules/applications/components/application-list";
import {
  listApplicationGreenhouseOptions,
  listApplications,
} from "@/modules/applications/queries";
import { applicationListParamsSchema } from "@/modules/applications/schema";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]);
  const params = applicationListParamsSchema.parse({
    gh: one("gh"),
    type: one("type"),
  });

  const greenhouses = await listApplicationGreenhouseOptions(ctx);
  const gh = greenhouses.some((g) => g.id === params.gh) ? params.gh : undefined;
  const applications = await listApplications(ctx, {
    greenhouseId: gh,
    type: params.type,
  });
  const filtered = Boolean(gh || params.type);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Applications"
        description="Fertigation and spray log."
        action={
          <Button asChild className="h-11">
            <Link href="/applications/new">
              <Plus className="size-4" /> Log
            </Link>
          </Button>
        }
      />
      <ApplicationFilters
        greenhouseId={gh}
        type={params.type}
        greenhouses={greenhouses}
      />
      {applications.length === 0 ? (
        <EmptyState
          icon={SprayCan}
          title={filtered ? "No matching applications" : "No applications yet"}
          description={
            filtered
              ? "Try another greenhouse or type."
              : "Log each fertigation and spray — stock is drawn from the store and spray safety windows are set automatically."
          }
        >
          <Button asChild className="h-11">
            <Link href={filtered ? "/applications" : "/applications/new"}>
              {filtered ? "Clear filters" : "Log an application"}
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <ApplicationList
          applications={applications}
          canSeeMoney={ctx.canSeeMoney}
          now={new Date().toISOString()}
          today={todayLagos()}
        />
      )}
    </div>
  );
}
