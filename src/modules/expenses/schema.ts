import { z } from "zod";
import { nairaToKobo } from "@/lib/money";
import { isNairaText } from "@/modules/receipts/schema";

/** > ₦0 once parsed (unparseable text is reported by the isNairaText check). */
function isPositiveNaira(s: string): boolean {
  try {
    return nairaToKobo(s) > 0;
  } catch {
    return true;
  }
}

/** Shared between the client form (zodResolver) and the server actions. */

/** Mirrors the expense_category pgEnum. */
export const EXPENSE_CATEGORIES = [
  "labour",
  "power",
  "water",
  "repairs",
  "transport",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  labour: "Labour",
  power: "Power / diesel",
  water: "Water",
  repairs: "Repairs",
  transport: "Transport",
  other: "Other",
};

const optionalId = z.uuid().optional().or(z.literal(""));

export const expenseCreateSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { error: "Pick a category" }),
  /** Naira, as typed. Converted with nairaToKobo server-side; must be > 0. */
  amount: z
    .string()
    .trim()
    .min(1, "Enter the amount")
    .max(20, "Too long")
    .refine(isNairaText, "Enter an amount like 15000 or 15,000.50")
    .refine(isPositiveNaira, "Must be more than ₦0"),
  /** Lagos calendar date yyyy-MM-dd; not in the future. */
  incurredDate: z.iso.date({ error: "Enter the date" }),
  siteId: optionalId,
  greenhouseId: optionalId,
  cropCycleId: optionalId,
  description: z.string().trim().max(500).optional().or(z.literal("")),
});
export const expenseUpdateSchema = expenseCreateSchema.extend({ id: z.uuid() });
export const expenseIdSchema = z.object({ id: z.uuid() });
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;

/** /expenses list filters (search params). `month` = "yyyy-MM". */
export const expenseListParamsSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  category: z.enum(EXPENSE_CATEGORIES).optional().catch(undefined),
});
export type ExpenseListParams = z.infer<typeof expenseListParamsSchema>;
