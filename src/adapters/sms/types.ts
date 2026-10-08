export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsAdapter {
  send(msg: SmsMessage): Promise<{ id: string }>;
}
