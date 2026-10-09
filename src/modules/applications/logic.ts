/**
 * Pure fertigation/spray math. No DB. Unit tested in
 * tests/unit/recipe-scaling.test.ts and tests/unit/safety-dates.test.ts.
 */

import { addDays, lagosDateOf } from "@/lib/dates";
import { roundQty } from "@/modules/stock/logic";

export interface RecipeLineLike {
  itemId: string;
  /** Base units per 1,000 litres of water. */
  quantityPer1000l: number;
}

/** Spec: "Logging an application scales the recipe to the volume used." */
export function scaleRecipe(
  lines: RecipeLineLike[],
  waterVolumeLitres: number,
): { itemId: string; quantity: number }[] {
  if (waterVolumeLitres <= 0) return [];
  return lines
    .map((l) => ({
      itemId: l.itemId,
      quantity: roundQty((l.quantityPer1000l * waterVolumeLitres) / 1000),
    }))
    .filter((l) => l.quantity > 0);
}

export interface SafetyInput {
  /** Pre-harvest interval in days from the product label (null = none). */
  phiDays: number | null;
  /** Re-entry interval in hours from the product label (null = none). */
  reiHours: number | null;
}

export interface SafetyResult {
  /** UTC instant after which the greenhouse is safe to enter (null = no REI). */
  entrySafeAt: Date | null;
  /** Lagos calendar date from which harvest is allowed (null = no PHI). */
  harvestSafeDate: string | null;
}

/**
 * Spec: "A spray sets the greenhouse's entry-safe time and harvest-safe date
 * from the LONGEST intervals among the chemicals used." Fertigation never
 * sets safety windows.
 */
export function computeSafety(
  type: "fertigation" | "spray",
  appliedAt: Date,
  items: SafetyInput[],
): SafetyResult {
  if (type !== "spray") return { entrySafeAt: null, harvestSafeDate: null };

  const maxRei = Math.max(0, ...items.map((i) => i.reiHours ?? 0));
  const maxPhi = Math.max(0, ...items.map((i) => i.phiDays ?? 0));

  return {
    entrySafeAt:
      maxRei > 0 ? new Date(appliedAt.getTime() + maxRei * 3600_000) : null,
    harvestSafeDate:
      maxPhi > 0 ? addDays(lagosDateOf(appliedAt), maxPhi) : null,
  };
}

/** GREATEST(existing, incoming) for the greenhouse's denormalized columns. */
export function laterInstant(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export function laterDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}
