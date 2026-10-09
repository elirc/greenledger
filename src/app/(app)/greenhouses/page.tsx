import Link from "next/link";
import { Tent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { todayLagos } from "@/lib/dates";
import { requireMember } from "@/lib/guard";
import { GreenhouseCard } from "@/modules/cycles/components/greenhouse-card";
import { listGreenhouseCards } from "@/modules/cycles/queries";

export const metadata = { title: "Greenhouses" };

export default async function GreenhousesPage() {
  const ctx = await requireMember();
  const cards = await listGreenhouseCards(ctx);
  const now = new Date().toISOString();
  const today = todayLagos();
  const canSetUp = ctx.role === "owner" || ctx.role === "manager";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Greenhouses"
        description="What is growing in each house and whether it is safe to enter or harvest."
      />
      {cards.length === 0 ? (
        <EmptyState
          icon={Tent}
          title={
            ctx.role === "worker"
              ? "No greenhouses assigned to you"
              : "No greenhouses yet"
          }
          description={
            ctx.role === "worker"
              ? "Ask your farm manager to assign you to a greenhouse."
              : "Add your greenhouses in farm settings."
          }
        >
          {canSetUp ? (
            <Button asChild className="h-11">
              <Link href="/settings/farm">Add greenhouses</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((gh) => (
            <GreenhouseCard key={gh.id} greenhouse={gh} now={now} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}
