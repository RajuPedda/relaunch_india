import { newId, nowIso, type Assessment, type CriterionFinding, type EffortEntry, type HumanReview, type RoleConfig, type Submission } from '@relaunch/shared';
import { artifacts } from '../adapters/artifacts.js';
import { bus } from '../adapters/bus.js';
import { runChecks } from './checks.js';
import { gradeSubmission, overallScore } from './grading.js';
import { recordEvidence } from './evidence.js';
import { audit, store } from './db.js';

const ACCEPTANCE_THRESHOLD = 3;

export async function assess(submission: Submission): Promise<Assessment> {
  const role = await store.get<RoleConfig>('role', submission.roleId);
  if (!role) throw new Error('role config not found');
  if (role.status !== 'approved') {
    throw new Error('Role configuration is not expert-approved; results cannot be presented as a validated assessment.');
  }
  const task = role.tasks.find((t) => t.id === submission.taskId);
  if (!task) throw new Error('task not found in role config');

  const artifact = await artifacts.get(submission.artifactRef);
  const checkResults = runChecks(task, submission, artifact, role);
  const { findings, costUsd } = await gradeSubmission(role, task, submission, artifact, checkResults);
  const overall = overallScore(role, findings);

  const factualErrors = checkResults.filter(
    (r) => !r.passed && /source_consistency|numeric|must_not/.test(r.checkId + r.detail),
  ).length;
  const omittedRequirements = checkResults.filter((r) => !r.passed).length - factualErrors;

  const needsReview = findings.some((f) => f.needsHumanReview);
  const assessment: Assessment = {
    id: newId('asm'),
    kind: 'assessment',
    submissionId: submission.id,
    profileId: submission.profileId,
    roleId: role.id,
    taskId: task.id,
    purpose: task.purpose,
    comparabilityGroup: task.comparabilityGroup,
    difficulty: task.difficulty,
    checkResults,
    findings,
    overall,
    firstPassAccepted: overall >= ACCEPTANCE_THRESHOLD && checkResults.every((r) => r.passed),
    factualErrors: Math.max(0, factualErrors),
    omittedRequirements: Math.max(0, omittedRequirements),
    status: needsReview ? 'awaiting_human_review' : 'approved',
    reworkMinutes: 0,
    aiCostUsd: costUsd,
    createdAt: nowIso(),
  };

  await store.put('assessment', assessment.id, assessment);
  await audit('system', 'assessment.created', assessment.id, { status: assessment.status, overall });

  if (assessment.status === 'approved') {
    await recordEvidence(assessment, findings, undefined);
    await bus.publish('evidence.approved', {
      profileId: assessment.profileId,
      competencyKeys: findings.map((f) => f.competencyKey),
      assessmentId: assessment.id,
    });
  }

  await recordEffort(assessment, submission, 0);
  await bus.publish('assessment.completed', {
    assessmentId: assessment.id, profileId: assessment.profileId, roleId: role.id,
  });
  return assessment;
}

/** Human review resolves disputes, judges professional judgment, approves conclusions. */
export async function reviewAssessment(
  assessmentId: string,
  review: Omit<HumanReview, 'reviewedAt'>,
): Promise<Assessment> {
  const assessment = await store.get<Assessment>('assessment', assessmentId);
  if (!assessment) throw new Error('assessment not found');
  const role = await store.get<RoleConfig>('role', assessment.roleId);
  if (!role) throw new Error('role config not found');

  const amended = review.amendedFindings.length ? mergeFindings(assessment.findings, review.amendedFindings) : assessment.findings;
  const next: Assessment = {
    ...assessment,
    findings: amended,
    overall: overallScore(role, amended),
    status: review.decision === 'rejected' ? 'rejected' : 'approved',
    review: { ...review, reviewedAt: nowIso() },
  };
  next.firstPassAccepted = next.overall >= ACCEPTANCE_THRESHOLD && next.checkResults.every((r) => r.passed);
  await store.put('assessment', next.id, next);
  await audit(review.reviewerId, `assessment.${review.decision}`, next.id, { overall: next.overall });

  const effort = (await store.find<EffortEntry>('effort', (e) => e.assessmentId === next.id))[0];
  if (effort) await store.update<EffortEntry>('effort', effort.id, { reviewMinutes: review.reviewMinutes });

  if (next.status === 'approved') {
    await recordEvidence(next, amended, review.reviewerId);
    await bus.publish('evidence.approved', {
      profileId: next.profileId,
      competencyKeys: amended.map((f) => f.competencyKey),
      assessmentId: next.id,
    });
  }
  return next;
}

/** The correction and review route: a worker can dispute a finding. */
export async function disputeAssessment(assessmentId: string, raisedBy: string, reason: string): Promise<Assessment> {
  const updated = await store.update<Assessment>('assessment', assessmentId, {
    status: 'disputed',
    dispute: { raisedBy, reason, raisedAt: nowIso() },
  });
  await audit(raisedBy, 'assessment.disputed', assessmentId, { reason });
  return updated;
}

function mergeFindings(base: CriterionFinding[], amended: CriterionFinding[]): CriterionFinding[] {
  return base.map((f) => {
    const replacement = amended.find((a) => a.criterionId === f.criterionId);
    return replacement ? { ...f, ...replacement, source: 'human' as const, needsHumanReview: false } : f;
  });
}

async function recordEffort(assessment: Assessment, submission: Submission, reviewMinutes: number) {
  const entry: EffortEntry = {
    id: newId('eff'), kind: 'effort',
    profileId: assessment.profileId, roleId: assessment.roleId, assessmentId: assessment.id,
    phase: assessment.purpose,
    aiAssisted: submission.assistance.tools.length > 0,
    workerMinutes: submission.workerMinutes,
    reviewMinutes,
    reworkMinutes: assessment.reworkMinutes,
    aiCostUsd: assessment.aiCostUsd,
    createdAt: nowIso(),
  };
  await store.put('effort', entry.id, entry);
}
