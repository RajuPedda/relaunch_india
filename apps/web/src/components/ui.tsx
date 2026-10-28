import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { EvidenceStatus, MatchReport, RequirementFinding, ThreadEntry } from '@relaunch/shared';
import { Icon } from './icons.js';

/* ------------------------------- layout -------------------------------- */

export function Panel({ title, hint, actions, children, flush }: {
  title?: string; hint?: string; actions?: React.ReactNode; children: React.ReactNode; flush?: boolean;
}) {
  return (
    <section className="panel">
      {title && (
        <header>
          <div className="grow">
            <h2>{title}</h2>
            {hint && <p>{hint}</p>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'body flush' : 'body'}>{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

/* ------------------------- the evidence language ------------------------ */

const STATUS_WORD: Record<EvidenceStatus, string> = {
  demonstrated: 'Demonstrated',
  self_reported: 'Self-reported',
  not_demonstrated: 'Not shown yet',
  not_met: 'Gap',
  unknown: 'Need info',
};

const STATUS_GLYPH: Record<EvidenceStatus, keyof typeof Icon> = {
  demonstrated: 'check',
  self_reported: 'alert',
  not_demonstrated: 'dash',
  not_met: 'ban',
  unknown: 'question',
};

/** State is never colour alone: every chip carries its glyph and its word. */
export function EvidenceChip({ status, title }: { status: EvidenceStatus; title?: string }) {
  const Glyph = Icon[STATUS_GLYPH[status]];
  return (
    <span className={`chip ${status}`} title={title ?? STATUS_WORD[status]}>
      <Glyph />
      {STATUS_WORD[status]}
    </span>
  );
}

export function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'outline' | 'accent' }) {
  return <span className={`chip ${tone === 'plain' ? '' : tone}`}>{children}</span>;
}

export function EvidenceLegend() {
  const order: EvidenceStatus[] = ['demonstrated', 'self_reported', 'not_demonstrated', 'not_met', 'unknown'];
  const swatch: Record<EvidenceStatus, string> = {
    demonstrated: 'var(--st-demonstrated)', self_reported: 'var(--st-self)',
    not_demonstrated: 'var(--st-none)', not_met: 'var(--st-notmet)', unknown: 'var(--st-unknown)',
  };
  return (
    <div className="legend">
      {order.map((s) => (
        <span className="key" key={s}>
          <span className="swatch" style={{ background: swatch[s] }} />
          {STATUS_WORD[s]}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------- pieces -------------------------------- */

export function Stat({ k, v, unit, note }: { k: string; v: React.ReactNode; unit?: string; note?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}{unit && <span className="unit">{unit}</span>}</div>
      {note && <div className="n">{note}</div>}
    </div>
  );
}

export function StatBand({ children }: { children: React.ReactNode }) {
  return <div className="statband">{children}</div>;
}

export function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  );
}

export function Switch({ label, help, checked, onChange }: {
  label: string; help?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="label">{label}</span>
        {help && <div className="help">{help}</div>}
      </span>
    </label>
  );
}

export function Record({ status, title, sub, right, children, onClick }: {
  status?: EvidenceStatus | 'none'; title: React.ReactNode; sub?: React.ReactNode;
  right?: React.ReactNode; children?: React.ReactNode; onClick?: () => void;
}) {
  return (
    <div className={`record${onClick ? ' interactive' : ''}`} onClick={onClick}>
      {status && <span className={`stripe ${status}`} />}
      <div className="grow stack tight">
        <div className="spread">
          <div className="grow">
            <div className="title">{title}</div>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {right && <div className="row tight" style={{ flex: 'none' }}>{right}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Ledger({ children }: { children: React.ReactNode }) {
  return <div className="ledger">{children}</div>;
}

export function Notice({ tone = 'plain', children }: {
  tone?: 'plain' | 'warn' | 'bad' | 'good' | 'info'; children: React.ReactNode;
}) {
  const Glyph = tone === 'bad' ? Icon.ban : tone === 'warn' ? Icon.alert : tone === 'good' ? Icon.check : Icon.question;
  return (
    <div className={`notice ${tone}`}>
      <span className="glyph"><Glyph /></span>
      <span className="grow">{children}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="t">{title}</div>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack tight" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton" key={i} style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/* -------------------------------- toasts -------------------------------- */

interface Toast { id: number; message: string; tone: 'ok' | 'bad' }
const ToastContext = createContext<(message: string, tone?: 'ok' | 'bad') => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.tone === 'bad' ? ' bad' : ''}`}>
            <span className="bar" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* -------------------------------- data ---------------------------------- */

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    setLoading(true);
    fn()
      .then((value) => { setData(value); setError(undefined); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { data, error, loading, reload: run };
}

/** Wraps an action so every click reports what happened. */
export function useAction(onDone?: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const run = useCallback(async (key: string, message: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      toast(message);
      onDone?.();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone, toast]);
  return { run, busy };
}

/* ----------------------------- match report ----------------------------- */

function RequirementRows({ findings }: { findings: RequirementFinding[] }) {
  return (
    <Ledger>
      {findings.map((f) => (
        <Record
          key={f.requirementId}
          status={f.status}
          title={f.text}
          sub={<>{f.note} <span className="mono">{f.sourceRef}</span></>}
          right={<EvidenceChip status={f.status} />}
        />
      ))}
    </Ledger>
  );
}

export function MatchView({ match, compact }: { match: MatchReport; compact?: boolean }) {
  const s = match.summary;
  return (
    <div className="stack">
      <StatBand>
        <Stat
          k="Must-have with evidence"
          v={<>{s.mustHaveDemonstrated}<span className="unit">/{s.mustHaveTotal}</span></>}
          note={`${s.mustHaveSelfReported} claimed · ${s.mustHaveUnknown} unknown · ${s.mustHaveNotMet} gap`}
        />
        <Stat
          k="Good-to-have with evidence"
          v={<>{s.goodToHaveDemonstrated}<span className="unit">/{s.goodToHaveTotal}</span></>}
          note="Never offsets a must-have"
        />
        <Stat
          k="Alert priority"
          v={<span style={{ fontSize: 17 }}><Chip tone="outline">{match.alertPriority}</Chip></span>}
          note={`Terms version ${match.jobTermsVersion}`}
        />
      </StatBand>

      <div>
        <Eyebrow>Must-have requirements</Eyebrow>
        <RequirementRows findings={match.mustHave} />
      </div>

      {match.goodToHave.length > 0 && (
        <div>
          <Eyebrow>Good-to-have skills</Eyebrow>
          <RequirementRows findings={match.goodToHave} />
        </div>
      )}

      {!compact && match.workEvidence.length > 0 && (
        <div>
          <Eyebrow>Work evidence</Eyebrow>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Competency</th><th>Score</th><th>Task</th><th>Review</th></tr>
              </thead>
              <tbody>
                {match.workEvidence.map((w, i) => (
                  <tr key={i}>
                    <td>{w.competencyKey}</td>
                    <td className="n">{w.score}/4</td>
                    <td className="small muted">{w.purpose}</td>
                    <td className="small muted">{w.approvedBy ?? 'not yet reviewed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!compact && (
        <div>
          <Eyebrow>Stated preferences</Eyebrow>
          <div className="row tight" style={{ marginTop: 6 }}>
            {match.preferenceFit.map((p) => (
              <span key={p.field} className="chip outline" title={`${p.candidateValue} vs ${p.jobValue}`}>
                {p.fit === 'fit' ? <Icon.check /> : p.fit === 'mismatch' ? <Icon.ban /> : <Icon.question />}
                {p.field}
              </span>
            ))}
          </div>
        </div>
      )}

      {match.flags.length > 0 && <Notice tone="warn">{match.flags.join(' ')}</Notice>}

      <p className="small muted" style={{ margin: 0 }}>
        This report orders a queue. It never rejects an applicant, and it is deliberately not a single percentage.
      </p>
    </div>
  );
}

/* -------------------------------- thread -------------------------------- */

const INITIALS = (s: string) => s.replace(/[^a-zA-Z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export function Thread({ entries, names = {} }: { entries: ThreadEntry[]; names?: Record<string, string> }) {
  return (
    <div className="thread">
      {entries.map((e) => (
        <div key={e.id} className={`msg ${e.author}`}>
          <span className="who">{e.author === 'system' ? <Icon.signal /> : INITIALS(names[e.authorId] ?? e.authorId)}</span>
          <div className="bubble">
            <div className="meta">
              {names[e.authorId] ?? e.author} · {e.kind.replace(/_/g, ' ')} · {new Date(e.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
            <div>{e.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReplyBox({ onSend, placeholder = 'Write a message', busy }: {
  onSend: (body: string) => void; placeholder?: string; busy?: boolean;
}) {
  const [body, setBody] = useState('');
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && body) { onSend(body); setBody(''); } }}
        placeholder={placeholder}
      />
      <button className="btn" disabled={!body || busy} onClick={() => { onSend(body); setBody(''); }}>
        <Icon.send /> Send
      </button>
    </div>
  );
}

/* -------------------------------- journey ------------------------------- */

export interface Stop { title: string; detail: string; done: boolean }

export function Journey({ stops }: { stops: Stop[] }) {
  const current = useMemo(() => stops.findIndex((s) => !s.done), [stops]);
  return (
    <div className="journey">
      {stops.map((s, i) => (
        <div key={s.title} className={`stop${s.done ? ' done' : ''}${i === current ? ' current' : ''}`}>
          <span className="n">{String(i + 1).padStart(2, '0')}</span>
          <span className="t">{s.title}</span>
          <span className="d">{s.detail}</span>
        </div>
      ))}
    </div>
  );
}
