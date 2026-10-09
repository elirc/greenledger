import { CalendarClock, TriangleAlert } from "lucide-react";
import { MoneyText } from "@/components/common/money-text";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge, type StatusVariant } from "@/components/common/status-badge";
import { TRIAL_WARN_DAYS } from "@/lib/alerts";
import { formatLagosDate } from "@/lib/dates";
import type { BillingOverview } from "../queries";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from "../schema";

const STATUS_VARIANT: Record<SubscriptionStatus, StatusVariant> = {
  trialing: "info",
  active: "success",
  past_due: "danger",
  cancelled: "danger",
};

/** Current plan + subscription status, trial countdown and greenhouse-limit note. */
export function SubscriptionCard({ overview }: { overview: BillingOverview }) {
  const sub = overview.subscription;
  if (!sub) {
    return (
      <SectionCard title="Current plan">
        <p className="text-muted-foreground text-sm">
          No subscription yet. Pick a plan below to subscribe.
        </p>
      </SectionCard>
    );
  }

  const trialEnded = sub.status === "trialing" && sub.trialDaysLeft === 0;
  const trialSoon =
    sub.status === "trialing" &&
    sub.trialDaysLeft !== null &&
    sub.trialDaysLeft > 0 &&
    sub.trialDaysLeft <= TRIAL_WARN_DAYS;

  return (
    <SectionCard
      title="Current plan"
      action={
        <StatusBadge variant={trialEnded ? "danger" : STATUS_VARIANT[sub.status]}>
          {trialEnded ? "Trial ended" : SUBSCRIPTION_STATUS_LABELS[sub.status]}
        </StatusBadge>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-lg font-semibold">{sub.plan.name}</span>
          <span>
            <MoneyText kobo={sub.plan.monthlyPriceKobo} className="font-medium" />
            <span className="text-muted-foreground text-sm"> / month</span>
          </span>
        </div>

        <p className="text-muted-foreground text-sm">
          {overview.greenhouseCount} of {sub.plan.maxGreenhouses} greenhouses used
        </p>

        {sub.status === "trialing" ? (
          <p
            className={
              trialEnded || trialSoon
                ? "text-status-warning flex items-center gap-2 text-sm font-medium"
                : "flex items-center gap-2 text-sm"
            }
          >
            <CalendarClock className="size-4 shrink-0" />
            {trialEnded
              ? `Trial ended ${formatLagosDate(sub.trialEndsAt)} — the farm is read-only until you subscribe.`
              : `${sub.trialDaysLeft} day${sub.trialDaysLeft === 1 ? "" : "s"} left in your free trial (ends ${formatLagosDate(sub.trialEndsAt)}).`}
          </p>
        ) : null}

        {sub.status === "active" && sub.currentPeriodEnd ? (
          <p className="flex items-center gap-2 text-sm">
            <CalendarClock className="size-4 shrink-0" />
            Paid until {formatLagosDate(sub.currentPeriodEnd)}
          </p>
        ) : null}

        {sub.status === "past_due" ? (
          <p className="text-status-danger text-sm font-medium">
            Your last payment failed. Renew below to unlock the farm.
          </p>
        ) : null}
        {sub.status === "cancelled" ? (
          <p className="text-status-danger text-sm font-medium">
            The subscription was cancelled. Subscribe below to unlock the farm.
          </p>
        ) : null}

        {overview.overGreenhouseLimit ? (
          <p className="border-status-warning/30 bg-status-warning/10 text-status-warning flex items-start gap-2 rounded-lg border p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Your farm has {overview.greenhouseCount} greenhouses, more than the{" "}
            {sub.plan.name} plan allows ({sub.plan.maxGreenhouses}). Consider
            upgrading — nothing is blocked for now.
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
