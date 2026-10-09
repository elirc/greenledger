"use client";

/**
 * Outbox helpers (ARCHITECTURE §6). Forms call `submitWithOfflineFallback`:
 * online → the Server Action runs as usual; a NETWORK failure (not a
 * validation error) enqueues the op locally. The badge flushes the queue on
 * `online`, app focus and manual taps via POST /api/sync.
 */

import { useCallback, useEffect, useState } from "react";
import { liveQuery } from "dexie";
import type { ActionResult } from "@/lib/action";
import { offlineDb, type OutboxRow } from "./db";

export interface SyncOpResult {
  id: string;
  status: "applied" | "duplicate" | "rejected";
  error?: string;
  code?: string;
}

/** True for fetch/network transport failures — not business rejections. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return (
    e instanceof TypeError ||
    (e instanceof Error && /fetch failed|Failed to fetch|NetworkError|ECONN/i.test(e.message))
  );
}

export async function enqueueOp(
  id: string,
  kind: string,
  payload: unknown,
): Promise<void> {
  await offlineDb.outbox.put({
    id,
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  });
}

export type OfflineSubmitOutcome<T> =
  | { kind: "result"; result: ActionResult<T> }
  | { kind: "queued" };

/**
 * The canonical form-submit wrapper for offline-capable ops. `input` MUST
 * carry the clientId used as `opId`.
 */
export async function submitWithOfflineFallback<T>(
  action: (input: never) => Promise<ActionResult<T>>,
  opKind: string,
  opId: string,
  input: unknown,
): Promise<OfflineSubmitOutcome<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await enqueueOp(opId, opKind, input);
    return { kind: "queued" };
  }
  try {
    const result = await action(input as never);
    return { kind: "result", result };
  } catch (e) {
    if (isNetworkError(e)) {
      await enqueueOp(opId, opKind, input);
      return { kind: "queued" };
    }
    throw e;
  }
}

/** Flush pending ops. Returns per-op results; safe to call repeatedly. */
export async function flushOutbox(): Promise<SyncOpResult[]> {
  const pending = await offlineDb.outbox
    .where("status")
    .equals("pending")
    .sortBy("createdAt");
  if (pending.length === 0) return [];

  let results: SyncOpResult[];
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ops: pending.map((p) => ({ id: p.id, kind: p.kind, payload: p.payload })),
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results: SyncOpResult[] };
    results = data.results ?? [];
  } catch {
    return []; // still offline — try again later
  }

  for (const r of results) {
    if (r.status === "applied" || r.status === "duplicate") {
      await offlineDb.outbox.delete(r.id);
    } else {
      const row = await offlineDb.outbox.get(r.id);
      if (row) {
        await offlineDb.outbox.put({
          ...row,
          status: "rejected",
          attempts: row.attempts + 1,
          lastError: r.error ?? r.code ?? "Rejected",
        });
      }
    }
  }
  return results;
}

export interface OutboxStatus {
  pending: number;
  rejected: OutboxRow[];
  flush: () => Promise<void>;
  discardRejected: (id: string) => Promise<void>;
}

/** Live outbox state + auto-flush on online/focus. */
export function useOutbox(): OutboxStatus {
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState<OutboxRow[]>([]);

  useEffect(() => {
    const sub = liveQuery(async () => ({
      pending: await offlineDb.outbox.where("status").equals("pending").count(),
      rejected: await offlineDb.outbox.where("status").equals("rejected").toArray(),
    })).subscribe({
      next: (v) => {
        setPending(v.pending);
        setRejected(v.rejected);
      },
      error: () => {},
    });
    return () => sub.unsubscribe();
  }, []);

  const flush = useCallback(async () => {
    await flushOutbox();
  }, []);

  useEffect(() => {
    const onOnline = () => void flushOutbox();
    const onFocus = () => {
      if (navigator.onLine) void flushOutbox();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    void onFocus();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const discardRejected = useCallback(async (id: string) => {
    await offlineDb.outbox.delete(id);
  }, []);

  return { pending, rejected, flush, discardRejected };
}
