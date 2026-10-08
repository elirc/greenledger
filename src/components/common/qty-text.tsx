import { cn } from "cn";
import { formatQty, type BaseUnit } from "@/lib/units";

/** Renders a base-unit quantity with its display unit (e.g. 1.5 kg, 250 mL). */
export function QtyText({
  qty,
  unit,
  className,
}: {
  qty: number;
  unit: BaseUnit;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatQty(qty, unit)}
    </span>
  );
}
