import { newId, nowIso, type Application, type ApplicationStatus, type Consent, type Job, type MatchReport, type Profile, type ThreadEntry, type ThreadEntryKind } from '@relaunch/shared';
import { bus } from '../adapters/bus.js';
import { computeMatch, saveMatch } from './matching.js';
import { currentEvidence } from './evidence.js';
import { audit, store } from './db.js';

/**
 * Applying or registering interest is an explicit, consented act: the worker
 * authorizes sharing their reviewed evidence with this employer, for this job,
 * at this version of its terms.
 */
export async function apply(
  jobId: string,
  profileId: string,
  options: { interestOnly?: boolean; message?: string } = {},
): Promise<{ application: Application; match: MatchReport }> {
  const job = await store.get<Job>('job', jobId);
  const profile = await store.get<Profile>('profile', profileId);
  if (!job || !profile) throw new Error('job or profile not found');
  if (job.status !== 'published') throw new Error('this job is not open for applications');

  const existing = (await store.find<Application>('application', (a) => a.jobId === jobId && a.profileId === profileId))[0];
  if (existing && existing.status !== 'superseded') return { application: existing, match: (await store.get<MatchReport>('match', existing.matchReportId ?? ''))! };

  const consent: Consent = {
    id: newId('con'), kind: 'consent', profileId,
    scope: 'share_evidence_with_employer', targetId: job.orgId,
    granted: true, policyVersion: `job:${job.id}@v${job.termsVersion}`, grantedAt: nowIso(),
  };
  await store.put('consent', consent.id, consent);

  // Consent makes the relevant evidence visible to this employer, and only it.
  const keys = new Set(job.requirements.map((r) => r.competencyKey));
  for (const item of await currentEvidence(profileId)) {
    if (keys.has(item.competencyKey)) await store.update('evidence', item.id, { shareable: true });
  }

  const { report } = await saveMatch(await computeMatch(job, profile));

  const application: Application = {
    id: newId('app'), kind: 'application',
    jobId, profileId, orgId: job.orgId,
    status: options.interestOnly ? 'interest_registered' : 'submitted',
    consentId: consent.id,
    jobTermsVersion: job.termsVersion,
    matchReportId: report.id,
    thread: [{
      id: newId('msg'), author: 'candidate', authorId: profileId, kind: 'application_submitted',
      body: options.message ?? (options.interestOnly ? 'Registered interest in this role.' : 'Submitted an application with consented work evidence.'),
      data: { matchReportId: report.id }, createdAt: nowIso(),
    }],
    nextAction: 'Employer to review the match report.',
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  await store.put('application', application.id, application);
  await audit(profileId, 'application.submitted', application.id, { jobId, consentId: consent.id });
  await bus.publish('application.submitted', { applicationId: application.id, jobId, profileId, orgId: job.orgId });
  return { application, match: report };
}

const NEXT_ACTION: Partial<Record<ThreadEntryKind, { status: ApplicationStatus; next: string }>> = {
  clarification_request: { status: 'clarification_requested', next: 'Candidate to answer the employer question.' },
  clarification_response: { status: 'in_review', next: 'Employer to review the answer.' },
  assessment_invite: { status: 'assessment_invited', next: 'Candidate to complete the invited assessment.' },
  assessment_completed: { status: 'in_review', next: 'Employer to review the new evidence.' },
  interview_offer: { status: 'interview_scheduled', next: 'Candidate to accept or propose another slot.' },
  interview_response: { status: 'interview_scheduled', next: 'Employer to confirm the interview slot.' },
  status_update: { status: 'in_review', next: 'Employer to confirm the next step.' },
  reply: { status: 'in_review', next: 'Awaiting the other party.' },
};

/** Both parties work inside the same application record. */
export async function addThreadEntry(
  applicationId: string,
  entry: { author: ThreadEntry['author']; authorId: string; kind: ThreadEntryKind; body: string; data?: Record<string, unknown> },
): Promise<Application> {
  const application = await store.get<Application>('application', applicationId);
  if (!application) throw new Error('application not found');
  if (application.status === 'superseded' && entry.kind !== 'terms_changed') {
    throw new Error('This application is on superseded terms. The candidate must confirm the revised terms first.');
  }

  const transition = NEXT_ACTION[entry.kind];
  const next = await store.update<Application>('application', applicationId, {
    thread: [...application.thread, { id: newId('msg'), createdAt: nowIso(), data: {}, ...entry }],
    status: transition?.status ?? application.status,
    nextAction: transition?.next ?? application.nextAction,
    updatedAt: nowIso(),
  });
  await audit(entry.authorId, `application.${entry.kind}`, applicationId, {});
  await bus.publish('application.updated', {
    applicationId, jobId: next.jobId, profileId: next.profileId, orgId: next.orgId,
  });
  return next;
}

/** Changed terms require fresh confirmation before the application can move on. */
export async function confirmRevisedTerms(applicationId: string, profileId: string): Promise<Application> {
  const application = await store.get<Application>('application', applicationId);
  if (!application) throw new Error('application not found');
  const job = await store.get<Job>('job', application.jobId);
  if (!job) throw new Error('job not found');
  const profile = await store.get<Profile>('profile', profileId);
  if (!profile) throw new Error('profile not found');

  const consent: Consent = {
    id: newId('con'), kind: 'consent', profileId, scope: 'share_evidence_with_employer',
    targetId: job.orgId, granted: true, policyVersion: `job:${job.id}@v${job.termsVersion}`, grantedAt: nowIso(),
  };
  await store.put('consent', consent.id, consent);
  const { report } = await saveMatch(await computeMatch(job, profile));

  const next = await store.update<Application>('application', applicationId, {
    status: 'in_review',
    jobTermsVersion: job.termsVersion,
    consentId: consent.id,
    matchReportId: report.id,
    nextAction: 'Employer to review the match report on the revised terms.',
    updatedAt: nowIso(),
    thread: [...application.thread, {
      id: newId('msg'), author: 'candidate', authorId: profileId, kind: 'reply',
      body: `Confirmed the revised terms (version ${job.termsVersion}).`, data: {}, createdAt: nowIso(),
    }],
  });
  await audit(profileId, 'application.terms_confirmed', applicationId, { termsVersion: job.termsVersion });
  return next;
}

export async function closeApplication(applicationId: string, actorId: string, outcome: string): Promise<Application> {
  const application = await store.get<Application>('application', applicationId);
  if (!application) throw new Error('application not found');
  return store.update<Application>('application', applicationId, {
    status: 'closed', nextAction: outcome, updatedAt: nowIso(),
    thread: [...application.thread, {
      id: newId('msg'), author: 'employer', authorId: actorId, kind: 'status_update',
      body: outcome, data: {}, createdAt: nowIso(),
    }],
  });
}
