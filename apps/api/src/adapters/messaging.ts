import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
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

/** Everything that was sent, whichever provider carried it. The Operations screen reads this. */
export const outbox: (OutboundMessage & {
  at: string;
  providerMessageId: string;
  provider: string;
  error?: string;
})[] = [];

function record(message: OutboundMessage, result: DeliveryResult) {
  outbox.push({
    ...message,
    at: new Date().toISOString(),
    providerMessageId: result.providerMessageId,
    provider: result.provider,
    ...(result.error ? { error: result.error } : {}),
  });
}

/** Captures what a provider would have sent. Used for WhatsApp, and for email when SES is off. */
export class OutboxSender implements MessageSender {
  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const provider =
      message.channel === 'email' ? 'ses(local)'
      : message.channel === 'whatsapp' ? 'eum-social(local)'
      : 'in-app';
    const result: DeliveryResult = {
      ok: true,
      providerMessageId: `local-${Math.random().toString(36).slice(2, 10)}`,
      provider,
    };
    record(message, result);
    return result;
  }
}

/**
 * Amazon SES. This is the AWS Communication Developer Service that carries
 * email at runtime: match reports, interview offers, clarification requests
 * and daily digests all leave through SendEmail.
 *
 * While the account is in the SES sandbox, every recipient must be a verified
 * identity. Set SES_OVERRIDE_TO to a verified address and all mail is routed
 * there, with the intended recipient named in the subject line, so the
 * demo works without verifying each synthetic address.
 */
export class SesSender implements MessageSender {
  private client = new SESv2Client({ region: config.aws.region });

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const override = config.aws.sesOverrideTo;
    const to = override || message.to;
    const subject = override
      ? `[to: ${message.to}] ${message.subject}`
      : message.subject;

    try {
      const response = await this.client.send(new SendEmailCommand({
        FromEmailAddress: config.aws.sesFrom,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: { Text: { Data: this.withFooter(message), Charset: 'UTF-8' } },
          },
        },
        // Carries the thread reference through to SES event notifications.
        EmailTags: message.correlationId
          ? [{ Name: 'correlation', Value: message.correlationId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 256) }]
          : undefined,
      }));
      const result: DeliveryResult = {
        ok: true,
        providerMessageId: response.MessageId ?? 'unknown',
        provider: 'amazon-ses',
      };
      record(message, result);
      return result;
    } catch (error) {
      // A failed send must never take the journey down: it is recorded, shown
      // on the Operations screen with its reason, and the app carries on.
      const result: DeliveryResult = {
        ok: false,
        providerMessageId: '',
        provider: 'amazon-ses',
        error: error instanceof Error ? error.message : String(error),
      };
      record(message, result);
      return result;
    }
  }

  private withFooter(message: OutboundMessage): string {
    const lines = [message.body, '', '--', 'ReLaunch India — proof of concept. Synthetic data.'];
    if (message.correlationId) lines.push(`Reference: ${message.correlationId}`);
    return lines.join('\n');
  }
}

/**
 * Routes each channel to its provider. Email goes to SES when it is configured;
 * WhatsApp and in-app are recorded in the outbox until End User Messaging
 * Social is wired.
 */
export class RoutingSender implements MessageSender {
  constructor(private readonly local: OutboxSender, private readonly ses: SesSender | undefined) {}
  async send(message: OutboundMessage): Promise<DeliveryResult> {
    if (message.channel === 'email' && this.ses) return this.ses.send(message);
    return this.local.send(message);
  }
}

export function createSender(): MessageSender {
  const ses = config.email === 'ses' ? new SesSender() : undefined;
  if (ses) console.log(`Email: Amazon SES, region ${config.aws.region}, from ${config.aws.sesFrom}${config.aws.sesOverrideTo ? `, routed to ${config.aws.sesOverrideTo}` : ''}.`);
  return new RoutingSender(new OutboxSender(), ses);
}

export const sender = createSender();
