"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { db } from "@/db";
import { organization, plans, subscriptions } from "@/db/schema";
import type { ActionResult } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { LAGOS_TZ } from "@/lib/dates";
import { AuthError, DomainError } from "@/lib/errors";
import { requirePlatformAdmin } from "@/lib/guard";
import { nairaToKobo } from "@/lib/money";
import {
  extendTrialSchema,
  planCreateSchema,
  planUpdateSchema,
  subscriptionEditSchema,
} from "./schema";

/**
 * Platform-admin mutations. defineAction needs an org membership, which a
 * platform admin does not have, so these run the same pipeline by hand:
 * zod → requirePlatformAdmin → handler → error mapping to ActionResult.
 * Audit rows carry org = null (platform actor) with the target org in `after`.
 */
async function runPlatform<S extends z.ZodType, T>(
  name: string,
  schema: S,
  raw: unknown,
  handler: (input: z.infer<S>, admin: { userId: string }) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error);
      return {
        ok: false,
        code: "VALIDATION",
        error: "Please check the highlighted fields.",
        fieldErrors: flat.fieldErrors as Record<string, string[]>,
      };
    }
    const admin = await requirePlatformAdmin();
    return { ok: true, data: await handler(parsed.data as z.infer<S>, admin) };
  } catch (e) {
    if (e instanceof DomainError || e instanceof AuthError) {
      return { ok: false, code: e.code, error: e.message };
    }
    console.error(`[action:${name}]`, e);
    return { ok: false, code: "INTERNAL", error: "Something went wrong. Please try again." };
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "cause" in e &&
    (e as { cause?: { code?: string } }).cause?.code === "23505"
  );
}

const emptyToNull = (s: string | undefined) => (s && s.length > 0 ? s : null);

/** Lagos calendar date → the END of that day (23:59:59 Lagos) as a UTC instant. */
const endOfLagosDay = (d: string) => fromZonedTime(`${d}T23:59:59`, LAGOS_TZ);

const DAY_MS = 24 * 60 * 60 * 1000;

export async function createPlan(raw: unknown) {
  return runPlatform("platform.createPlan", planCreateSchema, raw, async (input, admin) => {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(plans)
          .values({
            code: input.code,
            name: input.name,
            maxGreenhouses: input.maxGreenhouses,
            monthlyPriceKobo: nairaToKobo(input.monthlyPriceNaira),
            paystackPlanCode: emptyToNull(input.paystackPlanCode),
            isActive: input.isActive,
          })
          .returning({ id: plans.id, monthlyPriceKobo: plans.monthlyPriceKobo });
        await writeAudit(tx, { orgId: null, userId: admin.userId }, {
          action: "platform.plan.create",
          entityType: "plan",
          entityId: row.id,
          after: { code: input.code, name: input.name, maxGreenhouses: input.maxGreenhouses, monthlyPriceKobo: row.monthlyPriceKobo, isActive: input.isActive },
        });
        revalidatePath("/platform/plans");
        return { id: row.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", "A plan with this code already exists.");
      throw e;
    }
  });
}

export async function updatePlan(raw: unknown) {
  return runPlatform("platform.updatePlan", planUpdateSchema, raw, async (input, admin) => {
    try {
      return await db.transaction(async (tx) => {
        const [before] = await tx.select().from(plans).where(eq(plans.id, input.id)).for("update");
        if (!before) throw new DomainError("NOT_FOUND", "Plan not found.");
        const patch = {
          code: input.code,
          name: input.name,
          maxGreenhouses: input.maxGreenhouses,
          monthlyPriceKobo: nairaToKobo(input.monthlyPriceNaira),
          paystackPlanCode: emptyToNull(input.paystackPlanCode),
          isActive: input.isActive,
        };
        await tx.update(plans).set(patch).where(eq(plans.id, input.id));
        await writeAudit(tx, { orgId: null, userId: admin.userId }, {
          action: "platform.plan.update",
          entityType: "plan",
          entityId: input.id,
          before: {
            code: before.code,
            name: before.name,
            maxGreenhouses: before.maxGreenhouses,
            monthlyPriceKobo: before.monthlyPriceKobo,
            paystackPlanCode: before.paystackPlanCode,
            isActive: before.isActive,
          },
          after: patch,
        });
        revalidatePath("/platform/plans");
        return { id: input.id };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", "A plan with this code already exists.");
      throw e;
    }
  });
}

/** Full subscription override (status / plan / trial end / period end). */
export async function updateSubscription(raw: unknown) {
  return runPlatform("platform.updateSubscription", subscriptionEditSchema, raw, async (input, admin) =>
    db.transaction(async (tx) => {
      const [org] = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, input.orgId));
      if (!org) throw new DomainError("NOT_FOUND", "Organisation not found.");
      const [plan] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, input.planId));
      if (!plan) throw new DomainError("NOT_FOUND", "Plan not found.");

      const values = {
        planId: input.planId,
        status: input.status,
        trialEndsAt: endOfLagosDay(input.trialEndsOn),
        currentPeriodEnd: input.periodEndsOn ? endOfLagosDay(input.periodEndsOn) : null,
      };
      const [before] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organisationId, input.orgId))
        .for("update");

      let subId: string;
      if (before) {
        await tx.update(subscriptions).set(values).where(eq(subscriptions.id, before.id));
        subId = before.id;
      } else {
        const [row] = await tx
          .insert(subscriptions)
          .values({ organisationId: input.orgId, ...values })
          .returning({ id: subscriptions.id });
        subId = row.id;
      }

      await writeAudit(tx, { orgId: null, userId: admin.userId }, {
        action: "platform.subscription.update",
        entityType: "subscription",
        entityId: subId,
        before: before
          ? {
              orgId: input.orgId,
              planId: before.planId,
              status: before.status,
              trialEndsAt: before.trialEndsAt,
              currentPeriodEnd: before.currentPeriodEnd,
            }
          : null,
        after: { orgId: input.orgId, ...values },
        reason: input.reason,
      });
      revalidatePath(`/platform/orgs/${input.orgId}`);
      revalidatePath("/platform/orgs");
      return { subscriptionId: subId };
    }),
  );
}

/**
 * Extend a trial by N days from max(now, current trial end), and put the
 * subscription back to trialing — the quick "unlock" for a read-only farm.
 */
export async function extendTrial(raw: unknown) {
  return runPlatform("platform.extendTrial", extendTrialSchema, raw, async (input, admin) =>
    db.transaction(async (tx) => {
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organisationId, input.orgId))
        .for("update");
      if (!sub) throw new DomainError("NOT_FOUND", "This organisation has no subscription yet.");
      if (sub.status === "active") {
        throw new DomainError("INVALID_STATE", "The subscription is active — there is no trial to extend.");
      }
      const from = Math.max(Date.now(), sub.trialEndsAt.getTime());
      const trialEndsAt = new Date(from + input.days * DAY_MS);
      await tx
        .update(subscriptions)
        .set({ status: "trialing", trialEndsAt })
        .where(eq(subscriptions.id, sub.id));
      await writeAudit(tx, { orgId: null, userId: admin.userId }, {
        action: "platform.subscription.extend_trial",
        entityType: "subscription",
        entityId: sub.id,
        before: { orgId: input.orgId, status: sub.status, trialEndsAt: sub.trialEndsAt },
        after: { orgId: input.orgId, status: "trialing", trialEndsAt, days: input.days },
      });
      revalidatePath(`/platform/orgs/${input.orgId}`);
      revalidatePath("/platform/orgs");
      return { trialEndsAt: trialEndsAt.toISOString() };
    }),
  );
}
