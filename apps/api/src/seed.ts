/**
 * Demo data. Everything here is synthetic: no real employer material, no real
 * personal data. Role configurations arrive expert-approved except the
 * manufacturing one, which is deliberately left awaiting approval to show the
 * gate working.
 */
import { nowIso, type Job, type Organization, type Profile, type RoleConfig } from '@relaunch/shared';
import { store } from './domain/db.js';
import { confirmRequirements, draftJob, publishJob } from './domain/jobs.js';
import { releaseHeldNotifications } from './domain/notifications.js';
import { recordSelfReport } from './domain/evidence.js';
import { registerEventRules } from './domain/wiring.js';

export async function seed({ reset = true, publish = false } = {}) {
  if (reset) await store.reset();

  const orgs: Organization[] = [
    { id: 'org_nirvana', kind: 'org', name: 'Nirvana Retail Tech', industry: 'Retail technology', contactEmail: 'talent@nirvanaretail.example.in', createdAt: nowIso() },
    { id: 'org_lumen', kind: 'org', name: 'Lumen Systems', industry: 'IT services', contactEmail: 'people@lumensystems.example.in', createdAt: nowIso() },
    { id: 'org_vidya', kind: 'org', name: 'Vidya Learning Trust', industry: 'Education', contactEmail: 'academics@vidyatrust.example.in', createdAt: nowIso() },
  ];
  for (const org of orgs) await store.put('org', org.id, org);

  for (const role of [itTestingRole(), teachingRole(), maintenanceRole()]) {
    await store.put('role', role.id, role);
  }

  const profiles: Profile[] = [
    {
      id: 'prf_anita', kind: 'profile', name: 'Anita Rao', email: 'anita.rao@example.in', phone: '+919800000001',
      headline: 'QA engineer, 6 years, manual and API testing', roleFamily: 'it_testing', sponsorOrgId: 'org_lumen',
      selfReportedSkills: ['test automation', 'api testing'],
      responsibilities: ['Owns regression suite for the payments module', 'Reviews defect reports before release sign-off'],
      preferences: { locations: ['Hyderabad'], workMode: ['hybrid', 'remote'], noticePeriodDays: 30, expectedCtcLpa: 16 },
      notifications: { jobAlerts: true, employerDiscoveryOptIn: true, confidentialSearch: true, channels: ['whatsapp', 'email', 'in_app'], quietHours: { start: '21:00', end: '08:00', tz: 'Asia/Kolkata' }, digest: 'off', paused: false },
      createdAt: nowIso(),
    },
    {
      id: 'prf_vikram', kind: 'profile', name: 'Vikram Shetty', email: 'vikram.shetty@example.in', phone: '+919800000002',
      headline: 'Test lead, 9 years, automation frameworks', roleFamily: 'it_testing',
      selfReportedSkills: ['selenium', 'ci pipelines'],
      responsibilities: ['Leads a team of four testers'],
      preferences: { locations: ['Bengaluru'], workMode: ['onsite'], noticePeriodDays: 60, expectedCtcLpa: 24 },
      notifications: { jobAlerts: true, employerDiscoveryOptIn: false, confidentialSearch: false, channels: ['email', 'in_app'], quietHours: { start: '22:00', end: '07:00', tz: 'Asia/Kolkata' }, digest: 'daily', paused: false },
      createdAt: nowIso(),
    },
    {
      id: 'prf_priya', kind: 'profile', name: 'Priya Menon', email: 'priya.menon@example.in', phone: '+919800000003',
      headline: 'Secondary science teacher, 11 years', roleFamily: 'teaching', sponsorOrgId: 'org_vidya',
      selfReportedSkills: ['lesson planning'], responsibilities: ['Class 9 and 10 physics'],
      preferences: { locations: ['Kochi'], workMode: ['onsite'], expectedCtcLpa: 9 },
      notifications: { jobAlerts: true, employerDiscoveryOptIn: false, confidentialSearch: false, channels: ['whatsapp', 'in_app'], quietHours: { start: '20:00', end: '08:00', tz: 'Asia/Kolkata' }, digest: 'off', paused: false },
      createdAt: nowIso(),
    },
    {
      id: 'prf_rahul', kind: 'profile', name: 'Rahul Deshmukh', email: 'rahul.deshmukh@example.in', phone: '+919800000004',
      headline: 'Maintenance technician, 14 years, rotating equipment', roleFamily: 'maintenance',
      selfReportedSkills: ['vibration analysis'], responsibilities: ['Shift handover for line 3'],
      preferences: { locations: ['Pune'], workMode: ['onsite'], expectedCtcLpa: 11 },
      notifications: { jobAlerts: true, employerDiscoveryOptIn: false, confidentialSearch: false, channels: ['whatsapp', 'in_app'], quietHours: { start: '21:00', end: '06:00', tz: 'Asia/Kolkata' }, digest: 'off', paused: false },
      createdAt: nowIso(),
    },
  ];
  for (const profile of profiles) {
    await store.put('profile', profile.id, profile);
    await recordSelfReport(profile.id, profile.selfReportedSkills);
  }

  const job = await draftJob({
    orgId: 'org_nirvana',
    title: 'QA Engineer - AI-assisted testing',
    roleFamily: 'it_testing',
    description: JOB_DESCRIPTION,
    location: 'Hyderabad',
    workMode: 'hybrid',
    availabilityFrom: isoDays(45),
    compensationLpa: { min: 14, max: 20 },
  } as Omit<Job, 'id' | 'kind' | 'requirements' | 'status' | 'termsVersion' | 'createdAt'>, 'org_nirvana');

  if (publish) {
    // The employer confirms every extracted requirement, then publishes, which
    // is what sends the first alerts. Same path the Employer screen takes.
    await confirmRequirements(job.id, job.requirements, 'org_nirvana');
    const published = await publishJob(job.id, 'org_nirvana');
    // The seeded alert must be on screen whatever the hour the instance booted.
    // Quiet hours and digests still apply to everything the visitor does next;
    // the released message keeps the reason it was held in its record.
    await releaseHeldNotifications();
    return { orgs, profiles, job: published };
  }

  return { orgs, profiles, job };
}

const JOB_DESCRIPTION = `We are hiring a QA engineer to own release quality for our checkout platform. The team uses approved AI assistance and expects every AI-produced artifact to be verified by the engineer who submits it.

Must have
- Design test cases covering requirements including boundary and negative conditions
- Produce coverage of every documented acceptance condition for a release
- Write deterministic tests that do not depend on timing or random data
- Verify AI-generated test output against the source requirement before submitting

Good to have
- Experience building a reusable test automation framework
- Exposure to performance testing
`;

/* ----------------------- expert-approved role configs ------------------- */

function itTestingRole(): RoleConfig {
  const criterionIds = { design: 'crit_design', coverage: 'crit_coverage', reliability: 'crit_reliability', verification: 'crit_verification' };
  const mkTask = (purpose: 'baseline' | 'practice' | 'reassessment', title: string, brief: string, conditions: string[]) => ({
    id: `checkout_${purpose}`,
    title, purpose, unseen: purpose === 'reassessment', difficulty: 3, brief,
    inputs: 'Use only the supplied requirement extract (REQ-CHK-01..04). Synthetic data only.',
    acceptanceConditions: conditions,
    requiredFields: ['summary', 'verificationNotes'],
    checks: [
      { id: `${purpose}_fields`, label: 'Summary and verification notes supplied', criterionId: criterionIds.verification, type: 'required_fields' as const, config: { fields: ['summary', 'verificationNotes'] }, weight: 1 },
      { id: `${purpose}_count`, label: 'Test case count', criterionId: criterionIds.design, type: 'min_count' as const, config: { pattern: '^\\s*(?:it|test)\\(', min: 8, label: 'Test cases' }, weight: 2 },
      { id: `${purpose}_boundary`, label: 'Boundary and negative cases named', criterionId: criterionIds.design, type: 'contains_all' as const, config: { phrases: ['boundary', 'negative'] }, weight: 1 },
      { id: `${purpose}_conditions`, label: 'Acceptance conditions addressed', criterionId: criterionIds.coverage, type: 'acceptance_conditions' as const, config: { conditions }, weight: 2 },
      { id: `${purpose}_flaky`, label: 'No timing or random dependence', criterionId: criterionIds.reliability, type: 'must_not_contain' as const, config: { phrases: ['math.random', 'settimeout', 'sleep('] }, weight: 2 },
      { id: `${purpose}_sources`, label: 'Requirements cited and traceable', criterionId: criterionIds.verification, type: 'source_consistency' as const, config: {}, weight: 2 },
    ],
    comparabilityGroup: 'checkout_rules',
  });

  return {
    id: 'role_it_testing', kind: 'role', roleFamily: 'it_testing',
    title: 'IT testing professional', industry: 'Software',
    summary: 'Creates and improves test suites for a product team, with approved AI assistance and explicit verification of AI output.',
    recurringTasks: ['Create and improve a test suite', 'Review defect reports', 'Sign off release readiness'],
    goals: [
      'Every documented acceptance condition has at least one test case',
      'Boundary and negative conditions are covered explicitly',
      'Tests are deterministic and repeatable in CI',
    ],
    constraints: ['No production data in test fixtures', 'Release sign-off remains with the engineer, not the model'],
    permittedAiTools: ['Approved in-house assistant (Bedrock)', 'IDE completion'],
    authorizationBoundaries: ['The engineer signs off release readiness; the assistant never does.'],
    highConsequence: false,
    referenceMaterial: [
      { id: 'REQ-CHK-01', title: 'Discount applies above order value 2000', body: 'Orders with a subtotal strictly above INR 2000 receive a 10 percent discount. Orders at exactly 2000 do not.' },
      { id: 'REQ-CHK-02', title: 'One coupon per order', body: 'Only one coupon may be applied. A second coupon is rejected with error CHK-209.' },
      { id: 'REQ-CHK-03', title: 'Expired coupon', body: 'A coupon past its expiry date is rejected with error CHK-210 and the order total is unchanged.' },
      { id: 'REQ-CHK-04', title: 'Refund window', body: 'A refund may be requested within 7 days of delivery. Day 8 requests are rejected with error CHK-311.' },
    ],
    rubric: [
      { id: criterionIds.design, competencyKey: 'test.design', label: 'Test case design', description: 'Cases are specific, independent, and include boundary and negative conditions.', weight: 2, anchors: { '0': 'No usable cases.', '2': 'Happy path only.', '4': 'Boundary and negative conditions covered explicitly.' }, requiresHumanReview: false },
      { id: criterionIds.coverage, competencyKey: 'test.coverage', label: 'Coverage of requirements', description: 'Every documented acceptance condition has at least one case.', weight: 2, anchors: { '0': 'Requirements not traced.', '2': 'Partial coverage.', '4': 'Full traceable coverage.' }, requiresHumanReview: false },
      { id: criterionIds.reliability, competencyKey: 'test.reliability', label: 'Deterministic, non-flaky tests', description: 'No dependence on wall-clock timing, sleeps or random data.', weight: 1, anchors: { '0': 'Unrunnable.', '2': 'Timing-sensitive.', '4': 'Deterministic.' }, requiresHumanReview: false },
      { id: criterionIds.verification, competencyKey: 'test.verification', label: 'Verification of AI output', description: 'The engineer states what they checked against the source requirement and what they corrected.', weight: 2, anchors: { '0': 'AI output submitted unchecked.', '2': 'Generic claim of checking.', '4': 'Specific corrections traced to named requirements.' }, requiresHumanReview: true },
    ],
    tasks: [
      mkTask('baseline', 'Checkout discount and coupon suite (baseline)',
        'Write a test suite for the checkout discount and coupon rules in REQ-CHK-01..03. State what you verified yourself.',
        ['Every documented acceptance condition has a test case', 'Boundary values are tested explicitly', 'Negative and error-code paths are covered']),
      mkTask('practice', 'Coupon rules (practice)',
        'Practice: extend your suite to cover coupon stacking and expiry in REQ-CHK-02 and REQ-CHK-03, correcting the gaps from your feedback.',
        ['Every documented acceptance condition has a test case', 'Boundary values are tested explicitly', 'Negative and error-code paths are covered']),
      mkTask('reassessment', 'Refund window suite (unseen reassessment)',
        'Unseen task of comparable difficulty: write a test suite for the refund window rules in REQ-CHK-04. State what you verified yourself.',
        ['Every documented acceptance condition has a test case', 'Boundary values are tested explicitly', 'Negative and error-code paths are covered']),
    ],
    lessons: [
      {
        id: 'les_testing', competencyKey: 'test.verification',
        title: 'AI-assisted test design, with verification',
        steps: [
          'Paste the requirement extract and ask for one test case per acceptance condition, with the requirement id on each case.',
          'Ask the assistant to list boundary values it derived and the rule each came from.',
          'Re-read every generated case against the named requirement; delete any case whose requirement id does not exist.',
          'Remove timing, sleeps and random data before running the suite.',
        ],
        mustVerify: [
          'Each boundary value against the requirement text, not the model summary.',
          'Each error code against the requirement that defines it.',
          'That no requirement id was invented.',
        ],
      },
      {
        id: 'les_coverage', competencyKey: 'test.coverage',
        title: 'Tracing coverage back to acceptance conditions',
        steps: ['List the acceptance conditions first.', 'Map each to a case id before writing any code.', 'Report conditions with no case as gaps rather than filling them silently.'],
        mustVerify: ['That the mapping is complete before submission.'],
      },
    ],
    calibrationExamples: [
      { id: 'cal_1', criterionId: criterionIds.design, excerpt: 'it("rejects subtotal exactly 2000", ...) with boundary and negative cases named per requirement', expertScore: 4, note: 'Expert-scored exemplar: boundary at the rule edge, not near it.' },
      { id: 'cal_2', criterionId: criterionIds.coverage, excerpt: 'Each acceptance condition mapped to a case id in the summary table', expertScore: 4, note: 'Full traceability.' },
      { id: 'cal_3', criterionId: criterionIds.reliability, excerpt: 'No sleeps; fake clock injected', expertScore: 4, note: '' },
      { id: 'cal_4', criterionId: criterionIds.verification, excerpt: 'Corrected CHK-209 to CHK-210 after checking REQ-CHK-03', expertScore: 4, note: 'Specific correction traced to a named requirement.' },
      { id: 'cal_5', criterionId: criterionIds.verification, excerpt: '"Checked the AI output and it looked fine."', expertScore: 1, note: 'Generic claim, no traceable check.' },
    ],
    status: 'approved', draftedBy: 'human',
    approvedBy: 'expert_sridhar (QA practice lead)', approvedAt: nowIso(),
    version: 2, createdAt: nowIso(),
  };
}

function teachingRole(): RoleConfig {
  return {
    id: 'role_teaching', kind: 'role', roleFamily: 'teaching',
    title: 'Teacher or instructional designer', industry: 'Education',
    summary: 'Develops a lesson and matching assessment with AI assistance, verified for factual accuracy and learner appropriateness.',
    recurringTasks: ['Develop a lesson and assessment', 'Adapt material for mixed ability groups'],
    goals: ['Content is factually correct', 'Activities match the stated learning objectives', 'Language suits the intended learners'],
    constraints: ['Content must be expert-reviewed before classroom use'],
    permittedAiTools: ['Approved in-house assistant (Bedrock)'],
    authorizationBoundaries: ['Expert review before any classroom use. The assistant does not approve teaching material.'],
    highConsequence: true,
    referenceMaterial: [
      { id: 'SYL-PHY-9.3', title: 'Class 9 physics: forces and motion', body: 'Learners should distinguish balanced and unbalanced forces and relate net force to acceleration qualitatively.' },
      { id: 'SYL-PHY-9.4', title: 'Assessment guidance', body: 'Each objective requires at least one item at recall level and one at application level.' },
    ],
    rubric: [
      { id: 'crit_accuracy', competencyKey: 'lesson.accuracy', label: 'Factual accuracy of teaching content', description: 'Every claim is correct and traceable to the syllabus extract.', weight: 2, anchors: { '0': 'Contains errors.', '4': 'Accurate and sourced.' }, requiresHumanReview: true },
      { id: 'crit_objectives', competencyKey: 'lesson.objectives', label: 'Learning-objective alignment', description: 'Each activity maps to a stated objective.', weight: 2, anchors: {}, requiresHumanReview: false },
      { id: 'crit_audience', competencyKey: 'lesson.audience', label: 'Appropriateness for intended learners', description: 'Language, examples and pace suit the stated group.', weight: 1, anchors: {}, requiresHumanReview: true },
      { id: 'crit_assessment', competencyKey: 'lesson.assessment', label: 'Assessment design', description: 'Items cover recall and application for each objective.', weight: 1, anchors: {}, requiresHumanReview: false },
    ],
    tasks: [{
      id: 'lesson_baseline', title: 'Forces and motion lesson (baseline)', purpose: 'baseline', unseen: false, difficulty: 3,
      brief: 'Develop a 40-minute lesson and a 6-item assessment for SYL-PHY-9.3. State what you verified yourself.',
      inputs: 'Syllabus extracts SYL-PHY-9.3 and SYL-PHY-9.4 only.',
      acceptanceConditions: ['Each objective has at least one recall and one application item', 'All claims traceable to the syllabus extract'],
      requiredFields: ['summary', 'verificationNotes', 'objectives'],
      checks: [
        { id: 'lesson_fields', label: 'Required fields', criterionId: 'crit_objectives', type: 'required_fields', config: { fields: ['summary', 'verificationNotes', 'objectives'] }, weight: 1 },
        { id: 'lesson_sources', label: 'Sources traceable', criterionId: 'crit_accuracy', type: 'source_consistency', config: {}, weight: 2 },
        { id: 'lesson_levels', label: 'Recall and application items', criterionId: 'crit_assessment', type: 'contains_all', config: { phrases: ['recall', 'application'] }, weight: 1 },
      ],
      comparabilityGroup: 'physics_lesson',
    }],
    lessons: [{
      id: 'les_teaching', competencyKey: 'lesson.accuracy',
      title: 'AI-assisted lesson drafting with source checking',
      steps: ['Give the assistant the syllabus extract and the learner group.', 'Ask for objectives first, then activities mapped to them.', 'Check every factual claim against the extract before use.'],
      mustVerify: ['Every scientific claim.', 'That examples suit the stated age group.', 'That the assessment covers each objective at both levels.'],
    }],
    calibrationExamples: [
      { id: 'cal_t1', criterionId: 'crit_accuracy', excerpt: 'Net force related to acceleration qualitatively, cited SYL-PHY-9.3', expertScore: 4, note: 'Expert-approved exemplar.' },
    ],
    status: 'approved', draftedBy: 'ai', approvedBy: 'expert_meera (head of science)', approvedAt: nowIso(),
    version: 2, createdAt: nowIso(),
  };
}

/** Left awaiting expert approval on purpose: the demo shows the gate. */
function maintenanceRole(): RoleConfig {
  return {
    id: 'role_maintenance', kind: 'role', roleFamily: 'maintenance',
    title: 'Manufacturing maintenance professional', industry: 'Manufacturing',
    summary: 'Analyses historical maintenance records and drafts a shift handover report with AI assistance.',
    recurringTasks: ['Analyse historical maintenance records and draft a handover report'],
    goals: ['Handover is accurate and complete', 'Every finding is traceable to a work order', 'Issues needing expert review are escalated, not resolved in the report'],
    constraints: ['Historical records only in the POC', 'The agent is never connected to live machinery'],
    permittedAiTools: ['Approved in-house assistant (Bedrock)'],
    authorizationBoundaries: [
      'No connection to live machinery or control systems.',
      'Safety-critical findings go to a qualified engineer; the report never clears equipment for use.',
    ],
    highConsequence: true,
    referenceMaterial: [
      { id: 'WO-5512', title: 'Pump P-12 bearing noise', body: 'Operator reported bearing noise on 12 Oct. Vibration reading 7.1 mm/s. Temporary speed reduction applied; follow-up inspection not yet done.' },
      { id: 'WO-5530', title: 'Conveyor C-3 belt tracking', body: 'Belt tracking corrected 18 Oct. Alignment within tolerance on recheck.' },
    ],
    rubric: [
      { id: 'crit_m_accuracy', competencyKey: 'maint.accuracy', label: 'Accuracy of maintenance analysis', description: 'Readings and dates match the work orders.', weight: 2, anchors: {}, requiresHumanReview: true },
      { id: 'crit_m_complete', competencyKey: 'maint.completeness', label: 'Completeness of handover', description: 'Every open item from the period appears in the handover.', weight: 2, anchors: {}, requiresHumanReview: false },
      { id: 'crit_m_trace', competencyKey: 'maint.traceability', label: 'Traceability to source records', description: 'Every statement cites a work order id.', weight: 2, anchors: {}, requiresHumanReview: false },
      { id: 'crit_m_escalate', competencyKey: 'maint.escalation', label: 'Recognising issues needing expert review', description: 'Items beyond the technician’s authorization are escalated explicitly.', weight: 2, anchors: {}, requiresHumanReview: true },
    ],
    tasks: [{
      id: 'handover_baseline', title: 'Shift handover from work orders (baseline)', purpose: 'baseline', unseen: false, difficulty: 3,
      brief: 'Draft a shift handover report from work orders WO-5512 and WO-5530. Escalate anything that needs a qualified engineer.',
      inputs: 'Historical work orders only. No live machine data.',
      acceptanceConditions: ['Every open item appears', 'Every statement cites a work order', 'Items needing expert review are escalated'],
      requiredFields: ['summary', 'verificationNotes', 'openItems'],
      checks: [
        { id: 'maint_fields', label: 'Required fields', criterionId: 'crit_m_complete', type: 'required_fields', config: { fields: ['summary', 'verificationNotes', 'openItems'] }, weight: 1 },
        { id: 'maint_sources', label: 'Work orders cited', criterionId: 'crit_m_trace', type: 'source_consistency', config: {}, weight: 2 },
        { id: 'maint_escalate', label: 'Escalation stated', criterionId: 'crit_m_escalate', type: 'contains_any', config: { phrases: ['escalate', 'engineer review', 'qualified engineer'] }, weight: 2 },
      ],
      comparabilityGroup: 'handover',
    }],
    lessons: [],
    calibrationExamples: [],
    status: 'pending_expert_approval', draftedBy: 'ai',
    version: 1, createdAt: nowIso(),
  };
}

function isoDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

if (process.argv[1]?.endsWith('seed.ts')) {
  registerEventRules();
  seed().then((r) => {
    console.log(`Seeded ${r.orgs.length} organizations, ${r.profiles.length} profiles, 3 role configurations.`);
    console.log(`Draft job ${r.job.id} with ${r.job.requirements.length} extracted requirements awaiting employer confirmation.`);
  });
}
