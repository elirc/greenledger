export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailAdapter {
  send(msg: EmailMessage): Promise<{ id: string }>;
}
