import { config } from './config.js';
import type { Channel } from '@relaunch/shared';

export interface OutboundMessage {
  channel: Channel;
  to: string;
  subject: string;
  body: string;
  /** Correlates a reply back to the application thread it belongs to. */
  correlationId?: string;
}

export interface DeliveryResult {
  ok: boolean;
  providerMessageId: string;
  provider: string;
  error?: string;
}

export interface MessageSender {
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

/** Captures what SES / End User Messaging Social would have sent. */
export class OutboxSender implements MessageSender {
  readonly sent: (OutboundMessage & { at: string; providerMessageId: string })[] = [];
  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const providerMessageId = `local-${Math.random().toString(36).slice(2, 10)}`;
    this.sent.push({ ...message, at: new Date().toISOString(), providerMessageId });
    const provider = message.channel === 'email' ? 'ses(local)' : message.channel === 'whatsapp' ? 'eum-social(local)' : 'in-app';
    return { ok: true, providerMessageId, provider };
  }
}

export function createSender(): MessageSender {
  if (config.backend === 'aws') {
    // SES SendEmail for email; End User Messaging Social SendWhatsAppMessage
    // for whatsapp, using config.aws.whatsappPhoneNumberId.
    throw new Error('SES / End User Messaging not wired in this POC. Set RELAUNCH_BACKEND=local.');
  }
  return new OutboxSender();
}

export const sender = createSender();
export const outbox = sender instanceof OutboxSender ? sender.sent : [];
