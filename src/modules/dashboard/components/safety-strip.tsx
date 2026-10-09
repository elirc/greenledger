import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLagos, formatLagosDate } from "@/lib/dates";
import type { GreenhouseSafetyRow } from "@/modules/greenhouse-status/queries";

/**
 * One chip per greenhouse, red (entry or harvest blocked) first — the query
 * already sorts them. Each chip links to the greenhouse card.
 */
export function SafetyStrip({ rows }: { rows: GreenhouseSafetyRow[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {rows.map((gh) => {
        const blocked = !gh.entrySafe || !gh.harvestSafe;
        const parts: string[] = [];
        if (!gh.entrySafe && gh.entrySafeAt) {
          parts.push(`no entry until ${formatLagos(gh.entrySafeAt, "dd MMM HH:mm")}`);
        }
        if (!gh.harvestSafe && gh.harvestSafeDate) {
          parts.push(`no harvest until ${formatLagosDate(gh.harvestSafeDate)}`);
        }
        return (
          <li key={gh.id}>
            <Link
              href={`/greenhouses/${gh.id}`}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
                blocked
                  ? "bg-status-danger/12 text-status-danger border-status-danger/25"
                  : "bg-status-success/12 text-status-success border-status-success/25",
              )}
            >
              {blocked ? (
                <ShieldAlert className="size-4 shrink-0" aria-hidden />
              ) : (
                <ShieldCheck className="size-4 shrink-0" aria-hidden />
              )}
              <span>{gh.name}</span>
              <span className="font-normal">
                {blocked ? `· ${parts.join(" · ")}` : "· safe"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
