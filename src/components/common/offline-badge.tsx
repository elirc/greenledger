"use client";

import * as React from "react";
import { CloudOff } from "lucide-react";

/**
 * Stub — Phase 6 extends this with the Dexie outbox pending count.
 * Shows an amber pill whenever the browser reports it is offline.
 */
export function OfflineBadge() {
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warning/30 bg-status-warning/15 px-2.5 py-1 text-xs font-medium text-status-warning">
      <CloudOff className="size-3.5" />
      Offline — changes will sync
    </span>
  );
}
