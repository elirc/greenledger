import { z } from "zod";
import { todayLagos } from "@/lib/dates";

/** Shared between client forms (zodResolver) and the server actions. */

export const NURSERY_STATUS_LABELS = {
  open: "Open",
  transplanted: "Transplanted",
  discarded: "Discarded",
} as const;
export type NurseryStatus = keyof typeof NURSERY_STATUS_LABELS;

const count = (label: string) =>
  z
    .number({ error: `Enter ${label}` })
    .int("Whole numbers only")
    .min(0, "Can't be negative")
    .max(10_000_000, "Too large");

const positiveCount = (label: string) =>
  z
    .number({ error: `Enter ${label}` })
    .int("Whole numbers only")
    .min(1, "At least 1")
    .max(10_000_000, "Too large");

/** Lagos calendar date yyyy-MM-dd from <input type="date">, not in the future. */
const pastOrTodayDate = (label: string) =>
  z.iso
    .date({ error: `Enter the ${label}` })
    .refine((d) => d <= todayLagos(), `The ${label} can't be in the future`);

export const nurseryIdSchema = z.object({ id: z.uuid() });

// -------------------------------------------------------------------- create

export const nurseryBatchCreateSchema = z.object({
  varietyId: z.uuid({ error: "Pick a variety" }),
  sowDate: pastOrTodayDate("sow date"),
  trays: z
    .number({ error: "Enter the number of trays" })
    .int("Whole trays only")
    .min(1, "At least 1 tray")
    .max(100_000, "Too many trays"),
  cellsPerTray: z
    .number({ error: "Enter cells per tray" })
    .int("Whole cells only")
    .min(1, "At least 1 cell")
    .max(2_000, "Too many cells"),
  seedsSown: positiveCount("the seeds sown"),
  /** Optional link to the seed item batch used (category seed). */
  seedItemBatchId: z.uuid().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type NurseryBatchCreateInput = z.infer<typeof nurseryBatchCreateSchema>;

// ------------------------------------------------------------- update counts

export const nurseryCountsSchema = z
  .object({
    id: z.uuid(),
    germinated: count("germinated"),
    ready: count("ready"),
  })
  .refine((v) => v.ready <= v.germinated, {
    path: ["ready"],
    error: "Ready can't be more than germinated",
  });
export type NurseryCountsInput = z.infer<typeof nurseryCountsSchema>;

// ------------------------------------------------------------------- discard

export const nurseryDiscardSchema = z.object({
  id: z.uuid(),
  count: positiveCount("how many to discard"),
  reason: z
    .string()
    .trim()
    .min(3, "Say why (at least 3 characters)")
    .max(300, "Too long"),
});
export type NurseryDiscardInput = z.infer<typeof nurseryDiscardSchema>;

// ---------------------------------------------------------------- transplant

export const nurseryTransplantSchema = z.object({
  nurseryBatchId: z.uuid(),
  greenhouseId: z.uuid({ error: "Pick a greenhouse" }),
  zoneId: z.uuid().optional().or(z.literal("")),
  count: positiveCount("how many seedlings"),
  transplantDate: pastOrTodayDate("transplant date"),
  closeBatch: z.boolean(),
});
export type NurseryTransplantInput = z.infer<typeof nurseryTransplantSchema>;
