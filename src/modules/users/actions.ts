"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { greenhouseAssignments, greenhouses, member, user } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { Ctx } from "@/lib/guard";
import { newId } from "@/lib/ids";
import {
  normalizeNigerianPhone,
  staffCreateSchema,
  staffRemoveSchema,
  staffUpdateSchema,
  tempEmailForPhone,
} from "./schema";

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "cause" in e &&
    (e as { cause?: { code?: string } }).cause?.code === "23505"
  );
}

/** Workers get the requested greenhouses; every other role gets none. */
function effectiveGreenhouseIds(role: string, ids: string[]): string[] {
  return role === "worker" ? [...new Set(ids)] : [];
}

/** Every requested greenhouse must belong to this organisation. */
async function assertOrgGreenhouses(tx: Tx, ctx: Ctx, ids: string[]) {
  if (ids.length === 0) return;
  const found = await tx
    .select({ id: greenhouses.id })
    .from(greenhouses)
    .where(
      and(
        eq(greenhouses.organisationId, ctx.orgId),
        inArray(greenhouses.id, ids),
      ),
    );
  if (found.length !== ids.length) {
    throw new DomainError(
      "INVALID_GREENHOUSE",
      "One or more selected greenhouses no longer exist.",
    );
  }
}

async function replaceAssignments(
  tx: Tx,
  ctx: Ctx,
  userId: string,
  ids: string[],
) {
  await tx
    .delete(greenhouseAssignments)
    .where(
      and(
        eq(greenhouseAssignments.organisationId, ctx.orgId),
        eq(greenhouseAssignments.userId, userId),
      ),
    );
  if (ids.length > 0) {
    await tx.insert(greenhouseAssignments).values(
      ids.map((greenhouseId) => ({
        organisationId: ctx.orgId,
        userId,
        greenhouseId,
      })),
    );
  }
}

async function currentAssignmentIds(tx: Tx, ctx: Ctx, userId: string) {
  const rows = await tx
    .select({ greenhouseId: greenhouseAssignments.greenhouseId })
    .from(greenhouseAssignments)
    .where(
      and(
        eq(greenhouseAssignments.organisationId, ctx.orgId),
        eq(greenhouseAssignments.userId, userId),
      ),
    );
  return rows.map((r) => r.greenhouseId);
}

/** Lock and load a membership of THIS organisation. */
async function lockMember(tx: Tx, ctx: Ctx, memberId: string) {
  const [row] = await tx
    .select({ id: member.id, userId: member.userId, role: member.role })
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, ctx.orgId)))
    .for("update");
  if (!row) throw new DomainError("NOT_FOUND", "Staff member not found.");
  return row;
}

/**
 * Add a staff member by phone. Creates the Better Auth `user` row directly
 * (phone unverified, placeholder email) unless one already exists for that
 * phone, then the `member` row and worker greenhouse assignments — one tx.
 * The person signs in later with phone OTP.
 */
export const createStaff = defineAction({
  name: "users.create",
  schema: staffCreateSchema,
  roles: ["owner"],
  handler: async (input, ctx) => {
    const phone = normalizeNigerianPhone(input.phone);
    if (!phone) {
      throw new DomainError("INVALID_PHONE", "Enter a valid Nigerian phone number.");
    }
    const ghIds = effectiveGreenhouseIds(input.role, input.greenhouseIds);
    try {
      return await db.transaction(async (tx) => {
        await assertOrgGreenhouses(tx, ctx, ghIds);

        // Lock an existing user row so concurrent adds can't double-member.
        const [existing] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.phoneNumber, phone))
          .for("update");

        let userId: string;
        let createdUser = false;
        if (existing) {
          userId = existing.id;
          const [already] = await tx
            .select({ id: member.id })
            .from(member)
            .where(
              and(
                eq(member.userId, userId),
                eq(member.organizationId, ctx.orgId),
              ),
            );
          if (already) {
            throw new DomainError(
              "DUPLICATE",
              "This person is already on your farm.",
            );
          }
        } else {
          userId = newId();
          await tx.insert(user).values({
            id: userId,
            name: input.name,
            email: tempEmailForPhone(phone),
            emailVerified: false,
            phoneNumber: phone,
            phoneNumberVerified: false,
          });
          createdUser = true;
        }

        const memberId = newId();
        await tx.insert(member).values({
          id: memberId,
          organizationId: ctx.orgId,
          userId,
          role: input.role,
          createdAt: new Date(),
        });
        await replaceAssignments(tx, ctx, userId, ghIds);

        await writeAudit(tx, ctx, {
          action: "users.create",
          entityType: "member",
          entityId: memberId,
          after: {
            userId,
            name: input.name,
            phone,
            role: input.role,
            greenhouseIds: ghIds,
            createdUser,
          },
        });
        revalidatePath("/settings/users");
        return { id: memberId };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError(
          "DUPLICATE",
          "Someone with this phone number was just added. Refresh and check the list.",
        );
      }
      throw e;
    }
  },
});

/** Change a member's role and/or worker greenhouse assignments. */
export const updateStaff = defineAction({
  name: "users.update",
  schema: staffUpdateSchema,
  roles: ["owner"],
  handler: async (input, ctx) => {
    const ghIds = effectiveGreenhouseIds(input.role, input.greenhouseIds);
    return db.transaction(async (tx) => {
      const before = await lockMember(tx, ctx, input.memberId);
      if (before.userId === ctx.userId && before.role !== input.role) {
        throw new DomainError(
          "SELF_ROLE",
          "You can't change your own role. Ask another owner to do it.",
        );
      }
      await assertOrgGreenhouses(tx, ctx, ghIds);
      const beforeGh = await currentAssignmentIds(tx, ctx, before.userId);

      await tx
        .update(member)
        .set({ role: input.role })
        .where(
          and(eq(member.id, input.memberId), eq(member.organizationId, ctx.orgId)),
        );
      await replaceAssignments(tx, ctx, before.userId, ghIds);

      await writeAudit(tx, ctx, {
        action: "users.update",
        entityType: "member",
        entityId: input.memberId,
        before: { role: before.role, greenhouseIds: beforeGh },
        after: { role: input.role, greenhouseIds: ghIds },
      });
      revalidatePath("/settings/users");
      revalidatePath(`/settings/users/${input.memberId}`);
      return { id: input.memberId };
    });
  },
});

/** Remove a person from this farm: member + assignments. The user row stays. */
export const removeStaff = defineAction({
  name: "users.remove",
  schema: staffRemoveSchema,
  roles: ["owner"],
  handler: async (input, ctx) => {
    return db.transaction(async (tx) => {
      const before = await lockMember(tx, ctx, input.memberId);
      if (before.userId === ctx.userId) {
        throw new DomainError(
          "SELF_REMOVE",
          "You can't remove yourself from the farm.",
        );
      }
      const beforeGh = await currentAssignmentIds(tx, ctx, before.userId);
      await replaceAssignments(tx, ctx, before.userId, []);
      await tx
        .delete(member)
        .where(
          and(eq(member.id, input.memberId), eq(member.organizationId, ctx.orgId)),
        );
      await writeAudit(tx, ctx, {
        action: "users.remove",
        entityType: "member",
        entityId: input.memberId,
        before: {
          userId: before.userId,
          role: before.role,
          greenhouseIds: beforeGh,
        },
      });
      revalidatePath("/settings/users");
      return { id: input.memberId };
    });
  },
});
