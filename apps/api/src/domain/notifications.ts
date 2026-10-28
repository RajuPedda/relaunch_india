import { newId, nowIso, type Channel, type Notification, type NotificationPrefs, type Persona, type Profile } from '@relaunch/shared';
import { sender } from '../adapters/messaging.js';
import { audit, store } from './db.js';

export interface NotifyInput {
  recipientId: string;
  recipientRole: Persona;
  type: string;
  subject: string;
  body: string;
  data?: Record<string, unknown>;
  /** Identical content for the same recipient collapses on this key. */
  dedupeKey: string;
  /** Alert categories that the recipient can switch off. */
  category?: 'job_alert' | 'application' | 'evidence' | 'employer_discovery' | 'system';
  channels?: Channel[];
  /** Transactional messages (a reply in a thread the person is in) ignore digests. */
  transactional?: boolean;
}

/**
 * One gate for every outbound message. It applies, in order:
 * consent and category preferences, pause, deduplication, quiet hours, digest,
 * then delivery on the recipient's chosen channels.
 */
export async function notify(input: NotifyInput, at = new Date()): Promise<Notification> {
  const profile = await store.get<Profile>('profile', input.recipientId);
  const prefs = profile?.notifications;

  const base: Notification = {
    id: newId('ntf'), kind: 'notification',
    recipientId: input.recipientId, recipientRole: input.recipientRole,
    channel: 'in_app', type: input.type, subject: input.subject, body: input.body,
    data: input.data ?? {}, dedupeKey: input.dedupeKey, state: 'queued', reason: '',
    createdAt: nowIso(),
  };

  const blocked = consentGate(input, prefs);
  if (blocked) return finish({ ...base, state: 'suppressed', reason: blocked });

  const duplicate = (await store.find<Notification>('notification', (n) =>
    n.recipientId === input.recipientId && n.dedupeKey === input.dedupeKey && n.state !== 'suppressed')).length > 0;
  if (duplicate) return finish({ ...base, state: 'suppressed', reason: 'Duplicate of a message already delivered or queued.' });

  const channels = input.channels ?? prefs?.channels ?? ['email', 'in_app'];

  if (prefs && !input.transactional && prefs.digest === 'daily') {
    return finish({ ...base, state: 'digested', reason: 'Held for the daily digest.', scheduledFor: nextDigestAt(prefs, at) });
  }

  if (prefs && !input.transactional && inQuietHours(prefs, at)) {
    return finish({ ...base, state: 'deferred_quiet_hours', reason: `Quiet hours ${prefs.quietHours.start}-${prefs.quietHours.end} ${prefs.quietHours.tz}.`, scheduledFor: quietHoursEnd(prefs, at) });
  }

  return deliver(base, channels, profile);
}

function consentGate(input: NotifyInput, prefs?: NotificationPrefs): string | undefined {
  if (!prefs) return undefined; // employer and admin recipients have no opt-out on transactional updates
  if (prefs.paused) return 'Recipient has paused alerts.';
  if (input.category === 'job_alert' && !prefs.jobAlerts) return 'Recipient switched off job alerts.';
  if (input.category === 'employer_discovery' && !prefs.employerDiscoveryOptIn) return 'Profile discovery alerts require explicit opt-in.';
  return undefined;
}

async function deliver(notification: Notification, channels: Channel[], profile?: Profile): Promise<Notification> {
  let last: Notification = notification;
  for (const channel of channels) {
    const to = channel === 'whatsapp' ? profile?.phone ?? '' : channel === 'email' ? profile?.email ?? '' : profile?.id ?? notification.recipientId;
    if (channel !== 'in_app' && !to) continue;
    const result = await sender.send({
      channel, to,
      subject: notification.subject,
      body: notification.body,
      correlationId: String(notification.data.applicationId ?? notification.data.jobId ?? notification.id),
    });
    last = {
      ...notification,
      id: newId('ntf'), channel,
      state: result.ok ? 'sent' : 'failed',
      reason: result.ok ? `Delivered via ${result.provider} (${result.providerMessageId}).` : result.error ?? 'delivery failed',
      sentAt: nowIso(),
    };
    await store.put('notification', last.id, last);
  }
  if (last === notification) return finish({ ...notification, state: 'failed', reason: 'No usable channel for this recipient.' });
  await audit('system', 'notification.sent', notification.recipientId, { type: notification.type });
  return last;
}

async function finish(notification: Notification): Promise<Notification> {
  await store.put('notification', notification.id, notification);
  return notification;
}

/* ----------------------------- quiet hours ----------------------------- */

function localHhmm(tz: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

export function inQuietHours(prefs: NotificationPrefs, at: Date): boolean {
  const now = localHhmm(prefs.quietHours.tz, at);
  const { start, end } = prefs.quietHours;
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

function quietHoursEnd(prefs: NotificationPrefs, at: Date): string {
  const [h, m] = prefs.quietHours.end.split(':').map(Number);
  const next = new Date(at);
  next.setUTCHours((h ?? 8) - 5, (m ?? 0) - 30, 0, 0); // IST offset, good enough for the POC
  if (next <= at) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function nextDigestAt(prefs: NotificationPrefs, at: Date): string {
  const next = new Date(at);
  next.setUTCHours(3, 30, 0, 0); // 09:00 IST
  if (next <= at) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/**
 * Flushes everything held back by quiet hours, and rolls each recipient's
 * digest into one message. The demo and the UI both call this.
 */
export async function releaseHeldNotifications(at = new Date()): Promise<{ released: number; digests: number }> {
  const held = await store.find<Notification>('notification', (n) => n.state === 'deferred_quiet_hours' || n.state === 'digested');
  const byRecipient = new Map<string, Notification[]>();
  for (const n of held) {
    byRecipient.set(n.recipientId, [...(byRecipient.get(n.recipientId) ?? []), n]);
  }

  let released = 0, digests = 0;
  for (const [recipientId, items] of byRecipient) {
    const profile = await store.get<Profile>('profile', recipientId);
    const deferred = items.filter((i) => i.state === 'deferred_quiet_hours');
    const digested = items.filter((i) => i.state === 'digested');

    for (const item of deferred) {
      await store.update<Notification>('notification', item.id, { state: 'queued' });
      await deliver({ ...item, state: 'queued' }, profile?.notifications.channels ?? ['email'], profile);
      await store.update<Notification>('notification', item.id, { state: 'sent', sentAt: nowIso(), reason: 'Released after quiet hours.' });
      released++;
    }

    if (digested.length) {
      const summary: Notification = {
        id: newId('ntf'), kind: 'notification', recipientId, recipientRole: digested[0]!.recipientRole,
        channel: 'email', type: 'digest',
        subject: `ReLaunch daily digest - ${digested.length} update(s)`,
        body: digested.map((d, i) => `${i + 1}. ${d.subject}\n   ${d.body}`).join('\n\n'),
        data: { items: digested.map((d) => d.id) }, dedupeKey: `digest:${recipientId}:${at.toISOString().slice(0, 10)}`,
        state: 'queued', reason: '', createdAt: nowIso(),
      };
      await deliver(summary, profile?.notifications.channels ?? ['email'], profile);
      for (const d of digested) await store.update<Notification>('notification', d.id, { state: 'sent', reason: 'Delivered inside the daily digest.', sentAt: nowIso() });
      digests++;
      released += digested.length;
    }
  }
  return { released, digests };
}
