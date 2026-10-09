import { z } from "zod";
import { GRADES } from "@/modules/harvest/schema";

/** Shared between the client forms (zodResolver) and the server actions. */

export const WASTE_REASONS = ["spoiled", "damaged", "rejected", "other"] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  spoiled: "Spoiled",
  damaged: "Damaged",
  rejected: "Rejected by buyer",
  other: "Other",
};

const kgSchema = z
  .number({ error: "Enter the weight" })
  .positive("Must be more than zero")
  .max(1_000_000, "Weight is too large");

export const produceWasteSchema = z
  .object({
    /** Client UUID (offline idempotency) — becomes the movement PK. */
    clientId: z.uuid(),
    lotId: z.uuid(),
    storeId: z.uuid(),
    kg: kgSchema,
    reason: z.enum(WASTE_REASONS, { error: "Pick a reason" }),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.reason === "other" && !v.note) {
      ctx.addIssue({
        code: "custom",
        message: "Describe what happened",
        path: ["note"],
      });
    }
  });
export type ProduceWasteInput = z.infer<typeof produceWasteSchema>;

/** Stored produce_movements.waste_reason: "spoiled" or "other: <note>". */
export function wasteReasonText(reason: WasteReason, note?: string): string {
  const n = note?.trim();
  return n ? `${reason}: ${n}` : reason;
}

export const produceTransferSchema = z
  .object({
    lotId: z.uuid(),
    fromStoreId: z.uuid({ error: "Pick a store" }),
    toStoreId: z.uuid({ error: "Pick a store" }),
    kg: kgSchema,
  })
  .refine((v) => v.fromStoreId !== v.toStoreId, {
    message: "Choose a different store",
    path: ["toStoreId"],
  });
export type ProduceTransferInput = z.infer<typeof produceTransferSchema>;

/** Whole calendar days from yyyy-MM-dd `from` to `to` (to − from). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** /produce search params. */
export const produceListParamsSchema = z.object({
  tab: z.enum(["stock", "harvests"]).catch("stock"),
  store: z.uuid().optional().catch(undefined),
  grade: z.enum(GRADES).optional().catch(undefined),
});
export type ProduceListParams = z.infer<typeof produceListParamsSchema>;
