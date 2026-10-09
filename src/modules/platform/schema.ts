import { z } from "zod";
import { isNairaText } from "@/modules/receipts/schema";

/** Shared between platform admin forms (zodResolver) and the server actions. */

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "cancelled",
] as const;

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

/** Naira as typed ("25000", "25,000.50"); stored as kobo via nairaToKobo server-side. */
const nairaString = z
  .string()
  .trim()
  .max(20, "Too long")
  .refine(isNairaText, "Enter an amount like 25000 or 25,000.50");

export const planCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code is too short")
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "Lowercase letters, digits, - and _ only"),
  name: z.string().trim().min(2, "Name is too short").max(80),
  maxGreenhouses: z
    .number({ error: "Enter the greenhouse limit" })
    .int("Whole numbers only")
    .min(1, "At least 1")
    .max(10_000),
  monthlyPriceNaira: nairaString,
  paystackPlanCode: optionalText(80),
  isActive: z.boolean(),
});
export const planUpdateSchema = planCreateSchema.extend({ id: z.uuid() });
export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

/** Subscription edit (platform override). Dates are Lagos calendar dates. */
export const subscriptionEditSchema = z.object({
  orgId: z.string().trim().min(1).max(64),
  planId: z.uuid(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  trialEndsOn: z.iso.date({ error: "Pick the trial end date" }),
  periodEndsOn: z.iso.date().optional().or(z.literal("")),
  reason: z.string().trim().min(3, "Say why (for the audit log)").max(500),
});
export type SubscriptionEditInput = z.infer<typeof subscriptionEditSchema>;

export const extendTrialSchema = z.object({
  orgId: z.string().trim().min(1).max(64),
  days: z.number().int().min(1).max(90),
});
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;

/** /platform/audit filters (GET search params). */
export const auditFilterSchema = z.object({
  org: z.string().trim().max(64).optional().catch(undefined),
  action: z.string().trim().max(100).optional().catch(undefined),
  entity: z.string().trim().max(60).optional().catch(undefined),
});
export type AuditFilter = z.infer<typeof auditFilterSchema>;
