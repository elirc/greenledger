import { env } from "../../lib/env";
import { mockSmsAdapter } from "./mock";
import { termiiSmsAdapter } from "./termii";
import type { SmsAdapter } from "./types";

export const sms: SmsAdapter =
  env.ADAPTER_SMS === "termii" ? termiiSmsAdapter : mockSmsAdapter;

export type { SmsAdapter, SmsMessage } from "./types";
