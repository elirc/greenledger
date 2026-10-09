"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/common/money-text";
import { StatusBadge } from "@/components/common/status-badge";
import { startCheckout } from "../actions";

export interface PlanOption {
  id: string;
  code: string;
  name: string;
  maxGreenhouses: number;
  monthlyPriceKobo: number;
}

/**
 * Plan cards with a Subscribe / Change plan button each. The action returns
 * the checkout URL (mock: /billing/checkout-mock, real: Paystack hosted page).
 */
export function PlanPicker({
  plans,
  currentPlanCode,
  isActive,
  greenhouseCount,
}: {
  plans: PlanOption[];
  currentPlanCode: string | null;
  /** status === 'active' — the current plan is already paid for. */
  isActive: boolean;
  greenhouseCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function choose(planCode: string) {
    setPending(planCode);
    try {
      const result = await startCheckout({ planCode });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const url = result.data.url;
      if (url.startsWith("/")) router.push(url);
      else window.location.assign(url);
    } finally {
      setPending(null);
    }
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {plans.map((p) => {
        const current = p.code === currentPlanCode;
        const tooSmall = greenhouseCount > p.maxGreenhouses;
        const label = current
          ? isActive
            ? "Renew"
            : "Subscribe"
          : currentPlanCode && isActive
            ? "Change plan"
            : "Subscribe";
        return (
          <li
            key={p.id}
            className={cn(
              "flex flex-col gap-3 rounded-xl border bg-card p-4",
              current ? "border-primary/50 ring-1 ring-primary/30" : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-base font-semibold">{p.name}</span>
              {current ? <StatusBadge variant="info">Current</StatusBadge> : null}
            </div>
            <div>
              <MoneyText kobo={p.monthlyPriceKobo} className="text-xl font-semibold" />
              <span className="text-muted-foreground text-sm"> / month</span>
            </div>
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Check className="size-4" /> Up to {p.maxGreenhouses} greenhouses
            </p>
            {tooSmall ? (
              <p className="text-status-warning text-xs">
                Your farm has {greenhouseCount} greenhouses — above this plan&apos;s limit.
              </p>
            ) : null}
            <Button
              className="mt-auto h-11 w-full"
              variant={current ? "default" : "outline"}
              disabled={pending !== null}
              onClick={() => void choose(p.code)}
            >
              {pending === p.code ? "Opening checkout…" : label}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
