import { competencyLabel, newId, nowIso, type Assessment, type EvidenceItem, type Job, type MatchReport, type PreferenceFit, type Profile, type Requirement, type RequirementFinding } from '@relaunch/shared';
import { currentEvidence } from './evidence.js';
import { store } from './db.js';

/**
 * Requirement-by-requirement matching.
 *
 * Rules taken from the plan, and deliberately visible in the code:
 *  - must-have and good-to-have are reported separately; there is no single
 *    match percentage that hides the distinction;
 *  - good-to-have never compensates for an unmet mandatory requirement;
 *  - unknown information prompts a clarification, it is not proof of absence;
 *  - self-reported claims stay distinct from reviewed evidence;
 *  - matching orders alerts, it never rejects an applicant.
 */
export async function computeMatch(job: Job, profile: Profile): Promise<MatchReport> {
  const evidence = await currentEvidence(profile.id);
  const assessments = await store.find<Assessment>('assessment', (a) => a.profileId === profile.id && a.status === 'approved');

  const mustHave = job.requirements.filter((r) => r.kind === 'must_have').map((r) => assess(r, evidence, profile));
  const goodToHave = job.requirements.filter((r) => r.kind === 'good_to_have').map((r) => assess(r, evidence, profile));

  const relevantKeys = new Set(job.requirements.map((r) => r.competencyKey));
  const workEvidence = assessments
    .filter((a) => a.findings.some((f) => relevantKeys.has(f.competencyKey)))
    .flatMap((a) => a.findings
      .filter((f) => relevantKeys.has(f.competencyKey))
      .map((f) => ({
        competencyKey: f.competencyKey,
        assessmentId: a.id,
        score: f.score,
        purpose: a.purpose,
        approvedBy: a.review?.reviewerId,
      })));

  const preferenceFit = fitPreferences(job, profile);

  const summary = {
    mustHaveTotal: mustHave.length,
    mustHaveDemonstrated: mustHave.filter((f) => f.status === 'demonstrated').length,
    mustHaveSelfReported: mustHave.filter((f) => f.status === 'self_reported').length,
    mustHaveUnknown: mustHave.filter((f) => f.status === 'unknown' || f.status === 'not_demonstrated').length,
    mustHaveNotMet: mustHave.filter((f) => f.status === 'not_met').length,
    goodToHaveTotal: goodToHave.length,
    goodToHaveDemonstrated: goodToHave.filter((f) => f.status === 'demonstrated').length,
  };

  const flags: string[] = [];
  if (mustHave.some((f) => f.clarificationNeeded)) flags.push('Clarification needed on at least one mandatory requirement.');
  if (workEvidence.some((w) => !w.approvedBy)) flags.push('Some evidence has not been through human review; treat as provisional.');
  if (summary.mustHaveSelfReported > 0) flags.push('Some mandatory requirements rest on self-reported claims only.');
  if (preferenceFit.some((p) => p.fit === 'mismatch')) flags.push('Stated preferences do not match the posting.');
  if (profile.notifications.confidentialSearch && profile.sponsorOrgId === job.orgId) {
    flags.push('Confidential search: this posting is from the sponsoring employer.');
  }

  const developmentOpportunities = [...mustHave, ...goodToHave]
    .filter((f) => f.status === 'not_demonstrated' || f.status === 'not_met' || f.status === 'self_reported')
    .map((f) => `${readable(f)} - ${f.status === 'self_reported' ? 'claimed but not yet demonstrated' : 'practice available'}`);

  const report: MatchReport = {
    id: newId('mat'), kind: 'match',
    jobId: job.id, profileId: profile.id, jobTermsVersion: job.termsVersion,
    mustHave, goodToHave, workEvidence, preferenceFit, summary,
    developmentOpportunities, flags,
    alertPriority: priority(summary, preferenceFit),
    computedAt: nowIso(),
  };
  return report;
}

/** An unmapped requirement has no competency behind it; show its own wording. */
function readable(finding: RequirementFinding): string {
  return finding.competencyKey.startsWith('unmapped.') ? finding.text : competencyLabel(finding.competencyKey);
}

function assess(requirement: Requirement, evidence: EvidenceItem[], profile: Profile): RequirementFinding {
  const item = evidence.find((e) => e.competencyKey === requirement.competencyKey);
  if (item) {
    return {
      requirementId: requirement.id,
      kind: requirement.kind,
      text: requirement.text,
      competencyKey: requirement.competencyKey,
      status: item.status,
      sourceRef: item.sourceKind === 'assessment' ? `assessment ${item.sourceRef}` : item.sourceRef,
      note: item.score !== undefined ? `Rubric score ${item.score}/4 (${item.sourceKind.replace('_', ' ')}).` : `Source: ${item.sourceKind.replace('_', ' ')}.`,
      clarificationNeeded: item.status === 'self_reported',
    };
  }

  // Fall back to the profile's own words, which are a claim, never evidence.
  const claimed = profile.selfReportedSkills.some(
    (s) => s.toLowerCase() === requirement.competencyKey.toLowerCase() || requirement.text.toLowerCase().includes(s.toLowerCase()),
  );
  if (claimed) {
    return {
      requirementId: requirement.id, kind: requirement.kind, text: requirement.text,
      competencyKey: requirement.competencyKey, status: 'self_reported',
      sourceRef: 'self-reported profile claim',
      note: 'Claimed on the profile; no reviewed work sample yet.',
      clarificationNeeded: true,
    };
  }

  return {
    requirementId: requirement.id, kind: requirement.kind, text: requirement.text,
    competencyKey: requirement.competencyKey, status: 'unknown',
    sourceRef: 'no record',
    note: 'Nothing on file. This is missing information, not an indication the person lacks the skill.',
    clarificationNeeded: true,
  };
}

function fitPreferences(job: Job, profile: Profile): PreferenceFit[] {
  const prefs = profile.preferences;
  const fits: PreferenceFit[] = [];

  fits.push({
    field: 'location', jobValue: job.location, candidateValue: prefs.locations.join(', ') || 'not stated',
    fit: !prefs.locations.length ? 'unknown' : prefs.locations.some((l) => l.toLowerCase() === job.location.toLowerCase()) ? 'fit' : 'mismatch',
  });
  fits.push({
    field: 'workMode', jobValue: job.workMode, candidateValue: prefs.workMode.join(', ') || 'not stated',
    fit: !prefs.workMode.length ? 'unknown' : prefs.workMode.includes(job.workMode) ? 'fit' : 'mismatch',
  });
  if (job.availabilityFrom) {
    const ready = prefs.availabilityFrom ?? (prefs.noticePeriodDays !== undefined
      ? new Date(Date.now() + prefs.noticePeriodDays * 86400000).toISOString().slice(0, 10)
      : undefined);
    fits.push({
      field: 'availability', jobValue: job.availabilityFrom, candidateValue: ready ?? 'not stated',
      fit: !ready ? 'unknown' : ready <= job.availabilityFrom ? 'fit' : 'mismatch',
    });
  }
  if (job.compensationLpa) {
    const want = prefs.expectedCtcLpa;
    fits.push({
      field: 'compensation', jobValue: `${job.compensationLpa.min}-${job.compensationLpa.max} LPA`,
      candidateValue: want !== undefined ? `${want} LPA` : 'not stated',
      fit: want === undefined ? 'unknown' : want <= job.compensationLpa.max ? 'fit' : 'mismatch',
    });
  }
  return fits;
}

function priority(summary: MatchReport['summary'], fit: PreferenceFit[]): 'high' | 'medium' | 'low' {
  const mismatch = fit.some((f) => f.fit === 'mismatch');
  if (summary.mustHaveTotal === 0) return 'low';
  const allDemonstrated = summary.mustHaveDemonstrated === summary.mustHaveTotal;
  if (allDemonstrated && !mismatch) return 'high';
  if (summary.mustHaveNotMet === 0 && summary.mustHaveDemonstrated >= Math.ceil(summary.mustHaveTotal / 2)) return 'medium';
  return 'low';
}

/** A change is material when the headline counts or the priority move. */
export function isMaterialChange(previous: MatchReport | undefined, next: MatchReport): boolean {
  if (!previous) return true;
  const a = previous.summary, b = next.summary;
  return (
    previous.alertPriority !== next.alertPriority ||
    a.mustHaveDemonstrated !== b.mustHaveDemonstrated ||
    a.mustHaveNotMet !== b.mustHaveNotMet ||
    a.mustHaveUnknown !== b.mustHaveUnknown ||
    a.goodToHaveDemonstrated !== b.goodToHaveDemonstrated ||
    previous.jobTermsVersion !== next.jobTermsVersion
  );
}

export async function saveMatch(report: MatchReport): Promise<{ report: MatchReport; material: boolean }> {
  const previous = (await store.find<MatchReport>('match', (m) => m.jobId === report.jobId && m.profileId === report.profileId))
    .sort((x, y) => (x.computedAt < y.computedAt ? 1 : -1))[0];
  const material = isMaterialChange(previous, report);
  await store.put('match', report.id, report);
  return { report, material };
}
