import { newId, nowIso, type Assessment, type CriterionFinding, type EvidenceItem, type EvidenceStatus } from '@relaunch/shared';
import { store } from './db.js';

/**
 * Score band -> evidence status.
 * A short exercise can reveal a development need; it cannot establish overall
 * competence. "not_demonstrated" means the skill was not shown here, which is
 * different from "not_met", an observed gap.
 */
export function statusForScore(score: number): EvidenceStatus {
  if (score >= 3) return 'demonstrated';
  if (score < 2) return 'not_met';
  return 'not_demonstrated';
}

/** Records evidence, superseding any earlier item for the same competency. */
export async function recordEvidence(
  assessment: Assessment,
  findings: CriterionFinding[],
  approvedBy: string | undefined,
): Promise<EvidenceItem[]> {
  const created: EvidenceItem[] = [];
  for (const finding of findings) {
    const previous = (await store.find<EvidenceItem>('evidence', (e) =>
      e.profileId === assessment.profileId && e.competencyKey === finding.competencyKey && !e.supersedes,
    )).sort((a, b) => b.version - a.version)[0];

    const item: EvidenceItem = {
      id: newId('ev'),
      kind: 'evidence',
      profileId: assessment.profileId,
      competencyKey: finding.competencyKey,
      status: statusForScore(finding.score),
      sourceRef: assessment.id,
      sourceKind: 'assessment',
      score: finding.score,
      approvedBy,
      version: (previous?.version ?? 0) + 1,
      shareable: false,
      createdAt: nowIso(),
    };
    if (previous) {
      await store.update<EvidenceItem>('evidence', previous.id, { supersedes: item.id });
    }
    await store.put('evidence', item.id, item);
    created.push(item);
  }
  return created;
}

/** Self-reported claims are stored as evidence of a visibly weaker kind. */
export async function recordSelfReport(profileId: string, competencyKeys: string[]): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];
  for (const competencyKey of competencyKeys) {
    const exists = await store.find<EvidenceItem>('evidence', (e) => e.profileId === profileId && e.competencyKey === competencyKey);
    if (exists.length) continue;
    const item: EvidenceItem = {
      id: newId('ev'), kind: 'evidence', profileId, competencyKey,
      status: 'self_reported', sourceRef: 'self-reported profile claim', sourceKind: 'self_report',
      version: 1, shareable: false, createdAt: nowIso(),
    };
    await store.put('evidence', item.id, item);
    items.push(item);
  }
  return items;
}

/** Current (non-superseded) evidence for a person. */
export async function currentEvidence(profileId: string): Promise<EvidenceItem[]> {
  return store.find<EvidenceItem>('evidence', (e) => e.profileId === profileId && !e.supersedes);
}
