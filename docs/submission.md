# Submission — ReLaunch India

Paste the sections below into Devpost. Everything here is true of the code in
this repository; anything not yet wired is named as such.

---

## Inspiration

India's workforce conversation about AI is stuck between two unhelpful claims:
that AI will replace people, and that a certificate proves someone can use it.
Employers we spoke to do not want either. They want to know whether a specific
person, doing a specific job, produces work that meets their standard — and
whether AI assistance made that work better or merely faster to produce badly.

That is an evidence problem, not a training problem. So we built the evidence
layer: assess real work against criteria a domain expert approved, teach the
workflow, practise the observed gap, reassess on a task the person has not seen,
and only then let that evidence travel to an employer — with the worker's
consent, requirement by requirement.

## What it does

**For a worker.** Submit a work sample for your own role. Automated checks run
on what can be observed. The approved rubric is applied with each finding tied
to a passage in your artifact and one specific correction. You are taught the
AI-assisted workflow, including the parts you must verify yourself. You practise
the gap, then take an unseen task of comparable difficulty. A human reviewer
approves the conclusions. Only then does a competency become demonstrated
evidence, and only then can you authorise sharing it with an employer.

**For an employer.** Paste a job description. Requirements are extracted with AI
assistance and you confirm every one before anything publishes. Publishing
alerts relevant, opted-in people over WhatsApp and email. When someone applies
you receive a requirement-by-requirement report that keeps must-have,
good-to-have and work evidence apart — deliberately not a single match
percentage. You reply, ask for clarification, invite an assessment or offer an
interview, all inside one application record.

**For the organisation.** A pilot report answering the five questions that
decide whether this is worth funding: does the work meet our standard, does AI
reduce total effort once review and rework are counted, does targeted practice
help, can successful methods spread, and can people take on new work.

## How we built it

A TypeScript monorepo. A Fastify API and a React single-page app run from one
process. Every AWS service sits behind an adapter interface, so the domain code
is identical whether it runs against AWS or against the local implementations
used for offline development.

- **Amazon SES** — live at runtime. Every email the platform sends leaves
  through `SendEmail` in `apps/api/src/adapters/messaging.ts`: job alerts, match
  reports, clarification requests, interview offers and daily digests. Each send
  carries an `EmailTags` correlation value that ties a reply back to its
  application thread. The Operations screen shows the SES message id returned
  for every delivery, and the reason for any that failed.
- **AWS End User Messaging Social (WhatsApp)** — the same `MessageSender`
  interface, with the WhatsApp implementation still recorded to the outbox in
  this proof of concept rather than sent. The message bodies, the channel
  routing and the correlation ids are in place.
- **Amazon Bedrock** — three distinct uses: drafting a role configuration from
  an administrator's description of the work, extracting job requirements for
  employer confirmation, and applying the approved rubric to a submitted
  artifact. Every model judgment carries a confidence; low confidence, a
  high-consequence role, or a missing calibration example routes the finding to
  a human reviewer instead of to the worker.
- **Amazon DynamoDB, Amazon S3, Amazon EventBridge and Amazon Bedrock** — each
  behind its own switch, each defaulting to a local implementation so the
  journey also runs with no AWS account at all. `/api/health` reports which is
  live. A service that is switched on but unreachable degrades rather than
  disappearing: a failed Bedrock call leaves the automated checks in charge and
  marks the finding for human review.
- **Amazon EventBridge** — `job.published`, `job.changed`, `job.closed`,
  `assessment.completed`, `evidence.approved`, `application.submitted` and
  `application.updated`. Each rule recomputes the affected matches and notifies
  both parties.
- **Amazon DynamoDB** — one table keyed `(pk, sk)`; the GSIs the queries need
  are declared alongside the store interface.
- **Amazon S3** — work artifacts. Records hold a pointer, never the body, so
  each artifact is access-controlled on its own.

## Challenges we ran into

**Making "we don't know" a first-class answer.** The easy design marks an
unevidenced requirement as a gap. That is wrong and it is unfair: silence about
a skill is missing information, not proof of absence. The evidence model
therefore carries four distinct states — demonstrated, self-reported, not
demonstrated, not met — and unknown information produces a clarification
request. A test asserts that no `matchPercentage` field exists anywhere, because
the moment one does, every careful distinction collapses into it.

**Stopping a short exercise from becoming a verdict.** A 40-minute task can
reveal a development need. It cannot establish competence. So a role
configuration cannot assess anyone until a domain expert approves it, a
high-consequence role additionally requires an expert-scored calibration
example, findings flagged for review never become evidence on their own, and no
code path changes an application's status based on a score.

**Measuring effort honestly.** Counting only the worker's time makes any AI
workflow look good. The pilot report counts worker time plus review time plus
rework time, and reports AI tool cost beside that total rather than subtracted
from it.

## Accomplishments we're proud of

The guardrails are in the data model rather than in a policy document. You can
read them as code: the approval gate in `roles.ts`, the four evidence states in
`evidence.ts`, the clarification path in `matching.ts`, the consent record and
terms-version supersession in `applications.ts`, and the single delivery gate in
`notifications.ts` that applies consent, pause, deduplication, quiet hours and
digests to every outbound message. Eleven tests cover the rules the plan is
specific about.

## What we learned

Designing the refusals was harder, and mattered more, than designing the
features. Most of the work went into the cases where the system must decline to
conclude something: when it has not seen the skill, when the model is unsure,
when the reviewer has not looked yet, when the employer changed the terms.

## What's next

An employer pilot: two to four weeks, ten to twenty consenting participants, one
approved workflow per function, quality thresholds and a minimum worthwhile
improvement agreed before the start, matched tasks and a comparison group where
feasible. Expand only where quality holds and the observed gain justifies the
cost.

## Built with

TypeScript · Node.js · Fastify · React · Vite · Zod · Amazon Bedrock · AWS End
User Messaging Social · Amazon SES · Amazon EventBridge · Amazon DynamoDB ·
Amazon S3

---

## Scope of this proof of concept — read before judging

- All data is **synthetic**. No employer material, no personal data, no live
  machinery, as the manufacturing role's authorization boundaries require.
- The domain logic, the guardrails, the matching, the delivery gate and the
  pilot measures are **fully implemented and tested**, and run identically
  against AWS or local adapters.
- **Amazon SES is live in the deployed instance** and is the qualifying
  Communication Developer Service. Every other AWS service has a local adapter
  so the journey also runs with no AWS account at all. Which adapter carried
  which message is visible on the Operations screen, alongside everything held
  or suppressed and the reason for each.
- While the SES account is in the sandbox, mail is routed to one verified
  address with the intended recipient named in the subject line. That is a
  sandbox constraint, not a design choice.
- Pre-existing work: none. This repository was written for this hackathon.
