import type { FastifyInstance } from 'fastify';
import { newId, nowIso, type Application, type Assessment, type AuditEntry, type EvidenceItem, type Job, type MatchReport, type Notification, type Organization, type Profile, type RoleConfig, type Submission } from '@relaunch/shared';
import { artifacts } from '../adapters/artifacts.js';
import { bus } from '../adapters/bus.js';
import { outbox } from '../adapters/messaging.js';
import { config } from '../adapters/config.js';
import { store } from '../domain/db.js';
import { addCalibrationExample, aiDraftRoleConfig, approveRole, createRoleIntake, rejectRole } from '../domain/roles.js';
import { assess, disputeAssessment, reviewAssessment } from '../domain/assessment.js';
import { currentEvidence, recordSelfReport } from '../domain/evidence.js';
import { changeJob, closeJob, confirmRequirements, draftJob, publishJob } from '../domain/jobs.js';
import { computeMatch, saveMatch } from '../domain/matching.js';
import { addThreadEntry, apply, closeApplication, confirmRevisedTerms } from '../domain/applications.js';
import { releaseHeldNotifications } from '../domain/notifications.js';
import { pilotReport } from '../domain/metrics.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true, backend: config.backend, at: nowIso() }));

  /* ------------------------------ bootstrap ----------------------------- */
  app.get('/api/bootstrap', async () => ({
    orgs: await store.list<Organization>('org'),
    profiles: await store.list<Profile>('profile'),
    roles: (await store.list<RoleConfig>('role')).map((r) => ({
      id: r.id, title: r.title, roleFamily: r.roleFamily, status: r.status,
      industry: r.industry, highConsequence: r.highConsequence,
      criteria: r.rubric.length, tasks: r.tasks.length, approvedBy: r.approvedBy,
    })),
    jobs: await store.list<Job>('job'),
  }));

  /* -------------------------------- roles ------------------------------- */
  app.get('/api/roles', async () => store.list<RoleConfig>('role'));
  app.get<{ Params: { id: string } }>('/api/roles/:id', async (req, reply) => {
    const role = await store.get<RoleConfig>('role', req.params.id);
    return role ?? reply.code(404).send({ error: 'role not found' });
  });
  app.post('/api/roles', async (req) => createRoleIntake(req.body as any, actor(req)));
  app.post<{ Params: { id: string } }>('/api/roles/:id/ai-draft', async (req) => aiDraftRoleConfig(req.params.id, actor(req)));
  app.post<{ Params: { id: string } }>('/api/roles/:id/calibrate', async (req) => addCalibrationExample(req.params.id, req.body as any, actor(req)));
  app.post<{ Params: { id: string } }>('/api/roles/:id/approve', async (req, reply) => {
    try {
      return await approveRole(req.params.id, actor(req), (req.body as any)?.note ?? '');
    } catch (error) {
      return reply.code(422).send({ error: message(error) });
    }
  });
  app.post<{ Params: { id: string } }>('/api/roles/:id/reject', async (req) => rejectRole(req.params.id, actor(req), (req.body as any)?.reason ?? ''));

  /* ------------------------------- profiles ----------------------------- */
  app.get('/api/profiles', async () => store.list<Profile>('profile'));
  app.get<{ Params: { id: string } }>('/api/profiles/:id', async (req, reply) => {
    const profile = await store.get<Profile>('profile', req.params.id);
    return profile ?? reply.code(404).send({ error: 'profile not found' });
  });
  app.post('/api/profiles', async (req) => {
    const body = req.body as Partial<Profile>;
    const profile: Profile = {
      id: newId('prf'), kind: 'profile', name: body.name ?? 'Unnamed', email: body.email ?? '',
      phone: body.phone, headline: body.headline ?? '', roleFamily: body.roleFamily ?? 'general',
      sponsorOrgId: body.sponsorOrgId,
      selfReportedSkills: body.selfReportedSkills ?? [], responsibilities: body.responsibilities ?? [],
      preferences: { locations: [], workMode: [], ...(body.preferences ?? {}) } as Profile['preferences'],
      notifications: {
        jobAlerts: true, employerDiscoveryOptIn: false, confidentialSearch: false,
        channels: ['whatsapp', 'email', 'in_app'],
        quietHours: { start: '21:00', end: '08:00', tz: 'Asia/Kolkata' },
        digest: 'off', paused: false, ...(body.notifications ?? {}),
      } as Profile['notifications'],
      createdAt: nowIso(),
    };
    await store.put('profile', profile.id, profile);
    await recordSelfReport(profile.id, profile.selfReportedSkills);
    await bus.publish('profile.registered', { profileId: profile.id });
    return profile;
  });
  app.patch<{ Params: { id: string } }>('/api/profiles/:id', async (req) => {
    const next = await store.update<Profile>('profile', req.params.id, req.body as Partial<Profile>);
    await bus.publish('profile.updated', { profileId: next.id });
    return next;
  });
  app.get<{ Params: { id: string } }>('/api/profiles/:id/evidence', async (req) => currentEvidence(req.params.id));
  app.get<{ Params: { id: string } }>('/api/profiles/:id/matches', async (req) =>
    (await store.find<MatchReport>('match', (m) => m.profileId === req.params.id))
      .sort((a, b) => (a.computedAt < b.computedAt ? 1 : -1)));

  /* --------------------------------- jobs ------------------------------- */
  app.get('/api/jobs', async () => store.list<Job>('job'));
  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = await store.get<Job>('job', req.params.id);
    return job ?? reply.code(404).send({ error: 'job not found' });
  });
  app.post('/api/jobs', async (req) => draftJob(req.body as any, actor(req)));
  app.post<{ Params: { id: string } }>('/api/jobs/:id/requirements', async (req) =>
    confirmRequirements(req.params.id, (req.body as any).requirements, actor(req)));
  app.post<{ Params: { id: string } }>('/api/jobs/:id/publish', async (req, reply) => {
    try {
      return await publishJob(req.params.id, actor(req));
    } catch (error) {
      return reply.code(422).send({ error: message(error) });
    }
  });
  app.patch<{ Params: { id: string } }>('/api/jobs/:id', async (req) => {
    const body = req.body as any;
    return changeJob(req.params.id, body.patch ?? {}, body.changes ?? ['terms updated'], actor(req));
  });
  app.post<{ Params: { id: string } }>('/api/jobs/:id/close', async (req) => closeJob(req.params.id, actor(req)));
  app.get<{ Params: { id: string } }>('/api/jobs/:id/matches', async (req) =>
    (await store.find<MatchReport>('match', (m) => m.jobId === req.params.id))
      .sort((a, b) => (a.computedAt < b.computedAt ? 1 : -1)));
  app.post<{ Params: { id: string } }>('/api/jobs/:id/recompute', async (req, reply) => {
    const job = await store.get<Job>('job', req.params.id);
    if (!job) return reply.code(404).send({ error: 'job not found' });
    const profiles = await store.find<Profile>('profile', (p) => p.roleFamily === job.roleFamily);
    const reports = [];
    for (const profile of profiles) reports.push((await saveMatch(await computeMatch(job, profile))).report);
    return reports;
  });

  /* --------------------------- work and assessment ---------------------- */
  app.post('/api/submissions', async (req, reply) => {
    const body = req.body as any;
    const key = `submissions/${body.profileId}/${body.taskId}-${Date.now()}.md`;
    const artifactRef = await artifacts.put(key, String(body.artifact ?? ''));
    const submission: Submission = {
      id: newId('sub'), kind: 'submission',
      profileId: body.profileId, roleId: body.roleId, taskId: body.taskId,
      artifactRef, fields: body.fields ?? {}, citedSources: body.citedSources ?? [],
      assistance: { tools: [], aiShare: 0, notes: '', ...(body.assistance ?? {}) },
      workerMinutes: Number(body.workerMinutes ?? 0),
      dataProvenance: body.dataProvenance ?? 'synthetic',
      createdAt: nowIso(),
    };
    await store.put('submission', submission.id, submission);
    await bus.publish('submission.received', { submissionId: submission.id, profileId: submission.profileId });
    try {
      const assessment = await assess(submission);
      return { submission, assessment };
    } catch (error) {
      return reply.code(422).send({ error: message(error), submission });
    }
  });
  app.get('/api/assessments', async (req) => {
    const q = req.query as { profileId?: string; status?: string };
    return store.find<Assessment>('assessment', (a) =>
      (!q.profileId || a.profileId === q.profileId) && (!q.status || a.status === q.status));
  });
  app.get<{ Params: { id: string } }>('/api/assessments/:id', async (req, reply) => {
    const assessment = await store.get<Assessment>('assessment', req.params.id);
    if (!assessment) return reply.code(404).send({ error: 'assessment not found' });
    const submission = await store.get<Submission>('submission', assessment.submissionId);
    return { assessment, submission, artifact: submission ? await artifacts.get(submission.artifactRef) : '' };
  });
  app.post<{ Params: { id: string } }>('/api/assessments/:id/review', async (req) =>
    reviewAssessment(req.params.id, { reviewerId: actor(req), amendedFindings: [], note: '', reviewMinutes: 0, ...(req.body as any) }));
  app.post<{ Params: { id: string } }>('/api/assessments/:id/dispute', async (req) =>
    disputeAssessment(req.params.id, actor(req), (req.body as any)?.reason ?? ''));

  /* ----------------------------- applications --------------------------- */
  app.get('/api/applications', async (req) => {
    const q = req.query as { jobId?: string; profileId?: string; orgId?: string };
    return store.find<Application>('application', (a) =>
      (!q.jobId || a.jobId === q.jobId) && (!q.profileId || a.profileId === q.profileId) && (!q.orgId || a.orgId === q.orgId));
  });
  app.get<{ Params: { id: string } }>('/api/applications/:id', async (req, reply) => {
    const application = await store.get<Application>('application', req.params.id);
    if (!application) return reply.code(404).send({ error: 'application not found' });
    return {
      application,
      match: application.matchReportId ? await store.get<MatchReport>('match', application.matchReportId) : undefined,
      profile: await store.get<Profile>('profile', application.profileId),
      job: await store.get<Job>('job', application.jobId),
    };
  });
  app.post('/api/applications', async (req, reply) => {
    const body = req.body as any;
    try {
      return await apply(body.jobId, body.profileId, { interestOnly: body.interestOnly, message: body.message });
    } catch (error) {
      return reply.code(422).send({ error: message(error) });
    }
  });
  app.post<{ Params: { id: string } }>('/api/applications/:id/thread', async (req, reply) => {
    try {
      return await addThreadEntry(req.params.id, req.body as any);
    } catch (error) {
      return reply.code(422).send({ error: message(error) });
    }
  });
  app.post<{ Params: { id: string } }>('/api/applications/:id/confirm-terms', async (req) =>
    confirmRevisedTerms(req.params.id, (req.body as any).profileId));
  app.post<{ Params: { id: string } }>('/api/applications/:id/close', async (req) =>
    closeApplication(req.params.id, actor(req), (req.body as any)?.outcome ?? 'Closed.'));

  /* --------------------- notifications, events, audit ------------------- */
  app.get('/api/notifications', async (req) => {
    const q = req.query as { recipientId?: string };
    return (await store.find<Notification>('notification', (n) => !q.recipientId || n.recipientId === q.recipientId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  });
  app.post('/api/notifications/release', async () => releaseHeldNotifications());
  app.get('/api/outbox', async () => [...outbox].reverse());
  app.get('/api/events', async () => [...bus.log].reverse().slice(0, 200));
  app.get('/api/audit', async () => (await store.list<AuditEntry>('audit')).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
  app.get('/api/evidence', async () => store.list<EvidenceItem>('evidence'));

  /* ------------------------------- metrics ------------------------------ */
  app.get('/api/metrics', async (req) => pilotReport((req.query as { roleId?: string }).roleId));
}

function actor(req: { headers: Record<string, unknown> }): string {
  return String(req.headers['x-actor'] ?? 'system');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
