import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  greenhouseAssignments,
  member,
  organization,
  subscriptions,
} from "@/db/schema";
import { auth } from "./auth";
import { AuthError } from "./errors";
import { ROLES, type Role } from "./permissions";

export type OrgStatus = "trial" | "active" | "read_only";

export interface Ctx {
  userId: string;
  orgId: string;
  role: Role;
  user: {
    id: string;
    name: string;
    phoneNumber: string | null;
    isPlatformAdmin: boolean;
  };
  org: { id: string; name: string; status: OrgStatus };
  /** null = unrestricted (non-workers). Workers see only assigned greenhouses. */
  assignedGreenhouseIds: string[] | null;
  canSeeMoney: boolean;
}

type SubscriptionRow = {
  status: "trialing" | "active" | "past_due" | "cancelled";
  trialEndsAt: Date;
} | null;

/** DATA-MODEL §4.12: read_only ⇔ expired trial, past_due or cancelled. */
export function computeOrgStatus(sub: SubscriptionRow): OrgStatus {
  if (!sub) {
    // No subscription row yet (org mid-setup). Writable; billing check will create one.
    console.warn("[guard] organisation has no subscription row; treating as trial");
    return "trial";
  }
  if (sub.status === "active") return "active";
  if (sub.status === "trialing") {
    return sub.trialEndsAt.getTime() < Date.now() ? "read_only" : "trial";
  }
  return "read_only"; // past_due | cancelled
}

type SessionUser = {
  id: string;
  name: string;
  phoneNumber?: string | null;
  isPlatformAdmin?: boolean | null;
};

async function getSessionOrThrow() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AuthError("UNAUTHENTICATED");
  return session;
}

/**
 * The one true guard. Resolves {user, organisation, role} for the request,
 * throws AuthError otherwise. Every query downstream must filter by ctx.orgId.
 */
export async function requireMember(opts?: { roles?: Role[] }): Promise<Ctx> {
  const session = await getSessionOrThrow();
  const sessionUser = session.user as unknown as SessionUser;
  const userId = sessionUser.id;

  const activeOrgId =
    (session.session as unknown as { activeOrganizationId?: string | null })
      .activeOrganizationId ?? null;

  let membership = activeOrgId
    ? await db.query.member.findFirst({
        where: and(
          eq(member.userId, userId),
          eq(member.organizationId, activeOrgId),
        ),
      })
    : undefined;
  membership ??= await db.query.member.findFirst({
    where: eq(member.userId, userId),
    orderBy: asc(member.createdAt),
  });
  if (!membership) throw new AuthError("NO_ORG");

  const role = (ROLES as readonly string[]).includes(membership.role)
    ? (membership.role as Role)
    : null;
  if (!role) throw new AuthError("FORBIDDEN", "Unknown role");
  if (opts?.roles && !opts.roles.includes(role)) throw new AuthError("FORBIDDEN");

  const orgId = membership.organizationId;
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });
  if (!org) throw new AuthError("NO_ORG");

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.organisationId, orgId),
  });

  let assignedGreenhouseIds: string[] | null = null;
  if (role === "worker") {
    const rows = await db
      .select({ greenhouseId: greenhouseAssignments.greenhouseId })
      .from(greenhouseAssignments)
      .where(
        and(
          eq(greenhouseAssignments.organisationId, orgId),
          eq(greenhouseAssignments.userId, userId),
        ),
      );
    assignedGreenhouseIds = rows.map((r) => r.greenhouseId);
  }

  return {
    userId,
    orgId,
    role,
    user: {
      id: userId,
      name: sessionUser.name,
      phoneNumber: sessionUser.phoneNumber ?? null,
      isPlatformAdmin: Boolean(sessionUser.isPlatformAdmin),
    },
    org: {
      id: orgId,
      name: org.name,
      status: computeOrgStatus(sub ?? null),
    },
    assignedGreenhouseIds,
    canSeeMoney: role !== "worker",
  };
}

export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const session = await getSessionOrThrow();
  const sessionUser = session.user as unknown as SessionUser;
  if (!sessionUser.isPlatformAdmin) throw new AuthError("FORBIDDEN");
  return { userId: sessionUser.id };
}

/** Mutations are blocked for read-only organisations (billing lockout). */
export function assertWritable(ctx: Ctx): void {
  if (ctx.org.status === "read_only") throw new AuthError("READ_ONLY");
}

/** Workers may only act on greenhouses they are assigned to. */
export function assertGreenhouse(ctx: Ctx, greenhouseId: string): void {
  if (
    ctx.assignedGreenhouseIds &&
    !ctx.assignedGreenhouseIds.includes(greenhouseId)
  ) {
    throw new AuthError("FORBIDDEN", "You are not assigned to this greenhouse.");
  }
}
