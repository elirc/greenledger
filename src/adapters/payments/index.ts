import { env } from "../../lib/env";
import { mockPaymentsAdapter } from "./mock";
import { paystackPaymentsAdapter } from "./paystack";
import type { PaymentsAdapter } from "./types";

export const payments: PaymentsAdapter =
  env.ADAPTER_PAYMENTS === "paystack"
    ? paystackPaymentsAdapter
    : mockPaymentsAdapter;

export { MOCK_PAYSTACK_SECRET } from "./mock";
export { hmacSha512Sign, hmacSha512Verify } from "./verify";
export { parsePaystackEvent } from "./types";
export type { CheckoutInput, PaymentsAdapter, PaystackEvent } from "./types";
