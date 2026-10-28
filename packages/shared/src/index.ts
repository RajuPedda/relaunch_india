export * from './domain.js';
export * from './events.js';

export const COMPETENCY_LABELS: Record<string, string> = {
  'test.design': 'Test case design',
  'test.coverage': 'Coverage of requirements',
  'test.reliability': 'Deterministic, non-flaky tests',
  'test.verification': 'Verification of AI-generated output',
  'test.automation': 'Test automation framework',
  'lesson.accuracy': 'Factual accuracy of teaching content',
  'lesson.objectives': 'Learning-objective alignment',
  'lesson.audience': 'Appropriateness for intended learners',
  'lesson.assessment': 'Assessment design',
  'maint.accuracy': 'Accuracy of maintenance analysis',
  'maint.completeness': 'Completeness of handover',
  'maint.traceability': 'Traceability to source records',
  'maint.escalation': 'Recognising issues needing expert review',
};

export function competencyLabel(key: string): string {
  return COMPETENCY_LABELS[key] ?? key;
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
