"use client";

/**
 * Form reference-data cache (ARCHITECTURE §6): every online visit of an
 * entry form writes its server-loaded refs into Dexie `refCache`; when the
 * phone is offline the form renders from the last cached copy instead
 * (SWR-style), so entry forms keep working in the field.
 */

import { useEffect, useState } from "react";
import { offlineDb } from "./db";

/**
 * Returns `serverData` while online (and caches it under `key`); returns the
 * cached copy when offline and one exists. IndexedDB failures (private
 * mode, quota) silently fall back to `serverData`.
 */
export function useCachedRefs<T>(key: string, serverData: T): T {
  const [cached, setCached] = useState<{ key: string; data: T } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (navigator.onLine) {
      offlineDb.refCache
        .put({ key, data: serverData, fetchedAt: Date.now() })
        .catch(() => {});
    } else {
      offlineDb.refCache
        .get(key)
        .then((row) => {
          if (!cancelled && row) setCached({ key, data: row.data as T });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [key, serverData]);

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return offline && cached && cached.key === key ? cached.data : serverData;
}
