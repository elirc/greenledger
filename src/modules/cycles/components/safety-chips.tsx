import { ShieldAlert, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { formatLagos, formatLagosDate, lagosDateOf } from "@/lib/dates";
import { isEntrySafe, isHarvestSafe } from "@/modules/greenhouse-status/logic";

/**
 * PHI/REI state read from greenhouses.entry_safe_at / harvest_safe_date
 * (DECISIONS §7). Green when null or past, red with the time/date while in
 * the future. Pass `now` / `today` from the server so every viewer agrees;
 * when omitted they default to the current instant / its Lagos date.
 * Optional `lastSpray` adds a muted "last spray … · products" line (from
 * `getGreenhouseSafety` / `listGreenhouseSafety`).
 */
export function SafetyChips({
  entrySafeAt,
  harvestSafeDate,
  now,
  today,
  lastSpray,
}: {
  entrySafeAt: Date | string | null;
  /** yyyy-MM-dd Lagos date; harvest is allowed ON this date. */
  harvestSafeDate: string | null;
  /** ISO timestamp. */
  now?: string;
  /** yyyy-MM-dd Lagos date. */
  today?: string;
  lastSpray?: {
    appliedAt: Date | string;
    products: { name: string }[];
  } | null;
}) {
  const nowIso = now ?? new Date().toISOString();
  const todayLagos = today ?? lagosDateOf(new Date(nowIso));
  const entryBlocked = !isEntrySafe(entrySafeAt, nowIso);
  const harvestBlocked = !isHarvestSafe(harvestSafeDate, todayLagos);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {entryBlocked && entrySafeAt !== null ? (
          <StatusBadge variant="danger" className="px-3 py-1 text-sm">
            <ShieldAlert className="size-4" aria-hidden />
            No entry until {formatLagos(entrySafeAt, "dd MMM HH:mm")}
          </StatusBadge>
        ) : (
          <StatusBadge variant="success" className="px-3 py-1 text-sm">
            <ShieldCheck className="size-4" aria-hidden />
            Safe to enter
          </StatusBadge>
        )}
        {harvestBlocked && harvestSafeDate !== null ? (
          <StatusBadge variant="danger" className="px-3 py-1 text-sm">
            <ShieldAlert className="size-4" aria-hidden />
            No harvest until {formatLagosDate(harvestSafeDate)}
          </StatusBadge>
        ) : (
          <StatusBadge variant="success" className="px-3 py-1 text-sm">
            <ShieldCheck className="size-4" aria-hidden />
            Safe to harvest
          </StatusBadge>
        )}
      </div>
      {lastSpray ? (
        <p className="text-muted-foreground text-xs">
          Last spray {formatLagos(lastSpray.appliedAt, "dd MMM HH:mm")}
          {lastSpray.products.length > 0
            ? ` · ${lastSpray.products.map((p) => p.name).join(", ")}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
