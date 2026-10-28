/**
 * The three-minute demonstration, end to end, with no UI and no AWS account.
 * Run: npm run demo
 */
import { newId, nowIso, type Application, type Assessment, type Job, type MatchReport, type Notification, type Profile, type RoleConfig, type Submission } from '@relaunch/shared';
import { artifacts } from './adapters/artifacts.js';
import { outbox } from './adapters/messaging.js';
import { store } from './domain/db.js';
import { registerEventRules } from './domain/wiring.js';
import { seed } from './seed.js';
import { confirmRequirements, publishJob, changeJob } from './domain/jobs.js';
import { assess, reviewAssessment } from './domain/assessment.js';
import { apply, addThreadEntry, confirmRevisedTerms } from './domain/applications.js';
import { approveRole, addCalibrationExample } from './domain/roles.js';
import { releaseHeldNotifications } from './domain/notifications.js';
import { pilotReport } from './domain/metrics.js';
import { currentEvidence } from './domain/evidence.js';

const BASELINE = `# Checkout discount tests

Source used: REQ-CHK-09

it('applies discount', () => { expect(total(2500)).toBe(2250) })
it('no discount small order', () => { expect(total(500)).toBe(500) })
it('random order value', () => { const v = Math.random() * 5000; expect(total(v)).toBeDefined() })
`;

const PRACTICE = `# Checkout coupon tests (practice)

Requirements covered: REQ-CHK-01, REQ-CHK-02, REQ-CHK-03

Each documented acceptance condition is mapped to a test case below.
Boundary values are tested explicitly at 2000 and 2001.

it('subtotal exactly 2000 gets no discount', () => {})
it('subtotal 2001 gets ten percent', () => {})
it('single coupon applies', () => {})
it('second coupon rejected with CHK-209', () => {})
it('expired coupon rejected with CHK-210', () => {})
it('expired coupon leaves total unchanged', () => {})
it('coupon on zero value order', () => {})
it('negative case: unknown coupon code', () => {})
`;

const REASSESSMENT = `# Refund window test suite (unseen reassessment)

Requirements covered: REQ-CHK-04

Coverage map - every documented acceptance condition has a test case:
  C1 refund within window        -> cases 1, 2, 3
  C2 boundary values are tested explicitly -> cases 4, 5
  C3 negative and error code paths are covered -> cases 6, 7, 8, 9

it('refund accepted on day 1 after delivery', () => {})
it('refund accepted on day 6 after delivery', () => {})
it('refund accepted on day 7, the last day in the window', () => {})
it('boundary: day 7 at 23:59 is still inside the window', () => {})
it('boundary: day 8 at 00:00 is outside the window', () => {})
it('negative: day 8 request rejected with error code CHK-311', () => {})
it('negative: refund before delivery is rejected', () => {})
it('negative: duplicate refund request rejected', () => {})
it('error paths are covered for an unknown order id', () => {})

Clock is injected, so no sleeps and no timing dependence.
`;

const VERIFICATION_NOTE = 'Checked each boundary value against REQ-CHK-04 rather than the assistant summary. The assistant produced error code CHK-310 for the day-8 case; REQ-CHK-04 defines CHK-311, so I corrected it. I removed one generated case that cited a requirement id that does not exist.';

async function main() {
  registerEventRules();
  const { job: draft } = await seed();
  step(1, 'Job published, relevant alert sent');

  // 1. Employer confirms every AI-extracted requirement, then publishes.
  const confirmed = await confirmRequirements(draft.id, draft.requirements, 'org_nirvana');
  const job = await publishJob(confirmed.id, 'org_nirvana');
  console.log(`   ${job.title} published at terms version ${job.termsVersion} with ${job.requirements.length} confirmed requirements.`);
  show(await latestFor('prf_anita', 'job_alert'));

  // Vikram is on a daily digest and gets nothing yet; quiet hours and digests are visible in the outbox.
  const vikram = await latestFor('prf_vikram', 'job_alert');
  console.log(`   Vikram Shetty: ${vikram?.state} - ${vikram?.reason}`);

  // 2. Baseline work sample.
  step(2, 'Baseline work sample, evidence-based feedback');
  const baseline = await submit('prf_anita', 'role_it_testing', 'checkout_baseline', BASELINE, {
    summary: 'Three tests for the discount rule.',
    verificationNotes: 'Checked the AI output and it looked fine.',
  }, ['REQ-CHK-09'], 55);
  reportAssessment(baseline);

  // 3. Targeted practice on the observed gaps.
  step(3, 'Coached correction and targeted practice');
  const role = (await store.get<RoleConfig>('role', 'role_it_testing'))!;
  for (const finding of baseline.findings.filter((f) => f.score < 3)) {
    console.log(`   Gap: ${label(role, finding.criterionId)} -> ${finding.recommendedCorrection}`);
  }
  const lesson = role.lessons[0]!;
  console.log(`   Workflow taught: ${lesson.title}`);
  console.log(`   Must verify yourself: ${lesson.mustVerify.join(' ')}`);

  const practice = await submit('prf_anita', 'role_it_testing', 'checkout_practice', PRACTICE, {
    summary: 'Coupon rules covered with boundary cases at 2000 and 2001.',
    verificationNotes: 'Re-read each generated case against REQ-CHK-01..03 and removed one that cited a requirement that does not exist.',
  }, ['REQ-CHK-01', 'REQ-CHK-02', 'REQ-CHK-03'], 40);
  reportAssessment(practice);

  // 4. Unseen reassessment of comparable difficulty, then human review.
  step(4, 'Unseen reassessment and human review');
  const reassessment = await submit('prf_anita', 'role_it_testing', 'checkout_reassessment', REASSESSMENT, {
    summary: 'Refund window suite: 9 cases, every acceptance condition mapped.',
    verificationNotes: VERIFICATION_NOTE,
  }, ['REQ-CHK-04'], 32);
  reportAssessment(reassessment);

  const reviewed = await reviewAssessment(reassessment.id, {
    reviewerId: 'expert_sridhar (QA practice lead)',
    decision: 'approved',
    amendedFindings: [],
    note: 'Boundary cases sit on the rule edge and the CHK-311 correction is traced to REQ-CHK-04. Approved as demonstrated.',
    reviewMinutes: 12,
  });
  console.log(`   Human review: ${reviewed.review?.decision} by ${reviewed.review?.reviewerId} in ${reviewed.review?.reviewMinutes} minutes.`);
  console.log(`   Evidence now on file: ${(await currentEvidence('prf_anita')).map((e) => `${e.competencyKey}=${e.status}`).join(', ')}`);

  // 5. Consented application, employer match report.
  step(5, 'Application with consent, employer match report');
  const { application, match } = await apply(job.id, 'prf_anita', { message: 'Applying with my reviewed refund-window evidence.' });
  summariseMatch(match);
  show(await latestFor('org_nirvana', 'application_received'));

  // 6. Two-way follow-through inside one application record.
  step(6, 'Two-way follow-through');
  await addThreadEntry(application.id, {
    author: 'employer', authorId: 'org_nirvana', kind: 'clarification_request',
    body: 'Your automation framework experience is marked self-reported. Can you point us at a reviewed sample, or shall we set a short task?',
  });
  await addThreadEntry(application.id, {
    author: 'candidate', authorId: 'prf_anita', kind: 'clarification_response',
    body: 'No reviewed sample yet. Happy to take the short task this week.',
  });
  const scheduled = await addThreadEntry(application.id, {
    author: 'employer', authorId: 'org_nirvana', kind: 'interview_offer',
    body: 'Thursday 11:00 IST with the QA lead, 45 minutes, walking through your refund-window suite.',
  });
  console.log(`   Status: ${scheduled.status}. Confirmed next action: ${scheduled.nextAction}`);

  // 7. Changed terms supersede an application on the old terms.
  step(7, 'Changed terms require fresh confirmation');
  await changeJob(job.id, { compensationLpa: { min: 12, max: 17 } }, ['compensation band lowered'], 'org_nirvana');
  const superseded = (await store.get<Application>('application', application.id))!;
  console.log(`   Application status: ${superseded.status}. ${superseded.nextAction}`);
  const reconfirmed = await confirmRevisedTerms(application.id, 'prf_anita');
  console.log(`   After the candidate confirms version ${reconfirmed.jobTermsVersion}: ${reconfirmed.status}.`);

  // 8. Another role being configured for expert approval.
  step(8, 'Another role configured for expert approval');
  const maintenance = (await store.get<RoleConfig>('role', 'role_maintenance'))!;
  console.log(`   ${maintenance.title}: ${maintenance.status}, high-consequence=${maintenance.highConsequence}.`);
  console.log(`   Boundaries: ${maintenance.authorizationBoundaries.join(' ')}`);
  try {
    await approveRole(maintenance.id, 'expert_kiran (reliability engineer)');
  } catch (error) {
    console.log(`   Approval refused: ${(error as Error).message}`);
  }
  await addCalibrationExample(maintenance.id, {
    criterionId: 'crit_m_escalate',
    excerpt: 'Pump P-12 vibration 7.1 mm/s flagged for qualified engineer review; report does not clear the pump for use.',
    expertScore: 4, note: 'Correct escalation inside the technician boundary.',
  }, 'expert_kiran (reliability engineer)');
  const approved = await approveRole(maintenance.id, 'expert_kiran (reliability engineer)', 'Calibrated on escalation.');
  console.log(`   After calibration: ${approved.status}, approved by ${approved.approvedBy}.`);

  // 9. Held messages and the pilot report.
  step(9, 'Digest release and pilot measures');
  const released = await releaseHeldNotifications();
  console.log(`   Released ${released.released} held message(s) as ${released.digests} digest(s).`);

  const report = await pilotReport('role_it_testing');
  console.log(`   First-pass acceptance: ${report.quality.firstPassAcceptance}% of ${report.quality.assessments} assessments.`);
  console.log(`   Mean baseline -> reassessment change: ${report.practice.meanDelta} points on a 0-4 rubric (unseen task, comparable difficulty).`);
  console.log(`   Total effort, AI-assisted: ${report.effort.aiAssisted.totalMinutes} min/submission (worker ${report.effort.aiAssisted.workerMinutes}, review ${report.effort.aiAssisted.reviewMinutes}, rework ${report.effort.aiAssisted.reworkMinutes}).`);
  console.log(`   Manager-reviewed demonstrated evidence: ${report.mobility.managerReviewedEvidence}. Interviews confirmed: ${report.mobility.interviewsConfirmed}.`);
  console.log(`   Caveats: ${report.scope.caveats.join(' ')}`);

  step(10, 'Messages actually sent');
  for (const message of outbox.slice(-8)) {
    console.log(`   [${message.channel}] -> ${message.to}: ${message.subject}`);
  }
  console.log(`\nTotal messages in the outbox: ${outbox.length}. Data in .data/, artifacts in .artifacts/.`);
}

/* ------------------------------- helpers ------------------------------- */

async function submit(
  profileId: string, roleId: string, taskId: string, artifact: string,
  fields: Record<string, unknown>, citedSources: string[], workerMinutes: number,
): Promise<Assessment> {
  const artifactRef = await artifacts.put(`submissions/${profileId}/${taskId}-${Date.now()}.md`, artifact);
  const submission: Submission = {
    id: newId('sub'), kind: 'submission', profileId, roleId, taskId, artifactRef,
    fields, citedSources,
    assistance: { tools: ['Approved in-house assistant (Bedrock)'], aiShare: 0.6, notes: 'Drafted with the approved assistant, verified by hand.' },
    workerMinutes, dataProvenance: 'synthetic', createdAt: nowIso(),
  };
  await store.put('submission', submission.id, submission);
  return assess(submission);
}

function reportAssessment(assessment: Assessment) {
  console.log(`   ${assessment.purpose}: overall ${assessment.overall}/4, first-pass accepted=${assessment.firstPassAccepted}, status=${assessment.status}.`);
  const failed = assessment.checkResults.filter((r) => !r.passed);
  for (const check of failed) console.log(`     x ${check.detail}`);
  for (const finding of assessment.findings) {
    console.log(`     - ${finding.competencyKey}: ${finding.score}/4${finding.needsHumanReview ? ' (flagged for human review)' : ''}`);
  }
}

function summariseMatch(match: MatchReport) {
  const s = match.summary;
  console.log(`   Must-have: ${s.mustHaveDemonstrated}/${s.mustHaveTotal} demonstrated, ${s.mustHaveSelfReported} self-reported, ${s.mustHaveUnknown} unknown, ${s.mustHaveNotMet} not met.`);
  console.log(`   Good-to-have: ${s.goodToHaveDemonstrated}/${s.goodToHaveTotal} demonstrated (never offsets a must-have).`);
  console.log(`   Alert priority: ${match.alertPriority}. Flags: ${match.flags.join(' ') || 'none'}`);
}

async function latestFor(recipientId: string, type: string): Promise<Notification | undefined> {
  const all = await store.find<Notification>('notification', (n) => n.recipientId === recipientId && n.type === type);
  const rank = (n: Notification) => (n.channel === 'whatsapp' ? 0 : n.channel === 'email' ? 1 : 2);
  return all.sort((a, b) => (a.createdAt === b.createdAt ? rank(a) - rank(b) : a.createdAt < b.createdAt ? 1 : -1))[0];
}

function show(notification?: Notification) {
  if (!notification) return console.log('   (no message)');
  console.log(`   [${notification.channel}] ${notification.subject} (${notification.state})`);
  for (const line of notification.body.split('\n')) console.log(`     ${line}`);
}

function label(role: RoleConfig, criterionId: string): string {
  return role.rubric.find((c) => c.id === criterionId)?.label ?? criterionId;
}

function step(n: number, title: string) {
  console.log(`\n${'='.repeat(72)}\n${n}. ${title}\n${'='.repeat(72)}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
