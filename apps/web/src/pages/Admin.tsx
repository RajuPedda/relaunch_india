import React, { useState } from 'react';
import type { RoleConfig } from '@relaunch/shared';
import { api } from '../lib/api.js';
import { Icon } from '../components/icons.js';
import {
  Chip, Empty, Eyebrow, Field, Ledger, Notice, Panel, Record, Skeleton, Stat, StatBand, Switch, useAction, useAsync,
} from '../components/ui.js';

const STATUS_TONE: Record<string, 'plain' | 'outline' | 'accent'> = {
  approved: 'accent', pending_expert_approval: 'outline', draft: 'outline', ai_drafted: 'outline', rejected: 'outline',
};

export function Admin({ reload }: { reload: () => void }) {
  const roles = useAsync(() => api.get<RoleConfig[]>('/roles'), []);
  function refresh() { roles.reload(); reload(); }
  const all = roles.data ?? [];

  return (
    <>
      <Panel title="Role configurations" hint="Approval is the gate between a draft and a validated assessment." flush>
        <StatBand>
          <Stat k="Configured roles" v={all.length} note={`${all.filter((r) => r.industry).length} industries represented`} />
          <Stat k="Expert-approved" v={all.filter((r) => r.status === 'approved').length} note="Usable for assessment" />
          <Stat k="Awaiting an expert" v={all.filter((r) => r.status !== 'approved' && r.status !== 'rejected').length} note="Cannot assess anyone yet" />
          <Stat k="High consequence" v={all.filter((r) => r.highConsequence).length} note="Calibration required before approval" />
        </StatBand>
      </Panel>

      <div className="grid sidebar-right">
        <RoleList roles={all} loading={roles.loading} onDone={refresh} />
        <Intake onDone={refresh} />
      </div>
    </>
  );
}

function RoleList({ roles, loading, onDone }: { roles: RoleConfig[]; loading: boolean; onDone: () => void }) {
  const [openId, setOpenId] = useState<string>();
  const { run, busy } = useAction(onDone);

  return (
    <Panel title="Configured roles" hint="Any profession can enter intake. A domain expert approves and calibrates before results are presented as validated." flush>
      {loading && <div className="body"><Skeleton rows={4} /></div>}
      {!loading && roles.length === 0 && <Empty title="No roles configured" />}
      <Ledger>
        {roles.map((role) => (
          <Record
            key={role.id}
            status={role.status === 'approved' ? 'demonstrated' : role.status === 'rejected' ? 'not_met' : 'self_reported'}
            title={role.title}
            sub={<>{role.industry} · {role.rubric.length} criteria · {role.tasks.length} tasks · {role.calibrationExamples.length} calibration example{role.calibrationExamples.length === 1 ? '' : 's'}</>}
            right={<>
              {role.highConsequence && <Chip tone="outline">high consequence</Chip>}
              <Chip tone={STATUS_TONE[role.status] ?? 'outline'}>{role.status.replace(/_/g, ' ')}</Chip>
              <button className="btn small quiet" onClick={() => setOpenId(openId === role.id ? undefined : role.id)}>
                {openId === role.id ? 'Hide' : 'Inspect'}
              </button>
            </>}
          >
            {openId === role.id && (
              <div className="stack tight" style={{ marginTop: 8 }}>
                <div className="small"><strong>Permitted tools.</strong> {role.permittedAiTools.join(', ') || 'none'}</div>
                {role.authorizationBoundaries.length > 0 && (
                  <Notice tone="warn"><strong>Boundaries.</strong> {role.authorizationBoundaries.join(' ')}</Notice>
                )}
                <div>
                  <Eyebrow>Tasks</Eyebrow>
                  <div className="row tight">
                    {role.tasks.map((t) => (
                      <Chip key={t.id} tone="outline">{t.purpose}{t.unseen ? ' · unseen' : ''} · d{t.difficulty}</Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <Eyebrow>Rubric</Eyebrow>
                  <div className="row tight">
                    {role.rubric.map((c) => (
                      <Chip key={c.id} tone="outline">{c.label}{c.requiresHumanReview ? ' · human review' : ''}</Chip>
                    ))}
                  </div>
                </div>
                <div className="row">
                  <button className="btn small secondary" disabled={busy === role.id} onClick={() =>
                    run(role.id, 'Calibration example added.', () => api.post(`/roles/${role.id}/calibrate`, {
                      criterionId: role.rubric[0]?.id, expertScore: 4,
                      excerpt: 'Expert-scored exemplar supplied during calibration.',
                      note: 'Added by the domain expert.',
                    }, 'expert_reviewer'))}>
                    Add calibration example
                  </button>
                  {role.status !== 'approved' && (
                    <button className="btn small" disabled={busy === role.id} onClick={() =>
                      run(role.id, `${role.title} approved for assessment.`, () =>
                        api.post(`/roles/${role.id}/approve`, { note: 'Reviewed and calibrated.' }, 'expert_reviewer'))}>
                      <Icon.stamp /> Expert approve
                    </button>
                  )}
                  {role.status === 'approved' && role.approvedBy && (
                    <span className="small muted">Approved by {role.approvedBy}</span>
                  )}
                </div>
              </div>
            )}
          </Record>
        ))}
      </Ledger>
    </Panel>
  );
}

function Intake({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    title: 'Clinical coding specialist',
    roleFamily: 'clinical_coding',
    industry: 'Healthcare',
    summary: 'Assigns diagnosis and procedure codes from clinical notes, with approved AI assistance.',
    recurringTasks: 'Code an inpatient episode from the discharge summary\nQuery incomplete documentation',
    goals: 'Codes match the documented clinical picture\nQueries are raised rather than assumptions made',
    constraints: 'No patient-identifiable data in the proof of concept',
    permittedAiTools: 'Approved in-house assistant (Bedrock)',
    boundaries: 'A qualified coder signs off every episode. The assistant never finalises a code.',
    highConsequence: true,
  });
  const [created, setCreated] = useState<RoleConfig>();
  const { run, busy } = useAction(onDone);
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  const text = (key: keyof typeof form, label: string, help?: string, area = false) => (
    <Field label={label} help={help}>
      {area
        ? <textarea value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={{ minHeight: 68 }} />
        : <input value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}
    </Field>
  );

  return (
    <Panel title="Role intake" hint="Describe the work. AI drafts the rubric and the task set; it lands awaiting an expert.">
      {text('title', 'Role title')}
      <div className="row">
        {text('roleFamily', 'Role family key')}
        {text('industry', 'Industry')}
      </div>
      {text('summary', 'What the role does', undefined, true)}
      {text('recurringTasks', 'Recurring tasks', 'One per line. Each becomes a baseline, a practice and an unseen reassessment task.', true)}
      {text('goals', 'Goals', 'One per line. These become acceptance conditions.', true)}
      {text('constraints', 'Constraints', 'One per line.', true)}
      {text('permittedAiTools', 'Permitted AI tools', 'One per line.', true)}
      {text('boundaries', 'Authorization boundaries', 'What this profession may never delegate to the assistant.', true)}

      <Switch
        label="High-consequence work"
        help="Forces human review on every judgment criterion, and blocks approval until an expert-scored calibration example exists."
        checked={form.highConsequence}
        onChange={(v) => setForm({ ...form, highConsequence: v })}
      />

      <button className="btn" disabled={busy === 'create'} onClick={() =>
        run('create', 'Configuration drafted. It now needs an expert.', async () => {
          const role = await api.post<RoleConfig>('/roles', {
            title: form.title, roleFamily: form.roleFamily, industry: form.industry, summary: form.summary,
            recurringTasks: lines(form.recurringTasks), goals: lines(form.goals), constraints: lines(form.constraints),
            permittedAiTools: lines(form.permittedAiTools), authorizationBoundaries: lines(form.boundaries),
            highConsequence: form.highConsequence,
          }, 'admin');
          setCreated(await api.post<RoleConfig>(`/roles/${role.id}/ai-draft`, {}, 'admin'));
        })}>
        <Icon.arrow /> Create and draft with AI
      </button>

      {created && (
        <Notice tone="info">
          Drafted {created.rubric.length} rubric criteria and {created.tasks.length} tasks for {created.title}.
          Status is {created.status.replace(/_/g, ' ')} — it cannot assess anyone until an expert approves it.
        </Notice>
      )}
    </Panel>
  );
}
