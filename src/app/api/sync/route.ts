/**
 * Offline-sync endpoint (ARCHITECTURE §6). Batch of ops, per-op results,
 * idempotent via sync_ops insert-first (src/lib/sync-ops.ts). One rejection
 * never aborts the batch; the server wins on validation conflicts.
 */

import { z } from "zod";
import { AuthError, DomainError } from "@/lib/errors";
import { requireMember } from "@/lib/guard";
import { claimSyncOp, settleSyncOp } from "@/lib/sync-ops";
import { SYNC_OPS } from "@/modules/sync/registry";
import type { Ctx } from "@/lib/guard";

const bodySchema = z.object({
  ops: z
    .array(
      z.object({
        id: z.uuid(),
        kind: z.string().min(1).max(64),
        payload: z.unknown(),
      }),
    )
    .min(1)
    .max(100),
});

export type SyncOpResult = {
  id: string;
  status: "applied" | "duplicate" | "rejected";
  error?: string;
  code?: string;
};

function looksDuplicate(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { duplicate?: boolean }).duplicate === true
  );
}

export async function applySyncOp(
  ctx: Ctx,
  op: { id: string; kind: string; payload: unknown },
): Promise<SyncOpResult> {
  const entry = SYNC_OPS[op.kind];
  if (!entry) {
    return { id: op.id, status: "rejected", code: "UNKNOWN_KIND", error: `Unknown op kind ${op.kind}` };
  }
  const parsed = entry.schema.safeParse(op.payload);
  if (!parsed.success) {
    return { id: op.id, status: "rejected", code: "VALIDATION", error: "Invalid payload" };
  }

  const claim = await claimSyncOp(ctx, op.id, op.kind);
  if (!claim.claimed) {
    // Already processed (or mid-flight elsewhere): never re-apply.
    return claim.status === "failed"
      ? { id: op.id, status: "rejected", code: "PRIOR_FAILURE", error: claim.error ?? "Failed before" }
      : { id: op.id, status: "duplicate" };
  }

  try {
    const result = await entry.run(parsed.data as never, ctx);
    await settleSyncOp(op.id, { status: "applied", result: result ?? null });
    return { id: op.id, status: looksDuplicate(result) ? "duplicate" : "applied" };
  } catch (e) {
    // Belt-and-braces: the business row's client-UUID PK caught a replay.
    if (e instanceof DomainError && e.code === "DUPLICATE") {
      await settleSyncOp(op.id, { status: "applied", result: { duplicate: true } });
      return { id: op.id, status: "duplicate" };
    }
    const message =
      e instanceof DomainError || e instanceof AuthError
        ? e.message
        : "Could not apply this entry.";
    const code = e instanceof DomainError || e instanceof AuthError ? e.code : "INTERNAL";
    if (!(e instanceof DomainError) && !(e instanceof AuthError)) {
      console.error(`[sync:${op.kind}]`, e);
    }
    await settleSyncOp(op.id, { status: "failed", error: `${code}: ${message}` });
    return { id: op.id, status: "rejected", code, error: message };
  }
}

export async function POST(request: Request) {
  let ctx: Ctx;
  try {
    ctx = await requireMember();
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.code }, { status: 401 });
    }
    throw e;
  }
  if (ctx.org.status === "read_only") {
    return Response.json({ error: "READ_ONLY" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "VALIDATION" }, { status: 400 });
  }

  const results: SyncOpResult[] = [];
  for (const op of parsed.data.ops) {
    results.push(await applySyncOp(ctx, op));
  }
  return Response.json({ results });
}
