import { CircleCheck, CreditCard } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireMember } from "@/lib/guard";
import { PlanPicker } from "@/modules/billing/components/plan-picker";
import { SubscriptionCard } from "@/modules/billing/components/subscription-card";
import { getBillingOverview } from "@/modules/billing/queries";

export const metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const ctx = await requireMember({ roles: ["owner"] });
  const [overview, sp] = await Promise.all([getBillingOverview(ctx), searchParams]);
  const sub = overview.subscription;
  const justPaid = sp.checkout === "done";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Billing"
        description="Plan, trial and payments."
        backHref="/settings"
      />

      {justPaid ? (
        <p className="border-status-success/30 bg-status-success/10 text-status-success flex items-start gap-2 rounded-lg border p-3 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          {sub?.status === "active"
            ? "Payment received — your subscription is active."
            : "Payment submitted. Your status updates as soon as Paystack confirms it."}
        </p>
      ) : null}

      <SubscriptionCard overview={overview} />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Plans</h2>
        {overview.plans.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No plans available"
            description="Plans are not set up yet. Contact GreenLedger support."
          />
        ) : (
          <PlanPicker
            plans={overview.plans}
            currentPlanCode={sub?.plan.code ?? null}
            isActive={sub?.status === "active"}
            greenhouseCount={overview.greenhouseCount}
          />
        )}
        <p className="text-muted-foreground text-xs">
          Payments are processed by Paystack. Prices in naira, billed monthly.
        </p>
      </section>
    </div>
  );
}
