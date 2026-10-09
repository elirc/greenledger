import Link from "next/link";
import { MoneyText } from "@/components/common/money-text";
import { StatusBadge } from "@/components/common/status-badge";
import { dueBadge, EQUIPMENT_STATUS_VARIANTS } from "../logic";
import type { EquipmentListRow } from "../queries";
import {
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABELS,
  equipmentCategoryLabel,
} from "../schema";

/** Register grouped by status (operational → retired), each with a badge. */
export function EquipmentList({
  rows,
  today,
  showMoney,
}: {
  rows: EquipmentListRow[];
  today: string;
  showMoney: boolean;
}) {
  return (
    <div className="space-y-6">
      {EQUIPMENT_STATUSES.map((status) => {
        const group = rows.filter((r) => r.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status} aria-labelledby={`eq-${status}`} className="space-y-2">
            <h2
              id={`eq-${status}`}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <StatusBadge variant={EQUIPMENT_STATUS_VARIANTS[status]}>
                {EQUIPMENT_STATUS_LABELS[status]}
              </StatusBadge>
              <span className="text-muted-foreground">{group.length}</span>
            </h2>
            <ul className="divide-border divide-y rounded-lg border">
              {group.map((e) => {
                const due =
                  e.nextDueDate && status !== "retired"
                    ? dueBadge(e.nextDueDate, today)
                    : null;
                const where = [e.greenhouseName ?? e.siteName, e.locationNote]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={e.id}>
                    <Link
                      href={`/equipment/${e.id}`}
                      className="hover:bg-muted/50 flex min-h-14 items-center justify-between gap-3 px-4 py-2"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-medium">{e.name}</span>
                        <span className="text-muted-foreground truncate text-sm">
                          {[equipmentCategoryLabel(e.category), where]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {due && due.variant !== "success" ? (
                          <StatusBadge variant={due.variant}>{due.label}</StatusBadge>
                        ) : null}
                        {showMoney ? (
                          <MoneyText kobo={e.costKobo} className="text-sm" />
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
