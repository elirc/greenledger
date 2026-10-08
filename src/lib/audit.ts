import type { Db, Tx } from "@/db";
import { auditLog } from "@/db/schema";

/**
 * Every create, update, override and approval writes exactly one audit row,
 * inside the same transaction as the change (spec rule).
 */
export async function writeAudit(
  tx: Db | Tx,
  actor: { orgId: string | null; userId: string | null },
  entry: {
    action: string;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    organisationId: actor.orgId,
    userId: actor.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  });
}
