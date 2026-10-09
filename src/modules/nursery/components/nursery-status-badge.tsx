import { StatusBadge, type StatusVariant } from "@/components/common/status-badge";
import { NURSERY_STATUS_LABELS, type NurseryStatus } from "../schema";

const VARIANTS: Record<NurseryStatus, StatusVariant> = {
  open: "info",
  transplanted: "success",
  discarded: "neutral",
};

export function NurseryStatusBadge({ status }: { status: NurseryStatus }) {
  return (
    <StatusBadge variant={VARIANTS[status]}>
      {NURSERY_STATUS_LABELS[status]}
    </StatusBadge>
  );
}
