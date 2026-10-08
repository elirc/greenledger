import { StatusBadge } from "@/components/common/status-badge";
import { EXPIRY_WARN_DAYS } from "@/lib/alerts";
import { addDays, formatLagosDate, todayLagos } from "@/lib/dates";

/** Expiry date chip: expired / ≤30d danger, ≤60d warning, else neutral. */
export function ExpiryBadge({ expiryDate }: { expiryDate: string | null }) {
  if (!expiryDate) return <StatusBadge>No expiry</StatusBadge>;
  const today = todayLagos();
  const [warnDays, dangerDays] = EXPIRY_WARN_DAYS;
  const label = formatLagosDate(expiryDate);
  if (expiryDate < today) {
    return <StatusBadge variant="danger">Expired {label}</StatusBadge>;
  }
  if (expiryDate <= addDays(today, dangerDays)) {
    return <StatusBadge variant="danger">Exp {label}</StatusBadge>;
  }
  if (expiryDate <= addDays(today, warnDays)) {
    return <StatusBadge variant="warning">Exp {label}</StatusBadge>;
  }
  return <StatusBadge>Exp {label}</StatusBadge>;
}
