import { competencyLabel, type Application, type Job, type MatchReport, type Profile, type RoleConfig } from '@relaunch/shared';
import { bus } from '../adapters/bus.js';
import { computeMatch, saveMatch } from './matching.js';
import { notify } from './notifications.js';
import { store } from './db.js';

/**
 * Event rules. These are the EventBridge targets of the POC: each one is a
 * small, idempotent handler that recomputes matches and sends the updates the
 * plan's notification matrix describes.
 */
export function registerEventRules(): void {
  bus.on('job.published', async (event) => {
    const { jobId } = event.detail as { jobId: string };
    const job = await store.get<Job>('job', jobId);
    if (!job) return;

    const candidates = await eligibleCandidates(job);
    let high = 0, medium = 0, low = 0;

    for (const profile of candidates) {
      const { report } = await saveMatch(await computeMatch(job, profile));
      if (report.alertPriority === 'high') high++; else if (report.alertPriority === 'medium') medium++; else low++;

      await notify({
        recipientId: profile.id, recipientRole: 'employee', category: 'job_alert',
        type: 'job_alert',
        subject: `New role: ${job.title} at ${await orgName(job.orgId)}`,
        body: candidateAlertBody(job, report),
        data: { jobId: job.id, matchReportId: report.id, priority: report.alertPriority },
        dedupeKey: `job_alert:${job.id}:v${job.termsVersion}:${profile.id}`,
      });
    }

    await notify({
      recipientId: job.orgId, recipientRole: 'employer', category: 'system',
      type: 'job_published',
      subject: `Published: ${job.title}`,
      body: `Your role is live (terms version ${job.termsVersion}).\n\nMatch activity across opted-in candidates: ${high} strong, ${medium} partial, ${low} early-stage. All applications remain visible to your recruiters; matching orders alerts and never rejects anyone.`,
      data: { jobId: job.id, high, medium, low },
      dedupeKey: `job_published:${job.id}:v${job.termsVersion}`,
      transactional: true,
    });
  });

  bus.on('job.changed', async (event) => {
    const { jobId, changes } = event.detail as { jobId: string; changes: string[] };
    const job = await store.get<Job>('job', jobId);
    if (!job || job.status !== 'published') return;
    for (const profile of await eligibleCandidates(job)) {
      const { report, material } = await saveMatch(await computeMatch(job, profile));
      if (!material) continue;
      await notify({
        recipientId: profile.id, recipientRole: 'employee', category: 'job_alert',
        type: 'job_changed',
        subject: `Updated role: ${job.title}`,
        body: `The employer changed this role: ${changes.join('; ')}.\n\n${candidateAlertBody(job, report)}\n\nIf you already applied, confirm the revised terms to continue.`,
        data: { jobId: job.id, matchReportId: report.id },
        dedupeKey: `job_changed:${job.id}:v${job.termsVersion}:${profile.id}`,
      });
    }
  });

  bus.on('job.closed', async (event) => {
    const { jobId } = event.detail as { jobId: string };
    const applications = await store.find<Application>('application', (a) => a.jobId === jobId && a.status !== 'closed');
    const job = await store.get<Job>('job', jobId);
    for (const application of applications) {
      await notify({
        recipientId: application.profileId, recipientRole: 'employee', category: 'application',
        type: 'job_closed', subject: `Closed: ${job?.title ?? 'role'}`,
        body: 'This role has been closed. Your evidence stays on your profile and will be matched against new openings.',
        data: { jobId, applicationId: application.id },
        dedupeKey: `job_closed:${jobId}:${application.profileId}`, transactional: true,
      });
    }
  });

  bus.on('application.submitted', async (event) => {
    const { applicationId } = event.detail as { applicationId: string };
    const application = await store.get<Application>('application', applicationId);
    if (!application) return;
    const [job, profile, report] = await Promise.all([
      store.get<Job>('job', application.jobId),
      store.get<Profile>('profile', application.profileId),
      store.get<MatchReport>('match', application.matchReportId ?? ''),
    ]);
    if (!job || !profile || !report) return;

    await notify({
      recipientId: profile.id, recipientRole: 'employee', category: 'application',
      type: 'application_confirmed',
      subject: `Application received: ${job.title}`,
      body: `Your application is with the employer.\n\n${requirementBreakdown(report)}\n\nNext: ${application.nextAction}`,
      data: { applicationId, jobId: job.id },
      dedupeKey: `app_confirm:${applicationId}`, transactional: true,
    });

    await notify({
      recipientId: job.orgId, recipientRole: 'employer', category: 'application',
      type: 'application_received',
      subject: `Application: ${profile.name} - ${job.title}`,
      body: employerReportBody(profile, job, report),
      data: { applicationId, jobId: job.id, profileId: profile.id, matchReportId: report.id },
      dedupeKey: `app_received:${applicationId}`, transactional: true,
    });
  });

  bus.on('application.updated', async (event) => {
    const { applicationId } = event.detail as { applicationId: string };
    const application = await store.get<Application>('application', applicationId);
    if (!application) return;
    const last = application.thread[application.thread.length - 1];
    if (!last) return;
    const job = await store.get<Job>('job', application.jobId);
    const toCandidate = last.author !== 'candidate';
    await notify({
      recipientId: toCandidate ? application.profileId : application.orgId,
      recipientRole: toCandidate ? 'employee' : 'employer',
      category: 'application', type: `thread_${last.kind}`,
      subject: `${job?.title ?? 'Application'}: ${last.kind.replace(/_/g, ' ')}`,
      body: `${last.body}\n\nConfirmed next action: ${application.nextAction}`,
      data: { applicationId, jobId: application.jobId },
      dedupeKey: `thread:${last.id}`, transactional: true,
    });
  });

  bus.on('evidence.approved', async (event) => {
    const { profileId, competencyKeys } = event.detail as { profileId: string; competencyKeys: string[] };
    const profile = await store.get<Profile>('profile', profileId);
    if (!profile) return;
    const jobs = await store.find<Job>('job', (j) => j.status === 'published');

    for (const job of jobs) {
      if (!job.requirements.some((r) => competencyKeys.includes(r.competencyKey))) continue;
      if (!visibleTo(profile, job)) continue;

      const { report, material } = await saveMatch(await computeMatch(job, profile));
      if (!material) continue;

      await notify({
        recipientId: profile.id, recipientRole: 'employee', category: 'job_alert',
        type: 'evidence_updated_opportunity',
        subject: `New evidence changes your match: ${job.title}`,
        body: candidateAlertBody(job, report),
        data: { jobId: job.id, matchReportId: report.id },
        dedupeKey: `ev_match:${job.id}:${report.summary.mustHaveDemonstrated}:${profile.id}`,
      });

      // The employer is updated only for an active, consented application.
      const application = (await store.find<Application>('application', (a) =>
        a.jobId === job.id && a.profileId === profile.id && !['closed', 'superseded'].includes(a.status)))[0];
      if (!application) continue;

      await store.update<Application>('application', application.id, { matchReportId: report.id });
      await notify({
        recipientId: job.orgId, recipientRole: 'employer', category: 'application',
        type: 'match_updated',
        subject: `Updated evidence: ${profile.name} - ${job.title}`,
        body: `${profile.name} completed a human-reviewed reassessment.\n\n${employerReportBody(profile, job, report)}`,
        data: { applicationId: application.id, jobId: job.id, matchReportId: report.id },
        dedupeKey: `match_update:${application.id}:${report.summary.mustHaveDemonstrated}`, transactional: true,
      });
    }
  });
}

/* --------------------------- audience rules --------------------------- */

async function eligibleCandidates(job: Job): Promise<Profile[]> {
  const profiles = await store.find<Profile>('profile', (p) => p.roleFamily === job.roleFamily);
  return profiles.filter((p) => p.notifications.jobAlerts && !p.notifications.paused && visibleTo(p, job));
}

/**
 * Confidential external job search is kept apart from the employer-sponsored
 * development programme: a person searching confidentially is not surfaced to
 * their own sponsoring employer.
 */
function visibleTo(profile: Profile, job: Job): boolean {
  if (profile.notifications.confidentialSearch && profile.sponsorOrgId === job.orgId) return false;
  return true;
}

async function orgName(orgId: string): Promise<string> {
  return (await store.get<{ name: string }>('org', orgId))?.name ?? orgId;
}

/* ----------------------------- message copy ---------------------------- */

const ICON: Record<string, string> = {
  demonstrated: '[evidence]', self_reported: '[claimed]', not_demonstrated: '[not shown]',
  not_met: '[gap]', unknown: '[need info]',
};

export function requirementBreakdown(report: MatchReport): string {
  const lines: string[] = ['Must-have requirements:'];
  for (const f of report.mustHave) lines.push(`  ${ICON[f.status]} ${f.text} - ${f.note}`);
  if (report.goodToHave.length) {
    lines.push('Good-to-have (does not offset a missing must-have):');
    for (const f of report.goodToHave) lines.push(`  ${ICON[f.status]} ${f.text}`);
  }
  return lines.join('\n');
}

function candidateAlertBody(job: Job, report: MatchReport): string {
  const gaps = report.developmentOpportunities;
  const next = gaps.length
    ? `Next step: complete a short baseline work sample for ${gaps[0]!.split(' - ')[0]}, then apply with reviewed evidence.`
    : 'Next step: apply with your reviewed evidence.';
  return [
    `${job.title} - ${job.location} (${job.workMode}).`,
    '',
    requirementBreakdown(report),
    '',
    gaps.length ? `Evidence gaps: ${gaps.join('; ')}.` : 'No evidence gaps on the mandatory requirements.',
    report.flags.length ? `Notes: ${report.flags.join(' ')}` : '',
    next,
    'Reply STOP to pause alerts, or DIGEST for one daily summary.',
  ].filter(Boolean).join('\n');
}

function employerReportBody(profile: Profile, job: Job, report: MatchReport): string {
  const s = report.summary;
  return [
    `${profile.name} - ${profile.headline || profile.roleFamily}`,
    `Terms version ${report.jobTermsVersion}. Shared with consent.`,
    '',
    `Must-have: ${s.mustHaveDemonstrated}/${s.mustHaveTotal} demonstrated, ${s.mustHaveSelfReported} self-reported, ${s.mustHaveUnknown} unknown, ${s.mustHaveNotMet} not met.`,
    `Good-to-have: ${s.goodToHaveDemonstrated}/${s.goodToHaveTotal} demonstrated.`,
    '',
    requirementBreakdown(report),
    '',
    report.workEvidence.length
      ? `Work evidence: ${report.workEvidence.map((w) => `${competencyLabel(w.competencyKey)} ${w.score}/4 (${w.purpose}${w.approvedBy ? ', human-reviewed' : ', not yet reviewed'})`).join('; ')}.`
      : 'Work evidence: none shared yet.',
    `Preferences: ${report.preferenceFit.map((p) => `${p.field} ${p.fit}`).join(', ')}.`,
    report.flags.length ? `Flags: ${report.flags.join(' ')}` : '',
    '',
    'This report orders your queue. It is not a decision: every applicant stays visible to your recruiters.',
  ].filter(Boolean).join('\n');
}
