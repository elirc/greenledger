/**
 * Paystack webhook processing (ARCHITECTURE §2, DATA-MODEL §4.12).
 *
 * Order is load-bearing:
 *   1. HMAC-SHA512 of the RAW body verified (timing-safe) BEFORE any parse;
 *   2. parse;
 *   3. insert webhook_events (provider, external_id) ON CONFLICT DO NOTHING —
 *      no row back = a redelivery → acknowledged without side effects;
 *   4. apply the event to the org's subscription in the SAME transaction, so
 *      a crash mid-way rolls the event row back and Paystack's retry is
 *      processed afresh.
 *
 * Plain module (not 'use server'): the route handler and integration tests
 * call handlePaystackWebhook directly. No session: the org is resolved from
 * metadata.orgId (set by our checkout), else the stored Paystack
 * subscription / customer code.
 */

import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { plans, subscriptions, webhookEvents } from "@/db/schema";
import { payments, parsePaystackEvent, type PaystackEvent } from "@/adapters/payments";
import { writeAudit } from "@/lib/audit";
import { notifyRole } from "@/lib/notify";
import {
  eventCustomerCode,
  eventDate,
  eventPlanCode,
  eventSubscriptionCode,
  metadataOrgId,
  periodEndFrom,
  webhookExternalId,
} from "./logic";

/** notify.dispatch job payload: fan one logical notification out to email/SMS. */
export interface DispatchRequest {
  orgId: string;
  dedupKey: string;
}

export type WebhookResult =
  | "processed"
  | "duplicate"
  | "ignored"
  | "unresolved"
  | "invalid_signature"
  | "bad_payload"
  | "error";

export interface WebhookOutcome {
  status: 200 | 400 | 401 | 500;
  result: WebhookResult;
  event?: string;
  externalId?: string;
  /** Urgent notifications created — the route enqueues notify.dispatch for each. */
  dispatch: DispatchRequest[];
}

/** Envelope validation (rule: zod on all input) — `data` stays open, Paystack shapes vary. */
const paystackEventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z.record(z.string(), z.unknown()),
});

type SubRow = typeof subscriptions.$inferSelect;

async function resolveSubscription(
  tx: Tx,
  data: Record<string, unknown>,
): Promise<SubRow | null> {
  const orgId = metadataOrgId(data);
  if (orgId) {
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organisationId, orgId))
      .for("update");
    if (row) return row;
  }
  const subCode = eventSubscriptionCode(data);
  if (subCode) {
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.paystackSubscriptionCode, subCode))
      .for("update");
    if (row) return row;
  }
  const customerCode = eventCustomerCode(data);
  if (customerCode) {
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.paystackCustomerCode, customerCode))
      .for("update");
    if (row) return row;
  }
  return null;
}

async function resolvePlanId(tx: Tx, code: string | null): Promise<string | null> {
  if (!code) return null;
  const [row] = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(or(eq(plans.code, code), eq(plans.paystackPlanCode, code)))
    .limit(1);
  return row?.id ?? null;
}

function snapshot(s: SubRow) {
  return {
    status: s.status,
    planId: s.planId,
    trialEndsAt: s.trialEndsAt,
    currentPeriodEnd: s.currentPeriodEnd,
  };
}

/** Apply one verified, newly-recorded event. Returns what happened + dispatches. */
async function applyEvent(
  tx: Tx,
  evt: PaystackEvent,
  externalId: string,
): Promise<{ result: WebhookResult; error?: string; dispatch: DispatchRequest[] }> {
  const handled = [
    "charge.success",
    "subscription.create",
    "invoice.payment_failed",
    "subscription.disable",
  ];
  if (!handled.includes(evt.event)) {
    // invoice.create / invoice.update / subscription.not_renew / anything else:
    // stored for the record, no state change.
    return { result: "ignored", dispatch: [] };
  }

  const sub = await resolveSubscription(tx, evt.data);
  if (!sub) {
    return {
      result: "unresolved",
      error: "Could not resolve an organisation subscription for this event",
      dispatch: [],
    };
  }

  const before = snapshot(sub);
  const patch: Partial<typeof subscriptions.$inferInsert> = {};
  const customerCode = eventCustomerCode(evt.data);
  if (customerCode) patch.paystackCustomerCode = customerCode;
  const dispatch: DispatchRequest[] = [];

  switch (evt.event) {
    case "charge.success": {
      const paidAt = eventDate(evt.data, "paid_at", "paidAt") ?? new Date();
      patch.status = "active";
      patch.currentPeriodEnd = periodEndFrom(paidAt);
      const planId = await resolvePlanId(tx, eventPlanCode(evt.data));
      if (planId) patch.planId = planId;
      break;
    }
    case "subscription.create": {
      patch.status = "active";
      const subCode = eventSubscriptionCode(evt.data);
      if (subCode) patch.paystackSubscriptionCode = subCode;
      const next = eventDate(evt.data, "next_payment_date");
      patch.currentPeriodEnd =
        next ?? sub.currentPeriodEnd ?? periodEndFrom(new Date());
      const planId = await resolvePlanId(tx, eventPlanCode(evt.data));
      if (planId) patch.planId = planId;
      break;
    }
    case "invoice.payment_failed": {
      patch.status = "past_due";
      const dedupKey = `payfail:${externalId}`;
      const created = await notifyRole(tx, sub.organisationId, ["owner", "manager"], {
        type: "payment_failed",
        title: "Payment failed",
        body: "Your GreenLedger subscription payment did not go through. The farm is read-only until payment is made.",
        entityType: "subscription",
        entityId: sub.id,
        dedupKey,
      });
      if (created > 0) dispatch.push({ orgId: sub.organisationId, dedupKey });
      break;
    }
    case "subscription.disable": {
      patch.status = "cancelled";
      break;
    }
  }

  await tx.update(subscriptions).set(patch).where(eq(subscriptions.id, sub.id));
  await writeAudit(
    tx,
    { orgId: sub.organisationId, userId: null },
    {
      action: `billing.webhook.${evt.event}`,
      entityType: "subscription",
      entityId: sub.id,
      before,
      after: { ...before, ...patch, externalId },
    },
  );
  return { result: "processed", dispatch };
}

export async function handlePaystackWebhook(
  rawBody: string,
  signature: string | null,
): Promise<WebhookOutcome> {
  // 1. Verify the signature on the raw text — never parse unverified input.
  if (!payments.verifyWebhook(rawBody, signature)) {
    return { status: 401, result: "invalid_signature", dispatch: [] };
  }

  // 2. Parse.
  let evt: PaystackEvent;
  let payload: unknown;
  try {
    const parsed = paystackEventSchema.safeParse(parsePaystackEvent(rawBody));
    if (!parsed.success) throw new Error("bad shape");
    evt = parsed.data;
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, result: "bad_payload", dispatch: [] };
  }
  const externalId = webhookExternalId(evt.event, evt.data, rawBody);

  // 3 + 4. Record (idempotency) and apply in one transaction.
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(webhookEvents)
        .values({
          provider: "paystack",
          eventType: evt.event,
          externalId,
          payload,
        })
        .onConflictDoNothing({
          target: [webhookEvents.provider, webhookEvents.externalId],
        })
        .returning({ id: webhookEvents.id });
      if (!row) {
        return {
          status: 200 as const,
          result: "duplicate" as const,
          event: evt.event,
          externalId,
          dispatch: [],
        };
      }

      const outcome = await applyEvent(tx, evt, externalId);
      await tx
        .update(webhookEvents)
        .set({
          processedAt: outcome.error ? null : new Date(),
          error: outcome.error ?? null,
        })
        .where(eq(webhookEvents.id, row.id));

      return {
        status: 200 as const,
        result: outcome.result,
        event: evt.event,
        externalId,
        dispatch: outcome.dispatch,
      };
    });
  } catch (err) {
    console.error(`[webhook:paystack] ${evt.event} ${externalId} failed:`, err);
    return {
      status: 500,
      result: "error",
      event: evt.event,
      externalId,
      dispatch: [],
    };
  }
}
