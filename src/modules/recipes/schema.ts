import { z } from "zod";
import type { ItemCategory } from "@/modules/items/schema";

/** Shared between the client form (zodResolver) and the server actions. */

export const RECIPE_TYPES = ["fertigation", "spray"] as const;
export type RecipeType = (typeof RECIPE_TYPES)[number];

export const RECIPE_TYPE_LABELS: Record<RecipeType, string> = {
  fertigation: "Fertigation",
  spray: "Spray",
};

/**
 * Item categories offered first in the line picker for each type. Any
 * category is still allowed — the picker only filters by default.
 */
export const DEFAULT_CATEGORIES: Record<RecipeType, readonly ItemCategory[]> = {
  fertigation: ["fertiliser", "consumable"],
  spray: ["agrochemical"],
};

export const recipeLineSchema = z.object({
  itemId: z.uuid({ error: "Pick an item" }),
  /** Base units of the item per 1,000 litres of water. */
  quantityPer1000l: z
    .number({ error: "Enter a quantity" })
    .positive("Must be more than zero")
    .max(1_000_000, "Quantity is too large"),
});
export type RecipeLineInput = z.infer<typeof recipeLineSchema>;

const recipeFields = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  type: z.enum(RECIPE_TYPES, { error: "Pick a type" }),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  isActive: z.boolean(),
  lines: z
    .array(recipeLineSchema)
    .min(1, "Add at least one input")
    .max(50, "Too many inputs"),
});

/** The same item may appear only once per recipe (unique recipe_id+item_id). */
function uniqueLines(
  v: { lines: { itemId: string }[] },
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  v.lines.forEach((l, i) => {
    if (!l.itemId) return;
    if (seen.has(l.itemId)) {
      ctx.addIssue({
        code: "custom",
        message: "This input is already on the recipe",
        path: ["lines", i, "itemId"],
      });
    }
    seen.add(l.itemId);
  });
}

export const recipeCreateSchema = recipeFields.superRefine(uniqueLines);
export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>;

export const recipeUpdateSchema = recipeFields
  .extend({ id: z.uuid() })
  .superRefine(uniqueLines);
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>;

export const recipeIdSchema = z.object({ id: z.uuid() });
