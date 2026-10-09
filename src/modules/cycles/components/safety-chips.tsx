import { ShieldAlert, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { formatLagos, formatLagosDate } from "@/lib/dates";

/**
 * PHI/REI state read from greenhouses.entry_safe_at / harvest_safe_date
 * (DECISIONS §7). Green when null or past, red with the time/date while in
 * the future. `now` / `today` come from the server so every viewer agrees.
 */
export function SafetyChips({
  entrySafeAt,
  harvestSafeDate,
  now,
  today,
}: {
  entrySafeAt: Date | string | null;
  /** yyyy-MM-dd Lagos date; harvest is allowed ON this date. */
  harvestSafeDate: string | null;
  /** ISO timestamp. */
  now: string;
  /** yyyy-MM-dd Lagos date. */
  today: string;
}) {
  const entryBlocked =
    entrySafeAt !== null &&
    new Date(entrySafeAt).getTime() > new Date(now).getTime();
  const harvestBlocked = harvestSafeDate !== null && harvestSafeDate > today;

  return (
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
  );
}
