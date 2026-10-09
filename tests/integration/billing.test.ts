/**
 * Billing (Paystack mock-first), read-only lockout, platform admin and the
 * notification scans — end to end against the test DB.
 *
 *  - webhook: signature verified on the raw body (valid / invalid), a replay
 *    of the same delivery is processed exactly once (webhook_events unique);
 *  - activation: charge.success → active + period end +30d + plan switch;
 *    subscription.create resolves the org by customer code;
 *    invoice.payment_failed → past_due + urgent notification → SMS dispatch;
 *  - lockout: an expired-trial org gets READ_ONLY from a real mutating action
 *    while reads (and billing itself) still work;
 *  - platform admin: cross-org queries see every org; requirePlatformAdmin
 *    rejects non-admins and anonymous callers;
 *  - billing.check + scan.expiry: notifications created once (dedup).
 *
 * The REAL guard runs: only the session source is faked (`@/lib/auth`'s
 * getSession and `next/headers`), plus `next/cache` revalidation which has no
 * request store outside Next.
 *
 * Orchestrator-only (shared test DB): `pnpm test:integration`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, count, eq, isNull } from "drizzle-orm";

const fakeSession = vi.hoisted(() => ({
  current: null as null | {
    user: { id: string; name: string; phoneNumber: string | null; isPlatformAdmin: boolean };
    session: { activeOrganizationId: string | null };
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => fakeSession.current } },
}));

import { db } from "@/db";
import {
  auditLog,
  itemBatches,
  notifications,
  plans,
  subscriptions,
  suppliers,
  user,
  webhookEvents,
} from "@/db/schema";
import { MOCK_PAYSTACK_SECRET, hmacSha512Sign } from "@/adapters/payments";
import { sentSms } from "@/adapters/sms/mock";
import { env } from "@/lib/env";
import { AuthError } from "@/lib/errors";
import { computeOrgStatus, requireMember, requirePlatformAdmin } from "@/lib/guard";
import { addDays, todayLagos } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { startCheckout } from "@/modules/billing/actions";
import { periodEndFrom } from "@/modules/billing/logic";
import { handlePaystackWebhook } from "@/modules/billing/webhook";
import { markAllNotificationsRead } from "@/modules/notifications/actions";
import { extendTrial } from "@/modules/platform/actions";
import { getUsageCounts, listAuditLog, listOrganisations } from "@/modules/platform/queries";
import { postMovement } from "@/modules/stock/movements";
import { createSupplier } from "@/modules/suppliers/actions";
import { listSuppliers } from "@/modules/suppliers/queries";
import { runBillingCheck } from "@/worker/jobs/billing-check";
import { runExpiryScan, expiryDedupKey } from "@/worker/jobs/expiry-scan";
import { runNotifyDispatch } from "@/worker/jobs/notify-dispatch";
import { closeTestDb, getTestDb } from "../helpers/db";
import { createTestOrg, type TestOrg } from "../factories";

const DAY = 24 * 60 * 60 * 1000;
const SECRET = env.PAYSTACK_SECRET_KEY || MOCK_PAYSTACK_SECRET;

let paying: TestOrg; // goes trialing → active → past_due → cancelled
let expired: TestOrg; // trial ended yesterday → read-only
let other: TestOrg; // healthy org for cross-org checks
let estatePlanId: string;
let adminUserId: string;

function sign(body: string): string {
  return hmacSha512Sign(body, SECRET);
}

function actAs(org: TestOrg | null, role: keyof TestOrg["users"] | null, opts?: { admin?: boolean; userId?: string }) {
  if (opts?.userId) {
    fakeSession.current = {
      user: { id: opts.userId, name: "Platform Admin", phoneNumber: null, isPlatformAdmin: Boolean(opts.admin) },
      session: { activeOrganizationId: null },
    };
    return;
  }
  if (!org || !role) {
    fakeSession.current = null;
    return;
  }
  const u = org.users[role];
  fakeSession.current = {
    user: { id: u.id, name: u.name, phoneNumber: u.phoneNumber, isPlatformAdmin: false },
    session: { activeOrganizationId: org.orgId },
  };
}

async function subOf(org: TestOrg) {
  const [row] = await getTestDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organisationId, org.orgId));
  return row;
}

async function webhookRows(externalId: string): Promise<number> {
  const [row] = await getTestDb()
    .select({ n: count() })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, "paystack"), eq(webhookEvents.externalId, externalId)));
  return row.n;
}

beforeAll(async () => {
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("app db is not pointed at a test database");
  }
  const tdb = getTestDb();
  paying = await createTestOrg(tdb, { name: "Billing Pay Farm", inventory: false });
  expired = await createTestOrg(tdb, { name: "Billing Expired Farm", inventory: false });
  other = await createTestOrg(tdb, { name: "Billing Other Farm" });

  await tdb
    .insert(plans)
    .values({ code: "estate", name: "Estate", maxGreenhouses: 50, monthlyPriceKobo: 120_000_00 })
    .onConflictDoNothing({ target: plans.code });
  const estate = await tdb.query.plans.findFirst({ where: (p, { eq: e }) => e(p.code, "estate") });
  estatePlanId = estate!.id;

  // `paying` starts on a live trial; `expired` trial ended yesterday.
  await tdb
    .update(subscriptions)
    .set({ status: "trialing", trialEndsAt: new Date(Date.now() + 10 * DAY) })
    .where(eq(subscriptions.organisationId, paying.orgId));
  await tdb
    .update(subscriptions)
    .set({ status: "trialing", trialEndsAt: new Date(Date.now() - DAY) })
    .where(eq(subscriptions.organisationId, expired.orgId));

  adminUserId = newId();
  await tdb.insert(user).values({
    id: adminUserId,
    name: "Platform Admin",
    email: `admin.${adminUserId}@test.greenledger.local`,
    emailVerified: true,
    isPlatformAdmin: true,
  });
});

beforeEach(() => {
  fakeSession.current = null;
});

afterAll(async () => {
  fakeSession.current = null;
  await closeTestDb();
});

describe("paystack webhook — signature + idempotency", () => {
  const paidAt = new Date("2026-10-01T09:00:00.000Z");
  let chargeBody: string;

  beforeAll(() => {
    chargeBody = JSON.stringify({
      event: "charge.success",
      data: {
        id: 900_000_001,
        reference: newId(),
        status: "success",
        amount: 120_000_00,
        paid_at: paidAt.toISOString(),
        customer: { email: "owner@pay.test", customer_code: `CUS_${paying.orgId.slice(0, 8)}` },
        plan: { plan_code: "estate" },
        metadata: { orgId: paying.orgId, planCode: "estate" },
      },
    });
  });

  it("rejects an invalid signature before parsing and stores nothing", async () => {
    const res = await handlePaystackWebhook(chargeBody, "deadbeef".repeat(16));
    expect(res.status).toBe(401);
    expect(res.result).toBe("invalid_signature");
    const missing = await handlePaystackWebhook(chargeBody, null);
    expect(missing.status).toBe(401);
    // A body signed with the wrong key is rejected too.
    const wrongKey = await handlePaystackWebhook(chargeBody, hmacSha512Sign(chargeBody, "not-the-secret"));
    expect(wrongKey.status).toBe(401);
    expect(await webhookRows("charge.success:900000001")).toBe(0);
    expect((await subOf(paying)).status).toBe("trialing");
  });

  it("charge.success with a valid signature activates the subscription (+30d, plan switch)", async () => {
    const res = await handlePaystackWebhook(chargeBody, sign(chargeBody));
    expect(res.status).toBe(200);
    expect(res.result).toBe("processed");

    const sub = await subOf(paying);
    expect(sub.status).toBe("active");
    expect(sub.currentPeriodEnd?.getTime()).toBe(periodEndFrom(paidAt).getTime());
    expect(sub.planId).toBe(estatePlanId);
    expect(sub.paystackCustomerCode).toBe(`CUS_${paying.orgId.slice(0, 8)}`);
    expect(computeOrgStatus(sub)).toBe("active");

    const [ev] = await getTestDb()
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalId, "charge.success:900000001"));
    expect(ev.processedAt).not.toBeNull();
    expect(ev.error).toBeNull();
  });

  it("a replayed delivery is acknowledged but processed only once", async () => {
    const before = await subOf(paying);
    const replay = await handlePaystackWebhook(chargeBody, sign(chargeBody));
    expect(replay.status).toBe(200);
    expect(replay.result).toBe("duplicate");
    expect(await webhookRows("charge.success:900000001")).toBe(1);

    const [{ n }] = await getTestDb()
      .select({ n: count() })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organisationId, paying.orgId),
          eq(auditLog.action, "billing.webhook.charge.success"),
        ),
      );
    expect(n).toBe(1);
    const after = await subOf(paying);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("subscription.create resolves the org by customer code (no metadata) and stores the code", async () => {
    const next = new Date("2026-11-01T09:00:00.000Z");
    const body = JSON.stringify({
      event: "subscription.create",
      data: {
        id: 900_000_002,
        subscription_code: "SUB_test_pay",
        status: "active",
        next_payment_date: next.toISOString(),
        customer: { customer_code: `CUS_${paying.orgId.slice(0, 8)}` },
        plan: { plan_code: "estate" },
      },
    });
    const res = await handlePaystackWebhook(body, sign(body));
    expect(res.result).toBe("processed");
    const sub = await subOf(paying);
    expect(sub.paystackSubscriptionCode).toBe("SUB_test_pay");
    expect(sub.status).toBe("active");
    expect(sub.currentPeriodEnd?.getTime()).toBe(next.getTime());
  });

  it("an event for an unknown org is recorded with an error, not applied", async () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { id: 900_000_099, metadata: { orgId: "no-such-org" } },
    });
    const res = await handlePaystackWebhook(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.result).toBe("unresolved");
    const [ev] = await getTestDb()
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalId, "charge.success:900000099"));
    expect(ev.error).toMatch(/resolve/i);
    expect(ev.processedAt).toBeNull();
  });

  it("invoice.payment_failed → past_due, owner+manager notified, urgent SMS dispatched", async () => {
    const body = JSON.stringify({
      event: "invoice.payment_failed",
      data: { id: 900_000_003, subscription: { subscription_code: "SUB_test_pay" } },
    });
    const res = await handlePaystackWebhook(body, sign(body));
    expect(res.result).toBe("processed");
    expect(res.dispatch).toHaveLength(1);

    const sub = await subOf(paying);
    expect(sub.status).toBe("past_due");
    expect(computeOrgStatus(sub)).toBe("read_only");

    const rows = await getTestDb()
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(eq(notifications.organisationId, paying.orgId), eq(notifications.type, "payment_failed")),
      );
    expect(new Set(rows.map((r) => r.userId))).toEqual(
      new Set([paying.users.owner.id, paying.users.manager.id]),
    );

    const smsBefore = sentSms.length;
    const sent = await runNotifyDispatch(res.dispatch[0]);
    expect(sent.recipients).toBe(2);
    expect(sent.sms).toBe(2);
    const newSms = sentSms.slice(smsBefore).map((m) => m.to);
    expect(newSms).toEqual(
      expect.arrayContaining([paying.users.owner.phoneNumber, paying.users.manager.phoneNumber]),
    );
  });

  it("subscription.disable → cancelled", async () => {
    const body = JSON.stringify({
      event: "subscription.disable",
      data: { id: 900_000_004, subscription_code: "SUB_test_pay" },
    });
    const res = await handlePaystackWebhook(body, sign(body));
    expect(res.result).toBe("processed");
    expect((await subOf(paying)).status).toBe("cancelled");
  });

  it("malformed JSON with a valid signature is a 400, never a crash", async () => {
    const body = "{not json";
    const res = await handlePaystackWebhook(body, sign(body));
    expect(res.status).toBe(400);
  });
});

describe("read-only lockout (expired trial)", () => {
  it("the guard computes read_only for the expired-trial org", async () => {
    actAs(expired, "owner");
    const ctx = await requireMember();
    expect(ctx.orgId).toBe(expired.orgId);
    expect(ctx.org.status).toBe("read_only");
  });

  it("a mutating action returns READ_ONLY and writes nothing", async () => {
    actAs(expired, "storekeeper");
    const res = await createSupplier({ name: "Should Not Exist Ltd" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("READ_ONLY");
    const rows = await getTestDb()
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.organisationId, expired.orgId), eq(suppliers.name, "Should Not Exist Ltd")));
    expect(rows).toHaveLength(0);
  });

  it("reads still work while read-only", async () => {
    actAs(expired, "storekeeper");
    const ctx = await requireMember();
    const list = await listSuppliers(ctx);
    expect(list.map((s) => s.id)).toContain(expired.supplierId);
  });

  it("billing and notification actions are exempt so the owner can pay their way out", async () => {
    actAs(expired, "owner");
    const checkout = await startCheckout({ planCode: "growth" });
    expect(checkout.ok).toBe(true);
    if (checkout.ok) {
      expect(checkout.data.url).toMatch(/^\/billing\/checkout-mock\?/);
      expect(checkout.data.url).toContain(`org=${encodeURIComponent(expired.orgId)}`);
    }
    const marked = await markAllNotificationsRead({});
    expect(marked.ok).toBe(true);
  });

  it("the same mutating action succeeds for a writable org (control)", async () => {
    actAs(other, "storekeeper");
    const res = await createSupplier({ name: `Control Supplier ${newId().slice(0, 6)}` });
    expect(res.ok).toBe(true);
  });

  it("non-owners cannot start a checkout", async () => {
    actAs(other, "manager");
    const res = await startCheckout({ planCode: "growth" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("FORBIDDEN");
  });
});

describe("platform admin", () => {
  it("requirePlatformAdmin rejects anonymous callers and farm users", async () => {
    actAs(null, null);
    await expect(requirePlatformAdmin()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    actAs(other, "owner");
    await expect(requirePlatformAdmin()).rejects.toBeInstanceOf(AuthError);
    await expect(requirePlatformAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a non-admin cannot run platform actions", async () => {
    actAs(expired, "owner");
    const before = await subOf(expired);
    const res = await extendTrial({ orgId: expired.orgId, days: 14 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("FORBIDDEN");
    const after = await subOf(expired);
    expect(after.trialEndsAt.getTime()).toBe(before.trialEndsAt.getTime());
  });

  it("admin queries cross org boundaries", async () => {
    actAs(null, null, { admin: true, userId: adminUserId });
    const admin = await requirePlatformAdmin();
    expect(admin.userId).toBe(adminUserId);

    const orgs = await listOrganisations(admin);
    const ids = orgs.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining([paying.orgId, expired.orgId, other.orgId]));
    const exp = orgs.find((o) => o.id === expired.orgId)!;
    expect(exp.orgStatus).toBe("read_only");
    expect(exp.greenhouses).toBe(2);
    expect(exp.users).toBe(4);

    const usage = await getUsageCounts(admin);
    expect(usage.organisations).toBeGreaterThanOrEqual(3);
  });

  it("admin extends a trial: org unlocks, audited with org = null", async () => {
    actAs(null, null, { admin: true, userId: adminUserId });
    const res = await extendTrial({ orgId: expired.orgId, days: 7 });
    expect(res.ok).toBe(true);
    const sub = await subOf(expired);
    expect(sub.status).toBe("trialing");
    expect(computeOrgStatus(sub)).toBe("trial");

    const admin = await requirePlatformAdmin();
    const audit = await listAuditLog(admin, { action: "platform.subscription.extend_trial" });
    const mine = audit.find((a) => a.entityId === sub.id);
    expect(mine).toBeDefined();
    expect(mine!.orgId).toBeNull();

    // Lock it again for the billing-check suite below.
    await getTestDb()
      .update(subscriptions)
      .set({ trialEndsAt: new Date(Date.now() - DAY) })
      .where(eq(subscriptions.organisationId, expired.orgId));
  });
});

describe("billing.check + scan.expiry notifications", () => {
  it("read-only farms alert owner + manager once (dedup), with an urgent dispatch", async () => {
    const first = await runBillingCheck();
    const mine = first.dispatch.filter((d) => d.orgId === expired.orgId);
    expect(mine).toHaveLength(1);

    const rows = await getTestDb()
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          eq(notifications.organisationId, expired.orgId),
          eq(notifications.type, "subscription_read_only"),
        ),
      );
    expect(new Set(rows.map((r) => r.userId))).toEqual(
      new Set([expired.users.owner.id, expired.users.manager.id]),
    );

    const second = await runBillingCheck();
    expect(second.dispatch.filter((d) => d.orgId === expired.orgId)).toHaveLength(0);
    const [{ n }] = await getTestDb()
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.organisationId, expired.orgId),
          eq(notifications.type, "subscription_read_only"),
        ),
      );
    expect(n).toBe(2);
  });

  it("trials ending within 3 days warn the owner only", async () => {
    await getTestDb()
      .update(subscriptions)
      .set({ status: "trialing", trialEndsAt: new Date(Date.now() + 2 * DAY) })
      .where(eq(subscriptions.organisationId, other.orgId));
    await runBillingCheck();
    const rows = await getTestDb()
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(and(eq(notifications.organisationId, other.orgId), eq(notifications.type, "trial_ending")));
    expect(rows.map((r) => r.userId)).toEqual([other.users.owner.id]);
    // restore
    await getTestDb()
      .update(subscriptions)
      .set({ status: "active" })
      .where(eq(subscriptions.organisationId, other.orgId));
  });

  it("scan.expiry raises one 30-day alert per stock role for a batch with stock, once", async () => {
    const tdb = getTestDb();
    const today = todayLagos();
    const [batch] = await tdb
      .insert(itemBatches)
      .values({
        organisationId: other.orgId,
        itemId: other.itemId!,
        supplierId: other.supplierId,
        batchNumber: `EXP-${newId().slice(0, 8)}`,
        expiryDate: addDays(today, 10),
        unitCostKobo: "100.000000",
      })
      .returning({ id: itemBatches.id });
    await db.transaction((tx) =>
      postMovement(tx, other.ctx.storekeeper, {
        batchId: batch.id,
        storeId: other.storeIds[0],
        type: "receive",
        quantity: 5,
      }),
    );

    await runExpiryScan(today);
    const key = expiryDedupKey(batch.id, "30");
    const rows = await tdb
      .select({ userId: notifications.userId, type: notifications.type })
      .from(notifications)
      .where(and(eq(notifications.organisationId, other.orgId), eq(notifications.dedupKey, key)));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.type === "expiry_30")).toBe(true);
    expect(new Set(rows.map((r) => r.userId))).toEqual(
      new Set([other.users.owner.id, other.users.manager.id, other.users.storekeeper.id]),
    );

    await runExpiryScan(today);
    const [{ n }] = await tdb
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.organisationId, other.orgId), eq(notifications.dedupKey, key)));
    expect(n).toBe(3);

    // Unread until the user marks them read.
    const unread = await tdb
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.organisationId, other.orgId),
          eq(notifications.dedupKey, key),
          isNull(notifications.readAt),
        ),
      );
    expect(unread).toHaveLength(3);
  });
});
