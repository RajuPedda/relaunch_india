# Employer pilot

What the plan proposes, and what this POC already produces for it.

## Shape

- 2 to 4 weeks, 10 to 20 consenting participants, one approved workflow per function.
- Quality thresholds and a minimum worthwhile improvement agreed **before** the start.
- Matched tasks, and a comparison group where feasible.
- Expand only where quality holds and the observed gain justifies the cost.

## What the system records for you

| Agreement to make upfront | Field that measures it |
| --- | --- |
| Quality threshold for accepted work | `Assessment.firstPassAccepted` (rubric ≥ 3/4 and every automated check passing) |
| Minimum worthwhile improvement | `practice.meanDelta`, on a 0-4 rubric, baseline versus unseen comparable reassessment |
| Total effort budget | `effort.aiAssisted.totalMinutes` = worker + review + rework, with `aiCostUsd` beside it |
| Review burden | `quality.reviewerJudgment`, including amendments and disputes |
| Consistency | `spread.deltaStandardDeviation` across participants |

## Commercial questions this does not answer

Alert relevance, delivery success, application-to-review time, confirmed interviews,
paid agreements and actual first payment are tracked separately in the plan. This POC
produces the first four (`mobility` in the pilot report); the last two are commercial
events outside the system. Progress toward income in 2 to 4 weeks depends on demand
and selection, and is not guaranteed.

## Ownership

Five pairs, as the plan sets out: domain validation and opportunities; agent and role
configuration; assessment and state; messaging and interfaces; integration, evaluation
and submission. Name an integration lead and the domain reviewers before the pilot
starts — the reviewer is on the critical path for every validated assessment.
