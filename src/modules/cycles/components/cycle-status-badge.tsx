import {
  StatusBadge,
  type StatusVariant,
} from "@/components/common/status-badge";
import { CYCLE_STATUS_LABELS, type CycleStatus } from "../status";

const VARIANTS: Record<CycleStatus, StatusVariant> = {
  planned: "neutral",
  nursery: "info",
  growing: "success",
  harvesting: "warning",
  closed: "neutral",
};

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  return (
    <StatusBadge variant={VARIANTS[status]}>
      {CYCLE_STATUS_LABELS[status]}
    </StatusBadge>
  );
}
