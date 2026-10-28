# Three-minute demonstration

`npm run demo` runs all of this in the terminal. The UI version follows the same path.

| Time | What you show | Evidence on screen |
| --- | --- | --- |
| 0:00 | **Job publication and relevant alert.** Employer tab: paste a description, requirements are extracted, employer confirms each one, publish. | The candidate's WhatsApp alert explains which requirements are matched, which are unknown, and the next step. Another candidate on a daily digest is held, visibly, rather than messaged. |
| 0:35 | **Baseline work sample.** Employee tab: submit the weak test suite. | Automated checks fail on test count, boundary/negative cases, acceptance conditions, `Math.random`, and a cited requirement id that does not exist. Four rubric findings, each tied to a quote or a check. |
| 1:10 | **Gap and coached correction.** | The taught workflow with its "you must verify this yourself" list, and one specific correction per gap. Submit the practice task and watch the checks pass. |
| 1:45 | **Reassessment and human review.** Submit the *unseen* refund-window task. Reviewer tab: approve. | Evidence moves from `not_met` to `demonstrated`, with the reviewer's name and 12 minutes of review time recorded. |
| 2:15 | **Application with consent.** Employee tab: apply. | Employer receives a requirement-by-requirement report: must-have, good-to-have and work evidence kept separate, with preference fit and flags. No single match percentage anywhere. |
| 2:35 | **Two-way follow-through.** Employer asks for clarification, candidate answers, employer offers an interview. | One application record, confirmed next action after each step. |
| 2:50 | **Terms change.** Employer lowers the compensation band. | The application is superseded and cannot progress until the candidate confirms the revised terms. |
| 3:00 | **Another role being configured.** Admin tab: the manufacturing role. | Approval is refused until an expert calibration example exists; the authorization boundaries ("never connected to live machinery") are on screen. |

Close on the **Pilot measures** tab: first-pass acceptance, total effort including
review and rework, baseline-to-reassessment change on an unseen comparable task, and
the caveats that go with a small pilot.

## Disclosure for the submission

- All data is synthetic. No employer material and no personal data.
- The offline model is a deterministic stand-in, not a language model; it exercises the
  same rubric, calibration and human-review path.
- Pre-existing work: none. The repository is written for this hackathon.
