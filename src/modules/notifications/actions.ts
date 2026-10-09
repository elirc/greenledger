"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { defineAction } from "@/lib/action";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { markAllReadSchema, markReadSchema } from "./schema";

/**
 * Marking notifications read is allowed while the farm is read-only — it
 * only touches the user's own feed, not farm data.
 */

export const markNotificationRead = defineAction({
  name: "notifications.markRead",
  schema: markReadSchema,
  allowReadOnly: true,
  handler: async (input, ctx) =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.organisationId, ctx.orgId),
            eq(notifications.userId, ctx.userId),
            isNull(notifications.readAt),
          ),
        )
        .returning({ id: notifications.id });
      if (!row) {
        // Already read, or not this user's: idempotent no-op unless it doesn't exist.
        const exists = await tx
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.id, input.id),
              eq(notifications.organisationId, ctx.orgId),
              eq(notifications.userId, ctx.userId),
            ),
          )
          .limit(1);
        if (exists.length === 0) {
          throw new DomainError("NOT_FOUND", "Notification not found.");
        }
        return { id: input.id, changed: false };
      }
      await writeAudit(tx, ctx, {
        action: "notifications.markRead",
        entityType: "notification",
        entityId: row.id,
      });
      revalidatePath("/", "layout");
      return { id: row.id, changed: true };
    }),
});

export const markAllNotificationsRead = defineAction({
  name: "notifications.markAllRead",
  schema: markAllReadSchema,
  allowReadOnly: true,
  handler: async (_input, ctx) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.organisationId, ctx.orgId),
            eq(notifications.userId, ctx.userId),
            isNull(notifications.readAt),
          ),
        )
        .returning({ id: notifications.id });
      if (rows.length > 0) {
        await writeAudit(tx, ctx, {
          action: "notifications.markAllRead",
          entityType: "notification",
          after: { count: rows.length },
        });
      }
      revalidatePath("/", "layout");
      return { count: rows.length };
    }),
});
