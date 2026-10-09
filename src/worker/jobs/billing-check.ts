import { and, asc, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "../../db";
import { organization, plans, subscriptions } from "../../db/schema";
import { TRIAL_WARN_DAYS } from "../../lib/alerts";
import { writeAudit } from "../../lib/audit";
import { formatLagosDate, lagosDateOf } from "../../lib/dates";
import { notifyRole } from "../../lib/notify";
import { enqueueDispatch, type DispatchPayload } from "./notify-dispatch";

/**
 * billing.check (ARCHITECTURE §8, daily 06:00 Lagos).
 *
 * The read-only state is NOT stored: requireMember computes it from the
 * subscription (DATA-MODEL §4.12 predicate). This job never flips statuses;
 * it only:
 *  1. backfills a trialing subscription for an organisation that has none
 *     (guard treats a missing row as trial — "billing check will create
 *     one"): trial ends at org creation + 14 days, cheapest active plan;
 *  2. warns the owner when a trial ends within TRIAL_WARN_DAYS
 *     (`trial_ending:<subId>:<trialEndDate>`);
 *  3. tells owner + manager the farm is read-only (expired trial, past_due,
 *     cancelled) — `read_only:<subId>:<status>:<anchorDate>`; urgent →
 *     notify.dispatch.
 *
 * Boundary (DECISIONS §16): db + pure libs only (no guard).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;

export const trialEndingDedupKey = (subId: string, trialEndsAt: Date) =>
  `trial_ending:${subId}:${lagosDateOf(trialEndsAt)}`;
export const readOnlyDedupKey = (subId: string, status: string, anchor: Date) =>
  `read_only:${subId}:${status}:${lagosDateOf(anchor)}`;

export interface BillingCheckResult {
  backfilled: number;
  trialWarnings: number;
  readOnlyAlerts: number;
  dispatch: DispatchPayload[];
}

export async function runBillingCheck(now: Date = new Date()): Promise<BillingCheckResult> {
  const result: BillingCheckResult = {
    backfilled: 0,
    trialWarnings: 0,
    readOnlyAlerts: 0,
    dispatch: [],
  };

  // 1. Backfill missing subscription rows.
  const orphans = await db
    .select({ id: organization.id, createdAt: organization.createdAt })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.organisationId, organization.id))
    .where(isNull(subscriptions.id));
  if (orphans.length > 0) {
    const [plan] = await db
      .select({ id: plans.id, code: plans.code })
      .from(plans)
      .where(eq(plans.isActive, true))
      .orderBy(asc(plans.monthlyPriceKobo))
      .limit(1);
    if (!plan) {
      console.error("[worker] billing.check: no active plan — cannot backfill subscriptions");
    } else {
      for (const org of orphans) {
        try {
          await db.transaction(async (tx) => {
            const trialEndsAt = new Date(org.createdAt.getTime() + TRIAL_DAYS * DAY_MS);
            const [row] = await tx
              .insert(subscriptions)
              .values({ organisationId: org.id, planId: plan.id, status: "trialing", trialEndsAt })
              .onConflictDoNothing({ target: subscriptions.organisationId })
              .returning({ id: subscriptions.id });
            if (!row) return;
            await writeAudit(tx, { orgId: org.id, userId: null }, {
              action: "billing.subscription_backfilled",
              entityType: "subscription",
              entityId: row.id,
              after: { planCode: plan.code, status: "trialing", trialEndsAt },
            });
            result.backfilled += 1;
          });
        } catch (err) {
          console.error(`[worker] billing.check backfill failed for org ${org.id}:`, err);
        }
      }
    }
  }

  // 2. Trials ending soon.
  const warnUntil = new Date(now.getTime() + TRIAL_WARN_DAYS * DAY_MS);
  const ending = await db
    .select({
      id: subscriptions.id,
      organisationId: subscriptions.organisationId,
      trialEndsAt: subscriptions.trialEndsAt,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "trialing"),
        gte(subscriptions.trialEndsAt, now),
        lte(subscriptions.trialEndsAt, warnUntil),
      ),
    );
  for (const s of ending) {
    try {
      const daysLeft = Math.max(1, Math.ceil((s.trialEndsAt.getTime() - now.getTime()) / DAY_MS));
      result.trialWarnings += await notifyRole(db, s.organisationId, ["owner"], {
        type: "trial_ending",
        title: `Free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        body: `Your GreenLedger trial ends ${formatLagosDate(s.trialEndsAt)}. Subscribe to keep recording — after that the farm becomes read-only.`,
        entityType: "subscription",
        entityId: s.id,
        dedupKey: trialEndingDedupKey(s.id, s.trialEndsAt),
      });
    } catch (err) {
      console.error(`[worker] billing.check trial warning failed for org ${s.organisationId}:`, err);
    }
  }

  // 3. Read-only farms (same predicate as computeOrgStatus).
  const locked = await db
    .select({
      id: subscriptions.id,
      organisationId: subscriptions.organisationId,
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      updatedAt: subscriptions.updatedAt,
    })
    .from(subscriptions)
    .where(
      or(
        and(eq(subscriptions.status, "trialing"), lt(subscriptions.trialEndsAt, now)),
        inArray(subscriptions.status, ["past_due", "cancelled"]),
      ),
    );
  for (const s of locked) {
    try {
      const anchor = s.status === "trialing" ? s.trialEndsAt : s.updatedAt;
      const dedupKey = readOnlyDedupKey(s.id, s.status, anchor);
      const reason =
        s.status === "trialing"
          ? `Your free trial ended ${formatLagosDate(s.trialEndsAt)}.`
          : s.status === "past_due"
            ? "Your subscription payment is overdue."
            : "Your subscription was cancelled.";
      const created = await notifyRole(db, s.organisationId, ["owner", "manager"], {
        type: "subscription_read_only",
        title: "GreenLedger is read-only",
        body: `${reason} Your data is safe; renew the subscription to keep recording.`,
        entityType: "subscription",
        entityId: s.id,
        dedupKey,
      });
      result.readOnlyAlerts += created;
      if (created > 0) result.dispatch.push({ orgId: s.organisationId, dedupKey });
    } catch (err) {
      console.error(`[worker] billing.check read-only alert failed for org ${s.organisationId}:`, err);
    }
  }

  return result;
}

export async function billingCheckHandler(jobs: Job<Record<string, unknown>>[]): Promise<void> {
  const res = await runBillingCheck();
  await enqueueDispatch(res.dispatch);
  console.log(
    `[worker] billing.check: ${jobs.length} job(s) — ${res.backfilled} subscription(s) backfilled, ${res.trialWarnings} trial warning(s), ${res.readOnlyAlerts} read-only alert(s)`,
  );
}
