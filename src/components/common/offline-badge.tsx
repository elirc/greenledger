"use client";

import * as React from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { useOutbox } from "@/lib/offline/outbox";

/**
 * Shell-mounted sync indicator: offline pill, pending-outbox count with a
 * manual flush, and a rejected-count hint. useOutbox also auto-flushes on
 * `online` and app focus.
 */
export function OfflineBadge() {
  const [offline, setOffline] = React.useState(false);
  const { pending, rejected, flush } = useOutbox();

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

  if (offline) {
    return (
      <span className="border-status-warning/30 bg-status-warning/15 text-status-warning inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
        <CloudOff className="size-3.5" />
        Offline{pending > 0 ? ` — ${pending} saved to sync` : " — changes will sync"}
      </span>
    );
  }

  if (pending > 0) {
    return (
      <button
        type="button"
        onClick={() => void flush()}
        className="border-status-info/30 bg-status-info/15 text-status-info inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      >
        <RefreshCw className="size-3.5" />
        Sync {pending} {pending === 1 ? "entry" : "entries"}
      </button>
    );
  }

  if (rejected.length > 0) {
    return (
      <span className="border-status-danger/30 bg-status-danger/15 text-status-danger inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
        {rejected.length} failed to sync
      </span>
    );
  }

  return null;
}
