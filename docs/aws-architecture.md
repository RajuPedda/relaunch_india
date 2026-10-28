# AWS architecture

The POC runs locally, but it is built against the service shape proposed in the plan.
Every seam is an interface in `apps/api/src/adapters/`.

```
                     ┌──────────────────────────────┐
  Employer / worker  │  Web UI (apps/web)           │
  WhatsApp / email   │  Fastify API (apps/api)      │  -> API Gateway + Lambda
                     └───────────────┬──────────────┘
                                     │
        ┌────────────────────────────┼─────────────────────────────┐
        │                            │                             │
┌───────▼────────┐          ┌────────▼────────┐           ┌────────▼────────┐
│ Bedrock        │          │ EventBridge bus │           │ DynamoDB        │
│ (role drafts,  │          │ job.published   │           │ roles, profiles │
│  rubric        │          │ job.changed     │           │ submissions     │
│  feedback,     │          │ evidence.approved│          │ assessments     │
│  requirement   │          │ application.*   │           │ evidence, jobs  │
│  extraction)   │          │ profile.*       │           │ matches, apps   │
│ AgentCore for  │          └────────┬────────┘           │ notifications   │
│ role intake    │                   │                    │ audit, effort   │
└────────────────┘          ┌────────▼────────┐           └─────────────────┘
                            │ Lambda targets  │
                            │ recompute match │           ┌─────────────────┐
                            │ notify parties  │──────────▶│ S3 artifacts    │
                            └────────┬────────┘           └─────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │ SES (email)                   │
                     │ End User Messaging Social     │
                     │ (two-way WhatsApp)            │
                     └───────────────────────────────┘
```

## Service by service

**DynamoDB** — one table, `pk` = entity type, `sk` = id. `apps/api/src/adapters/store.ts`
carries the `INDEXES` map: the GSIs the queries in `domain/` actually need
(`job` by `orgId`/`status`/`roleFamily`, `evidence` by `profileId`/`competencyKey`,
`application` by `jobId`/`profileId`/`orgId`, `notification` by `recipientId`/`dedupeKey`,
and so on). The local driver implements the same `Store` interface over JSON files.

**S3** — work artifacts. Submissions store a pointer (`artifactRef`), never the body,
so the record stays small and the artifact can be access-controlled on its own.

**EventBridge** — `packages/shared/src/events.ts` is the contract: `source`,
`name` (the detail-type) and a typed `detail`. `domain/wiring.ts` registers the rules;
each one is a small idempotent handler that would become a Lambda target. Handler
failures are captured on the bus rather than thrown back at the publisher.

**Bedrock** — three uses: drafting a role configuration (`domain/roles.ts`), extracting
job requirements (`domain/jobs.ts`), and rubric-applied feedback (`domain/grading.ts`).
All three go through `Model.complete()`, which returns text, a model id, a cost and a
confidence. Confidence below the threshold routes the finding to a human reviewer.
AgentCore fits the multi-turn role-intake conversation, where the administrator is
questioned about tasks, tools and constraints.

**SES and End User Messaging Social** — `MessageSender.send()` takes a channel, a
recipient, a subject, a body and a correlation id. The correlation id is what lets an
inbound WhatsApp reply land back on the right application thread. Locally the
messages collect in an outbox that the Operations tab renders.

**Lambda** — every `domain/` service is already a pure function over the adapters, so
each route and each event rule maps to one handler.

## What switching the backend does today

`RELAUNCH_BACKEND=aws` makes `createStore()`, `createModel()` and `createSender()`
throw with the exact wiring note for that adapter. That is deliberate: a POC that
silently half-connects to AWS is worse than one that says where the work is.

## Cost and residency notes

- Region `ap-south-1` for data residency in India.
- Artifacts and evidence are per-person; consent records name the employer and the
  job terms version the sharing was granted for.
- The AI cost line in the pilot report is tracked per assessment (`aiCostUsd`) and is
  never netted off against the effort saved — it is reported beside it.
