export interface CheckoutInput {
  orgId: string;
  planCode: string;
  email: string;
  amountKobo: number;
  callbackUrl: string;
}

export interface PaymentsAdapter {
  createCheckout(i: CheckoutInput): Promise<{ url: string; reference: string }>;
  /** HMAC-SHA512 hex of the RAW body, timing-safe compared to the header. */
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}

export interface PaystackEvent {
  event: string;
  data: Record<string, unknown>;
}

export function parsePaystackEvent(rawBody: string): PaystackEvent {
  const parsed = JSON.parse(rawBody) as Partial<PaystackEvent>;
  if (typeof parsed.event !== "string") {
    throw new Error("Not a Paystack event payload");
  }
  return { event: parsed.event, data: parsed.data ?? {} };
}
