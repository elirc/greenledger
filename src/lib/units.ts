import { DomainError } from "./errors";

export type BaseUnit = "kg" | "g" | "l" | "ml" | "pcs";

export const UNIT_LABELS: Record<BaseUnit, string> = {
  kg: "kg",
  g: "g",
  l: "L",
  ml: "mL",
  pcs: "pieces",
};

const DIMENSION: Record<BaseUnit, "mass" | "volume" | "count"> = {
  kg: "mass",
  g: "mass",
  l: "volume",
  ml: "volume",
  pcs: "count",
};

/** Factor to the dimension's small unit (g, ml, pcs). */
const TO_SMALL: Record<BaseUnit, number> = {
  kg: 1000,
  g: 1,
  l: 1000,
  ml: 1,
  pcs: 1,
};

/** Convert within a dimension only (g↔kg, ml↔l ×1000). Cross-dimension throws. */
export function convert(qty: number, from: BaseUnit, to: BaseUnit): number {
  if (from === to) return qty;
  if (DIMENSION[from] !== DIMENSION[to]) {
    throw new DomainError("UNIT_MISMATCH", `Cannot convert ${from} to ${to}`);
  }
  return (qty * TO_SMALL[from]) / TO_SMALL[to];
}

function trimNumber(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

/**
 * Human quantity in the friendliest unit of its dimension:
 * <1 kg shows grams, ≥1000 g shows kg; same for l/ml. Max 3 decimals.
 */
export function formatQty(qty: number, baseUnit: BaseUnit): string {
  let unit: BaseUnit = baseUnit;
  let value = qty;
  if (baseUnit === "kg" && Math.abs(qty) < 1 && qty !== 0) {
    unit = "g";
    value = qty * 1000;
  } else if (baseUnit === "g" && Math.abs(qty) >= 1000) {
    unit = "kg";
    value = qty / 1000;
  } else if (baseUnit === "l" && Math.abs(qty) < 1 && qty !== 0) {
    unit = "ml";
    value = qty * 1000;
  } else if (baseUnit === "ml" && Math.abs(qty) >= 1000) {
    unit = "l";
    value = qty / 1000;
  }
  return `${trimNumber(value)} ${UNIT_LABELS[unit]}`;
}
