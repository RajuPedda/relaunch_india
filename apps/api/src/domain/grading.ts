import { model } from '../adapters/llm.js';
import type { CheckResult, CriterionFinding, RoleConfig, RubricCriterion, Submission, TaskSpec } from '@relaunch/shared';

/**
 * AI-assisted feedback. Every finding must:
 *  - apply the approved rubric,
 *  - point at evidence in the submitted artifact,
 *  - name what is missing,
 *  - recommend one specific correction.
 * Judgments stay reviewable, and are calibrated against expert-scored examples.
 */
export async function gradeSubmission(
  role: RoleConfig,
  task: TaskSpec,
  submission: Submission,
  artifact: string,
  checkResults: CheckResult[],
): Promise<{ findings: CriterionFinding[]; costUsd: number }> {
  const call = await model.complete({
    system: [
      `You are applying an approved assessment rubric for the role: ${role.title}.`,
      'Judge only what the artifact shows. Quote the artifact as evidence for every judgment.',
      'Never infer anything about the person beyond this piece of work.',
      'Reply with JSON only, no prose: {"findings":[{"criterionId":"...","score":0-4,',
      '"evidenceQuote":"...","omissions":["..."],"recommendedCorrection":"..."}]}',
    ].join(' '),
    prompt: [
      `Rubric criteria:`,
      ...role.rubric.map((c) => `- ${c.id}: ${c.label}. ${c.description}`),
      '',
      `Acceptance conditions: ${task.acceptanceConditions.join('; ') || 'none stated'}`,
      `Reference material ids: ${role.referenceMaterial.map((r) => r.id).join(', ') || 'none'}`,
      `Sources the worker cited: ${submission.citedSources.join(', ') || 'none'}`,
      `What the worker says they verified: ${String(submission.fields.verificationNotes ?? 'nothing stated')}`,
      '',
      'Artifact:',
      artifact.slice(0, 6000),
    ].join('\n'),
    purpose: `grade:${role.id}:${task.id}`,
  });

  const analysis = parseFindings(call.text);
  const findings: CriterionFinding[] = [];
  for (const criterion of role.rubric) {
    findings.push(buildFinding(
      criterion, role, task, submission, artifact, checkResults,
      call.confidence, analysis.get(criterion.id),
    ));
  }
  return { findings, costUsd: call.costUsd };
}

export interface ModelFinding {
  criterionId: string; score?: number; evidenceQuote?: string;
  omissions?: string[]; recommendedCorrection?: string;
}

/** The model's reply is advisory. Anything unparseable is simply ignored. */
function parseFindings(text: string): Map<string, ModelFinding> {
  const map = new Map<string, ModelFinding>();
  if (!text.trim()) return map;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return map;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { findings?: ModelFinding[] };
    for (const finding of parsed.findings ?? []) {
      if (finding?.criterionId) map.set(finding.criterionId, finding);
    }
  } catch {
    // Keep the automated checks; a malformed reply changes nothing.
  }
  return map;
}

function buildFinding(
  criterion: RubricCriterion,
  role: RoleConfig,
  task: TaskSpec,
  submission: Submission,
  artifact: string,
  checkResults: CheckResult[],
  modelConfidence: number,
  analysis: ModelFinding | undefined,
): CriterionFinding {
  const own = checkResults.filter((r) => r.criterionId === criterion.id);
  const failed = own.filter((r) => !r.passed);
  const passedRatio = own.length ? (own.length - failed.length) / own.length : 0;

  // Observable checks decide the score wherever they exist — a model does not
  // overrule a test that ran. Where no check covers the criterion, the model's
  // judgment is used if there is one, and the finding goes to a reviewer either
  // way because nothing observable backs it.
  let score: number;
  if (own.length > 0) {
    score = Math.round(passedRatio * 4 * 10) / 10;
  } else if (typeof analysis?.score === 'number' && analysis.score >= 0 && analysis.score <= 4) {
    score = Math.round(analysis.score * 10) / 10;
  } else {
    score = 2;
  }

  const omissions = [...failed.map((f) => f.detail), ...(analysis?.omissions ?? [])];
  const evidenceQuote = analysis?.evidenceQuote?.trim() || quoteFor(criterion, artifact, own);
  const correction = analysis?.recommendedCorrection?.trim()
    || (failed.length
      ? correctionFor(criterion, failed, role)
      : `Keep the current approach for ${criterion.label.toLowerCase()}; extend it to the next comparable task.`);

  const calibration = role.calibrationExamples.filter((c) => c.criterionId === criterion.id);
  const calibrationNote = calibration.length
    ? `Calibrated against ${calibration.length} expert-scored example(s); expert band ${Math.min(...calibration.map((c) => c.expertScore))}-${Math.max(...calibration.map((c) => c.expertScore))}.`
    : 'No expert-scored example for this criterion yet; treat the score as provisional.';

  const ambiguous = score > 1.5 && score < 3;
  const needsHumanReview =
    criterion.requiresHumanReview ||
    role.highConsequence ||
    own.length === 0 ||
    calibration.length === 0 ||
    ambiguous ||
    modelConfidence < 0.7;

  return {
    criterionId: criterion.id,
    competencyKey: criterion.competencyKey,
    score,
    evidenceQuote,
    omissions,
    recommendedCorrection: correction,
    source: own.length && !analysis ? 'automated' : 'ai_assisted',
    needsHumanReview,
    calibrationNote,
  };
}

function quoteFor(criterion: RubricCriterion, artifact: string, own: CheckResult[]): string {
  const passed = own.find((r) => r.passed);
  if (passed) return passed.detail;
  const words = criterion.label.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const line = artifact
    .split('\n')
    .find((l) => words.some((w) => l.toLowerCase().includes(w)));
  return line ? `Artifact: "${line.trim().slice(0, 160)}"` : 'No passage in the artifact addresses this criterion.';
}

function correctionFor(criterion: RubricCriterion, failed: CheckResult[], role: RoleConfig): string {
  const first = failed[0]!;
  const lesson = role.lessons.find((l) => l.competencyKey === criterion.competencyKey);
  const step = lesson?.steps[0];
  return step
    ? `${first.detail} Next step: ${step}`
    : `${first.detail} Revise the artifact so this criterion is met, then resubmit.`;
}

/** Overall score is weighted by rubric weight, on the 0-4 scale. */
export function overallScore(role: RoleConfig, findings: CriterionFinding[]): number {
  let weighted = 0;
  let total = 0;
  for (const f of findings) {
    const criterion = role.rubric.find((c) => c.id === f.criterionId);
    const w = criterion?.weight ?? 1;
    weighted += f.score * w;
    total += w;
  }
  return total ? Math.round((weighted / total) * 100) / 100 : 0;
}
