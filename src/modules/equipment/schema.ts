import { z } from "zod";
import { isNairaText } from "@/modules/receipts/schema";

/** Shared between the client forms (zodResolver) and the server actions. */

/** App constant (DATA-MODEL §4.9) — stored as text, not a pgEnum. */
export const EQUIPMENT_CATEGORIES = [
  "pump",
  "tank",
  "dosing_unit",
  "sprayer",
  "cover",
  "net",
  "irrigation",
  "other",
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  pump: "Pump",
  tank: "Tank",
  dosing_unit: "Dosing unit",
  sprayer: "Sprayer",
  cover: "Cover / poly film",
  net: "Insect / shade net",
  irrigation: "Irrigation",
  other: "Other",
};

export function equipmentCategoryLabel(c: string): string {
  return (EQUIPMENT_CATEGORY_LABELS as Record<string, string>)[c] ?? c;
}

export const EQUIPMENT_STATUSES = [
  "operational",
  "needs_service",
  "broken",
  "retired",
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  operational: "Operational",
  needs_service: "Needs service",
  broken: "Broken",
  retired: "Retired",
};

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

/** Optional FK picked from a select ("" = none). */
const optionalId = z.uuid().optional().or(z.literal(""));

/** Optional naira text; "" means 0. Converted with nairaToKobo server-side. */
const optionalNaira = z
  .string()
  .trim()
  .max(20, "Too long")
  .refine((s) => s === "" || isNairaText(s), "Enter an amount like 1250 or 1,250.50")
  .optional();

export const equipmentCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  category: z.enum(EQUIPMENT_CATEGORIES, { error: "Pick a category" }),
  siteId: optionalId,
  greenhouseId: optionalId,
  locationNote: optionalText(200),
  serialNumber: optionalText(80),
  /** Lagos calendar date yyyy-MM-dd; "" = unknown. */
  purchaseDate: z.iso
    .date({ error: "Enter a valid date" })
    .optional()
    .or(z.literal("")),
  /** Purchase cost in naira, as typed. */
  cost: optionalNaira,
  status: z.enum(EQUIPMENT_STATUSES, { error: "Pick a status" }),
  notes: optionalText(1000),
});
export const equipmentUpdateSchema = equipmentCreateSchema.extend({
  id: z.uuid(),
});
export type EquipmentCreateInput = z.infer<typeof equipmentCreateSchema>;
export type EquipmentUpdateInput = z.infer<typeof equipmentUpdateSchema>;

export const scheduleCreateSchema = z.object({
  equipmentId: z.uuid(),
  name: z.string().trim().min(2, "Name is too short").max(120),
  intervalDays: z
    .number({ error: "Enter the interval in days" })
    .int("Whole days only")
    .positive("Must be at least 1 day")
    .max(3650, "At most 10 years"),
  /** Lagos calendar date yyyy-MM-dd. */
  nextDueDate: z.iso.date({ error: "Enter the next due date" }),
  isActive: z.boolean(),
});
export const scheduleUpdateSchema = scheduleCreateSchema.extend({
  id: z.uuid(),
});
export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;
export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateSchema>;

export const logWorkSchema = z.object({
  equipmentId: z.uuid(),
  /** "" = unscheduled work (repair, one-off). */
  scheduleId: optionalId,
  /** Lagos calendar date yyyy-MM-dd; not in the future. */
  doneDate: z.iso.date({ error: "Enter the date the work was done" }),
  description: z
    .string()
    .trim()
    .min(3, "Describe the work done")
    .max(500, "Too long"),
  cost: optionalNaira,
  notes: optionalText(1000),
});
export type LogWorkInput = z.infer<typeof logWorkSchema>;
