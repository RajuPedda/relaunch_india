# ReLaunch India

A proof of concept for the ReLaunch India executive plan: help people do their work
effectively with AI, show the improvement with reviewed evidence, and connect that
evidence to real opportunities — with the employer able to see whether the work meets
their standard.

It runs with **no AWS account and no network**. Every AWS service in the plan sits
behind an adapter, so the same domain code runs locally or on AWS.

## Run it

```bash
npm install
npm run demo     # the whole journey in the terminal, ~10 seconds
npm run dev      # API on :4000, UI on http://localhost:5173
npm test         # 11 domain tests covering the plan's rules
```

`npm run reset` clears `.data/` and `.artifacts/`.

To run it the way it is deployed — one process serving both the API and the
built app on `http://localhost:4000`:

```bash
npm run build && npm start
```

## Deploy it

[`render.yaml`](render.yaml) is a Render blueprint: push to GitHub, then
**New > Blueprint** on Render. One free web service runs the API and serves the
app, so there is a single URL and no CORS.

Two things to know about every free tier, Render included: the service sleeps
after 15 minutes idle and takes about a minute to wake, and there is no
persistent disk, so each restart gives a freshly seeded demo. Setting
`RELAUNCH_SEED_PUBLISHED=true` (the blueprint does) publishes the seeded role on
boot, so a visitor arriving cold lands on a live alert and match report rather
than an unpublished draft. [docs/deploy.md](docs/deploy.md) covers the limits,
how to keep the service awake for a judging window, and why Vercel and Netlify
do not fit this particular app without a managed database.

## What is implemented

**The individual journey** — understand the role, assess an approved work sample
against domain criteria, teach an AI-assisted workflow (including what the
professional must verify), practise the observed gaps, reassess on a different
*unseen* task of comparable difficulty, then act on the reviewed evidence.

**Role intake for any profession** — an administrator supplies the role, recurring
tasks, goals, constraints and permitted AI tools. AI drafts the rubric and the
baseline/practice/reassessment tasks. A domain expert must approve and calibrate
before anything counts as a validated assessment. High-consequence roles cannot be
approved without an expert-scored calibration example.

**Three-layer evaluation** — automated checks on observable outcomes, AI-assisted
feedback that applies the approved rubric and points at evidence, and human review
that resolves disputes and approves conclusions. Managers and employers keep the
work-acceptance, staffing and hiring decisions.

**Two-way matching and communication** — publishing a job searches for relevant,
opted-in people; applying sends the employer a requirement-by-requirement report.
Both parties work inside one application record: clarifications, assessment
invitations, interview offers, replies, confirmed next actions.

**Notification and visibility rules** — alert preferences and employer visibility are
asked at registration. Matches recompute when jobs, profiles or approved evidence
change. Broader profile-discovery needs explicit opt-in. Confidential external search
is kept apart from the employer-sponsored programme. Consent and versions are
recorded; messages are deduplicated; quiet hours, digests and pausing all work.

**Employer pilot measures** — the five questions from the plan, each with its measure
and its caveats, with a slope chart for baseline-to-reassessment change and a stacked
bar for total effort.

## The interface

Six screens behind a persona rail: worker, employer, role configuration, review queue,
pilot measures, operations. The design carries the product's own claim — that a claim
and a proof should never look alike — so evidence state is the one loud thing on the
page, and it is always a coloured stripe, a glyph and a word, never colour alone.

- A five-stop journey strip on the worker screen, derived from real assessments.
- Records ruled like a register, with a status stripe down the left of each.
- Light and dark, both designed, with a theme control in the context bar.
- Chart colours were validated for colour-vision separation and contrast against this
  app's own surfaces before they were used.

See [docs/requirements-coverage.md](docs/requirements-coverage.md) for a line-by-line
map from the plan to the code.

## Shape of the code

```
packages/shared     domain model (zod schemas) and the event contract
apps/api
  adapters/         store, artifacts, event bus, model, messaging  <- the AWS seam
  domain/           roles, checks, grading, assessment, evidence,
                    matching, jobs, applications, notifications, metrics, wiring
  routes/           HTTP surface
  seed.ts demo.ts   synthetic data and the three-minute journey
apps/web
  styles.css        the design system: tokens, both themes, components
  components/       primitives, icon set, charts
  pages/            worker, employer, role configuration, review, measures, operations
```

## Local adapters and their AWS counterparts

| Adapter | Local (this POC) | AWS (as proposed in the plan) |
| --- | --- | --- |
| `store` | JSON files in `.data/` | DynamoDB, single table `(pk, sk)` with the GSIs listed in `store.ts` |
| `artifacts` | files in `.artifacts/` | S3 |
| `bus` | in-process rules, same `source`/`name`/`detail` shape | EventBridge rules targeting Lambdas |
| `llm` | deterministic heuristic model | Bedrock `InvokeModel`, or AgentCore for role intake |
| `messaging` | outbox you can read in the UI | SES for email, End User Messaging Social for WhatsApp |

Switching `RELAUNCH_BACKEND=aws` makes each adapter throw with the exact wiring note
rather than pretending to work. See [docs/aws-architecture.md](docs/aws-architecture.md).

## Honest limits

- The offline model is a deterministic stand-in, not a language model. It exercises
  the same rubric, calibration and human-review path, so the control flow is real;
  the judgments are not a language model's.
- All data is synthetic. No employer material, no personal data, no live machinery.
- A short exercise can reveal a development need. It cannot establish overall
  competence or employability, and the code never treats it as if it could.
