/**
 * Pure billing helpers (no DB, no request) — unit-testable.
 */

import { createHash } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A paid period runs 30 days from the successful charge (brief: "+30d"). */
export const BILLING_PERIOD_DAYS = 30;

/** Whole days left in a trial, rounded up; 0 once it has ended. */
export function trialDaysLeft(trialEndsAt: Date, now: Date = new Date()): number {
  const ms = trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

/** Period end for a charge paid at `paidAt`. Not cumulative: replays land on the same value. */
export function periodEndFrom(paidAt: Date): Date {
  return new Date(paidAt.getTime() + BILLING_PERIOD_DAYS * DAY_MS);
}

/** Farms above their plan's greenhouse limit get a warning (no hard block in v1). */
export function isOverGreenhouseLimit(
  greenhouseCount: number,
  maxGreenhouses: number,
): boolean {
  return greenhouseCount > maxGreenhouses;
}

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function obj(v: unknown): Json | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Json)
    : null;
}

/**
 * Paystack events carry no event id of their own, so the idempotency key is
 * the event name + the most specific id in `data` (transaction id, then
 * reference / subscription code / invoice code). Falls back to a hash of the
 * raw body so an identical redelivery still collapses onto one row.
 */
export function webhookExternalId(
  event: string,
  data: Json,
  rawBody: string,
): string {
  const id =
    str(data.id) ??
    str(data.reference) ??
    str(data.subscription_code) ??
    str(data.invoice_code) ??
    createHash("sha256").update(rawBody).digest("hex");
  return `${event}:${id}`;
}

/** Org id from metadata (`orgId` from our checkout; `org_id` from the real driver). */
export function metadataOrgId(data: Json): string | null {
  const meta = obj(data.metadata);
  return meta ? (str(meta.orgId) ?? str(meta.org_id)) : null;
}

/** Plan code from metadata (ours) or the Paystack plan object. */
export function eventPlanCode(data: Json): string | null {
  const meta = obj(data.metadata);
  const fromMeta = meta ? (str(meta.planCode) ?? str(meta.plan_code)) : null;
  if (fromMeta) return fromMeta;
  const plan = obj(data.plan);
  if (plan) return str(plan.plan_code);
  return str(data.plan);
}

export function eventSubscriptionCode(data: Json): string | null {
  const sub = obj(data.subscription);
  return str(data.subscription_code) ?? (sub ? str(sub.subscription_code) : null);
}

export function eventCustomerCode(data: Json): string | null {
  const customer = obj(data.customer);
  return customer ? str(customer.customer_code) : null;
}

/** paid_at / paidAt / next_payment_date as a Date, if present and valid. */
export function eventDate(data: Json, ...keys: string[]): Date | null {
  for (const k of keys) {
    const v = str(data[k]);
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Only follow a checkout callback back into this app (no open redirect):
 * same-origin absolute URLs and app-relative paths become a path; anything
 * else falls back to the billing page.
 */
export function safeCallbackPath(
  callback: string | null | undefined,
  appUrl: string,
): string {
  const fallback = "/settings/billing";
  if (!callback) return fallback;
  try {
    const base = new URL(appUrl);
    const u = new URL(callback, base);
    if (u.origin !== base.origin) return fallback;
    if (!u.pathname.startsWith("/") || u.pathname.startsWith("//")) return fallback;
    return `${u.pathname}${u.search}`;
  } catch {
    return fallback;
  }
}
