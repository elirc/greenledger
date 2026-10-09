import { formatLagosDate } from "@/lib/dates";
import type { PlantLossRow } from "../queries";
import { lossCauseLabel } from "../schema";

const numberFmt = new Intl.NumberFormat("en-NG");

/** Plant losses: date, count, cause (+note), who logged it. */
export function LossList({ rows }: { rows: PlantLossRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No losses logged — good news.
      </p>
    );
  }
  return (
    <ul className="divide-border divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex min-h-14 items-start gap-3 py-2">
          <span className="text-status-danger w-16 shrink-0 pt-0.5 text-right font-semibold tabular-nums">
            −{numberFmt.format(r.count)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{lossCauseLabel(r.cause)}</p>
            {r.notes ? (
              <p className="text-muted-foreground text-sm break-words">
                {r.notes}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {formatLagosDate(r.date)} · {r.createdByName ?? "Unknown"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
