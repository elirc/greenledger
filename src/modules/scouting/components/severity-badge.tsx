import { StatusBadge, type StatusVariant } from "@/components/common/status-badge";
import { SEVERITY_LABELS, type ScoutingSeverity } from "../schema";

const VARIANT: Record<ScoutingSeverity, StatusVariant> = {
  low: "info",
  medium: "warning",
  high: "danger",
};

export function SeverityBadge({ severity }: { severity: ScoutingSeverity }) {
  return (
    <StatusBadge variant={VARIANT[severity]}>
      {SEVERITY_LABELS[severity]}
    </StatusBadge>
  );
}
