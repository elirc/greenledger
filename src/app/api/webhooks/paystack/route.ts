/**
 * Paystack webhook (ARCHITECTURE §2). Raw text body → signature verify →
 * idempotent record + apply (src/modules/billing/webhook.ts). Returns fast;
 * urgent notification fan-out (notify.dispatch) is enqueued after the
 * response is sent.
 */

import { after } from "next/server";
import { JOBS, sendJob } from "@/lib/jobs";
import { handlePaystackWebhook } from "@/modules/billing/webhook";

export async function POST(request: Request): Promise<Response> {
  // Read as TEXT: the HMAC is over the exact bytes Paystack sent.
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  const outcome = await handlePaystackWebhook(rawBody, signature);

  if (outcome.dispatch.length > 0) {
    after(async () => {
      for (const d of outcome.dispatch) {
        try {
          await sendJob(JOBS.notifyDispatch, { orgId: d.orgId, dedupKey: d.dedupKey });
        } catch (err) {
          console.error("[webhook:paystack] could not enqueue notify.dispatch:", err);
        }
      }
    });
  }

  return Response.json({ result: outcome.result }, { status: outcome.status });
}
