import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import type { Ctx } from "@/lib/guard";

/**
 * The in-app feed: rows are per user (DECISIONS §8), so every query filters
 * by BOTH ctx.orgId and ctx.userId. No money columns exist on this table.
 */
export async function listNotifications(ctx: Ctx, limit = 30) {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      entityType: notifications.entityType,
      entityId: notifications.entityId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.organisationId, ctx.orgId),
        eq(notifications.userId, ctx.userId),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(Math.max(1, Math.trunc(limit) || 30), 100));
}

export async function countUnreadNotifications(ctx: Ctx): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.organisationId, ctx.orgId),
        eq(notifications.userId, ctx.userId),
        isNull(notifications.readAt),
      ),
    );
  return row?.n ?? 0;
}

export type NotificationRow = Awaited<ReturnType<typeof listNotifications>>[number];
