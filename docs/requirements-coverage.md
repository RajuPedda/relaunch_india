# Plan to code

Every requirement in *ReLaunch India — Proposed AWS hackathon POC and employer pilot*,
and where it lives.

## How the experience works

| Plan | Where |
| --- | --- |
| Understand the role, recurring tasks, goals, constraints, permitted AI tools | `domain/roles.ts` `RoleIntakeInput`; Admin tab |
| Assess an approved work sample against domain-specific criteria | `domain/checks.ts`, `domain/grading.ts`, `domain/assessment.ts` |
| Teach an AI-assisted workflow, including what the professional must verify | `RoleConfig.lessons[].mustVerify`; shown in the Employee feedback panel |
| Practise observed gaps and reassess on a different, comparable task | `TaskSpec.purpose` + `comparabilityGroup` + `unseen`; `checkout_reassessment` is a different rule set at the same difficulty |
| Review evidence, receive alerts, authorize applications or internal moves | `domain/evidence.ts`, `domain/wiring.ts`, `domain/applications.ts` |

## Two-way matching and communication

| Plan | Where |
| --- | --- |
| Publishing a job triggers a search for relevant, opted-in people | `bus.on('job.published')` in `domain/wiring.ts`; `eligibleCandidates()` filters on `jobAlerts`, `paused` and confidential-search separation |
| Applying triggers an employer update with a requirement-by-requirement report | `bus.on('application.submitted')`; `employerReportBody()` |
| Both parties reply, request clarification, arrange assessments, coordinate interviews in one record | `Application.thread`, `addThreadEntry()`, `NEXT_ACTION` transitions |
| Employer confirms mandatory requirements extracted from the description | `jobs.extractRequirements()` leaves every requirement `confirmed: false`; `publishJob()` refuses until all are confirmed |
| Each requirement marked demonstrated / self-reported / not demonstrated / not met, with its source | `EvidenceStatus`, `RequirementFinding.sourceRef` |
| Unknown information prompts clarification; it is not proof the person lacks the skill | `matching.assess()` returns `unknown` + `clarificationNeeded`, with that sentence in the note. Test: *an unknown requirement asks for clarification instead of counting as a gap* |
| Good-to-have never compensates for an unmet mandatory requirement | `summary` keeps the two sets apart; `priority()` reads must-have only. Test: *good-to-have skills never offset a missing must-have* |
| Show them separately instead of hiding the distinction in a single match percentage | There is no percentage field in `MatchReport`. The test asserts it does not exist |
| Compare approved samples, assessment results, responsibilities, location, work mode, availability, compensation | `MatchReport.workEvidence` and `fitPreferences()` |
| Keep self-reported claims distinct from reviewed evidence | `recordSelfReport()` writes `self_reported` evidence; matching never promotes it |

### The notification matrix

Every row of the plan's event table is a rule in `domain/wiring.ts`:
`job.published`, `job.changed`, `job.closed`, `application.submitted`,
`application.updated`, `evidence.approved`.

| Plan | Where |
| --- | --- |
| Ask about job-alert preferences and employer visibility at registration | `NotificationPrefs`; Employee tab |
| Recompute matches when jobs, profiles or approved evidence change | the four recomputing rules in `wiring.ts` |
| Notify employers of applications; profile-discovery alerts need explicit opt-in | `consentGate()` on `category: 'employer_discovery'`. Test covers it |
| Keep confidential external search separate from the employer programme | `visibleTo()`. Test: *a confidential job search is hidden from the sponsoring employer* |
| Prioritize alerts where mandatory requirements have evidence and constraints fit | `priority()` |
| Flag uncertain evidence for review | `MatchReport.flags`; `CriterionFinding.needsHumanReview` |
| All applications stay visible to recruiters; matching does not auto-reject | stated in the employer message body; no code path rejects an application |
| Record consent and versions, deduplicate, support quiet hours and digests, allow pausing | `Consent`, `Job.termsVersion`, `dedupeKey`, `inQuietHours()`, `releaseHeldNotifications()`, `paused` |
| Changed terms require fresh confirmation; superseded applications cannot progress | `changeJob()` supersedes; `addThreadEntry()` refuses; `confirmRevisedTerms()` re-consents. Test covers all three |

## Assessment and employer outcomes

| Plan | Where |
| --- | --- |
| Any profession can enter role intake | `createRoleIntake()`; the Admin tab ships with a healthcare example |
| An administrator configures tasks, tools, reference material, criteria | `RoleConfig` |
| AI may draft, but a domain expert must approve and calibrate | `aiDraftRoleConfig()` sets `pending_expert_approval`; `assess()` refuses a role that is not `approved`. Test covers it |
| High-consequence work requires professional oversight | `highConsequence` forces `requiresHumanReview`, and blocks approval without a calibration example. Test covers it |
| Feedback tied to an observed action or artifact | `CriterionFinding.evidenceQuote` |
| Distinguish "not demonstrated" from an established gap | `statusForScore()`: `demonstrated` / `not_demonstrated` / `not_met`. Test covers the bands |
| Automated checks on observable outcomes | `domain/checks.ts`: required fields, phrase coverage, occurrence counts, numeric tolerance, source consistency, acceptance conditions, disallowed content |
| AI feedback applies the rubric, points at evidence, explains omissions, recommends one correction | `buildFinding()` |
| Keep model judgments reviewable and calibrated against expert examples | `calibrationNote` on every finding; no calibration example means the score is marked provisional and routed to review |
| Human review resolves disputes and approves conclusions | `reviewAssessment()`, `disputeAssessment()`; Reviewer tab |
| Managers and employers retain work-acceptance, staffing and hiring decisions | no code path changes an application status on a score |
| Record assistance used; compare tasks of similar difficulty | `Submission.assistance`; `comparabilityGroup` and `difficulty` on each pair |
| An unseen reassessment is stronger evidence than repeating a coached exercise | `TaskSpec.unseen`; the pilot report flags whether difficulty matched and whether a human reviewed it |

## What employers would measure

`domain/metrics.ts`, one block per question in the plan:
first-pass acceptance and reviewer judgment; worker **plus** review **plus** rework
minutes with AI cost reported separately; baseline versus comparable reassessment;
consistency across participants and approved-workflow adoption; manager-reviewed
evidence and confirmed employer next steps. `scope.caveats` travels with the numbers.

## Data and decision boundaries

| Plan | Where |
| --- | --- |
| Approved or synthetic work samples; controlled access to employer material | `Submission.dataProvenance` |
| Permission before sharing personal evidence | `apply()` writes a `Consent` naming the employer and the job terms version, and only then marks the relevant evidence shareable |
| Correction and review route | `disputeAssessment()` and the amend path in `reviewAssessment()` |
| Do not infer sensitive characteristics; never decide employment on task scores alone | no sensitive attributes exist in the model; no status change is driven by a score |
| Manufacturing: historical records only, never live machinery | `role_maintenance.authorizationBoundaries`, shown in the Admin tab |
| Education: expert review before classroom use | `role_teaching.highConsequence = true`, accuracy and audience criteria require human review |
| Assessments stay inside each profession's authorized boundaries | `RoleConfig.authorizationBoundaries` |
