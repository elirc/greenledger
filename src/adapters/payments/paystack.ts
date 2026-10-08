import { env } from "../../lib/env";
import type { PaymentsAdapter } from "./types";
import { hmacSha512Verify } from "./verify";

const PAYSTACK_BASE = "https://api.paystack.co";

export const paystackPaymentsAdapter: PaymentsAdapter = {
  async createCheckout(i) {
    // UNVERIFIED against live docs: field names from paystack.com/docs/api
    // (transaction/initialize: email, amount in kobo, plan, callback_url).
    // Re-verify before first production use.
    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: i.email,
        amount: i.amountKobo,
        plan: i.planCode,
        callback_url: i.callbackUrl,
        metadata: { org_id: i.orgId },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Paystack initialize failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as {
      data?: { authorization_url?: string; reference?: string };
    };
    if (!body.data?.authorization_url || !body.data.reference) {
      throw new Error("Paystack initialize: unexpected response shape");
    }
    return { url: body.data.authorization_url, reference: body.data.reference };
  },
  verifyWebhook(rawBody, signature) {
    if (!env.PAYSTACK_SECRET_KEY) return false;
    return hmacSha512Verify(rawBody, signature, env.PAYSTACK_SECRET_KEY);
  },
};
