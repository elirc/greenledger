import { asc, count, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { greenhouses, plans, subscriptions } from "@/db/schema";
import { AuthError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { isOverGreenhouseLimit, trialDaysLeft } from "./logic";

/**
 * Billing reads. Owner-only (ARCHITECTURE §3 capability matrix): any other
 * role is rejected with FORBIDDEN before a row is read. The subscription is
 * scoped by ctx.orgId; plans are global (no org column).
 */
function assertOwner(ctx: Ctx): void {
  if (ctx.role !== "owner") throw new AuthError("FORBIDDEN");
}

/** Active plans, cheapest first. */
export async function listPlans(ctx: Ctx) {
  assertOwner(ctx);
  return db
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      maxGreenhouses: plans.maxGreenhouses,
      monthlyPriceKobo: plans.monthlyPriceKobo,
    })
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.monthlyPriceKobo));
}

/** One plan by code or Paystack plan code (mock checkout page header). */
export async function getPlanByCode(ctx: Ctx, code: string) {
  assertOwner(ctx);
  const [row] = await db
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      maxGreenhouses: plans.maxGreenhouses,
      monthlyPriceKobo: plans.monthlyPriceKobo,
    })
    .from(plans)
    .where(or(eq(plans.code, code), eq(plans.paystackPlanCode, code)))
    .limit(1);
  return row ?? null;
}

/** Everything the /settings/billing page shows. */
export async function getBillingOverview(ctx: Ctx) {
  assertOwner(ctx);
  const [sub] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      hasPaystackSubscription: subscriptions.paystackSubscriptionCode,
      planId: plans.id,
      planCode: plans.code,
      planName: plans.name,
      maxGreenhouses: plans.maxGreenhouses,
      monthlyPriceKobo: plans.monthlyPriceKobo,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.organisationId, ctx.orgId))
    .limit(1);

  const [{ n: greenhouseCount }] = await db
    .select({ n: count() })
    .from(greenhouses)
    .where(eq(greenhouses.organisationId, ctx.orgId));

  const availablePlans = await listPlans(ctx);

  return {
    orgStatus: ctx.org.status,
    subscription: sub
      ? {
          id: sub.id,
          status: sub.status,
          trialEndsAt: sub.trialEndsAt,
          trialDaysLeft:
            sub.status === "trialing" ? trialDaysLeft(sub.trialEndsAt) : null,
          currentPeriodEnd: sub.currentPeriodEnd,
          hasPaystackSubscription: Boolean(sub.hasPaystackSubscription),
          plan: {
            id: sub.planId,
            code: sub.planCode,
            name: sub.planName,
            maxGreenhouses: sub.maxGreenhouses,
            monthlyPriceKobo: sub.monthlyPriceKobo,
          },
        }
      : null,
    greenhouseCount,
    overGreenhouseLimit: sub
      ? isOverGreenhouseLimit(greenhouseCount, sub.maxGreenhouses)
      : false,
    plans: availablePlans,
  };
}

export type BillingOverview = Awaited<ReturnType<typeof getBillingOverview>>;
