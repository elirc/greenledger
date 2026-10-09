import Link from "next/link";
import { Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { dateToLagosLocal } from "@/modules/applications/schema";
import { ReadingForm } from "@/modules/readings/components/reading-form";
import { getReadingGreenhouses } from "@/modules/readings/queries";

export const metadata = { title: "Add reading" };

export default async function NewReadingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMember({ roles: ["owner", "manager", "worker"] });
  const raw = await searchParams;
  const ghParam = Array.isArray(raw.gh) ? raw.gh[0] : raw.gh;
  const greenhouses = await getReadingGreenhouses(ctx);
  const initialGreenhouseId = greenhouses.some((g) => g.id === ghParam)
    ? (ghParam as string)
    : greenhouses.length === 1
      ? greenhouses[0].id
      : "";

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Add reading" backHref="/readings" />
      {greenhouses.length === 0 ? (
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
        <ReadingForm
          greenhouses={greenhouses}
          initialGreenhouseId={initialGreenhouseId}
          nowLocal={dateToLagosLocal(new Date())}
        />
      )}
    </div>
  );
}
