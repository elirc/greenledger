import { env } from "../../lib/env";
import { mockEmailAdapter } from "./mock";
import { resendEmailAdapter } from "./resend";
import type { EmailAdapter } from "./types";

export const email: EmailAdapter =
  env.ADAPTER_EMAIL === "resend" ? resendEmailAdapter : mockEmailAdapter;

export type { EmailAdapter, EmailMessage } from "./types";
