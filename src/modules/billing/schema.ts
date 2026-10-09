import { z } from "zod";

/** Shared between client components and the billing server actions. */

export const PLAN_CODES = ["starter", "growth", "estate"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "cancelled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment overdue",
  cancelled: "Cancelled",
};

/** "Subscribe / Change plan" — plan codes are free text in the DB, validated on lookup. */
export const startCheckoutSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
});
export type StartCheckoutInput = z.infer<typeof startCheckoutSchema>;

/**
 * The mock Paystack hosted page posts back exactly what the mock adapter put
 * in its URL (src/adapters/payments/mock.ts createCheckout).
 */
export const mockCheckoutSchema = z.object({
  ref: z.uuid(),
  org: z.string().trim().min(1).max(64),
  plan: z.string().trim().min(1).max(40),
  amount: z.coerce.number().int().positive(),
  email: z.string().trim().min(3).max(320),
  callback: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type MockCheckoutInput = z.infer<typeof mockCheckoutSchema>;
