import { CalendarClock } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { BEST_BEFORE_WARN_DAYS } from "@/lib/alerts";
import { formatLagosDate } from "@/lib/dates";
import { daysBetween } from "../schema";

/**
 * Best-before chip: danger when ≤ BEST_BEFORE_WARN_DAYS to go or past,
 * neutral otherwise. Pass `today` (Lagos yyyy-MM-dd) from the server.
 */
export function BestBeforeChip({
  bestBeforeDate,
  today,
}: {
  bestBeforeDate: string;
  today: string;
}) {
  const days = daysBetween(today, bestBeforeDate);
  const danger = days <= BEST_BEFORE_WARN_DAYS;
  const label =
    days < 0
      ? `Past best-before · ${formatLagosDate(bestBeforeDate)}`
      : days === 0
        ? "Best before today"
        : `Best before ${formatLagosDate(bestBeforeDate)} · ${days} d`;
  return (
    <StatusBadge variant={danger ? "danger" : "neutral"}>
      <CalendarClock className="size-3.5" aria-hidden />
      {label}
    </StatusBadge>
  );
}
