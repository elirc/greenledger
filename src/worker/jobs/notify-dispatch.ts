import { and, eq } from "drizzle-orm";
import type { Job } from "pg-boss";
import { z } from "zod";
import { db } from "../../db";
import { notifications, user } from "../../db/schema";
import { email } from "../../adapters/email";
import { sms } from "../../adapters/sms";
import { JOBS, sendJob } from "../../lib/jobs";

/**
 * notify.dispatch (ARCHITECTURE §8/§12, queue-only — no schedule).
 *
 * Payload `{ orgId, dedupKey }` names ONE logical alert; notifyRole created
 * one row per recipient under that dedup key. For URGENT types (expired
 * batch, payment failed, subscription read-only) each recipient gets an SMS
 * (if they have a phone) and an email (if they have a real address — phone
 * sign-ups carry a placeholder `@phone.greenledger.local` address).
 * Non-urgent types stay in-app only.
 *
 * Mock adapters log + push to in-memory arrays (DECISIONS §18).
 * Boundary (DECISIONS §16): db + adapters + pure libs only.
 */

export const URGENT_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "expired",
  "payment_failed",
  "subscription_read_only",
]);

export const dispatchPayloadSchema = z.object({
  orgId: z.string().min(1).max(64),
  dedupKey: z.string().min(1).max(300),
});
export type DispatchPayload = z.infer<typeof dispatchPayloadSchema>;

const PLACEHOLDER_EMAIL = /@(phone|placeholder)\.greenledger\.local$/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface DispatchResult {
  recipients: number;
  sms: number;
  emails: number;
  skipped: number;
}

/** Deliver one logical alert to its recipients. Exported for tests. */
export async function runNotifyDispatch(payload: DispatchPayload): Promise<DispatchResult> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      email: user.email,
      phoneNumber: user.phoneNumber,
    })
    .from(notifications)
    .innerJoin(user, eq(user.id, notifications.userId))
    .where(
      and(
        eq(notifications.organisationId, payload.orgId),
        eq(notifications.dedupKey, payload.dedupKey),
      ),
    );

  const result: DispatchResult = { recipients: rows.length, sms: 0, emails: 0, skipped: 0 };
  for (const r of rows) {
    if (!URGENT_NOTIFICATION_TYPES.has(r.type)) {
      result.skipped += 1;
      continue;
    }
    const text = r.body ? `${r.title}. ${r.body}` : r.title;
    try {
      if (r.phoneNumber) {
        await sms.send({ to: r.phoneNumber, body: `GreenLedger: ${text}` });
        result.sms += 1;
      }
      if (r.email && !PLACEHOLDER_EMAIL.test(r.email)) {
        await email.send({
          to: r.email,
          subject: `GreenLedger: ${r.title}`,
          html: `<p><strong>${escapeHtml(r.title)}</strong></p>${
            r.body ? `<p>${escapeHtml(r.body)}</p>` : ""
          }<p>Open GreenLedger to see details.</p>`,
        });
        result.emails += 1;
      }
    } catch (err) {
      // One failed delivery must not stop the others (the in-app row exists regardless).
      console.error(`[worker] notify.dispatch delivery failed for notification ${r.id}:`, err);
    }
  }
  return result;
}

/**
 * Enqueue dispatches for freshly created urgent alerts. If the queue is
 * unreachable, deliver inline so an urgent alert is never silently dropped.
 */
export async function enqueueDispatch(requests: DispatchPayload[]): Promise<void> {
  for (const r of requests) {
    try {
      await sendJob(JOBS.notifyDispatch, { orgId: r.orgId, dedupKey: r.dedupKey });
    } catch (err) {
      console.error("[worker] could not enqueue notify.dispatch, delivering inline:", err);
      await runNotifyDispatch(r).catch((e) =>
        console.error("[worker] inline notify.dispatch failed:", e),
      );
    }
  }
}

export async function notifyDispatchHandler(
  jobs: Job<Record<string, unknown>>[],
): Promise<void> {
  for (const job of jobs) {
    const parsed = dispatchPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      console.error(`[worker] notify.dispatch: invalid payload on job ${job.id}`);
      continue;
    }
    const res = await runNotifyDispatch(parsed.data);
    console.log(
      `[worker] notify.dispatch ${parsed.data.dedupKey}: ${res.recipients} recipient(s), ${res.sms} sms, ${res.emails} email(s)`,
    );
  }
}
