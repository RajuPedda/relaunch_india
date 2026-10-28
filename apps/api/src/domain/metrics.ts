import type { Application, Assessment, EffortEntry, EvidenceItem, Profile } from '@relaunch/shared';
import { store } from './db.js';

/**
 * The five employer questions from the plan, each with the measure that
 * answers it. Everything is reported with its denominator, and the caveats are
 * part of the payload: a small pilot describes the tasks and participants it
 * tested, it does not prove an organization-wide productivity gain.
 */
export async function pilotReport(roleId?: string) {
  const assessments = (await store.list<Assessment>('assessment')).filter((a) => !roleId || a.roleId === roleId);
  const efforts = (await store.list<EffortEntry>('effort')).filter((e) => !roleId || e.roleId === roleId);
  const evidence = await store.list<EvidenceItem>('evidence');
  const applications = await store.list<Application>('application');
  const profiles = await store.list<Profile>('profile');

  const participants = new Set(assessments.map((a) => a.profileId));

  /* 1. Does work meet our standard? */
  const reviewed = assessments.filter((a) => a.status === 'approved' || a.status === 'rejected');
  const quality = {
    assessments: assessments.length,
    firstPassAcceptance: rate(assessments.filter((a) => a.firstPassAccepted).length, assessments.length),
    factualErrorsPerSubmission: avg(assessments.map((a) => a.factualErrors)),
    omittedRequirementsPerSubmission: avg(assessments.map((a) => a.omittedRequirements)),
    reviewerJudgment: {
      approvedAsSubmitted: reviewed.filter((a) => a.review?.decision === 'approved').length,
      amendedByReviewer: reviewed.filter((a) => a.review?.decision === 'amended').length,
      rejected: reviewed.filter((a) => a.review?.decision === 'rejected').length,
      autoApprovedNoReviewNeeded: assessments.filter((a) => a.status === 'approved' && !a.review).length,
      disputesRaised: assessments.filter((a) => a.dispute).length,
    },
  };

  /* 2. Does AI reduce total effort? Worker time PLUS review and rework, plus tool cost. */
  const withAi = efforts.filter((e) => e.aiAssisted);
  const withoutAi = efforts.filter((e) => !e.aiAssisted);
  const effort = {
    aiAssisted: effortSummary(withAi),
    unassisted: effortSummary(withoutAi),
    note: 'Total effort counts worker, review and rework minutes. AI tool cost is reported separately and never netted off.',
  };

  /* 3. Does targeted practice help? Baseline vs comparable reassessment. */
  const byParticipant = [...participants].map((profileId) => {
    const own = assessments.filter((a) => a.profileId === profileId);
    const pairs = own
      .filter((a) => a.purpose === 'reassessment')
      .map((re) => {
        const base = own.find((b) => b.purpose === 'baseline' && b.comparabilityGroup === re.comparabilityGroup);
        if (!base) return undefined;
        return {
          comparabilityGroup: re.comparabilityGroup,
          baseline: base.overall,
          reassessment: re.overall,
          delta: Math.round((re.overall - base.overall) * 100) / 100,
          comparableDifficulty: base.difficulty === re.difficulty,
          unseenReassessment: true,
          humanReviewed: Boolean(re.review),
        };
      })
      .filter(Boolean) as NonNullable<ReturnType<() => any>>[];
    return {
      profileId,
      name: profiles.find((p) => p.id === profileId)?.name ?? profileId,
      pairs,
      meanDelta: avg(pairs.map((p: any) => p.delta)),
    };
  });

  const practice = {
    participantsWithPairedTasks: byParticipant.filter((p) => p.pairs.length > 0).length,
    meanDelta: avg(byParticipant.flatMap((p) => p.pairs.map((x: any) => x.delta))),
    byParticipant,
    note: 'An unseen reassessment of comparable difficulty is stronger evidence than repeating a coached exercise.',
  };

  /* 4. Can successful methods spread? */
  const finalScores = byParticipant.map((p) => p.meanDelta).filter((n) => Number.isFinite(n));
  const spread = {
    participants: participants.size,
    deltaStandardDeviation: stddev(finalScores),
    approvedWorkflowAdoption: rate(
      assessments.filter((a) => a.findings.some((f) => f.score >= 3)).length,
      assessments.length,
    ),
    note: 'Consistency across participants, not a single success story, is what shows a method can spread.',
  };

  /* 5. Can people take on new work? */
  const mobility = {
    managerReviewedEvidence: evidence.filter((e) => e.status === 'demonstrated' && e.approvedBy).length,
    demonstratedCompetencies: evidence.filter((e) => e.status === 'demonstrated' && !e.supersedes).length,
    applicationsSubmitted: applications.length,
    interviewsConfirmed: applications.filter((a) => a.status === 'interview_scheduled').length,
    confirmedEmployerNextActions: applications.filter((a) => a.nextAction && a.status !== 'closed').length,
    applicationToFirstEmployerResponseHours: avg(
      applications
        .map((a) => {
          const reply = a.thread.find((t) => t.author === 'employer');
          return reply ? (Date.parse(reply.createdAt) - Date.parse(a.createdAt)) / 3600000 : undefined;
        })
        .filter((n): n is number => n !== undefined),
    ),
  };

  return {
    scope: {
      roleId: roleId ?? 'all roles',
      participants: participants.size,
      tasksTested: [...new Set(assessments.map((a) => a.taskId))],
      caveats: [
        'Results describe the tested tasks and participants only.',
        'Task scores alone are never used to make an employment decision.',
        'Self-reported claims are excluded from demonstrated-evidence counts.',
      ],
    },
    quality, effort, practice, spread, mobility,
  };
}

function effortSummary(entries: EffortEntry[]) {
  const total = entries.map((e) => e.workerMinutes + e.reviewMinutes + e.reworkMinutes);
  return {
    submissions: entries.length,
    workerMinutes: avg(entries.map((e) => e.workerMinutes)),
    reviewMinutes: avg(entries.map((e) => e.reviewMinutes)),
    reworkMinutes: avg(entries.map((e) => e.reworkMinutes)),
    totalMinutes: avg(total),
    aiCostUsd: sum(entries.map((e) => e.aiCostUsd)),
  };
}

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0);
const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
function stddev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.round(Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) * 100) / 100;
}
