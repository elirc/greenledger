import { StatusBadge, type StatusVariant } from "@/components/common/status-badge";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

const ROLE_VARIANT: Record<Role, StatusVariant> = {
  owner: "success",
  manager: "info",
  storekeeper: "warning",
  worker: "neutral",
};

export function RoleBadge({ role }: { role: Role | null }) {
  if (!role) return <StatusBadge variant="danger">Unknown role</StatusBadge>;
  return <StatusBadge variant={ROLE_VARIANT[role]}>{ROLE_LABELS[role]}</StatusBadge>;
}
