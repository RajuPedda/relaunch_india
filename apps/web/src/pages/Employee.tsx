import React, { useMemo, useState } from 'react';
import type { Application, Assessment, EvidenceItem, Job, MatchReport, Notification, Profile, RoleConfig, Submission } from '@relaunch/shared';
import { api } from '../lib/api.js';
import { Icon } from '../components/icons.js';
import {
  Chip, Empty, EvidenceChip, EvidenceLegend, Eyebrow, Field, Journey, Ledger, MatchView, Notice,
  Panel, Record, ReplyBox, Skeleton, Stat, StatBand, Switch, Thread, useAction, useAsync,
} from '../components/ui.js';
import { StatusSpread } from '../components/charts.js';

export function Employee({ profiles, jobs, reload }: { profiles: Profile[]; jobs: Job[]; reload: () => void }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const profile = profiles.find((p) => p.id === profileId);

  const alerts = useAsync(() => api.get<Notification[]>(`/notifications?recipientId=${profileId}`), [profileId]);
  const matches = useAsync(() => api.get<MatchReport[]>(`/profiles/${profileId}/matches`), [profileId]);
  const evidence = useAsync(() => api.get<EvidenceItem[]>(`/profiles/${profileId}/evidence`), [profileId]);
  const applications = useAsync(() => api.get<Application[]>(`/applications?profileId=${profileId}`), [profileId]);
  const assessments = useAsync(() => api.get<Assessment[]>(`/assessments?profileId=${profileId}`), [profileId]);
  const roles = useAsync(() => api.get<RoleConfig[]>('/roles'), []);

  const role = roles.data?.find((r) => r.roleFamily === profile?.roleFamily && r.status === 'approved');

  function refreshAll() {
    alerts.reload(); matches.reload(); evidence.reload(); applications.reload(); assessments.reload(); reload();
  }

  const stops = useMemo(() => {
    const own = assessments.data ?? [];
    const reassessed = own.find((a) => a.purpose === 'reassessment' && a.status === 'approved');
    return [
      { title: 'Role understood', detail: role ? role.title : 'No approved configuration', done: Boolean(role) },
      { title: 'Baseline assessed', detail: own.some((a) => a.purpose === 'baseline') ? 'Work sample on file' : 'Submit a work sample', done: own.some((a) => a.purpose === 'baseline') },
      { title: 'Workflow practised', detail: own.some((a) => a.purpose === 'practice') ? 'Gaps worked through' : 'Practice the observed gaps', done: own.some((a) => a.purpose === 'practice') },
      { title: 'Reassessed, reviewed', detail: reassessed ? 'Unseen task, human-reviewed' : 'Unseen comparable task', done: Boolean(reassessed) },
      { title: 'Acted on evidence', detail: (applications.data ?? []).length ? 'Application in progress' : 'Apply or move internally', done: (applications.data ?? []).length > 0 },
    ];
  }, [assessments.data, applications.data, role]);

  if (!profile) return <Panel title="No profile"><Empty title="Seed the demo data first." /></Panel>;

  const ev = evidence.data ?? [];
  const spread = [
    { status: 'demonstrated', label: 'Demonstrated', value: ev.filter((e) => e.status === 'demonstrated').length },
    { status: 'self_reported', label: 'Self-reported', value: ev.filter((e) => e.status === 'self_reported').length },
    { status: 'not_demonstrated', label: 'Not shown yet', value: ev.filter((e) => e.status === 'not_demonstrated').length },
    { status: 'not_met', label: 'Gap', value: ev.filter((e) => e.status === 'not_met').length },
  ];

  return (
    <>
      <Panel
        title={profile.name}
        hint={profile.headline}
        actions={
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="pick" aria-label="Switch person">
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.roleFamily}</option>)}
          </select>
        }
        flush
      >
        <Journey stops={stops} />
      </Panel>

      <div className="grid sidebar-right">
        <div className="stack">
          {role
            ? <WorkPanel profile={profile} role={role} onDone={refreshAll} />
            : (
              <Panel title="Assessment">
                <Notice tone="warn">
                  No expert-approved configuration exists for {profile.roleFamily} yet. Work cannot be assessed until
                  a domain expert approves one on the Role configuration screen.
                </Notice>
              </Panel>
            )}
          <AlertsPanel alerts={alerts.data ?? []} matches={matches.data ?? []} jobs={jobs} loading={alerts.loading} />
        </div>

        <div className="stack">
          <Panel title="Evidence on file" hint="Reviewed evidence and claims are kept apart, with the source of each." flush>
            <div className="body">
              {ev.length > 0 && <StatusSpread counts={spread} />}
            </div>
            {ev.length === 0
              ? <Empty title="Nothing on file yet">Complete a baseline work sample and the first evidence appears here.</Empty>
              : (
                <Ledger>
                  {ev.map((e) => (
                    <Record
                      key={e.id}
                      status={e.status}
                      title={<span className="mono">{e.competencyKey}</span>}
                      sub={<>{e.sourceKind.replace('_', ' ')} · <span className="mono">{e.sourceRef}</span>{e.score !== undefined && ` · ${e.score}/4`}{e.approvedBy ? ` · reviewed by ${e.approvedBy}` : ''} · v{e.version}</>}
                      right={<EvidenceChip status={e.status} />}
                    />
                  ))}
                </Ledger>
              )}
          </Panel>

          <Preferences profile={profile} onSaved={refreshAll} />
        </div>
      </div>

      <ApplyPanel profile={profile} jobs={jobs} applications={applications.data ?? []} onDone={refreshAll} />
    </>
  );
}

/* ------------------------------ preferences ----------------------------- */

function Preferences({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [prefs, setPrefs] = useState(profile.notifications);
  const { run, busy } = useAction(onSaved);
  React.useEffect(() => setPrefs(profile.notifications), [profile.id]);

  return (
    <Panel
      title="Alerts, visibility and consent"
      hint="Asked at registration, changeable at any time. Nothing here is inferred."
      actions={
        <button className="btn small" disabled={busy === 'save'} onClick={() =>
          run('save', 'Preferences saved.', () => api.patch(`/profiles/${profile.id}`, { notifications: prefs }, profile.id))}>
          Save
        </button>
      }
    >
      <Switch label="Job alerts" help="New and changed roles that match your evidence."
        checked={prefs.jobAlerts} onChange={(v) => setPrefs({ ...prefs, jobAlerts: v })} />
      <Switch label="Let employers discover my profile" help="Off by default. Broader discovery needs this explicit opt-in."
        checked={prefs.employerDiscoveryOptIn} onChange={(v) => setPrefs({ ...prefs, employerDiscoveryOptIn: v })} />
      <Switch label="Search confidentially" help="Keeps an external search out of the employer-sponsored programme: your sponsoring employer never sees you in its own postings."
        checked={prefs.confidentialSearch} onChange={(v) => setPrefs({ ...prefs, confidentialSearch: v })} />
      <Switch label="Pause everything" help="No messages on any channel until you switch this back off."
        checked={prefs.paused} onChange={(v) => setPrefs({ ...prefs, paused: v })} />

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Quiet from">
          <input value={prefs.quietHours.start} onChange={(e) => setPrefs({ ...prefs, quietHours: { ...prefs.quietHours, start: e.target.value } })} />
        </Field>
        <Field label="Until">
          <input value={prefs.quietHours.end} onChange={(e) => setPrefs({ ...prefs, quietHours: { ...prefs.quietHours, end: e.target.value } })} />
        </Field>
        <Field label="Delivery">
          <select value={prefs.digest} onChange={(e) => setPrefs({ ...prefs, digest: e.target.value as 'off' | 'daily' })}>
            <option value="off">As they happen</option>
            <option value="daily">One daily digest</option>
          </select>
        </Field>
      </div>
      <div className="small muted">Times are {prefs.quietHours.tz}.</div>
    </Panel>
  );
}

/* --------------------------------- alerts -------------------------------- */

const CHANNEL_GLYPH = { whatsapp: Icon.whatsapp, email: Icon.mail, in_app: Icon.monitor };

function AlertsPanel({ alerts, matches, jobs, loading }: {
  alerts: Notification[]; matches: MatchReport[]; jobs: Job[]; loading: boolean;
}) {
  const [openMatch, setOpenMatch] = useState<string>();
  const match = matches.find((m) => m.id === openMatch);

  // One message delivered on three channels is one message. Group by the
  // dedupe key and show which channels it went out on.
  const delivered = useMemo(() => {
    const groups = new Map<string, { message: Notification; channels: Notification['channel'][] }>();
    for (const n of alerts.filter((a) => a.state === 'sent')) {
      const group = groups.get(n.dedupeKey);
      if (group) group.channels.push(n.channel);
      else groups.set(n.dedupeKey, { message: n, channels: [n.channel] });
    }
    return [...groups.values()];
  }, [alerts]);

  return (
    <Panel title="Your messages" hint="Every alert names the matched requirements, the evidence gaps and the next step." flush>
      {loading && <div className="body"><Skeleton /></div>}
      {!loading && delivered.length === 0 && <Empty title="No messages yet">Publish a role from the Employer screen to see an alert arrive.</Empty>}
      <div className="body">
        {delivered.slice(0, 6).map(({ message: n, channels }) => {
          const matchId = typeof n.data.matchReportId === 'string' ? n.data.matchReportId : undefined;
          return (
            <div className="envelope" key={n.id}>
              <div className="head">
                <span className="row tight" style={{ gap: 4 }} title={`Delivered on ${channels.join(', ')}`}>
                  {channels.map((channel) => {
                    const Glyph = CHANNEL_GLYPH[channel] ?? Icon.monitor;
                    return <Glyph key={channel} />;
                  })}
                </span>
                <span className="subject grow">{n.subject}</span>
                {matchId && (
                  <button className="btn small secondary" onClick={() => setOpenMatch(openMatch === matchId ? undefined : matchId)}>
                    {openMatch === matchId ? 'Hide report' : 'Match report'}
                  </button>
                )}
              </div>
              <pre>{n.body}</pre>
            </div>
          );
        })}
      </div>
      {match && (
        <div className="body" style={{ borderTop: '1px solid var(--line)' }}>
          <Eyebrow>{jobs.find((j) => j.id === match.jobId)?.title ?? 'Match report'}</Eyebrow>
          <MatchView match={match} />
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------- work sample ----------------------------- */

function WorkPanel({ profile, role, onDone }: { profile: Profile; role: RoleConfig; onDone: () => void }) {
  const [taskId, setTaskId] = useState(role.tasks[0]?.id ?? '');
  const task = role.tasks.find((t) => t.id === taskId);
  const [artifact, setArtifact] = useState('');
  const [summary, setSummary] = useState('');
  const [verification, setVerification] = useState('');
  const [sources, setSources] = useState('');
  const [minutes, setMinutes] = useState(45);
  const [result, setResult] = useState<{ assessment: Assessment; submission: Submission }>();
  const { run, busy } = useAction(onDone);

  const lesson = useMemo(
    () => role.lessons.find((l) => result?.assessment.findings.some((f) => f.score < 3 && f.competencyKey === l.competencyKey)) ?? role.lessons[0],
    [role, result],
  );

  function submit() {
    return run('submit', 'Work sample assessed.', async () => {
      const response = await api.post<{ assessment: Assessment; submission: Submission }>('/submissions', {
        profileId: profile.id, roleId: role.id, taskId, artifact,
        fields: { summary, verificationNotes: verification, objectives: summary, openItems: summary },
        citedSources: sources.split(',').map((s) => s.trim()).filter(Boolean),
        assistance: { tools: role.permittedAiTools, aiShare: 0.6, notes: 'Drafted with the approved assistant.' },
        workerMinutes: minutes,
      }, profile.id);
      setResult(response);
    });
  }

  return (
    <>
      <Panel
        title="Work sample"
        hint={`${role.title}. Permitted tools: ${role.permittedAiTools.join(', ') || 'none'}.`}
        actions={
          <select value={taskId} onChange={(e) => { setTaskId(e.target.value); setResult(undefined); }} className="pick" aria-label="Task">
            {role.tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        }
      >
        {task && (
          <div className="stack tight">
            <p style={{ margin: 0 }}>{task.brief}</p>
            <div className="row tight">
              {task.unseen && <Chip tone="accent">unseen task</Chip>}
              <Chip tone="outline">difficulty {task.difficulty}/5</Chip>
              <Chip tone="outline">{role.referenceMaterial.map((r) => r.id).join(' · ') || 'no reference material'}</Chip>
            </div>
            {task.acceptanceConditions.length > 0 && (
              <div className="small muted">Accepted when: {task.acceptanceConditions.join('; ')}.</div>
            )}
          </div>
        )}

        <Field label="Your work artifact">
          <textarea value={artifact} onChange={(e) => setArtifact(e.target.value)} placeholder="Paste the work you produced." />
        </Field>
        <div className="grid two" style={{ gap: 12 }}>
          <Field label="Summary"><input value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
          <Field label="Sources cited" help="Ids from the supplied reference material, comma separated.">
            <input value={sources} onChange={(e) => setSources(e.target.value)} placeholder="REQ-CHK-01, REQ-CHK-02" />
          </Field>
        </div>
        <Field label="What you verified yourself" help="Name what you checked against the source and what you corrected.">
          <input value={verification} onChange={(e) => setVerification(e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Minutes spent">
            <input type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={{ width: 110 }} />
          </Field>
          <div className="grow" />
          <button className="btn" onClick={submit} disabled={busy === 'submit' || !artifact}>
            <Icon.arrow /> Submit for assessment
          </button>
        </div>
      </Panel>

      {result && <FeedbackPanel assessment={result.assessment} role={role} profileId={profile.id} lesson={lesson} onDone={onDone} />}
    </>
  );
}

function FeedbackPanel({ assessment, role, profileId, lesson, onDone }: {
  assessment: Assessment; role: RoleConfig; profileId: string; lesson?: RoleConfig['lessons'][number]; onDone: () => void;
}) {
  const { run, busy } = useAction(onDone);
  const failed = assessment.checkResults.filter((c) => !c.passed);
  const label = (id: string) => role.rubric.find((c) => c.id === id)?.label ?? id;

  return (
    <Panel
      title="Feedback"
      hint="Every finding is tied to an observed check or a passage in your artifact, with one correction to make."
      flush
    >
      <StatBand>
        <Stat k="Overall" v={assessment.overall} unit="/4" note={`${assessment.purpose} task`} />
        <Stat k="Automated checks" v={`${assessment.checkResults.length - failed.length}`} unit={`/${assessment.checkResults.length}`} note={failed.length ? `${failed.length} failing` : 'all passing'} />
        <Stat
          k="Acceptance"
          v={<span style={{ fontSize: 17 }}>{assessment.firstPassAccepted ? 'First pass' : 'Not yet'}</span>}
          note={assessment.status.replace(/_/g, ' ')}
        />
      </StatBand>

      {failed.length > 0 && (
        <div className="body" style={{ borderTop: '1px solid var(--line)' }}>
          <Eyebrow>What the checks found</Eyebrow>
          <Ledger>
            {failed.map((c) => (
              <Record key={c.checkId} status="not_met" title={c.detail} sub={<span className="mono">{c.checkId}</span>} />
            ))}
          </Ledger>
        </div>
      )}

      <div className="body" style={{ borderTop: '1px solid var(--line)' }}>
        <Eyebrow>Rubric findings</Eyebrow>
        <Ledger>
          {assessment.findings.map((f) => (
            <Record
              key={f.criterionId}
              status={f.score >= 3 ? 'demonstrated' : f.score < 2 ? 'not_met' : 'not_demonstrated'}
              title={label(f.criterionId)}
              sub={<span className="mono">{f.competencyKey}</span>}
              right={<>
                <span className="mono" style={{ fontSize: 13 }}>{f.score}/4</span>
                {f.needsHumanReview && <Chip tone="outline">for review</Chip>}
              </>}
            >
              <div className="small muted">{f.evidenceQuote}</div>
              {f.omissions.length > 0 && <div className="small">Missing: {f.omissions.join(' ')}</div>}
              <div className="small"><strong>Correction.</strong> {f.recommendedCorrection}</div>
              <div className="small muted">{f.calibrationNote}</div>
            </Record>
          ))}
        </Ledger>
      </div>

      {lesson && (
        <div className="body" style={{ borderTop: '1px solid var(--line)' }}>
          <Eyebrow>Taught workflow · {lesson.title}</Eyebrow>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)' }}>
            {lesson.steps.map((s, i) => <li key={i} style={{ marginBottom: 3 }}>{s}</li>)}
          </ol>
          <Notice tone="info">
            <strong>You verify this yourself.</strong> {lesson.mustVerify.join(' ')}
          </Notice>
        </div>
      )}

      <div className="body" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="row">
          {assessment.status === 'awaiting_human_review' && (
            <span className="small muted grow">Flagged findings go to a reviewer before any of this counts as demonstrated evidence.</span>
          )}
          <button
            className="btn secondary small"
            disabled={busy === 'dispute'}
            onClick={() => run('dispute', 'Dispute raised. A reviewer will look at it.', () =>
              api.post(`/assessments/${assessment.id}/dispute`, { reason: 'I disagree with this finding.' }, profileId))}
          >
            Dispute a finding
          </button>
        </div>
      </div>
    </Panel>
  );
}

/* ----------------------------- opportunities ----------------------------- */

function ApplyPanel({ profile, jobs, applications, onDone }: {
  profile: Profile; jobs: Job[]; applications: Application[]; onDone: () => void;
}) {
  const { run, busy } = useAction(onDone);
  const open = jobs.filter((j) => j.status === 'published' && j.roleFamily === profile.roleFamily);

  return (
    <div className="grid sidebar-right">
      <Panel
        title="Applications"
        hint="Applying authorizes sharing your reviewed evidence with that employer, for that job, at that version of its terms."
        flush
      >
        {applications.length === 0 && <Empty title="No applications yet">Apply to an open role and the thread appears here.</Empty>}
        <div className="body">
          {applications.map((application) => (
            <div className="stack" key={application.id}>
              <div className="spread">
                <div>
                  <div style={{ fontWeight: 500 }}>{jobs.find((j) => j.id === application.jobId)?.title}</div>
                  <div className="small muted">Next: {application.nextAction}</div>
                </div>
                <Chip tone="outline">{application.status.replace(/_/g, ' ')}</Chip>
              </div>

              {application.status === 'superseded' && (
                <Notice tone="warn">
                  <span className="grow">The employer changed the terms. This cannot progress until you confirm the new ones.</span>
                  <button
                    className="btn small"
                    disabled={busy === application.id}
                    onClick={() => run(application.id, 'Revised terms confirmed.', () =>
                      api.post(`/applications/${application.id}/confirm-terms`, { profileId: profile.id }))}
                  >
                    Confirm revised terms
                  </button>
                </Notice>
              )}

              <Thread entries={application.thread} names={{ [profile.id]: profile.name }} />
              <ReplyBox
                busy={busy === application.id}
                placeholder="Reply to the employer"
                onSend={(body) => run(application.id, 'Reply sent.', () =>
                  api.post(`/applications/${application.id}/thread`, { author: 'candidate', authorId: profile.id, kind: 'reply', body }))}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Open roles" hint="Matched on your role family and your alert preferences." flush>
        {open.length === 0 && <Empty title="Nothing open">Publish a role from the Employer screen.</Empty>}
        <Ledger>
          {open.map((job) => {
            const application = applications.find((a) => a.jobId === job.id);
            return (
              <Record
                key={job.id}
                title={job.title}
                sub={<>{job.location} · {job.workMode} · terms v{job.termsVersion} · {job.requirements.filter((r) => r.kind === 'must_have').length} must-have</>}
                right={application
                  ? <Chip tone="outline">{application.status.replace(/_/g, ' ')}</Chip>
                  : <>
                      <button className="btn small secondary" disabled={busy === job.id}
                        onClick={() => run(job.id, 'Interest registered.', () => api.post('/applications', { jobId: job.id, profileId: profile.id, interestOnly: true }))}>
                        Register interest
                      </button>
                      <button className="btn small" disabled={busy === job.id}
                        onClick={() => run(job.id, 'Applied. Your reviewed evidence was shared with consent.', () => api.post('/applications', { jobId: job.id, profileId: profile.id }))}>
                        Apply
                      </button>
                    </>}
              />
            );
          })}
        </Ledger>
        <div className="body" style={{ borderTop: '1px solid var(--line)' }}>
          <EvidenceLegend />
        </div>
      </Panel>
    </div>
  );
}
