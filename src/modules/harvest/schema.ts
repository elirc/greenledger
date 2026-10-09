import { z } from "zod";
import { lagosLocalToDate } from "@/modules/applications/schema";

/** Shared between the client form (zodResolver) and the server action. */

export const GRADES = ["a", "b", "c", "reject"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
  a: "Grade A",
  b: "Grade B",
  c: "Grade C",
  reject: "Reject",
};

export const GRADE_SHORT: Record<Grade, string> = {
  a: "A",
  b: "B",
  c: "C",
  reject: "Rej",
};

/** PHI override (owner/manager only — enforced in the handler). */
export const harvestOverrideSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Give a reason of at least 5 characters")
    .max(500, "Keep the reason under 500 characters"),
});
export type HarvestOverrideInput = z.infer<typeof harvestOverrideSchema>;

/**
 * One row per grade on the form. Blank rows (no kg) are skipped by the
 * handler; crates default to 0.
 */
export const harvestLineSchema = z.object({
  grade: z.enum(GRADES),
  crates: z
    .number({ error: "Enter a number" })
    .min(0, "Cannot be negative")
    .max(100_000, "Too many crates")
    .optional(),
  kg: z
    .number({ error: "Enter the weight" })
    .positive("Must be more than zero")
    .max(1_000_000, "Weight is too large")
    .optional(),
});
export type HarvestLineFormInput = z.infer<typeof harvestLineSchema>;

export const harvestCreateSchema = z
  .object({
    /** Client UUID (offline idempotency) — becomes the harvest PK. */
    clientId: z.uuid(),
    greenhouseId: z.uuid({ error: "Pick a greenhouse" }),
    cropCycleId: z.uuid({ error: "Pick a crop cycle" }),
    /** Lagos wall time from `<input type="datetime-local">`. */
    harvestedAt: z
      .string()
      .min(1, "Enter the date and time")
      .refine((v) => lagosLocalToDate(v) !== null, "Enter a valid date and time"),
    lines: z.array(harvestLineSchema).min(1).max(GRADES.length),
    storeId: z.uuid({ error: "Pick a store" }),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    override: harvestOverrideSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<Grade>();
    let filled = 0;
    v.lines.forEach((l, i) => {
      if (seen.has(l.grade)) {
        ctx.addIssue({
          code: "custom",
          message: "One line per grade",
          path: ["lines", i, "grade"],
        });
      }
      seen.add(l.grade);
      if (l.kg !== undefined) filled += 1;
      else if (l.crates !== undefined && l.crates > 0) {
        ctx.addIssue({
          code: "custom",
          message: "Enter the kg for these crates",
          path: ["lines", i, "kg"],
        });
      }
    });
    if (filled === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Enter the kg for at least one grade",
        path: ["lines"],
      });
    }
  });
export type HarvestCreateInput = z.infer<typeof harvestCreateSchema>;

/** Is harvesting inside the PHI window on a Lagos date? Client-safe mirror. */
export function insidePhi(harvestSafeDate: string | null, lagosDate: string) {
  return harvestSafeDate !== null && harvestSafeDate > lagosDate;
}
