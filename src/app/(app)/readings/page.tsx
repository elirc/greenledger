import Link from "next/link";
import { Plus, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { GreenhousePicker } from "@/modules/readings/components/greenhouse-picker";
import { ReadingsCharts } from "@/modules/readings/components/readings-charts";
import {
  getReadingGreenhouses,
  listGreenhouseReadings,
} from "@/modules/readings/queries";
import { READINGS_WINDOW_DAYS } from "@/modules/readings/schema";

export const metadata = { title: "Readings" };

export default async function ReadingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const raw = await searchParams;
  const ghParam = Array.isArray(raw.gh) ? raw.gh[0] : raw.gh;
  const greenhouses = await getReadingGreenhouses(ctx);
  const selected =
    greenhouses.find((g) => g.id === ghParam) ?? greenhouses[0] ?? null;

  const endMs = new Date().getTime();
  const startMs = endMs - READINGS_WINDOW_DAYS * 86_400_000;
  const points = selected
    ? await listGreenhouseReadings(ctx, selected.id, READINGS_WINDOW_DAYS)
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Readings"
        description="Temperature, humidity, EC and pH — last 14 days."
        action={
          selected ? (
            <Button asChild className="h-11">
              <Link href={`/readings/new?gh=${selected.id}`}>
                <Plus className="size-4" /> Add
              </Link>
            </Button>
          ) : undefined
        }
      />
      {!selected ? (
        <EmptyState
          icon={Thermometer}
          title={ctx.role === "worker" ? "No greenhouses assigned" : "No greenhouses yet"}
          description={
            ctx.role === "worker"
              ? "Ask your farm manager to assign you to a greenhouse."
              : "Add a greenhouse before recording readings."
          }
        >
          {ctx.role !== "worker" ? (
            <Button asChild className="h-11">
              <Link href="/settings/farm">Set up greenhouses</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <>
          {greenhouses.length > 1 ? (
            <GreenhousePicker greenhouses={greenhouses} selectedId={selected.id} />
          ) : null}
          {points.length === 0 ? (
            <EmptyState
              icon={Thermometer}
              title={`No readings for ${selected.name} in the last 14 days`}
              description="Record temperature, humidity, EC or pH to see the trend."
            >
              <Button asChild className="h-11">
                <Link href={`/readings/new?gh=${selected.id}`}>Add a reading</Link>
              </Button>
            </EmptyState>
          ) : (
            <ReadingsCharts points={points} startMs={startMs} endMs={endMs} />
          )}
        </>
      )}
    </div>
  );
}
