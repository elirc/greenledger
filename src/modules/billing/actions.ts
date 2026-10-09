"use server";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, subscriptions, user } from "@/db/schema";
import {
  MOCK_PAYSTACK_SECRET,
  hmacSha512Sign,
  payments,
} from "@/adapters/payments";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { AuthError, DomainError } from "@/lib/errors";
import { BILLING_PERIOD_DAYS, safeCallbackPath } from "./logic";
import { mockCheckoutSchema, startCheckoutSchema } from "./schema";

/**
 * Billing actions are allowReadOnly: a locked-out farm must still be able to
 * pay its way out of read-only (ARCHITECTURE §3).
 */

export const startCheckout = defineAction({
  name: "billing.startCheckout",
  schema: startCheckoutSchema,
  roles: ["owner"],
  allowReadOnly: true,
  handler: async (input, ctx) => {
    const [plan] = await db
      .select({
        id: plans.id,
        code: plans.code,
        name: plans.name,
        monthlyPriceKobo: plans.monthlyPriceKobo,
        paystackPlanCode: plans.paystackPlanCode,
      })
      .from(plans)
      .where(and(eq(plans.code, input.planCode), eq(plans.isActive, true)))
      .limit(1);
    if (!plan) throw new DomainError("NOT_FOUND", "That plan is not available.");

    const [owner] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, ctx.userId))
      .limit(1);
    if (!owner) throw new AuthError("UNAUTHENTICATED");

    const [sub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.organisationId, ctx.orgId))
      .limit(1);

    const checkout = await payments.createCheckout({
      orgId: ctx.orgId,
      planCode: plan.paystackPlanCode ?? plan.code,
      email: owner.email,
      amountKobo: plan.monthlyPriceKobo,
      callbackUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=done`,
    });

    await writeAudit(db, ctx, {
      action: "billing.startCheckout",
      entityType: "subscription",
      entityId: sub?.id,
      after: {
        planCode: plan.code,
        amountKobo: plan.monthlyPriceKobo,
        reference: checkout.reference,
      },
    });
    return { url: checkout.url, reference: checkout.reference };
  },
});

/** Deterministic Paystack-style integer ids from the checkout reference, so a
 * double-tap on "Pay now" redelivers the SAME events (webhook dedups them). */
function idsFromRef(ref: string): { chargeId: number; subEventId: number } {
  const base = parseInt(ref.replace(/-/g, "").slice(0, 12), 16);
  return { chargeId: base, subEventId: base + 1 };
}

async function webhookUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/paystack`;
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/api/webhooks/paystack`;
}

/**
 * Mock Paystack hosted page "Pay now": sign charge.success +
 * subscription.create with the mock secret and POST them to our own webhook
 * route — the same path a real Paystack delivery takes.
 */
export const payMockCheckout = defineAction({
  name: "billing.payMockCheckout",
  schema: mockCheckoutSchema,
  roles: ["owner"],
  allowReadOnly: true,
  handler: async (input, ctx) => {
    if (env.ADAPTER_PAYMENTS !== "mock") {
      throw new DomainError("NOT_AVAILABLE", "Mock checkout is disabled.");
    }
    if (input.org !== ctx.orgId) throw new AuthError("FORBIDDEN");

    // Same key the mock adapter verifies with (mock.ts: secret || MOCK secret).
    const secret = env.PAYSTACK_SECRET_KEY || MOCK_PAYSTACK_SECRET;
    const now = new Date();
    const next = new Date(now.getTime() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const { chargeId, subEventId } = idsFromRef(input.ref);
    const customer = {
      email: input.email,
      customer_code: `CUS_mock_${ctx.orgId.replace(/-/g, "").slice(0, 12)}`,
    };
    const metadata = { orgId: ctx.orgId, planCode: input.plan };

    const events = [
      {
        event: "charge.success",
        data: {
          id: chargeId,
          reference: input.ref,
          status: "success",
          amount: input.amount,
          currency: "NGN",
          paid_at: now.toISOString(),
          customer,
          plan: { plan_code: input.plan },
          metadata,
        },
      },
      {
        event: "subscription.create",
        data: {
          id: subEventId,
          subscription_code: `SUB_mock_${input.ref.replace(/-/g, "").slice(0, 12)}`,
          status: "active",
          amount: input.amount,
          createdAt: now.toISOString(),
          next_payment_date: next.toISOString(),
          customer,
          plan: { plan_code: input.plan },
          metadata,
        },
      },
    ];

    const url = await webhookUrl();
    for (const evt of events) {
      const body = JSON.stringify(evt);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-paystack-signature": hmacSha512Sign(body, secret),
        },
        body,
        cache: "no-store",
      });
      if (!res.ok) {
        throw new DomainError(
          "PAYMENT_FAILED",
          `The payment could not be confirmed (webhook ${res.status}).`,
        );
      }
    }

    return {
      redirectTo: safeCallbackPath(input.callback, env.NEXT_PUBLIC_APP_URL),
    };
  },
});
