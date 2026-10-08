import { z } from "zod";

/** Shared between client forms (zodResolver) and the server actions. */

/** The two crops the spec supports, with placeholder shelf lives (Assumptions). */
export const DEFAULT_CROPS = {
  tomato: { name: "Tomato", shelfLifeDays: 7 },
  pepper: { name: "Pepper", shelfLifeDays: 10 },
} as const;
export const DEFAULT_CROP_KEYS = ["tomato", "pepper"] as const;
export type DefaultCropKey = (typeof DEFAULT_CROP_KEYS)[number];

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const cropIdSchema = z.object({ id: z.uuid() });

// --------------------------------------------------------------------- crops

export const cropCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60),
  shelfLifeDays: z
    .number({ error: "Enter the shelf life in days" })
    .int("Whole days only")
    .min(1, "At least 1 day")
    .max(365, "At most 365 days"),
});
export const cropUpdateSchema = cropCreateSchema.extend({ id: z.uuid() });
export type CropCreateInput = z.infer<typeof cropCreateSchema>;
export type CropUpdateInput = z.infer<typeof cropUpdateSchema>;

/** Wizard step 4: create the picked default crops if they are missing. */
export const ensureCropsSchema = z.object({
  crops: z.array(z.enum(DEFAULT_CROP_KEYS)).min(1, "Pick at least one crop"),
});
export type EnsureCropsInput = z.infer<typeof ensureCropsSchema>;

// ----------------------------------------------------------------- varieties

export const varietyCreateSchema = z.object({
  cropId: z.uuid({ error: "Pick a crop" }),
  name: z.string().trim().min(1, "Name is required").max(80),
  daysToFirstHarvest: z
    .number({ error: "Enter days to first harvest" })
    .int("Whole days only")
    .min(1, "At least 1 day")
    .max(365, "At most 365 days"),
  harvestDurationWeeks: z
    .number({ error: "Enter harvest weeks" })
    .int("Whole weeks only")
    .min(1, "At least 1 week")
    .max(104, "At most 104 weeks"),
  expectedYieldKgPerPlant: z
    .number({ error: "Enter expected yield" })
    .positive("Must be more than 0")
    .max(9999.99, "Too large"),
  notes: optionalText(1000),
  isActive: z.boolean(),
});
export const varietyUpdateSchema = varietyCreateSchema.extend({ id: z.uuid() });
export type VarietyCreateInput = z.infer<typeof varietyCreateSchema>;
export type VarietyUpdateInput = z.infer<typeof varietyUpdateSchema>;
