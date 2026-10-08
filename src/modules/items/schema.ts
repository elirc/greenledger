import { z } from "zod";
import type { BaseUnit } from "@/lib/units";

/** Shared between the client form (zodResolver) and the server actions. */

export const ITEM_CATEGORIES = [
  "seed",
  "growing_media",
  "fertiliser",
  "agrochemical",
  "packaging",
  "consumable",
  "spare_part",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  seed: "Seed",
  growing_media: "Growing media",
  fertiliser: "Fertiliser",
  agrochemical: "Agrochemical",
  packaging: "Packaging",
  consumable: "Consumable",
  spare_part: "Spare part",
};

export const BASE_UNITS = ["kg", "g", "l", "ml", "pcs"] as const satisfies
  readonly BaseUnit[];

/** Categories where an empty expiry date on receipt deserves a warning. */
export const EXPIRY_EXPECTED_CATEGORIES: readonly ItemCategory[] = [
  "agrochemical",
  "fertiliser",
];

export const MOVEMENT_TYPE_LABELS = {
  receive: "Received",
  issue: "Issued",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  adjustment: "Adjustment",
  return: "Returned",
} as const;

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const pct = z
  .number({ error: "Enter a percentage" })
  .min(0, "Cannot be negative")
  .max(100, "At most 100%")
  .optional();

const itemFields = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  category: z.enum(ITEM_CATEGORIES, { error: "Pick a category" }),
  baseUnit: z.enum(BASE_UNITS, { error: "Pick a unit" }),
  reorderLevel: z
    .number({ error: "Enter a reorder level (0 for none)" })
    .min(0, "Cannot be negative")
    .max(99_999_999_999, "Too large"),
  // Agrochemicals only.
  activeIngredient: optionalText(200),
  phiDays: z
    .number({ error: "Enter the PHI in days" })
    .int("Whole days only")
    .min(0, "Cannot be negative")
    .max(365, "At most 365 days")
    .optional(),
  reiHours: z
    .number({ error: "Enter the REI in hours" })
    .int("Whole hours only")
    .min(0, "Cannot be negative")
    .max(2_000, "At most 2000 hours")
    .optional(),
  // Fertilisers only.
  nPct: pct,
  pPct: pct,
  kPct: pct,
  notes: optionalText(1000),
  isActive: z.boolean(),
});

type ItemFields = z.infer<typeof itemFields>;

/**
 * Category rules (DATA-MODEL §4.4): PHI/REI/active ingredient are required
 * for agrochemicals and forbidden otherwise; N/P/K only for fertilisers.
 */
function categoryRules(v: ItemFields, ctx: z.RefinementCtx) {
  const isChem = v.category === "agrochemical";
  const isFert = v.category === "fertiliser";
  const hasText = (s: string | undefined) => !!s && s.trim().length > 0;

  if (isChem) {
    if (!hasText(v.activeIngredient)) {
      ctx.addIssue({
        code: "custom",
        path: ["activeIngredient"],
        message: "Required for agrochemicals",
      });
    }
    if (v.phiDays === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["phiDays"],
        message: "PHI (days) is required for agrochemicals",
      });
    }
    if (v.reiHours === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["reiHours"],
        message: "REI (hours) is required for agrochemicals",
      });
    }
  } else {
    const msg = "Only for agrochemicals";
    if (hasText(v.activeIngredient)) {
      ctx.addIssue({ code: "custom", path: ["activeIngredient"], message: msg });
    }
    if (v.phiDays !== undefined) {
      ctx.addIssue({ code: "custom", path: ["phiDays"], message: msg });
    }
    if (v.reiHours !== undefined) {
      ctx.addIssue({ code: "custom", path: ["reiHours"], message: msg });
    }
  }

  if (!isFert) {
    for (const key of ["nPct", "pPct", "kPct"] as const) {
      if (v[key] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Only for fertilisers",
        });
      }
    }
  }
}

export const itemCreateSchema = itemFields.superRefine(categoryRules);

export const itemUpdateSchema = itemFields
  .extend({ id: z.uuid() })
  .superRefine(categoryRules);

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
