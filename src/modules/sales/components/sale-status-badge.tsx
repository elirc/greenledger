import { StatusBadge, type StatusVariant } from "@/components/common/status-badge";
import { SALE_STATUS_LABELS, type SaleStatus } from "../schema";

const VARIANT: Record<SaleStatus, StatusVariant> = {
  unpaid: "danger",
  part_paid: "warning",
  paid: "success",
};

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <StatusBadge variant={VARIANT[status]}>
      {SALE_STATUS_LABELS[status]}
    </StatusBadge>
  );
}
