import Link from "next/link";
import { notFound } from "next/navigation";
import { Bug, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { ScoutingList } from "@/modules/scouting/components/scouting-list";
import {
  getScoutingCycle,
  listScoutingLogs,
} from "@/modules/scouting/queries";

export const metadata = { title: "Scouting" };

export default async function CycleScoutingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const cycle = await getScoutingCycle(ctx, id);
  if (!cycle) notFound();
  const logs = await listScoutingLogs(ctx, cycle.id);
  const canLog = cycle.status !== "closed";
  const newHref = `/cycles/${cycle.id}/scouting/new`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Scouting"
        description={`${cycle.code} · ${cycle.greenhouseName} · ${cycle.varietyName}`}
        backHref={`/cycles/${cycle.id}`}
        action={
          canLog ? (
            <Button asChild className="h-11">
              <Link href={newHref}>
                <Plus className="size-4" /> Log scouting
              </Link>
            </Button>
          ) : undefined
        }
      />
      {logs.length === 0 ? (
        <EmptyState
          icon={Bug}
          title="No scouting logged yet"
          description={
            canLog
              ? "Record pests and diseases you find while walking the rows, with a photo."
              : "This cycle is closed."
          }
        >
          {canLog ? (
            <Button asChild className="h-11">
              <Link href={newHref}>Log the first scouting</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <ScoutingList logs={logs} />
      )}
    </div>
  );
}
