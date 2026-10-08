import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { greenhouseAssignments, greenhouses, member, user } from "@/db/schema";
import type { Ctx } from "@/lib/guard";
import { ROLES, type Role } from "@/lib/permissions";

/** Every query takes ctx and filters by ctx.orgId — no exceptions. No money here. */

function asRole(value: string): Role | null {
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}

export async function listStaff(ctx: Ctx) {
  const rows = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      phoneNumberVerified: user.phoneNumberVerified,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.orgId))
    .orderBy(asc(member.createdAt));

  const counts = await db
    .select({
      userId: greenhouseAssignments.userId,
      n: count(),
    })
    .from(greenhouseAssignments)
    .where(eq(greenhouseAssignments.organisationId, ctx.orgId))
    .groupBy(greenhouseAssignments.userId);
  const countByUser = new Map(counts.map((c) => [c.userId, Number(c.n)]));

  return rows.map((r) => ({
    ...r,
    role: asRole(r.role),
    phoneNumberVerified: Boolean(r.phoneNumberVerified),
    greenhouseCount: countByUser.get(r.userId) ?? 0,
    isSelf: r.userId === ctx.userId,
  }));
}

export async function getStaffMember(ctx: Ctx, memberId: string) {
  const [row] = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      phoneNumberVerified: user.phoneNumberVerified,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.id, memberId), eq(member.organizationId, ctx.orgId)))
    .limit(1);
  if (!row) return null;

  const assigned = await db
    .select({ greenhouseId: greenhouseAssignments.greenhouseId })
    .from(greenhouseAssignments)
    .where(
      and(
        eq(greenhouseAssignments.organisationId, ctx.orgId),
        eq(greenhouseAssignments.userId, row.userId),
      ),
    );

  return {
    ...row,
    role: asRole(row.role),
    phoneNumberVerified: Boolean(row.phoneNumberVerified),
    greenhouseIds: assigned.map((a) => a.greenhouseId),
    isSelf: row.userId === ctx.userId,
  };
}

/** Options for the worker greenhouse multi-select. */
export async function listGreenhouseOptions(ctx: Ctx) {
  return db
    .select({ id: greenhouses.id, name: greenhouses.name })
    .from(greenhouses)
    .where(
      and(
        eq(greenhouses.organisationId, ctx.orgId),
        eq(greenhouses.isActive, true),
      ),
    )
    .orderBy(asc(greenhouses.name));
}
