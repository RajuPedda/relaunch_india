import React from 'react';
import type { Profile } from '@relaunch/shared';
import { api } from '../lib/api.js';
import { Icon } from '../components/icons.js';
import { Empty, Eyebrow, Notice, Panel, Skeleton, Stat, StatBand, useAsync } from '../components/ui.js';
import { EffortBars, SlopeChart, type SlopeSeries } from '../components/charts.js';

const fetchReport = () => api.get<any>('/metrics');

export function Metrics({ profiles }: { profiles: Profile[] }) {
  const report = useAsync<any>(fetchReport, []);

  if (report.loading && !report.data) return <Panel title="Pilot measures"><Skeleton rows={6} /></Panel>;
  if (!report.data) return <Panel title="Pilot measures"><Empty title="No measures yet" /></Panel>;
  const r = report.data;

  const pairs: SlopeSeries[] = (r.practice.byParticipant ?? [])
    .filter((p: any) => p.pairs.length > 0)
    .map((p: any) => ({ label: p.name, from: p.pairs[0].baseline, to: p.pairs[0].reassessment }));

  const effortRows = [
    { label: 'AI-assisted', parts: [
      { name: 'Worker', value: r.effort.aiAssisted.workerMinutes },
      { name: 'Review', value: r.effort.aiAssisted.reviewMinutes },
      { name: 'Rework', value: r.effort.aiAssisted.reworkMinutes },
    ] },
    { label: 'Unassisted', parts: [
      { name: 'Worker', value: r.effort.unassisted.workerMinutes },
      { name: 'Review', value: r.effort.unassisted.reviewMinutes },
      { name: 'Rework', value: r.effort.unassisted.reworkMinutes },
    ] },
  ].filter((row) => row.parts.some((p) => p.value > 0));

  return (
    <>
      <Panel
        title="Does the work meet our standard?"
        hint="First-pass acceptance, factual errors, omitted requirements, and what reviewers actually did."
        actions={<button className="btn small quiet" onClick={report.reload}><Icon.refresh /> Refresh</button>}
        flush
      >
        <StatBand>
          <Stat k="First-pass acceptance" v={r.quality.firstPassAcceptance} unit="%" note={`of ${r.quality.assessments} assessments`} />
          <Stat k="Factual errors" v={r.quality.factualErrorsPerSubmission} note="per submission" />
          <Stat k="Omitted requirements" v={r.quality.omittedRequirementsPerSubmission} note="per submission" />
          <Stat k="Disputes raised" v={r.quality.reviewerJudgment.disputesRaised} note="by workers" />
        </StatBand>
        <div className="body" style={{ borderTop: '1px solid var(--line)' }}>
          <Eyebrow>Reviewer judgment</Eyebrow>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Outcome</th><th>Count</th><th>What it means</th></tr></thead>
              <tbody>
                <tr><td>Approved as submitted</td><td className="n">{r.quality.reviewerJudgment.approvedAsSubmitted}</td><td className="small muted">The reviewer agreed with every finding.</td></tr>
                <tr><td>Amended by reviewer</td><td className="n">{r.quality.reviewerJudgment.amendedByReviewer}</td><td className="small muted">Model judgment needed correction — watch this against the calibration set.</td></tr>
                <tr><td>Rejected</td><td className="n">{r.quality.reviewerJudgment.rejected}</td><td className="small muted">Nothing recorded as evidence.</td></tr>
                <tr><td>No flagged finding</td><td className="n">{r.quality.reviewerJudgment.autoApprovedNoReviewNeeded}</td><td className="small muted">Every criterion was observable and calibrated.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      <div className="grid two">
        <Panel title="Does targeted practice help?" hint={r.practice.note}>
          {pairs.length === 0
            ? <Empty title="No paired tasks yet">Complete a baseline and the unseen reassessment for the same comparability group.</Empty>
            : <>
                <SlopeChart series={pairs} />
                <div className="row">
                  <Stat k="Mean change" v={`${r.practice.meanDelta >= 0 ? '+' : ''}${r.practice.meanDelta}`} note="rubric points, 0-4" />
                  <Stat k="Participants paired" v={r.practice.participantsWithPairedTasks} />
                </div>
              </>}
        </Panel>

        <Panel title="Does AI reduce total effort?" hint={r.effort.note}>
          {effortRows.length === 0
            ? <Empty title="No effort recorded yet" />
            : <>
                <EffortBars rows={effortRows} />
                <Notice>
                  AI tool cost for the assisted set: ${r.effort.aiAssisted.aiCostUsd}. It sits beside the time, never subtracted from it.
                </Notice>
              </>}
        </Panel>
      </div>

      <div className="grid two">
        <Panel title="Can successful methods spread?" hint={r.spread.note} flush>
          <StatBand>
            <Stat k="Participants" v={r.spread.participants} />
            <Stat k="Spread of change" v={r.spread.deltaStandardDeviation} note="standard deviation; lower is more consistent" />
            <Stat k="Workflow adoption" v={r.spread.approvedWorkflowAdoption} unit="%" note="assessments with a criterion at 3/4 or better" />
          </StatBand>
        </Panel>

        <Panel title="Can people take on new work?" hint="Manager-reviewed evidence, employer responses, and confirmed next steps." flush>
          <StatBand>
            <Stat k="Reviewed evidence" v={r.mobility.managerReviewedEvidence} note="demonstrated and human-approved" />
            <Stat k="Applications" v={r.mobility.applicationsSubmitted} />
            <Stat k="Interviews confirmed" v={r.mobility.interviewsConfirmed} />
            <Stat k="To first reply" v={r.mobility.applicationToFirstEmployerResponseHours} unit="h" note="application to employer response" />
          </StatBand>
        </Panel>
      </div>

      <Panel title="Scope and caveats" hint="A small pilot describes the tasks and participants it tested.">
        <div className="small">
          Role: <span className="mono">{r.scope.roleId}</span> · participants: {r.scope.participants} ·
          tasks tested: <span className="mono">{r.scope.tasksTested.join(', ') || 'none'}</span>
          {profiles.length > 0 && <> · pool: {profiles.length} registered profiles</>}
        </div>
        {r.scope.caveats.map((c: string, i: number) => <Notice key={i} tone="warn">{c}</Notice>)}
      </Panel>
    </>
  );
}
