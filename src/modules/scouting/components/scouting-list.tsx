import { ImageOff } from "lucide-react";
import { formatLagosDate } from "@/lib/dates";
import type { ScoutingLogRow } from "../queries";
import { SeverityBadge } from "./severity-badge";

/** Scouting history for one cycle (server-rendered, no interactivity). */
export function ScoutingList({ logs }: { logs: ScoutingLogRow[] }) {
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {logs.map((log) => (
        <li key={log.id} className="flex gap-3 p-3">
          {log.photoUrl ? (
            <a
              href={log.photoUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0"
              aria-label={`Open photo of ${log.pestOrDisease}`}
            >
              {/* Auth-checked /api/uploads stream — next/image can't optimise it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={log.photoUrl}
                alt={log.pestOrDisease}
                loading="lazy"
                decoding="async"
                className="bg-muted size-16 rounded-md border object-cover"
              />
            </a>
          ) : (
            <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-md border">
              <ImageOff className="text-muted-foreground size-5" aria-hidden />
              <span className="sr-only">No photo</span>
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-words">{log.pestOrDisease}</span>
              <SeverityBadge severity={log.severity} />
            </div>
            <p className="text-muted-foreground text-sm">
              {formatLagosDate(log.date)}
              {log.createdByName ? ` · ${log.createdByName}` : ""}
            </p>
            {log.actionTaken ? (
              <p className="text-sm break-words">
                <span className="text-muted-foreground">Action: </span>
                {log.actionTaken}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
