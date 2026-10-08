import { z } from "zod";

/** Shared between client forms (zodResolver) and the server actions. */

export const GREENHOUSE_TYPES = [
  "greenhouse",
  "net_house",
  "shade_house",
  "open_field",
] as const;
export type GreenhouseType = (typeof GREENHOUSE_TYPES)[number];

export const GREENHOUSE_TYPE_LABELS: Record<GreenhouseType, string> = {
  greenhouse: "Greenhouse",
  net_house: "Net house",
  shade_house: "Shade house",
  open_field: "Open field",
};

export const STORE_TYPES = ["input_store", "cold_room", "packhouse"] as const;
export type StoreType = (typeof STORE_TYPES)[number];

export const STORE_TYPE_LABELS: Record<StoreType, string> = {
  input_store: "Input store",
  cold_room: "Cold room",
  packhouse: "Packhouse",
};

/** Names used when the wizard creates the standard stores. */
export const DEFAULT_STORE_NAMES: Record<StoreType, string> = {
  input_store: "Input Store",
  cold_room: "Cold Room",
  packhouse: "Packhouse",
};

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const idSchema = z.object({ id: z.uuid() });
export type IdInput = z.infer<typeof idSchema>;

// ---------------------------------------------------------------- onboarding

export const createFarmSchema = z.object({
  name: z.string().trim().min(2, "Farm name is too short").max(120),
});
export type CreateFarmInput = z.infer<typeof createFarmSchema>;

// --------------------------------------------------------------------- sites

export const siteCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  address: optionalText(300),
});
export const siteUpdateSchema = siteCreateSchema.extend({ id: z.uuid() });
export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;

// --------------------------------------------------------------- greenhouses

const greenhouseFields = {
  name: z.string().trim().min(1, "Name is required").max(60),
  type: z.enum(GREENHOUSE_TYPES),
  areaM2: z
    .number({ error: "Enter the area in m²" })
    .positive("Area must be more than 0")
    .max(99_999_999, "Area is too large"),
  plantCapacity: z
    .number({ error: "Enter the plant capacity" })
    .int("Whole plants only")
    .min(0, "Cannot be negative")
    .max(10_000_000, "Capacity is too large"),
};

export const greenhouseCreateSchema = z.object({
  siteId: z.uuid({ error: "Pick a site" }),
  ...greenhouseFields,
  notes: optionalText(1000),
  isActive: z.boolean(),
});
export const greenhouseUpdateSchema = greenhouseCreateSchema.extend({
  id: z.uuid(),
});
export type GreenhouseCreateInput = z.infer<typeof greenhouseCreateSchema>;
export type GreenhouseUpdateInput = z.infer<typeof greenhouseUpdateSchema>;

/** Wizard step 2: repeatable rows; rows with an id update, others insert. */
export const greenhouseRowSchema = z.object({
  id: z.uuid().optional(),
  ...greenhouseFields,
});
export const greenhousesBulkSchema = z
  .object({
    siteId: z.uuid({ error: "Pick a site" }),
    rows: z
      .array(greenhouseRowSchema)
      .min(1, "Add at least one greenhouse")
      .max(200),
  })
  .superRefine((val, ctx) => {
    const seen = new Map<string, number>();
    val.rows.forEach((row, i) => {
      const key = row.name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", i, "name"],
          message: "Name used twice",
        });
      } else {
        seen.set(key, i);
      }
    });
  });
export type GreenhouseRowInput = z.infer<typeof greenhouseRowSchema>;
export type GreenhousesBulkInput = z.infer<typeof greenhousesBulkSchema>;

// --------------------------------------------------------------------- zones

export const zoneCreateSchema = z.object({
  greenhouseId: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(60),
});
export const zoneRenameSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(60),
});
export const zoneMoveSchema = z.object({
  id: z.uuid(),
  direction: z.enum(["up", "down"]),
});
export type ZoneCreateInput = z.infer<typeof zoneCreateSchema>;
export type ZoneRenameInput = z.infer<typeof zoneRenameSchema>;

// -------------------------------------------------------------------- stores

export const storeCreateSchema = z.object({
  siteId: z.uuid({ error: "Pick a site" }),
  name: z.string().trim().min(2, "Name is too short").max(60),
  type: z.enum(STORE_TYPES),
  isDefault: z.boolean(),
});
export const storeUpdateSchema = storeCreateSchema.extend({ id: z.uuid() });
export type StoreCreateInput = z.infer<typeof storeCreateSchema>;
export type StoreUpdateInput = z.infer<typeof storeUpdateSchema>;

/** Wizard step 3: which of the standard stores the farm has. */
export const ensureStoresSchema = z.object({
  siteId: z.uuid(),
  types: z.array(z.enum(STORE_TYPES)).min(1, "Pick at least one store"),
});
export type EnsureStoresInput = z.infer<typeof ensureStoresSchema>;
