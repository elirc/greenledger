import type { SmsAdapter, SmsMessage } from "./types";

/** In-memory outbox so tests can assert what was "sent". */
export const sentSms: SmsMessage[] = [];

export const mockSmsAdapter: SmsAdapter = {
  async send(msg) {
    sentSms.push(msg);
    console.log(`[mock:sms] to=${msg.to} body=${msg.body}`);
    return { id: `mock-sms-${sentSms.length}` };
  },
};
