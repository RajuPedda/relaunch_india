import { newId, nowIso, type Application, type Job, type Requirement, type RoleConfig } from '@relaunch/shared';
import { bus } from '../adapters/bus.js';
import { model } from '../adapters/llm.js';
import { audit, store } from './db.js';

/**
 * Requirement extraction is AI-assisted but never authoritative: every
 * extracted requirement starts unconfirmed, and the employer must confirm the
 * full set before the job can be published.
 */
export async function draftJob(input: Omit<Job, 'id' | 'kind' | 'requirements' | 'status' | 'termsVersion' | 'createdAt'>, actor: string): Promise<Job> {
  const role = (await store.find<RoleConfig>('role', (r) => r.roleFamily === input.roleFamily && r.status === 'approved'))[0];
  const requirements = await extractRequirements(input.description, role);

  const job: Job = {
    ...input,
    id: newId('job'), kind: 'job',
    requirements,
    status: 'pending_confirmation',
    termsVersion: 1,
    createdAt: nowIso(),
  };
  await store.put('job', job.id, job);
  await audit(actor, 'job.drafted', job.id, { requirements: requirements.length });
  return job;
}

export async function extractRequirements(description: string, role?: RoleConfig): Promise<Requirement[]> {
  await model.complete({
    system: 'Extract mandatory and preferred requirements from a job description. Do not invent requirements.',
    prompt: description.slice(0, 4000),
    purpose: 'job_requirement_extraction',
  });

  const requirements: Requirement[] = [];
  let kind: Requirement['kind'] | undefined;
  for (const raw of description.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.toLowerCase().replace(/[^a-z ]/g, '').trim();
    if (/^must have/.test(heading)) { kind = 'must_have'; continue; }
    if (/^(good to have|nice to have|preferred)/.test(heading)) { kind = 'good_to_have'; continue; }
    if (!kind) continue;
    const text = line.replace(/^[-*•]\s*/, '');
    if (!text || text.length < 3) continue;
    requirements.push({
      id: newId('req'), kind, text,
      competencyKey: mapCompetency(text, role),
      confirmed: false, extractedBy: 'ai',
    });
  }
  return requirements;
}

function mapCompetency(text: string, role?: RoleConfig): string {
  const lower = text.toLowerCase();
  const candidates = role?.rubric ?? [];
  let best: { key: string; score: number } | undefined;
  for (const criterion of candidates) {
    const words = criterion.label.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const score = words.filter((w) => lower.includes(w)).length / Math.max(1, words.length);
    if (!best || score > best.score) best = { key: criterion.competencyKey, score };
  }
  // A weak keyword overlap is not a mapping: leave it unmapped so matching asks
  // the employer or the candidate instead of inheriting someone else's evidence.
  if (best && best.score >= 0.5) return best.key;
  return `unmapped.${lower.split(/\W+/).filter(Boolean).slice(0, 3).join('_')}`;
}

/** Employer confirms (and may correct) every extracted requirement. */
export async function confirmRequirements(jobId: string, confirmed: Requirement[], actor: string): Promise<Job> {
  const job = await store.get<Job>('job', jobId);
  if (!job) throw new Error('job not found');
  const next = await store.update<Job>('job', jobId, {
    requirements: confirmed.map((r) => ({ ...r, confirmed: true, extractedBy: 'employer' })),
  });
  await audit(actor, 'job.requirements_confirmed', jobId, { count: confirmed.length });
  return next;
}

export async function publishJob(jobId: string, actor: string): Promise<Job> {
  const job = await store.get<Job>('job', jobId);
  if (!job) throw new Error('job not found');
  const unconfirmed = job.requirements.filter((r) => !r.confirmed);
  if (unconfirmed.length) {
    throw new Error(`Confirm all ${unconfirmed.length} extracted requirement(s) before publishing.`);
  }
  const next = await store.update<Job>('job', jobId, { status: 'published', publishedAt: nowIso() });
  await audit(actor, 'job.published', jobId, { termsVersion: next.termsVersion });
  await bus.publish('job.published', { jobId: next.id, orgId: next.orgId, termsVersion: next.termsVersion });
  return next;
}

/**
 * Changing published terms bumps the version. Applications and approvals made
 * on the old terms are superseded and cannot progress until the candidate
 * confirms the new terms.
 */
export async function changeJob(jobId: string, patch: Partial<Job>, changes: string[], actor: string): Promise<Job> {
  const job = await store.get<Job>('job', jobId);
  if (!job) throw new Error('job not found');
  const termsChanged = ['requirements', 'compensationLpa', 'location', 'workMode', 'availabilityFrom', 'title'].some((k) => k in patch);
  const next = await store.update<Job>('job', jobId, {
    ...patch,
    termsVersion: termsChanged ? job.termsVersion + 1 : job.termsVersion,
  });
  await audit(actor, 'job.changed', jobId, { changes, termsVersion: next.termsVersion });

  if (termsChanged) {
    const applications = await store.find<Application>('application', (a) => a.jobId === jobId && a.status !== 'closed');
    for (const application of applications) {
      if (application.jobTermsVersion < next.termsVersion) {
        await store.update<Application>('application', application.id, {
          status: 'superseded',
          nextAction: 'Candidate must confirm the revised terms before this application can progress.',
          updatedAt: nowIso(),
          thread: [...application.thread, {
            id: newId('msg'), author: 'system', authorId: 'system', kind: 'terms_changed',
            body: `The employer changed the terms of this role (${changes.join('; ')}). This application cannot progress on the old terms.`,
            data: { termsVersion: next.termsVersion }, createdAt: nowIso(),
          }],
        });
      }
    }
  }
  await bus.publish('job.changed', { jobId: next.id, orgId: next.orgId, termsVersion: next.termsVersion, changes });
  return next;
}

export async function closeJob(jobId: string, actor: string): Promise<Job> {
  const job = await store.update<Job>('job', jobId, { status: 'closed', closedAt: nowIso() });
  await audit(actor, 'job.closed', jobId, {});
  await bus.publish('job.closed', { jobId, orgId: job.orgId });
  return job;
}
