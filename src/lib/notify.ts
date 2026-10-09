/**
 * Notification fan-out helper (ARCHITECTURE §12, DECISIONS §8).
 * Per-user rows with a dedup key so daily scans never spam:
 * unique (org, user, dedup_key) WHERE dedup_key IS NOT NULL → insert
 * ON CONFLICT DO NOTHING.
 */

import { and, eq, inArray } from "drizzle-orm";
import { member, notifications } from "@/db/schema";
import type { Db, Tx } from "@/db";
import type { Role } from "./permissions";

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  /** Stable key per logical alert, e.g. `exp:<batchId>:30`. */
  dedupKey?: string;
}

/** One notification row per member holding any of `roles` in the org. */
export async function notifyRole(
  db: Db | Tx,
  orgId: string,
  roles: Role[],
  input: NotifyInput,
): Promise<number> {
  const members = await db
    .select({ userId: member.userId })
    .from(member)
    .where(
      and(eq(member.organizationId, orgId), inArray(member.role, roles)),
    );
  if (members.length === 0) return 0;
  const rows = members.map((m) => ({
    organisationId: orgId,
    userId: m.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    dedupKey: input.dedupKey ?? null,
  }));
  const inserted = await db
    .insert(notifications)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return inserted.length;
}

/** One notification for a specific user. */
export async function notifyUser(
  db: Db | Tx,
  orgId: string,
  userId: string,
  input: NotifyInput,
): Promise<boolean> {
  const inserted = await db
    .insert(notifications)
    .values({
      organisationId: orgId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      dedupKey: input.dedupKey ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return inserted.length > 0;
}
