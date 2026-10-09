/**
 * Platform-admin reads. DELIBERATELY CROSS-ORG: these functions skip the
 * organisation scoping every other queries.ts enforces, which is why they
 * live here (never registered in the tenancy test) and why each one takes
 * the PlatformAdmin returned by requirePlatformAdmin() as proof the caller
 * passed the guard.
 */

import { and, asc, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  greenhouses,
  harvests,
  inventoryMovements,
  member,
  organization,
  plans,
  sales,
  subscriptions,
  user,
  webhookEvents,
} from "@/db/schema";
import { env } from "@/lib/env";
import { AuthError } from "@/lib/errors";
import { computeOrgStatus, type OrgStatus } from "@/lib/guard";
import type { AuditFilter } from "./schema";

export type PlatformAdmin = { userId: string };

/** Cheap runtime check that the caller really passed requirePlatformAdmin(). */
function assertAdmin(admin: PlatformAdmin): void {
  if (!admin || typeof admin.userId !== "string" || admin.userId.length === 0) {
    throw new AuthError("FORBIDDEN");
  }
}

const greenhouseCount = sql<number>`(select count(*)::int from ${greenhouses} where ${greenhouses.organisationId} = ${organization.id})`;
const memberCount = sql<number>`(select count(*)::int from ${member} where ${member.organizationId} = ${organization.id})`;

function orgStatusOf(row: {
  subStatus: "trialing" | "active" | "past_due" | "cancelled" | null;
  trialEndsAt: Date | null;
}): OrgStatus {
  return computeOrgStatus(
    row.subStatus && row.trialEndsAt
      ? { status: row.subStatus, trialEndsAt: row.trialEndsAt }
      : null,
  );
}

/** Every organisation with plan, subscription status and size. */
export async function listOrganisations(admin: PlatformAdmin) {
  assertAdmin(admin);
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      planName: plans.name,
      subStatus: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      greenhouses: greenhouseCount,
      users: memberCount,
    })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.organisationId, organization.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .orderBy(desc(organization.createdAt));
  return rows.map((r) => ({ ...r, orgStatus: orgStatusOf(r) }));
}

export async function getOrganisationDetail(admin: PlatformAdmin, orgId: string) {
  assertAdmin(admin);
  const [org] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      subscriptionId: subscriptions.id,
      subStatus: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      paystackCustomerCode: subscriptions.paystackCustomerCode,
      paystackSubscriptionCode: subscriptions.paystackSubscriptionCode,
      planId: plans.id,
      planName: plans.name,
      maxGreenhouses: plans.maxGreenhouses,
      greenhouses: greenhouseCount,
      users: memberCount,
    })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.organisationId, organization.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) return null;

  const members = await db
    .select({
      memberId: member.id,
      userId: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(member.createdAt));

  const recentAudit = await listAuditLog(admin, { org: orgId }, 20);

  return { ...org, orgStatus: orgStatusOf(org), members, recentAudit };
}

/** All plans incl. inactive, with how many organisations are on each. */
export async function listAllPlans(admin: PlatformAdmin) {
  assertAdmin(admin);
  return db
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      maxGreenhouses: plans.maxGreenhouses,
      monthlyPriceKobo: plans.monthlyPriceKobo,
      paystackPlanCode: plans.paystackPlanCode,
      isActive: plans.isActive,
      subscribers: sql<number>`(select count(*)::int from ${subscriptions} where ${subscriptions.planId} = ${plans.id})`,
    })
    .from(plans)
    .orderBy(asc(plans.monthlyPriceKobo));
}

export async function getPlan(admin: PlatformAdmin, id: string) {
  assertAdmin(admin);
  const [row] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return row ?? null;
}

/** Platform-wide usage counters. */
export async function getUsageCounts(admin: PlatformAdmin) {
  assertAdmin(admin);
  const [orgs, users, gh, movements, harvestCount, salesCount, webhooks7d] =
    await Promise.all([
      db.select({ n: count() }).from(organization),
      db.select({ n: count() }).from(user),
      db.select({ n: count() }).from(greenhouses),
      db.select({ n: count() }).from(inventoryMovements),
      db.select({ n: count() }).from(harvests),
      db.select({ n: count() }).from(sales),
      db
        .select({ n: count() })
        .from(webhookEvents)
        .where(sql`${webhookEvents.createdAt} > now() - interval '7 days'`),
    ]);
  const subs = await db
    .select({ status: subscriptions.status, trialEndsAt: subscriptions.trialEndsAt })
    .from(subscriptions);
  const byStatus: Record<OrgStatus, number> = { trial: 0, active: 0, read_only: 0 };
  for (const s of subs) byStatus[computeOrgStatus(s)] += 1;

  return {
    organisations: orgs[0].n,
    users: users[0].n,
    greenhouses: gh[0].n,
    inventoryMovements: movements[0].n,
    harvests: harvestCount[0].n,
    sales: salesCount[0].n,
    webhookEvents7d: webhooks7d[0].n,
    byStatus,
  };
}

/** Cross-org audit log, latest first (max 200), optional filters. */
export async function listAuditLog(
  admin: PlatformAdmin,
  filter: AuditFilter = {},
  limit = 200,
) {
  assertAdmin(admin);
  const conds: SQL[] = [];
  if (filter.org) conds.push(eq(auditLog.organisationId, filter.org));
  if (filter.action) conds.push(ilike(auditLog.action, `${filter.action.replace(/[%_\\]/g, "\\$&")}%`));
  if (filter.entity) conds.push(eq(auditLog.entityType, filter.entity));
  return db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      reason: auditLog.reason,
      orgId: auditLog.organisationId,
      orgName: organization.name,
      userName: user.name,
    })
    .from(auditLog)
    .leftJoin(organization, eq(organization.id, auditLog.organisationId))
    .leftJoin(user, eq(user.id, auditLog.userId))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(Math.max(1, limit), 200));
}

/** Organisation id/name pairs for the audit filter. */
export async function listOrganisationOptions(admin: PlatformAdmin) {
  assertAdmin(admin);
  return db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .orderBy(asc(organization.name));
}

export interface JobRun {
  name: string;
  lastCompletedAt: Date | null;
  lastFailedAt: Date | null;
}

/**
 * DB round-trip + latest pg-boss runs per queue. The pg-boss read is
 * best-effort: if its schema is missing or shaped differently, `jobs` is
 * null and the card omits it.
 */
export async function getSystemHealth(admin: PlatformAdmin) {
  assertAdmin(admin);
  const t0 = Date.now();
  let dbOk = true;
  let dbError: string | null = null;
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    dbOk = false;
    dbError = err instanceof Error ? err.message : String(err);
  }
  const dbLatencyMs = Date.now() - t0;

  let jobs: JobRun[] | null = null;
  if (dbOk) {
    try {
      const res = await db.execute<{
        name: string;
        last_completed: string | Date | null;
        last_failed: string | Date | null;
      }>(sql`
        select name,
               max(completed_on) filter (where state = 'completed') as last_completed,
               max(completed_on) filter (where state = 'failed') as last_failed
        from ${sql.identifier(env.PGBOSS_SCHEMA)}.job
        group by name
        order by name
      `);
      jobs = res.rows.map((r) => ({
        name: r.name,
        lastCompletedAt: r.last_completed ? new Date(r.last_completed) : null,
        lastFailedAt: r.last_failed ? new Date(r.last_failed) : null,
      }));
    } catch {
      jobs = null;
    }
  }

  const [lastWebhook] = dbOk
    ? await db
        .select({ createdAt: webhookEvents.createdAt, eventType: webhookEvents.eventType, error: webhookEvents.error })
        .from(webhookEvents)
        .orderBy(desc(webhookEvents.createdAt))
        .limit(1)
    : [];

  return { dbOk, dbError, dbLatencyMs, jobs, lastWebhook: lastWebhook ?? null };
}
