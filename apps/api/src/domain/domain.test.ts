import { strict as assert } from 'node:assert';
import { test, before } from 'node:test';
import fs from 'node:fs';

process.env.RELAUNCH_DATA_DIR = '.data-test';
process.env.RELAUNCH_ARTIFACT_DIR = '.artifacts-test';

type Mods = {
  store: typeof import('./db.js')['store'];
  matching: typeof import('./matching.js');
  notifications: typeof import('./notifications.js');
  checks: typeof import('./checks.js');
  evidence: typeof import('./evidence.js');
  jobs: typeof import('./jobs.js');
  roles: typeof import('./roles.js');
  applications: typeof import('./applications.js');
  wiring: typeof import('./wiring.js');
  seed: typeof import('../seed.js');
};
let m: Mods;

before(async () => {
  for (const dir of ['.data-test', '.artifacts-test']) fs.rmSync(dir, { recursive: true, force: true });
  const [db, matching, notifications, checks, evidence, jobs, roles, applications, wiring, seed] = await Promise.all([
    import('./db.js'), import('./matching.js'), import('./notifications.js'), import('./checks.js'),
    import('./evidence.js'), import('./jobs.js'), import('./roles.js'), import('./applications.js'),
    import('./wiring.js'), import('../seed.js'),
  ]);
  m = { store: db.store, matching, notifications, checks, evidence, jobs, roles, applications, wiring, seed };
  wiring.registerEventRules();
  await seed.seed();
});

test('an unknown requirement asks for clarification instead of counting as a gap', async () => {
  const job = (await m.store.find<any>('job', (j) => j.roleFamily === 'it_testing'))[0];
  const profile = await m.store.get<any>('profile', 'prf_anita');
  const report = await m.matching.computeMatch(job, profile);
  const unknown = report.mustHave.filter((f) => f.status === 'unknown');
  assert.ok(unknown.length > 0, 'expected unknown must-have requirements for a fresh profile');
  for (const finding of unknown) {
    assert.equal(finding.clarificationNeeded, true);
    assert.notEqual(finding.status, 'not_met');
  }
});

test('good-to-have skills never offset a missing must-have', async () => {
  const job = (await m.store.find<any>('job', (j) => j.roleFamily === 'it_testing'))[0];
  const profile = await m.store.get<any>('profile', 'prf_anita');
  const report = await m.matching.computeMatch(job, profile);
  assert.equal(report.summary.mustHaveDemonstrated, 0);
  assert.equal(report.alertPriority, 'low', 'self-reported good-to-have must not raise priority');
  assert.ok('mustHaveTotal' in report.summary && 'goodToHaveTotal' in report.summary);
  assert.ok(!('matchPercentage' in (report as object)), 'a single match percentage must not exist');
});

test('evidence score bands separate "not demonstrated" from "not met"', () => {
  assert.equal(m.evidence.statusForScore(3.5), 'demonstrated');
  assert.equal(m.evidence.statusForScore(2.5), 'not_demonstrated');
  assert.equal(m.evidence.statusForScore(1), 'not_met');
});

test('a job cannot be published until every extracted requirement is confirmed', async () => {
  const draft = await m.jobs.draftJob({
    orgId: 'org_nirvana', title: 'Unconfirmed role', roleFamily: 'it_testing',
    description: 'Must have\n- Write deterministic tests that do not depend on timing or random data\n',
    location: 'Pune', workMode: 'remote',
  } as any, 'org_nirvana');
  await assert.rejects(() => m.jobs.publishJob(draft.id, 'org_nirvana'), /Confirm all/);
  await m.jobs.confirmRequirements(draft.id, draft.requirements, 'org_nirvana');
  const published = await m.jobs.publishJob(draft.id, 'org_nirvana');
  assert.equal(published.status, 'published');
});

test('changed terms supersede an application made on the old terms', async () => {
  const job = (await m.store.find<any>('job', (j) => j.status === 'published' && j.title === 'Unconfirmed role'))[0];
  const { application } = await m.applications.apply(job.id, 'prf_anita');
  await m.jobs.changeJob(job.id, { location: 'Chennai' }, ['location changed'], 'org_nirvana');
  const after = await m.store.get<any>('application', application.id);
  assert.equal(after.status, 'superseded');
  await assert.rejects(
    () => m.applications.addThreadEntry(application.id, { author: 'employer', authorId: 'org_nirvana', kind: 'interview_offer', body: 'x' }),
    /superseded terms/,
  );
  const confirmed = await m.applications.confirmRevisedTerms(application.id, 'prf_anita');
  assert.equal(confirmed.status, 'in_review');
  assert.equal(confirmed.jobTermsVersion, after.jobTermsVersion + 1);
});

test('a high-consequence role cannot be approved without an expert calibration example', async () => {
  await assert.rejects(() => m.roles.approveRole('role_maintenance', 'expert'), /calibration example/);
  await m.roles.addCalibrationExample('role_maintenance', { criterionId: 'crit_m_escalate', excerpt: 'escalated', expertScore: 4 }, 'expert');
  const approved = await m.roles.approveRole('role_maintenance', 'expert');
  assert.equal(approved.status, 'approved');
});

test('work cannot be assessed against a role configuration that is not expert-approved', async () => {
  const role = await m.roles.createRoleIntake({
    roleFamily: 'unapproved', title: 'Unapproved role', industry: 'Test', summary: '',
    recurringTasks: ['Do a thing'], goals: [], constraints: [], permittedAiTools: [],
  }, 'admin');
  await m.roles.aiDraftRoleConfig(role.id, 'admin');
  const { assess } = await import('./assessment.js');
  await assert.rejects(
    () => assess({
      id: 'sub_x', kind: 'submission', profileId: 'prf_anita', roleId: role.id, taskId: 'grp_1_baseline',
      artifactRef: 'none', fields: {}, citedSources: [], assistance: { tools: [], aiShare: 0, notes: '' },
      workerMinutes: 1, dataProvenance: 'synthetic', createdAt: new Date().toISOString(),
    } as any),
    /not expert-approved/,
  );
});

test('automated checks catch flakiness and untraceable sources', async () => {
  const role = await m.store.get<any>('role', 'role_it_testing');
  const task = role.tasks.find((t: any) => t.id === 'checkout_baseline');
  const results = m.checks.runChecks(
    task,
    { fields: { summary: 's', verificationNotes: 'v' }, citedSources: ['REQ-CHK-99'] } as any,
    'it("a", () => {}) with Math.random()',
    role,
  );
  assert.equal(results.find((r) => r.checkId === 'baseline_flaky')?.passed, false);
  assert.equal(results.find((r) => r.checkId === 'baseline_sources')?.passed, false);
  assert.equal(results.find((r) => r.checkId === 'baseline_count')?.passed, false);
});

test('quiet hours defer an alert, and an identical alert is deduplicated', async () => {
  const profile = await m.store.get<any>('profile', 'prf_priya');
  const night = new Date('2026-10-28T17:00:00Z'); // 22:30 IST, inside 20:00-08:00
  const first = await m.notifications.notify({
    recipientId: profile.id, recipientRole: 'employee', category: 'job_alert',
    type: 'test_alert', subject: 's', body: 'b', dedupeKey: 'dedupe-test',
  }, night);
  assert.equal(first.state, 'deferred_quiet_hours');

  const second = await m.notifications.notify({
    recipientId: profile.id, recipientRole: 'employee', category: 'job_alert',
    type: 'test_alert', subject: 's', body: 'b', dedupeKey: 'dedupe-test',
  }, night);
  assert.equal(second.state, 'suppressed');
  assert.match(second.reason, /Duplicate/);
});

test('profile-discovery alerts require explicit opt-in, and pause stops everything', async () => {
  const blocked = await m.notifications.notify({
    recipientId: 'prf_vikram', recipientRole: 'employee', category: 'employer_discovery',
    type: 'discovery', subject: 's', body: 'b', dedupeKey: 'disc-1',
  });
  assert.equal(blocked.state, 'suppressed');
  assert.match(blocked.reason, /explicit opt-in/);

  await m.store.update('profile', 'prf_priya', { notifications: { ...(await m.store.get<any>('profile', 'prf_priya')).notifications, paused: true } });
  const paused = await m.notifications.notify({
    recipientId: 'prf_priya', recipientRole: 'employee', category: 'job_alert',
    type: 'test_alert', subject: 's2', body: 'b2', dedupeKey: 'paused-1',
  });
  assert.equal(paused.state, 'suppressed');
  assert.match(paused.reason, /paused/);
});

test('a confidential job search is hidden from the sponsoring employer', async () => {
  const anita = await m.store.get<any>('profile', 'prf_anita');
  assert.equal(anita.notifications.confidentialSearch, true);
  assert.equal(anita.sponsorOrgId, 'org_lumen');

  const sponsorJob = await m.jobs.draftJob({
    orgId: 'org_lumen', title: 'Internal QA opening', roleFamily: 'it_testing',
    description: 'Must have\n- Write deterministic tests that do not depend on timing or random data\n',
    location: 'Hyderabad', workMode: 'hybrid',
  } as any, 'org_lumen');
  await m.jobs.confirmRequirements(sponsorJob.id, sponsorJob.requirements, 'org_lumen');
  await m.jobs.publishJob(sponsorJob.id, 'org_lumen');

  const alerts = await m.store.find<any>('notification', (n) =>
    n.recipientId === 'prf_anita' && n.data?.jobId === sponsorJob.id);
  assert.equal(alerts.length, 0, 'the sponsoring employer must not reach a confidential searcher');
});
