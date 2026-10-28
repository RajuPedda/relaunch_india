import React from 'react';
import type { AuditEntry, DomainEvent, Notification, Organization, Profile } from '@relaunch/shared';
import { api } from '../lib/api.js';
import { Icon } from '../components/icons.js';
import {
  Chip, Empty, Eyebrow, Ledger, Panel, Record, Skeleton, Stat, StatBand, useAction, useAsync,
} from '../components/ui.js';

interface OutboxMessage {
  channel: string; to: string; subject: string; body: string;
  at: string; providerMessageId: string; provider?: string; error?: string;
}

const CHANNEL = {
  whatsapp: { glyph: Icon.whatsapp, provider: 'End User Messaging Social' },
  email: { glyph: Icon.mail, provider: 'SES' },
  in_app: { glyph: Icon.monitor, provider: 'in-app' },
} as const;

export function Ops({ profiles, orgs }: { profiles: Profile[]; orgs: Organization[] }) {
  const outbox = useAsync(() => api.get<OutboxMessage[]>('/outbox'), []);
  const notifications = useAsync(() => api.get<Notification[]>('/notifications'), []);
  const events = useAsync(() => api.get<DomainEvent[]>('/events'), []);
  const audit = useAsync(() => api.get<AuditEntry[]>('/audit'), []);
  const { run, busy } = useAction(() => { outbox.reload(); notifications.reload(); });

  const all = notifications.data ?? [];
  const held = all.filter((n) => n.state === 'deferred_quiet_hours' || n.state === 'digested');
  const suppressed = all.filter((n) => n.state === 'suppressed');
  const name = (id: string) =>
    profiles.find((p) => p.id === id)?.name ?? orgs.find((o) => o.id === id)?.name ?? id;

  return (
    <>
      <Panel
        title="Delivery"
        hint="Every message passed the consent, deduplication, quiet-hours and digest gate before it left."
        actions={
          <>
            <button className="btn small secondary" disabled={busy === 'release'} onClick={() =>
              run('release', 'Held messages released and digests sent.', () => api.post('/notifications/release'))}>
              Release held messages
            </button>
            <button className="btn small quiet" onClick={() => { outbox.reload(); notifications.reload(); events.reload(); audit.reload(); }}>
              <Icon.refresh /> Refresh
            </button>
          </>
        }
        flush
      >
        <StatBand>
          <Stat
            k="Delivered"
            v={(outbox.data ?? []).filter((m) => !m.error).length}
            note={`${(outbox.data ?? []).filter((m) => m.provider === 'amazon-ses' && !m.error).length} through Amazon SES`}
          />
          <Stat k="Held" v={held.length} note="quiet hours or a daily digest" />
          <Stat k="Suppressed" v={suppressed.length} note="preference, pause or duplicate" />
          <Stat k="Events" v={(events.data ?? []).length} note="on the bus" />
        </StatBand>
      </Panel>

      <div className="grid sidebar-right">
        <Panel title="Outbox" hint="What SES and End User Messaging Social would have delivered." flush>
          {outbox.loading && <div className="body"><Skeleton rows={3} /></div>}
          {!outbox.loading && (outbox.data ?? []).length === 0 && <Empty title="Nothing sent yet">Publish a role to start the flow.</Empty>}
          <div className="body">
            {(outbox.data ?? []).slice(0, 14).map((m) => {
              const meta = CHANNEL[m.channel as keyof typeof CHANNEL] ?? CHANNEL.in_app;
              const Glyph = meta.glyph;
              return (
                <div className="envelope" key={m.providerMessageId}>
                  <div className="head">
                    <Glyph />
                    <span className="subject grow">{m.subject}</span>
                    {m.provider && (
                      <Chip tone={m.provider === 'amazon-ses' ? 'accent' : 'outline'}>
                        {m.provider}{m.providerMessageId ? ` · ${m.providerMessageId.slice(0, 12)}` : ''}
                      </Chip>
                    )}
                    <span className="small muted mono">{m.to}</span>
                  </div>
                  {m.error && <div className="small" style={{ padding: '6px 12px', color: 'var(--st-notmet-fg)' }}>Delivery failed: {m.error}</div>}
                  <pre>{m.body}</pre>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="stack">
          <Panel title="Held and suppressed" hint="Why a message was not sent is recorded, never hidden." flush>
            {held.length + suppressed.length === 0 && <Empty title="Nothing withheld" />}
            <Ledger>
              {[...held, ...suppressed].slice(0, 12).map((n) => (
                <Record
                  key={n.id}
                  status={n.state === 'suppressed' ? 'not_demonstrated' : 'self_reported'}
                  title={n.subject}
                  sub={<>{name(n.recipientId)} · {n.reason}</>}
                  right={<Chip tone="outline">{n.state.replace(/_/g, ' ')}</Chip>}
                />
              ))}
            </Ledger>
          </Panel>

          <Panel title="Event bus" hint="Each name is an EventBridge rule that recomputes matches and notifies." flush>
            <Ledger>
              {(events.data ?? []).slice(0, 12).map((e) => (
                <Record
                  key={e.id}
                  title={<span className="mono">{e.name}</span>}
                  sub={new Date(e.at).toLocaleTimeString('en-IN')}
                />
              ))}
            </Ledger>
          </Panel>
        </div>
      </div>

      <Panel title="Consent and audit trail" hint="So a person can ask what was shared, when, and on which version of the terms." flush>
        {audit.loading && <div className="body"><Skeleton rows={4} /></div>}
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Subject</th></tr></thead>
            <tbody>
              {(audit.data ?? []).slice(0, 25).map((a) => (
                <tr key={a.id}>
                  <td className="small muted">{new Date(a.createdAt).toLocaleTimeString('en-IN')}</td>
                  <td className="small">{name(a.actor)}</td>
                  <td><span className="mono">{a.action}</span></td>
                  <td className="small muted mono">{a.subject}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
