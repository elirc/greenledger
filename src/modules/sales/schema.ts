import { z } from "zod";
import { nairaToKobo } from "@/lib/money";

/** Shared between the sale/payment forms (zodResolver) and the server actions. */

export const GRADES = ["a", "b", "c", "reject"] as const;
export type Grade = (typeof GRADES)[number];

export const GRADE_LABELS: Record<Grade, string> = {
  a: "Grade A",
  b: "Grade B",
  c: "Grade C",
  reject: "Reject",
};

export const PRICE_BASES = ["per_kg", "per_crate"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

export const PRICE_BASIS_LABELS: Record<PriceBasis, string> = {
  per_kg: "per kg",
  per_crate: "per crate",
};

export const PAYMENT_METHODS = ["cash", "transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  other: "Other",
};

export const SALE_STATUSES = ["unpaid", "part_paid", "paid"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  unpaid: "Unpaid",
  part_paid: "Part paid",
  paid: "Paid",
};

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

const nairaText = (emptyMsg: string) =>
  z
    .string()
    .trim()
    .min(1, emptyMsg)
    .max(20, "Too long")
    .refine(isNairaText, "Enter an amount like 1500 or 1,500.50");

export const saleLineSchema = z
  .object({
    cropId: z.uuid({ error: "Pick a crop" }),
    grade: z.enum(GRADES, { error: "Pick a grade" }),
    /** Weight sold, kg (always required — stock is tracked in kg). */
    kg: z
      .number({ error: "Enter the weight" })
      .positive("Must be more than 0")
      .max(9_999_999, "Too large"),
    /** Optional crate count; required when pricing per crate. */
    crates: z
      .number({ error: "Enter a number" })
      .positive("Must be more than 0")
      .max(999_999, "Too large")
      .optional(),
    priceBasis: z.enum(PRICE_BASES),
    /** Naira per kg or per crate, as typed. Converted with nairaToKobo server-side. */
    unitPrice: nairaText("Enter the price"),
  })
  .superRefine((line, ctx) => {
    if (line.priceBasis === "per_crate" && !line.crates) {
      ctx.addIssue({
        code: "custom",
        path: ["crates"],
        message: "Enter the crates when pricing per crate",
      });
    }
  });

export const saleCreateSchema = z.object({
  /** Optional client-generated sale id (seed / offline replay). */
  clientId: z.uuid().optional(),
  customerId: z.uuid({ error: "Pick a customer" }),
  /** Lagos calendar date yyyy-MM-dd from <input type="date">. */
  saleDate: z.iso.date({ error: "Enter a valid date" }),
  storeId: z.uuid({ error: "Pick the store the produce leaves from" }),
  notes: optionalText(1000),
  lines: z
    .array(saleLineSchema)
    .min(1, "Add at least one line")
    .max(50, "At most 50 lines per sale"),
});

export const paymentCreateSchema = z.object({
  saleId: z.uuid(),
  amount: nairaText("Enter the amount").refine((s) => {
    try {
      return nairaToKobo(s) > 0;
    } catch {
      return false;
    }
  }, "Must be more than ₦0"),
  method: z.enum(PAYMENT_METHODS),
  /** Lagos calendar date yyyy-MM-dd. */
  receivedDate: z.iso.date({ error: "Enter a valid date" }),
  notes: optionalText(500),
});

export const salesFilterSchema = z.object({
  status: z.enum(SALE_STATUSES).optional(),
  customerId: z.uuid().optional(),
});

export type SaleLineInput = z.infer<typeof saleLineSchema>;
export type SaleCreateInput = z.infer<typeof saleCreateSchema>;
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
export type SalesFilter = z.infer<typeof salesFilterSchema>;
