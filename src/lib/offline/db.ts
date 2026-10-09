"use client";

/**
 * Dexie (IndexedDB) store for offline work (ARCHITECTURE §6):
 * - outbox: queued mutations, id = the client mutation UUID (sync_ops PK)
 * - refCache: form reference data so entry forms open offline
 */

import Dexie, { type EntityTable } from "dexie";

export interface OutboxRow {
  /** Client mutation UUID — also the business row's PK server-side. */
  id: string;
  kind: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: "pending" | "rejected";
}

export interface RefCacheRow {
  key: string;
  data: unknown;
  fetchedAt: number;
}

const dexie = new Dexie("greenledger-offline") as Dexie & {
  outbox: EntityTable<OutboxRow, "id">;
  refCache: EntityTable<RefCacheRow, "key">;
};

dexie.version(1).stores({
  outbox: "id, status, createdAt",
  refCache: "key",
});

export const offlineDb = dexie;
