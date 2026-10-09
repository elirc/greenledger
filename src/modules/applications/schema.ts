import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { formatLagos, LAGOS_TZ } from "@/lib/dates";

/** Shared between the client form (zodResolver) and the server action. */

export const APPLICATION_TYPES = ["fertigation", "spray"] as const;
export type ApplicationType = (typeof APPLICATION_TYPES)[number];

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  fertigation: "Fertigation",
  spray: "Spray",
};

/** `<input type="datetime-local">` value, read as Africa/Lagos wall time. */
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** Lagos wall-clock "yyyy-MM-ddTHH:mm" → UTC instant (null if invalid). */
export function lagosLocalToDate(local: string): Date | null {
  if (!LOCAL_DATETIME_RE.test(local)) return null;
  const d = fromZonedTime(local, LAGOS_TZ);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A UTC instant as a datetime-local value in Lagos time. */
export function dateToLagosLocal(d: Date): string {
  return formatLagos(d, "yyyy-MM-dd'T'HH:mm");
}

export const applicationLineSchema = z.object({
  itemId: z.uuid({ error: "Pick an input" }),
  /** Final quantity in the item's base unit (already recipe-scaled). */
  quantity: z
    .number({ error: "Enter a quantity" })
    .positive("Must be more than zero")
    .max(1_000_000_000, "Quantity is too large"),
});
export type ApplicationLineInput = z.infer<typeof applicationLineSchema>;

export const applicationCreateSchema = z
  .object({
    /** Client UUID (offline sync hook) — becomes the application PK. */
    clientId: z.uuid(),
    greenhouseId: z.uuid({ error: "Pick a greenhouse" }),
    cropCycleId: z.uuid({ error: "Pick a crop cycle" }),
    type: z.enum(APPLICATION_TYPES, { error: "Pick a type" }),
    recipeId: z.uuid().optional(),
    waterVolumeLitres: z
      .number({ error: "Enter the water volume" })
      .positive("Must be more than zero")
      .max(1_000_000, "Volume is too large"),
    lines: z
      .array(applicationLineSchema)
      .min(1, "Add at least one input")
      .max(50, "Too many inputs"),
    storeId: z.uuid({ error: "Pick a store" }),
    /** Lagos wall time from `<input type="datetime-local">`. */
    appliedAt: z
      .string()
      .regex(LOCAL_DATETIME_RE, "Enter the date and time"),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (!l.itemId) return;
      if (seen.has(l.itemId)) {
        ctx.addIssue({
          code: "custom",
          message: "This input is already listed — combine the quantities",
          path: ["lines", i, "itemId"],
        });
      }
      seen.add(l.itemId);
    });
    if (LOCAL_DATETIME_RE.test(v.appliedAt) && !lagosLocalToDate(v.appliedAt)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid date and time",
        path: ["appliedAt"],
      });
    }
  });
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;

/** /applications list filters (search params). */
export const applicationListParamsSchema = z.object({
  gh: z.uuid().optional().catch(undefined),
  type: z.enum(APPLICATION_TYPES).optional().catch(undefined),
});
export type ApplicationListParams = z.infer<typeof applicationListParamsSchema>;
