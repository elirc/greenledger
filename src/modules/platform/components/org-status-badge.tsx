import { StatusBadge, type StatusVariant } from "@/components/common/status-badge";
import type { OrgStatus } from "@/lib/guard";

const VARIANT: Record<OrgStatus, StatusVariant> = {
  trial: "info",
  active: "success",
  read_only: "danger",
};
const LABEL: Record<OrgStatus, string> = {
  trial: "Trial",
  active: "Active",
  read_only: "Read-only",
};

/** Effective org status (computed by the guard predicate, not stored). */
export function OrgStatusBadge({ status }: { status: OrgStatus }) {
  return <StatusBadge variant={VARIANT[status]}>{LABEL[status]}</StatusBadge>;
}
