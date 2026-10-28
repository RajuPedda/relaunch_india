import React, { useState } from 'react';
import type { Application, Job, MatchReport, Organization, Profile, Requirement, ThreadEntryKind } from '@relaunch/shared';
import { api } from '../lib/api.js';
import { Icon } from '../components/icons.js';
import {
  Chip, Empty, EvidenceChip, Eyebrow, Field, Ledger, MatchView, Notice, Panel, Record,
  ReplyBox, Skeleton, Stat, StatBand, Thread, useAction, useAsync,
} from '../components/ui.js';

const SAMPLE = `Must have
- Design test cases covering requirements including boundary and negative conditions
- Write deterministic tests that do not depend on timing or random data

Good to have
- Exposure to performance testing
`;

export function Employer({ orgs, jobs, profiles, reload }: {
  orgs: Organization[]; jobs: Job[]; profiles: Profile[]; reload: () => void;
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');
  const ownJobs = jobs.filter((j) => j.orgId === orgId);
  const applications = useAsync(() => api.get<Application[]>(`/applications?orgId=${orgId}`), [orgId, jobs.length]);

  function refresh() { applications.reload(); reload(); }
  const published = ownJobs.filter((j) => j.status === 'published');
  const apps = applications.data ?? [];

  return (
    <>
      <Panel
        title={orgs.find((o) => o.id === orgId)?.name ?? 'Employer'}
        hint={orgs.find((o) => o.id === orgId)?.industry}
        actions={
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="pick" aria-label="Switch employer">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        }
        flush
      >
        <StatBand>
          <Stat k="Published roles" v={published.length} note={`${ownJobs.length} in total`} />
          <Stat k="Applications" v={apps.length} note={`${apps.filter((a) => a.status === 'submitted').length} not yet opened`} />
          <Stat k="Waiting on you" v={apps.filter((a) => a.nextAction.toLowerCase().startsWith('employer')).length} note="Your confirmed next action" />
          <Stat k="On superseded terms" v={apps.filter((a) => a.status === 'superseded').length} note="Cannot progress until re-confirmed" />
        </StatBand>
      </Panel>

      <div className="grid sidebar-right">
        <Applicants applications={apps} jobs={ownJobs} profiles={profiles} orgId={orgId} loading={applications.loading} onDone={refresh} />
        <div className="stack">
          <NewJob orgId={orgId} onDone={refresh} />
          <JobList jobs={ownJobs} onDone={refresh} />
        </div>
      </div>
    </>
  );
}

/* ------------------------------ publishing ------------------------------ */

function NewJob({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [form, setForm] = useState({ title: 'Senior QA Engineer', roleFamily: 'it_testing', location: 'Hyderabad', description: SAMPLE });
  const [draft, setDraft] = useState<Job>();
  const { run, busy } = useAction(onDone);

  function update(index: number, patch: Partial<Requirement>) {
    if (!draft) return;
    setDraft({ ...draft, requirements: draft.requirements.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  }

  return (
    <Panel
      title="Publish a role"
      hint="Requirements are extracted with AI assistance. None of them is authoritative until you confirm it."
    >
      {!draft && (
        <>
          <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <div className="row">
            <Field label="Role family">
              <select value={form.roleFamily} onChange={(e) => setForm({ ...form, roleFamily: e.target.value })}>
                <option value="it_testing">IT testing</option>
                <option value="teaching">Teaching</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </Field>
            <Field label="Location"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          </div>
          <Field label="Description" help="Use 'Must have' and 'Good to have' headings; everything under them is extracted.">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ minHeight: 130 }} />
          </Field>
          <button className="btn" disabled={busy === 'draft'} onClick={() =>
            run('draft', 'Requirements extracted. Confirm each one.', async () => {
              setDraft(await api.post<Job>('/jobs', { ...form, orgId, workMode: 'hybrid', compensationLpa: { min: 14, max: 20 } }, orgId));
            })}>
            <Icon.arrow /> Extract requirements
          </button>
        </>
      )}

      {draft && (
        <>
          <Notice tone="info">
            {draft.requirements.length} requirements extracted from the description. Correct the wording or the kind,
            then confirm. Nothing publishes while one is unconfirmed.
          </Notice>
          <div className="stack tight">
            {draft.requirements.map((r, i) => (
              <div className="row" key={r.id} style={{ flexWrap: 'nowrap' }}>
                <select value={r.kind} onChange={(e) => update(i, { kind: e.target.value as Requirement['kind'] })} style={{ width: 128, flex: 'none' }}>
                  <option value="must_have">Must have</option>
                  <option value="good_to_have">Good to have</option>
                </select>
                <input value={r.text} onChange={(e) => update(i, { text: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="row">
            <button className="btn secondary small" onClick={() => setDraft(undefined)}>Discard</button>
            <div className="grow" />
            <button className="btn" disabled={busy === 'publish'} onClick={() =>
              run('publish', 'Role published. Matching candidates have been alerted.', async () => {
                await api.post(`/jobs/${draft.id}/requirements`, { requirements: draft.requirements }, orgId);
                await api.post(`/jobs/${draft.id}/publish`, {}, orgId);
                setDraft(undefined);
              })}>
              <Icon.check /> Confirm all and publish
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

function JobList({ jobs, onDone }: { jobs: Job[]; onDone: () => void }) {
  const [openId, setOpenId] = useState<string>();
  const { run, busy } = useAction(onDone);
  const matches = useAsync(() => (openId ? api.get<MatchReport[]>(`/jobs/${openId}/matches`) : Promise.resolve([])), [openId, jobs]);

  return (
    <Panel title="Your roles" hint="Changing published terms bumps the version; applications on the old terms stop until the candidate re-confirms." flush>
      {jobs.length === 0 && <Empty title="No roles yet">Publish one above.</Empty>}
      <Ledger>
        {jobs.map((job) => (
          <Record
            key={job.id}
            title={job.title}
            sub={<>{job.status} · terms v{job.termsVersion} · {job.location} · {job.workMode}</>}
            right={<>
              <button className="btn small quiet" onClick={() => setOpenId(openId === job.id ? undefined : job.id)}>
                {openId === job.id ? 'Hide matches' : 'Matches'}
              </button>
              {job.status === 'published' && (
                <>
                  <button className="btn small secondary" disabled={busy === job.id} onClick={() =>
                    run(job.id, 'Terms changed. Existing applications are superseded.', () =>
                      api.patch(`/jobs/${job.id}`, { patch: { compensationLpa: { min: 12, max: 17 } }, changes: ['compensation band lowered'] }, job.orgId))}>
                    Change terms
                  </button>
                  <button className="btn small quiet" disabled={busy === job.id} onClick={() =>
                    run(job.id, 'Role closed. Applicants were told.', () => api.post(`/jobs/${job.id}/close`, {}, job.orgId))}>
                    Close
                  </button>
                </>
              )}
            </>}
          >
            {openId === job.id && (
              <div className="stack" style={{ marginTop: 8 }}>
                {matches.loading && <Skeleton rows={2} />}
                {!matches.loading && (matches.data ?? []).length === 0 && <div className="small muted">No computed matches yet.</div>}
                {(matches.data ?? []).slice(0, 3).map((m) => (
                  <div key={m.id} className="stack tight">
                    <Eyebrow>{m.profileId}</Eyebrow>
                    <MatchView match={m} compact />
                  </div>
                ))}
              </div>
            )}
          </Record>
        ))}
      </Ledger>
    </Panel>
  );
}

/* ------------------------------ applicants ------------------------------ */

const ACTIONS: { kind: ThreadEntryKind; label: string; body: string }[] = [
  { kind: 'clarification_request', label: 'Ask for clarification', body: 'Could you point us at a reviewed sample for the requirement marked self-reported?' },
  { kind: 'assessment_invite', label: 'Invite to an assessment', body: 'We would like you to complete a short unseen task so that gap is evidenced.' },
  { kind: 'interview_offer', label: 'Offer an interview', body: 'Thursday 11:00 IST with the QA lead, 45 minutes, walking through your work sample.' },
  { kind: 'status_update', label: 'Send a status update', body: 'Your application is with the hiring manager this week.' },
];

function Applicants({ applications, jobs, profiles, orgId, loading, onDone }: {
  applications: Application[]; jobs: Job[]; profiles: Profile[]; orgId: string; loading: boolean; onDone: () => void;
}) {
  const [openId, setOpenId] = useState<string>();
  const detail = useAsync(
    () => (openId ? api.get<{ application: Application; match?: MatchReport }>(`/applications/${openId}`) : Promise.resolve(undefined as any)),
    [openId, applications],
  );
  const { run, busy } = useAction(() => { detail.reload(); onDone(); });
  const name = (id: string) => profiles.find((p) => p.id === id)?.name ?? id;

  return (
    <Panel
      title="Applications"
      hint="Must-have, good-to-have and work evidence stay separate. Every applicant remains visible to your recruiters."
      flush
    >
      {loading && <div className="body"><Skeleton rows={3} /></div>}
      {!loading && applications.length === 0 && (
        <Empty title="No applications yet">Publish a role, then apply as a worker to watch the report arrive.</Empty>
      )}

      {applications.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Applicant</th><th>Role</th><th>Applied</th><th>Status</th><th>Next action</th><th /></tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id}>
                  <td>{name(a.profileId)}</td>
                  <td className="small muted">{jobs.find((j) => j.id === a.jobId)?.title ?? a.jobId}</td>
                  <td className="n">{new Date(a.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  <td><Chip tone="outline">{a.status.replace(/_/g, ' ')}</Chip></td>
                  <td className="small muted">{a.nextAction}</td>
                  <td>
                    <button className="btn small secondary" onClick={() => setOpenId(openId === a.id ? undefined : a.id)}>
                      {openId === a.id ? 'Close' : 'Open'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && detail.data && (
        <div className="body" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="spread">
            <div>
              <Eyebrow>Match report</Eyebrow>
              <div style={{ fontWeight: 500 }}>{name(detail.data.application.profileId)}</div>
            </div>
            <Chip tone="outline">terms v{detail.data.application.jobTermsVersion}</Chip>
          </div>
          {detail.data.match && <MatchView match={detail.data.match} />}

          <Eyebrow>Conversation</Eyebrow>
          <Thread
            entries={detail.data.application.thread}
            names={{ ...Object.fromEntries(profiles.map((p) => [p.id, p.name])), [orgId]: 'You' }}
          />
          <div className="row tight">
            {ACTIONS.map((action) => (
              <button
                key={action.kind}
                className="btn small secondary"
                disabled={busy === action.kind}
                onClick={() => run(action.kind, `Sent: ${action.label.toLowerCase()}.`, () =>
                  api.post(`/applications/${openId}/thread`, { author: 'employer', authorId: orgId, kind: action.kind, body: action.body }, orgId))}
              >
                {action.label}
              </button>
            ))}
          </div>
          <ReplyBox
            placeholder="Write your own message"
            busy={busy === 'reply'}
            onSend={(body) => run('reply', 'Message sent.', () =>
              api.post(`/applications/${openId}/thread`, { author: 'employer', authorId: orgId, kind: 'reply', body }, orgId))}
          />
        </div>
      )}
    </Panel>
  );
}
