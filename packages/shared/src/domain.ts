import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const Iso = z.string().describe('ISO-8601 timestamp');

/** Evidence strength. Self-reported claims stay distinct from reviewed evidence. */
export const EvidenceStatus = z.enum([
  'demonstrated',    // reviewed work/assessment proves it
  'self_reported',   // candidate claims it, nothing reviewed
  'not_demonstrated',// never exercised -> NOT proof of absence
  'not_met',         // exercised and failed, or explicitly contradicted
  'unknown',         // nothing on file -> triggers clarification
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

export const RequirementKind = z.enum(['must_have', 'good_to_have']);
export type RequirementKind = z.infer<typeof RequirementKind>;

export const WorkMode = z.enum(['onsite', 'hybrid', 'remote']);
export type WorkMode = z.infer<typeof WorkMode>;
export const Channel = z.enum(['whatsapp', 'email', 'in_app']);
export type Channel = z.infer<typeof Channel>;

export const Persona = z.enum(['employee', 'employer', 'admin', 'reviewer']);
export type Persona = z.infer<typeof Persona>;

/* ------------------------------------------------------------------ */
/* People and organizations                                            */
/* ------------------------------------------------------------------ */

export const NotificationPrefs = z.object({
  jobAlerts: z.boolean().default(true),
  /** Broader profile-discovery by employers requires explicit opt-in. */
  employerDiscoveryOptIn: z.boolean().default(false),
  /** Confidential external job search is kept apart from employer-sponsored development. */
  confidentialSearch: z.boolean().default(false),
  channels: z.array(Channel).default(['whatsapp', 'email', 'in_app']),
  quietHours: z.object({ start: z.string().default('21:00'), end: z.string().default('08:00'), tz: z.string().default('Asia/Kolkata') }).default({}),
  digest: z.enum(['off', 'daily']).default('off'),
  paused: z.boolean().default(false),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export const Preferences = z.object({
  locations: z.array(z.string()).default([]),
  workMode: z.array(WorkMode).default([]),
  availabilityFrom: z.string().optional(),
  noticePeriodDays: z.number().int().optional(),
  expectedCtcLpa: z.number().optional(),
});
export type Preferences = z.infer<typeof Preferences>;

export const Profile = z.object({
  id: z.string(),
  kind: z.literal('profile').default('profile'),
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  headline: z.string().default(''),
  roleFamily: z.string(),              // e.g. "it_testing"
  /** Employer that sponsors this person's development programme, if any. */
  sponsorOrgId: z.string().optional(),
  /** Self-reported claims only. Never promoted to evidence without review. */
  selfReportedSkills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  preferences: Preferences.default({}),
  notifications: NotificationPrefs.default({}),
  createdAt: Iso,
});
export type Profile = z.infer<typeof Profile>;

export const Organization = z.object({
  id: z.string(),
  kind: z.literal('org').default('org'),
  name: z.string(),
  industry: z.string(),
  contactEmail: z.string(),
  createdAt: Iso,
});
export type Organization = z.infer<typeof Organization>;

/* ------------------------------------------------------------------ */
/* Role intake and configuration                                       */
/* ------------------------------------------------------------------ */

/** A single observable check that can be run without a human. */
export const AutomatedCheck = z.object({
  id: z.string(),
  label: z.string(),
  /** Which rubric criterion this check feeds. */
  criterionId: z.string(),
  type: z.enum([
    'required_fields',     // structured submission has these keys, non-empty
    'contains_all',        // artifact text contains every phrase
    'contains_any',
    'must_not_contain',
    'min_count',           // regex occurrences >= n (e.g. number of test cases)
    'numeric_tolerance',   // numeric field within tolerance of expected
    'source_consistency',  // every cited source id exists in reference material
    'acceptance_conditions', // documented acceptance conditions all addressed
  ]),
  config: z.record(z.any()).default({}),
  weight: z.number().default(1),
});
export type AutomatedCheck = z.infer<typeof AutomatedCheck>;

export const RubricCriterion = z.object({
  id: z.string(),
  /** Competency key this criterion produces evidence for. Links assessment -> matching. */
  competencyKey: z.string(),
  label: z.string(),
  description: z.string(),
  weight: z.number().default(1),
  /** Scale anchors used by both AI feedback and human review. */
  anchors: z.record(z.string()).default({}),
  /** High-consequence criteria always require professional oversight. */
  requiresHumanReview: z.boolean().default(false),
});
export type RubricCriterion = z.infer<typeof RubricCriterion>;

export const TaskSpec = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.enum(['baseline', 'practice', 'reassessment']),
  /** Reassessment tasks must be unseen and of comparable difficulty. */
  unseen: z.boolean().default(false),
  difficulty: z.number().int().min(1).max(5),
  brief: z.string(),
  inputs: z.string().default(''),
  acceptanceConditions: z.array(z.string()).default([]),
  /** Structured fields the submission must provide, beyond free-text artifact. */
  requiredFields: z.array(z.string()).default([]),
  checks: z.array(AutomatedCheck).default([]),
  /** Comparable-difficulty group: baseline and reassessment share it. */
  comparabilityGroup: z.string(),
});
export type TaskSpec = z.infer<typeof TaskSpec>;

export const ReferenceMaterial = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
});

export const WorkflowLesson = z.object({
  id: z.string(),
  competencyKey: z.string(),
  title: z.string(),
  steps: z.array(z.string()),
  /** What the professional must verify themselves - never delegated to the model. */
  mustVerify: z.array(z.string()),
});
export type WorkflowLesson = z.infer<typeof WorkflowLesson>;

export const RoleConfigStatus = z.enum(['draft', 'ai_drafted', 'pending_expert_approval', 'approved', 'rejected']);
export type RoleConfigStatus = z.infer<typeof RoleConfigStatus>;

export const RoleConfig = z.object({
  id: z.string(),
  kind: z.literal('role').default('role'),
  roleFamily: z.string(),
  title: z.string(),
  industry: z.string(),
  summary: z.string(),
  recurringTasks: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  permittedAiTools: z.array(z.string()).default([]),
  /** Boundaries that must hold for this profession (no live machinery, classroom review, ...). */
  authorizationBoundaries: z.array(z.string()).default([]),
  highConsequence: z.boolean().default(false),
  referenceMaterial: z.array(ReferenceMaterial).default([]),
  rubric: z.array(RubricCriterion).default([]),
  tasks: z.array(TaskSpec).default([]),
  lessons: z.array(WorkflowLesson).default([]),
  /** Expert-reviewed examples used to calibrate model judgments. */
  calibrationExamples: z.array(z.object({
    id: z.string(), criterionId: z.string(), excerpt: z.string(),
    expertScore: z.number(), note: z.string().default(''),
  })).default([]),
  status: RoleConfigStatus.default('draft'),
  draftedBy: z.enum(['human', 'ai']).default('human'),
  approvedBy: z.string().optional(),
  approvedAt: Iso.optional(),
  version: z.number().int().default(1),
  createdAt: Iso,
});
export type RoleConfig = z.infer<typeof RoleConfig>;

/* ------------------------------------------------------------------ */
/* Submissions, assessment, evidence                                   */
/* ------------------------------------------------------------------ */

export const AssistanceUsed = z.object({
  tools: z.array(z.string()).default([]),
  /** Rough share of the artifact produced with AI help, as declared by the worker. */
  aiShare: z.number().min(0).max(1).default(0),
  notes: z.string().default(''),
});

export const Submission = z.object({
  id: z.string(),
  kind: z.literal('submission').default('submission'),
  profileId: z.string(),
  roleId: z.string(),
  taskId: z.string(),
  /** Artifact body is stored in the artifact store; this is the pointer. */
  artifactRef: z.string(),
  fields: z.record(z.any()).default({}),
  citedSources: z.array(z.string()).default([]),
  assistance: AssistanceUsed.default({}),
  workerMinutes: z.number().default(0),
  /** Approved or synthetic sample only - never un-permissioned employer material. */
  dataProvenance: z.enum(['synthetic', 'approved_sample', 'employer_controlled']).default('synthetic'),
  createdAt: Iso,
});
export type Submission = z.infer<typeof Submission>;

export const CheckResult = z.object({
  checkId: z.string(),
  criterionId: z.string(),
  passed: z.boolean(),
  detail: z.string(),
  observed: z.any().optional(),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const CriterionFinding = z.object({
  criterionId: z.string(),
  competencyKey: z.string(),
  score: z.number().min(0).max(4),
  /** Quote or field reference the judgment is tied to. No free-floating opinions. */
  evidenceQuote: z.string(),
  omissions: z.array(z.string()).default([]),
  recommendedCorrection: z.string().default(''),
  source: z.enum(['automated', 'ai_assisted', 'human']),
  /** Flagged when model confidence is low or checks and model disagree. */
  needsHumanReview: z.boolean().default(false),
  calibrationNote: z.string().default(''),
});
export type CriterionFinding = z.infer<typeof CriterionFinding>;

export const HumanReview = z.object({
  reviewerId: z.string(),
  decision: z.enum(['approved', 'amended', 'rejected']),
  amendedFindings: z.array(CriterionFinding).default([]),
  note: z.string().default(''),
  reviewMinutes: z.number().default(0),
  reviewedAt: Iso,
});

export type HumanReview = z.infer<typeof HumanReview>;

export const AssessmentStatus = z.enum(['running', 'awaiting_human_review', 'approved', 'disputed', 'rejected']);
export type AssessmentStatus = z.infer<typeof AssessmentStatus>;

export const Assessment = z.object({
  id: z.string(),
  kind: z.literal('assessment').default('assessment'),
  submissionId: z.string(),
  profileId: z.string(),
  roleId: z.string(),
  taskId: z.string(),
  purpose: z.enum(['baseline', 'practice', 'reassessment']),
  comparabilityGroup: z.string(),
  difficulty: z.number().int(),
  checkResults: z.array(CheckResult).default([]),
  findings: z.array(CriterionFinding).default([]),
  overall: z.number().default(0),
  firstPassAccepted: z.boolean().default(false),
  factualErrors: z.number().int().default(0),
  omittedRequirements: z.number().int().default(0),
  status: AssessmentStatus.default('running'),
  review: HumanReview.optional(),
  dispute: z.object({ raisedBy: z.string(), reason: z.string(), raisedAt: Iso, resolution: z.string().optional() }).optional(),
  reworkMinutes: z.number().default(0),
  aiCostUsd: z.number().default(0),
  createdAt: Iso,
});
export type Assessment = z.infer<typeof Assessment>;

export const EvidenceItem = z.object({
  id: z.string(),
  kind: z.literal('evidence').default('evidence'),
  profileId: z.string(),
  competencyKey: z.string(),
  status: EvidenceStatus,
  /** Human-readable pointer: assessment id, submission id, or "self-reported". */
  sourceRef: z.string(),
  sourceKind: z.enum(['assessment', 'work_sample', 'self_report', 'manager_review']),
  score: z.number().optional(),
  /** Only expert-approved assessments may mark something demonstrated. */
  approvedBy: z.string().optional(),
  version: z.number().int().default(1),
  supersedes: z.string().optional(),
  /** Visible to employers only with consent for a specific application. */
  shareable: z.boolean().default(false),
  createdAt: Iso,
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

/* ------------------------------------------------------------------ */
/* Jobs, matching, applications                                        */
/* ------------------------------------------------------------------ */

export const Requirement = z.object({
  id: z.string(),
  kind: RequirementKind,
  text: z.string(),
  competencyKey: z.string(),
  /** Employer must confirm every extracted requirement before publication. */
  confirmed: z.boolean().default(false),
  extractedBy: z.enum(['ai', 'employer']).default('ai'),
});
export type Requirement = z.infer<typeof Requirement>;

export const JobStatus = z.enum(['draft', 'pending_confirmation', 'published', 'closed']);
export type JobStatus = z.infer<typeof JobStatus>;

export const Job = z.object({
  id: z.string(),
  kind: z.literal('job').default('job'),
  orgId: z.string(),
  title: z.string(),
  roleFamily: z.string(),
  description: z.string(),
  requirements: z.array(Requirement).default([]),
  location: z.string().default(''),
  workMode: WorkMode.default('hybrid'),
  availabilityFrom: z.string().optional(),
  compensationLpa: z.object({ min: z.number(), max: z.number() }).optional(),
  status: JobStatus.default('draft'),
  /** Bumped whenever terms change. Applications on an old version cannot progress. */
  termsVersion: z.number().int().default(1),
  publishedAt: Iso.optional(),
  closedAt: Iso.optional(),
  createdAt: Iso,
});
export type Job = z.infer<typeof Job>;

export const RequirementFinding = z.object({
  requirementId: z.string(),
  kind: RequirementKind,
  text: z.string(),
  competencyKey: z.string(),
  status: EvidenceStatus,
  sourceRef: z.string(),
  note: z.string().default(''),
  /** Unknown information asks a question - it never counts as "lacks the skill". */
  clarificationNeeded: z.boolean().default(false),
});
export type RequirementFinding = z.infer<typeof RequirementFinding>;

export const PreferenceFit = z.object({
  field: z.string(),
  jobValue: z.string(),
  candidateValue: z.string(),
  fit: z.enum(['fit', 'mismatch', 'unknown']),
});

export type PreferenceFit = z.infer<typeof PreferenceFit>;

export const MatchReport = z.object({
  id: z.string(),
  kind: z.literal('match').default('match'),
  jobId: z.string(),
  profileId: z.string(),
  jobTermsVersion: z.number().int(),
  mustHave: z.array(RequirementFinding).default([]),
  goodToHave: z.array(RequirementFinding).default([]),
  workEvidence: z.array(z.object({
    competencyKey: z.string(), assessmentId: z.string(), score: z.number(),
    purpose: z.string(), approvedBy: z.string().optional(),
  })).default([]),
  preferenceFit: z.array(PreferenceFit).default([]),
  /** Separate counts. Deliberately NOT collapsed into one percentage. */
  summary: z.object({
    mustHaveTotal: z.number().int(), mustHaveDemonstrated: z.number().int(),
    mustHaveSelfReported: z.number().int(), mustHaveUnknown: z.number().int(), mustHaveNotMet: z.number().int(),
    goodToHaveTotal: z.number().int(), goodToHaveDemonstrated: z.number().int(),
  }),
  developmentOpportunities: z.array(z.string()).default([]),
  flags: z.array(z.string()).default([]),
  /** Alert priority, used for ordering only. Never an auto-reject. */
  alertPriority: z.enum(['high', 'medium', 'low']),
  computedAt: Iso,
});
export type MatchReport = z.infer<typeof MatchReport>;

export const ThreadEntryKind = z.enum([
  'application_submitted', 'clarification_request', 'clarification_response',
  'assessment_invite', 'assessment_completed', 'interview_offer', 'interview_response',
  'status_update', 'reply', 'match_update', 'terms_changed',
]);

export type ThreadEntryKind = z.infer<typeof ThreadEntryKind>;

export const ThreadEntry = z.object({
  id: z.string(),
  author: z.enum(['employer', 'candidate', 'system']),
  authorId: z.string(),
  kind: ThreadEntryKind,
  body: z.string(),
  data: z.record(z.any()).default({}),
  createdAt: Iso,
});
export type ThreadEntry = z.infer<typeof ThreadEntry>;

export const ApplicationStatus = z.enum([
  'interest_registered', 'submitted', 'in_review', 'clarification_requested',
  'assessment_invited', 'interview_scheduled', 'offer', 'closed', 'superseded',
]);

export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

export const Application = z.object({
  id: z.string(),
  kind: z.literal('application').default('application'),
  jobId: z.string(),
  profileId: z.string(),
  orgId: z.string(),
  status: ApplicationStatus.default('submitted'),
  /** The worker authorized sharing this evidence for this job, at this terms version. */
  consentId: z.string(),
  jobTermsVersion: z.number().int(),
  matchReportId: z.string().optional(),
  thread: z.array(ThreadEntry).default([]),
  nextAction: z.string().default(''),
  createdAt: Iso,
  updatedAt: Iso,
});
export type Application = z.infer<typeof Application>;

/* ------------------------------------------------------------------ */
/* Consent, notifications, audit                                       */
/* ------------------------------------------------------------------ */

export const Consent = z.object({
  id: z.string(),
  kind: z.literal('consent').default('consent'),
  profileId: z.string(),
  scope: z.enum(['share_evidence_with_employer', 'job_alerts', 'employer_discovery', 'programme_enrolment']),
  targetId: z.string().optional(),
  granted: z.boolean(),
  policyVersion: z.string().default('v1'),
  grantedAt: Iso,
  revokedAt: Iso.optional(),
});
export type Consent = z.infer<typeof Consent>;

export const NotificationState = z.enum(['queued', 'sent', 'suppressed', 'deferred_quiet_hours', 'digested', 'failed']);
export type NotificationState = z.infer<typeof NotificationState>;

export const Notification = z.object({
  id: z.string(),
  kind: z.literal('notification').default('notification'),
  recipientId: z.string(),
  recipientRole: Persona,
  channel: Channel,
  type: z.string(),
  subject: z.string(),
  body: z.string(),
  data: z.record(z.any()).default({}),
  /** Identical payloads collapse instead of spamming the recipient. */
  dedupeKey: z.string(),
  state: NotificationState.default('queued'),
  reason: z.string().default(''),
  scheduledFor: Iso.optional(),
  sentAt: Iso.optional(),
  createdAt: Iso,
});
export type Notification = z.infer<typeof Notification>;

export const AuditEntry = z.object({
  id: z.string(),
  kind: z.literal('audit').default('audit'),
  actor: z.string(),
  action: z.string(),
  subject: z.string(),
  detail: z.record(z.any()).default({}),
  createdAt: Iso,
});
export type AuditEntry = z.infer<typeof AuditEntry>;

/* ------------------------------------------------------------------ */
/* Pilot measurement                                                   */
/* ------------------------------------------------------------------ */

export const EffortEntry = z.object({
  id: z.string(),
  kind: z.literal('effort').default('effort'),
  profileId: z.string(),
  roleId: z.string(),
  assessmentId: z.string(),
  phase: z.enum(['baseline', 'practice', 'reassessment']),
  aiAssisted: z.boolean(),
  workerMinutes: z.number(),
  reviewMinutes: z.number(),
  reworkMinutes: z.number(),
  aiCostUsd: z.number(),
  createdAt: Iso,
});
export type EffortEntry = z.infer<typeof EffortEntry>;

export const AnyRecord = z.union([
  Profile, Organization, RoleConfig, Submission, Assessment, EvidenceItem,
  Job, MatchReport, Application, Consent, Notification, AuditEntry, EffortEntry,
]);
