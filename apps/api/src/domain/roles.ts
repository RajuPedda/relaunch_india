import { newId, nowIso, type RoleConfig, type RubricCriterion, type TaskSpec } from '@relaunch/shared';
import { model } from '../adapters/llm.js';
import { audit, store } from './db.js';

/**
 * Role intake. Any profession can enter this process: an administrator supplies
 * the role, recurring tasks, goals, constraints and permitted AI tools. AI may
 * draft tasks and rubrics, but a domain expert must approve and calibrate them
 * before any result is presented as a validated assessment.
 */
export interface RoleIntakeInput {
  roleFamily: string;
  title: string;
  industry: string;
  summary: string;
  recurringTasks: string[];
  goals: string[];
  constraints: string[];
  permittedAiTools: string[];
  authorizationBoundaries?: string[];
  highConsequence?: boolean;
  competencies?: { key: string; label: string; description: string; requiresHumanReview?: boolean }[];
}

export async function createRoleIntake(input: RoleIntakeInput, actor: string): Promise<RoleConfig> {
  const role: RoleConfig = {
    id: newId('role'), kind: 'role',
    roleFamily: input.roleFamily, title: input.title, industry: input.industry, summary: input.summary,
    recurringTasks: input.recurringTasks, goals: input.goals, constraints: input.constraints,
    permittedAiTools: input.permittedAiTools,
    authorizationBoundaries: input.authorizationBoundaries ?? [],
    highConsequence: input.highConsequence ?? false,
    referenceMaterial: [], rubric: [], tasks: [], lessons: [], calibrationExamples: [],
    status: 'draft', draftedBy: 'human', version: 1, createdAt: nowIso(),
  };
  await store.put('role', role.id, role);
  await audit(actor, 'role.intake_created', role.id, { title: role.title });
  return role;
}

/**
 * Drafts rubric criteria, a baseline task and a comparable unseen reassessment
 * task for each recurring task. Output is explicitly a draft: it lands in
 * `pending_expert_approval` and cannot be used for assessment until approved.
 */
export async function aiDraftRoleConfig(roleId: string, actor: string): Promise<RoleConfig> {
  const role = await store.get<RoleConfig>('role', roleId);
  if (!role) throw new Error('role not found');

  await model.complete({
    system: 'Draft assessment material for a professional role. Mark anything needing expert judgment.',
    prompt: `${role.title}\n${role.recurringTasks.join('\n')}`,
    purpose: `role_draft:${role.id}`,
  });

  const rubric: RubricCriterion[] = role.rubric.length
    ? role.rubric
    : role.recurringTasks.map((taskText, i) => ({
        id: `crit_${i + 1}`,
        competencyKey: `${role.roleFamily}.${slug(taskText).slice(0, 18)}`,
        label: titleCase(taskText),
        description: `Quality of "${taskText}" and verification of any AI-generated output used to produce it.`,
        weight: 1,
        anchors: {
          '0': 'Not attempted or materially wrong.',
          '2': 'Partly correct; important elements missing or unverified.',
          '4': 'Meets the stated standard with verification evidence.',
        },
        requiresHumanReview: role.highConsequence,
      }));

  const tasks: TaskSpec[] = role.tasks.length
    ? role.tasks
    : role.recurringTasks.flatMap((taskText, i) => {
        const group = `grp_${i + 1}`;
        const criterionId = rubric[i]?.id ?? rubric[0]!.id;
        const mk = (purpose: TaskSpec['purpose'], unseen: boolean): TaskSpec => ({
          id: `${group}_${purpose}`,
          title: `${titleCase(taskText)} (${purpose})`,
          purpose,
          unseen,
          difficulty: 3,
          brief: `${taskText}. Use only the permitted tools: ${role.permittedAiTools.join(', ') || 'none'}. State what you verified yourself.`,
          inputs: 'Supplied reference material only. Use approved or synthetic data.',
          acceptanceConditions: role.goals.slice(0, 3),
          requiredFields: ['summary', 'verificationNotes'],
          checks: [
            { id: `${group}_${purpose}_fields`, label: 'Required fields present', criterionId, type: 'required_fields', config: { fields: ['summary', 'verificationNotes'] }, weight: 1 },
            { id: `${group}_${purpose}_sources`, label: 'Sources traceable', criterionId, type: 'source_consistency', config: {}, weight: 1 },
          ],
          comparabilityGroup: group,
        });
        return [mk('baseline', false), mk('practice', false), mk('reassessment', true)];
      });

  const next: RoleConfig = {
    ...role,
    rubric,
    tasks,
    lessons: role.lessons.length ? role.lessons : rubric.map((c) => ({
      id: newId('les'),
      competencyKey: c.competencyKey,
      title: `AI-assisted workflow: ${c.label}`,
      steps: [
        'State the goal, the constraints and the acceptance conditions before prompting.',
        'Supply only approved or synthetic source material.',
        'Ask the model for its reasoning and the sources it used.',
        'Correct the output against the source material yourself.',
      ],
      mustVerify: ['Every factual claim against a named source.', 'Every number you did not compute yourself.', 'Anything that would need professional sign-off.'],
    })),
    status: 'pending_expert_approval',
    draftedBy: 'ai',
  };
  await store.put('role', next.id, next);
  await audit(actor, 'role.ai_drafted', next.id, { criteria: rubric.length, tasks: tasks.length });
  return next;
}

/** Expert approval gate. Nothing is assessable before this. */
export async function approveRole(roleId: string, expertId: string, note = ''): Promise<RoleConfig> {
  const role = await store.get<RoleConfig>('role', roleId);
  if (!role) throw new Error('role not found');
  if (!role.rubric.length || !role.tasks.length) throw new Error('role has no rubric or tasks to approve');
  if (role.highConsequence && role.calibrationExamples.length === 0) {
    throw new Error('High-consequence role requires at least one expert-scored calibration example before approval.');
  }
  const next = await store.update<RoleConfig>('role', roleId, {
    status: 'approved', approvedBy: expertId, approvedAt: nowIso(), version: role.version + 1,
  });
  await audit(expertId, 'role.approved', roleId, { note, version: next.version });
  return next;
}

export async function rejectRole(roleId: string, expertId: string, reason: string): Promise<RoleConfig> {
  const next = await store.update<RoleConfig>('role', roleId, { status: 'rejected' });
  await audit(expertId, 'role.rejected', roleId, { reason });
  return next;
}

export async function addCalibrationExample(
  roleId: string,
  example: { criterionId: string; excerpt: string; expertScore: number; note?: string },
  expertId: string,
): Promise<RoleConfig> {
  const role = await store.get<RoleConfig>('role', roleId);
  if (!role) throw new Error('role not found');
  const next = await store.update<RoleConfig>('role', roleId, {
    calibrationExamples: [...role.calibrationExamples, { id: newId('cal'), note: '', ...example }],
  });
  await audit(expertId, 'role.calibrated', roleId, { criterionId: example.criterionId });
  return next;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
