import { z } from "zod";
import { nairaToKobo } from "@/lib/money";

/** Shared between the receive form (zodResolver) and the receiveStock action. */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

/** True when naira text ("₦1,250.50", "1250") parses to a non-negative amount. */
export function isNairaText(s: string): boolean {
  try {
    nairaToKobo(s);
    return true;
  } catch {
    return false;
  }
}

export const receiptLineSchema = z.object({
  itemId: z.uuid({ error: "Pick an item" }),
  batchNumber: z
    .string()
    .trim()
    .min(1, "Enter the batch / lot number")
    .max(60, "Too long"),
  /** Lagos calendar date yyyy-MM-dd from <input type="date">; empty = no expiry. */
  expiryDate: z.iso
    .date({ error: "Enter a valid date" })
    .optional()
    .or(z.literal("")),
  /** In the item's base unit. */
  quantity: z
    .number({ error: "Enter the quantity" })
    .positive("Must be more than 0")
    .max(99_999_999_999, "Too large"),
  /** Naira per base unit, as typed. Converted with nairaToKobo server-side. */
  unitCost: z
    .string()
    .trim()
    .min(1, "Enter the cost (0 if free)")
    .max(20, "Too long")
    .refine(isNairaText, "Enter an amount like 1250 or 1,250.50"),
});

export const receiveStockSchema = z
  .object({
    supplierId: z.uuid({ error: "Pick a supplier" }),
    storeId: z.uuid({ error: "Pick a store" }),
    reference: optionalText(80),
    notes: optionalText(1000),
    lines: z
      .array(receiptLineSchema)
      .min(1, "Add at least one line")
      .max(100, "At most 100 lines per receipt"),
  })
  .superRefine((v, ctx) => {
    // One receipt cannot list the same item batch twice (unique per item).
    const seen = new Set<string>();
    v.lines.forEach((line, i) => {
      const key = `${line.itemId}::${line.batchNumber.trim().toLowerCase()}`;
      if (line.itemId && line.batchNumber && seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "batchNumber"],
          message: "This batch is already on another line",
        });
      }
      seen.add(key);
    });
  });

export type ReceiptLineInput = z.infer<typeof receiptLineSchema>;
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
