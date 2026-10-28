# Three-minute demonstration — shot list and narration

Target 2:55. Narration below is ~430 words, which is 150 words per minute with
room to breathe. Record in one take if you can; the app needs no cuts.

## Before you hit record

1. Open the deployed URL and let it wake — a cold Render instance takes about a
   minute. Reload until the Worker screen renders.
2. The instance seeds itself: the QA Engineer role is already published and the
   alert already delivered. Nothing to set up.
3. Browser at 1280×800 or wider, zoom 100%. Close other tabs.
4. Have this text ready to paste in one go for the work sample (shot 3):

   **Artifact** — paste the weak baseline:
   ```
   it('applies discount', () => { expect(total(2500)).toBe(2250) })
   it('no discount small order', () => { expect(total(500)).toBe(500) })
   it('random', () => { const v = Math.random() * 5000; expect(total(v)).toBeDefined() })
   ```
   **Summary**: `Three tests for the discount rule.`
   **Sources cited**: `REQ-CHK-09`
   **What you verified**: `Checked the AI output and it looked fine.`

---

## 0:00 — 0:18 · The problem

**On screen:** Worker tab, top of page. The journey strip is visible.

> Indian employers do not want to know whether someone attended an AI course.
> They want to know whether this person, doing this job, produces work that
> meets their standard. ReLaunch India answers that with evidence instead of
> certificates.

## 0:18 — 0:45 · A real message, over AWS CDS

**On screen:** Scroll to **Your messages**. Point at the three channel icons on
the envelope. Open the message body.

> An employer published a QA role. That triggered a search for relevant,
> opted-in people, and this alert went out over AWS End User Messaging Social
> and Amazon SES. It is not a notification badge — it names every must-have
> requirement, what evidence exists for each, and what to do next. Right now
> Anita has nothing demonstrated, so every requirement reads "need info" — which
> is missing information, not a mark against her.

## 0:45 — 1:20 · Baseline, and feedback tied to evidence

**On screen:** Paste the prepared artifact into **Work sample**, fill the three
fields, click **Submit for assessment**. Let the Feedback panel render. Scroll
through the failing checks, then one rubric finding.

> She submits a real work sample. Automated checks run first on what can be
> observed: three test cases where eight are required, no boundary or negative
> cases, a dependency on random data, and a cited requirement that does not
> exist. Then the approved rubric is applied — each finding points at the
> artifact and recommends one specific correction. Nothing here is a grade. It
> is a list of things to fix.

## 1:20 — 1:50 · Taught workflow, then an unseen task

**On screen:** Scroll to **Taught workflow** and its blue callout. Then switch
the task selector to **Refund window suite (unseen reassessment)** and submit
the strong artifact. Show the checks passing.

> She is taught the AI-assisted workflow, including the part she must verify
> herself — every boundary value against the requirement text, not the model's
> summary. Then she takes a different task she has not seen, at the same
> difficulty. That is the point: repeating a coached exercise proves nothing.

## 1:50 — 2:15 · Human review makes it evidence

**On screen:** Review queue tab → **Review** → **Approve conclusions**. Back to
Worker → **Evidence on file** now shows green.

> A domain expert approves the conclusions. Only now do these competencies
> become demonstrated evidence, carrying the reviewer's name. Her self-reported
> claims stay amber, visibly separate — a claim and a proof never look alike in
> this product.

## 2:15 — 2:40 · Consent, and the employer's view

**On screen:** Worker → **Apply**. Switch to Employer tab → **Open** on the
application.

> Applying is consent: she authorises sharing this evidence with this employer,
> for this job, at this version of its terms. The employer gets a
> requirement-by-requirement report. Must-have, good-to-have and work evidence
> stay separate. There is deliberately no single match percentage, because that
> number would hide every distinction we just made.

## 2:40 — 2:55 · Two-way, and the boundary

**On screen:** Click **Offer an interview**. Show the thread updating.

> The employer replies in the same record, and that reply goes back over
> WhatsApp. Matching orders a queue — it never rejects anyone. The hiring
> decision stays where it belongs.

---

## If you have 15 seconds spare

Open **Operations** and point at the held and suppressed list: one message
withheld for quiet hours, another suppressed as a duplicate, each with its
reason recorded. It is the most convincing single screen in the product, because
it shows the restraint rather than claiming it.

## Recording notes

- QuickTime: File → New Screen Recording, select the browser window only.
- Speak over it live; re-recording narration separately costs more time than it
  saves.
- Upload to YouTube **unlisted or public** — Devpost requires a publicly
  viewable video. A private video fails review.
- Say nothing the product does not do. The guardrails are the differentiator;
  overclaiming undermines them.
