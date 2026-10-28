import type { AutomatedCheck, CheckResult, RoleConfig, Submission, TaskSpec } from '@relaunch/shared';

/**
 * Automated checks look at observable outcomes only. They never guess intent:
 * anything that needs judgment is left to the rubric pass and to human review.
 */
export function runChecks(
  task: TaskSpec,
  submission: Submission,
  artifact: string,
  role: RoleConfig,
): CheckResult[] {
  const text = artifact.toLowerCase();
  const results: CheckResult[] = [];

  for (const field of task.requiredFields) {
    const value = submission.fields[field];
    const present = value !== undefined && value !== null && String(value).trim() !== '';
    results.push({
      checkId: `field:${field}`,
      criterionId: role.rubric[0]?.id ?? 'unknown',
      passed: present,
      detail: present ? `Field "${field}" supplied.` : `Required field "${field}" is missing.`,
      observed: value ?? null,
    });
  }

  for (const check of task.checks) {
    results.push(runOne(check, submission, artifact, text, role));
  }
  return results;
}

function runOne(
  check: AutomatedCheck,
  submission: Submission,
  artifact: string,
  text: string,
  role: RoleConfig,
): CheckResult {
  const base = { checkId: check.id, criterionId: check.criterionId };
  const cfg = check.config as Record<string, any>;

  switch (check.type) {
    case 'required_fields': {
      const missing = (cfg.fields as string[] ?? []).filter(
        (f) => String(submission.fields[f] ?? '').trim() === '',
      );
      return { ...base, passed: missing.length === 0, detail: missing.length ? `Missing: ${missing.join(', ')}.` : 'All required fields present.', observed: missing };
    }
    case 'contains_all': {
      const missing = (cfg.phrases as string[] ?? []).filter((p) => !text.includes(p.toLowerCase()));
      return { ...base, passed: missing.length === 0, detail: missing.length ? `Not addressed: ${missing.join(', ')}.` : `All ${(cfg.phrases ?? []).length} expected elements addressed.`, observed: missing };
    }
    case 'contains_any': {
      const hit = (cfg.phrases as string[] ?? []).find((p) => text.includes(p.toLowerCase()));
      return { ...base, passed: Boolean(hit), detail: hit ? `Found "${hit}".` : `None of: ${(cfg.phrases ?? []).join(', ')}.`, observed: hit ?? null };
    }
    case 'must_not_contain': {
      const found = (cfg.phrases as string[] ?? []).filter((p) => text.includes(p.toLowerCase()));
      return { ...base, passed: found.length === 0, detail: found.length ? `Disallowed content present: ${found.join(', ')}.` : 'No disallowed content.', observed: found };
    }
    case 'min_count': {
      const re = new RegExp(cfg.pattern as string, 'gim');
      const count = (artifact.match(re) ?? []).length;
      const min = Number(cfg.min ?? 1);
      return { ...base, passed: count >= min, detail: `${cfg.label ?? 'Occurrences'}: ${count} (minimum ${min}).`, observed: count };
    }
    case 'numeric_tolerance': {
      const actual = Number(submission.fields[cfg.field as string]);
      const expected = Number(cfg.expected);
      const tol = Number(cfg.tolerance ?? 0);
      const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
      return { ...base, passed: ok, detail: ok ? `${cfg.field} = ${actual}, within ±${tol} of ${expected}.` : `${cfg.field} = ${actual}, expected ${expected} ±${tol}.`, observed: actual };
    }
    case 'source_consistency': {
      const known = new Set(role.referenceMaterial.map((r) => r.id.toLowerCase()));
      const unknown = submission.citedSources.filter((s) => !known.has(s.toLowerCase()));
      const uncited = submission.citedSources.length === 0;
      return { ...base, passed: !uncited && unknown.length === 0, detail: uncited ? 'No sources cited; conclusions are not traceable.' : unknown.length ? `Cited sources not in the supplied material: ${unknown.join(', ')}.` : `All ${submission.citedSources.length} cited sources exist in the supplied material.`, observed: unknown };
    }
    case 'acceptance_conditions': {
      const conditions = (cfg.conditions as string[] ?? []);
      const unmet = conditions.filter((c) => {
        const keywords = c.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
        const hits = keywords.filter((k) => text.includes(k)).length;
        return keywords.length > 0 && hits / keywords.length < 0.5;
      });
      return { ...base, passed: unmet.length === 0, detail: unmet.length ? `Acceptance conditions not addressed: ${unmet.join(' | ')}.` : 'All documented acceptance conditions addressed.', observed: unmet };
    }
    default:
      return { ...base, passed: false, detail: `Unknown check type ${check.type}.` };
  }
}
