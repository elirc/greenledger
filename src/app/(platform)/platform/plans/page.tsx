import Link from "next/link";
import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { MoneyText } from "@/components/common/money-text";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { requirePlatformAdmin } from "@/lib/guard";
import { listAllPlans } from "@/modules/platform/queries";

export const metadata = { title: "Plans · Platform" };

export default async function PlatformPlansPage() {
  const admin = await requirePlatformAdmin();
  const plans = await listAllPlans(admin);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plans"
        description="Prices are stored in kobo and charged monthly."
        action={
          <Button asChild className="h-11">
            <Link href="/platform/plans/new">
              <Plus className="size-4" /> New plan
            </Link>
          </Button>
        }
      />
      {plans.length === 0 ? (
        <EmptyState icon={CreditCard} title="No plans yet" description="Farms need at least one plan to subscribe.">
          <Button asChild className="h-11">
            <Link href="/platform/plans/new">Create the first plan</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {plans.map((p) => (
            <li key={p.id}>
              <Link
                href={`/platform/plans/${p.id}`}
                className="hover:bg-muted/50 flex min-h-16 flex-col gap-1 px-4 py-3"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {p.name} <span className="text-muted-foreground font-mono text-xs">{p.code}</span>
                  </span>
                  {p.isActive ? (
                    <StatusBadge variant="success">Active</StatusBadge>
                  ) : (
                    <StatusBadge>Inactive</StatusBadge>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  <MoneyText kobo={p.monthlyPriceKobo} /> / month ({p.monthlyPriceKobo.toLocaleString("en-NG")} kobo) · up to{" "}
                  {p.maxGreenhouses} greenhouses · {p.subscribers} farm{p.subscribers === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
