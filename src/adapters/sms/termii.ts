import { env } from "../../lib/env";
import type { SmsAdapter } from "./types";

const TERMII_URL = "https://api.ng.termii.com/api/sms/send";

export const termiiSmsAdapter: SmsAdapter = {
  async send(msg) {
    const res = await fetch(TERMII_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.TERMII_API_KEY,
        to: msg.to,
        from: env.TERMII_SENDER_ID,
        sms: msg.body,
        type: "plain",
        channel: env.TERMII_CHANNEL,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Termii send failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { message_id?: string };
    return { id: data.message_id ?? "termii-unknown" };
  },
};
