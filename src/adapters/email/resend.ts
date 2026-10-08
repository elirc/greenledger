import { env } from "../../lib/env";
import type { EmailAdapter } from "./types";

const RESEND_URL = "https://api.resend.com/emails";

export const resendEmailAdapter: EmailAdapter = {
  async send(msg) {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { id?: string };
    return { id: data.id ?? "resend-unknown" };
  },
};
