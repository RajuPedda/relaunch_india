import React, { useState } from 'react';
import type { Assessment, CriterionFinding, Profile, Submission } from '@relaunch/shared';
import { api } from '../lib/api.js';
import { Icon } from '../components/icons.js';
import {
  Chip, Empty, Eyebrow, Field, Ledger, Notice, Panel, Record, Skeleton, Stat, StatBand, useAction, useAsync,
} from '../components/ui.js';

export function Reviewer({ profiles, reload }: { profiles: Profile[]; reload: () => void }) {
  const queue = useAsync(() => api.get<Assessment[]>('/assessments'), []);
  const [openId, setOpenId] = useState<string>();
  const all = queue.data ?? [];
  const pending = all.filter((a) => a.status === 'awaiting_human_review' || a.status === 'disputed');
  const name = (id: string) => profiles.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <Panel
        title="Review queue"
        hint="Reviewers resolve disputes and approve conclusions. Work-acceptance, staffing and hiring decisions stay with managers and employers."
        actions={<button className="btn small quiet" onClick={queue.reload}><Icon.refresh /> Refresh</button>}
        flush
      >
        <StatBand>
          <Stat k="Awaiting review" v={pending.filter((a) => a.status === 'awaiting_human_review').length} note="Flagged findings" />
          <Stat k="Disputed" v={pending.filter((a) => a.status === 'disputed').length} note="Raised by the worker" />
          <Stat k="Approved" v={all.filter((a) => a.status === 'approved').length} note={`${all.filter((a) => a.review).length} after a human pass`} />
          <Stat k="Total assessed" v={all.length} />
        </StatBand>
      </Panel>

      <Panel title="Pending" flush>
        {queue.loading && <div className="body"><Skeleton rows={3} /></div>}
        {!queue.loading && pending.length === 0 && <Empty title="Nothing waiting">Submit a work sample as a worker to fill this queue.</Empty>}
        <Ledger>
          {pending.map((a) => (
            <Record
              key={a.id}
              status={a.status === 'disputed' ? 'not_met' : 'self_reported'}
              title={<>{name(a.profileId)} · <span className="mono">{a.taskId}</span></>}
              sub={<>{a.purpose} · overall {a.overall}/4 · {a.findings.filter((f) => f.needsHumanReview).length} flagged{a.dispute ? ` · disputed: ${a.dispute.reason}` : ''}</>}
              right={<>
                <Chip tone="outline">{a.status.replace(/_/g, ' ')}</Chip>
                <button className="btn small secondary" onClick={() => setOpenId(openId === a.id ? undefined : a.id)}>
                  {openId === a.id ? 'Close' : 'Review'}
                </button>
              </>}
            >
              {openId === a.id && <ReviewForm assessmentId={a.id} onDone={() => { queue.reload(); reload(); }} />}
            </Record>
          ))}
        </Ledger>
      </Panel>
    </>
  );
}

function ReviewForm({ assessmentId, onDone }: { assessmentId: string; onDone: () => void }) {
  const detail = useAsync(
    () => api.get<{ assessment: Assessment; submission: Submission; artifact: string }>(`/assessments/${assessmentId}`),
    [assessmentId],
  );
  const [amended, setAmended] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState(10);
  const { run, busy } = useAction(onDone);

  if (!detail.data) return <div style={{ marginTop: 10 }}><Skeleton rows={3} /></div>;
  const { assessment, submission, artifact } = detail.data;

  function decide(decision: 'approved' | 'amended' | 'rejected', label: string) {
    const amendedFindings: CriterionFinding[] = Object.entries(amended).map(([criterionId, score]) => {
      const base = assessment.findings.find((f) => f.criterionId === criterionId)!;
      return { ...base, score, source: 'human', needsHumanReview: false };
    });
    return run(decision, label, () =>
      api.post(`/assessments/${assessmentId}/review`, { decision, amendedFindings, note, reviewMinutes: minutes }, 'expert_reviewer'));
  }

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <div className="row tight">
        <Chip tone="outline">{submission.assistance.tools.join(', ') || 'no AI tools declared'}</Chip>
        <Chip tone="outline">{Math.round(submission.assistance.aiShare * 100)}% AI share</Chip>
        <Chip tone="outline">{submission.dataProvenance.replace('_', ' ')}</Chip>
        <Chip tone="outline">{submission.workerMinutes} min of worker time</Chip>
      </div>

      <div className="grid sidebar-right" style={{ gap: 12 }}>
        <div>
          <Eyebrow>Submitted artifact</Eyebrow>
          <div className="envelope" style={{ marginTop: 6 }}>
            <div className="head"><Icon.file /><span className="subject grow">{submission.artifactRef.split('/').pop()}</span></div>
            <pre>{artifact.slice(0, 2400)}</pre>
          </div>
        </div>

        <div className="stack tight">
          <Eyebrow>Findings — adjust any score</Eyebrow>
          <Ledger>
            {assessment.findings.map((f) => (
              <Record
                key={f.criterionId}
                title={<span className="mono">{f.competencyKey}</span>}
                right={
                  <input
                    type="number" min={0} max={4} step={0.5} aria-label={`Score for ${f.competencyKey}`}
                    value={amended[f.criterionId] ?? f.score}
                    onChange={(e) => setAmended({ ...amended, [f.criterionId]: Number(e.target.value) })}
                    style={{ width: 76 }}
                  />
                }
              >
                <div className="small muted">{f.evidenceQuote}</div>
                {f.omissions.length > 0 && <div className="small">Missing: {f.omissions.join(' ')}</div>}
                <div className="small"><strong>Correction.</strong> {f.recommendedCorrection}</div>
                <div className="small muted">{f.calibrationNote}</div>
              </Record>
            ))}
          </Ledger>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="grow"><Field label="Reviewer note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
        <Field label="Review minutes">
          <input type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={{ width: 110 }} />
        </Field>
      </div>

      <div className="row">
        <button className="btn" disabled={Boolean(busy)} onClick={() => decide('approved', 'Conclusions approved. Evidence recorded.')}>
          <Icon.check /> Approve conclusions
        </button>
        <button className="btn secondary" disabled={Boolean(busy)} onClick={() => decide('amended', 'Approved with your amendments.')}>
          Approve with amendments
        </button>
        <button className="btn danger" disabled={Boolean(busy)} onClick={() => decide('rejected', 'Rejected. Nothing recorded as evidence.')}>
          Reject
        </button>
      </div>

      <Notice>
        A short exercise can reveal a development need. It cannot establish overall competence or employability.
      </Notice>
    </div>
  );
}
