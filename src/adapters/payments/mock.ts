import { env } from "../../lib/env";
import type { PaymentsAdapter } from "./types";
import { hmacSha512Verify } from "./verify";

/**
 * Mock Paystack: checkout happens on our own /billing/checkout-mock page,
 * which signs and POSTs real-shaped webhook events back to the webhook route,
 * so the full billing loop is testable offline.
 */
export const MOCK_PAYSTACK_SECRET = "mock-paystack-secret";

function mockSecret(): string {
  return env.PAYSTACK_SECRET_KEY || MOCK_PAYSTACK_SECRET;
}

export const mockPaymentsAdapter: PaymentsAdapter = {
  async createCheckout(i) {
    const reference = crypto.randomUUID();
    const params = new URLSearchParams({
      ref: reference,
      org: i.orgId,
      plan: i.planCode,
      amount: String(i.amountKobo),
      email: i.email,
      callback: i.callbackUrl,
    });
    console.log(`[mock:payments] checkout ref=${reference} plan=${i.planCode}`);
    return { url: `/billing/checkout-mock?${params.toString()}`, reference };
  },
  verifyWebhook(rawBody, signature) {
    return hmacSha512Verify(rawBody, signature, mockSecret());
  },
};
