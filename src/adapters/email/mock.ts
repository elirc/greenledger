import type { EmailAdapter, EmailMessage } from "./types";

/** In-memory outbox so tests can assert what was "sent". */
export const sentEmails: EmailMessage[] = [];

export const mockEmailAdapter: EmailAdapter = {
  async send(msg) {
    sentEmails.push(msg);
    console.log(`[mock:email] to=${msg.to} subject=${msg.subject}`);
    return { id: `mock-email-${sentEmails.length}` };
  },
};
