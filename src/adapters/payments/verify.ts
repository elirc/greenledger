import { createHmac, timingSafeEqual } from "node:crypto";

/** Paystack signs webhooks with HMAC-SHA512 of the raw body, keyed by the API secret. */
export function hmacSha512Verify(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const digest = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hmacSha512Sign(rawBody: string, secret: string): string {
  return createHmac("sha512", secret).update(rawBody).digest("hex");
}
