/**
 * Offline-sync idempotency (DECISIONS §3): sync_ops PK = the client mutation
 * UUID; insert-first ON CONFLICT DO NOTHING. The business rows' own
 * client-UUID PKs are the belt-and-braces second layer.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { syncOps } from "@/db/schema";
import type { Ctx } from "./guard";

export type SyncOpStatus = "pending" | "applied" | "failed";

/**
 * Claim an op id. Returns `{ claimed: true }` when this call owns the op,
 * or the stored prior outcome when it was already processed.
 */
export async function claimSyncOp(
  ctx: Ctx,
  opId: string,
  kind: string,
): Promise<
  | { claimed: true }
  | { claimed: false; status: SyncOpStatus; result: unknown; error: string | null }
> {
  const inserted = await db
    .insert(syncOps)
    .values({
      id: opId,
      organisationId: ctx.orgId,
      userId: ctx.userId,
      kind,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning({ id: syncOps.id });
  if (inserted.length > 0) return { claimed: true };

  const [row] = await db
    .select({
      status: syncOps.status,
      result: syncOps.result,
      error: syncOps.error,
    })
    .from(syncOps)
    .where(eq(syncOps.id, opId));
  return {
    claimed: false,
    status: (row?.status ?? "pending") as SyncOpStatus,
    result: row?.result ?? null,
    error: row?.error ?? null,
  };
}

export async function settleSyncOp(
  opId: string,
  outcome:
    | { status: "applied"; result?: unknown }
    | { status: "failed"; error: string },
): Promise<void> {
  await db
    .update(syncOps)
    .set(
      outcome.status === "applied"
        ? { status: "applied", result: outcome.result ?? null, appliedAt: sql`now()` }
        : { status: "failed", error: outcome.error, appliedAt: sql`now()` },
    )
    .where(eq(syncOps.id, opId));
}
