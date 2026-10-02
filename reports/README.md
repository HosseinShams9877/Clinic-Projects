# Phase Reports

> One report per phase, written when the phase closes. A phase that is finished
> but has no report is **not** finished — the report is part of the definition of
> done (`../roadmap/phases.md`).

---

## Why these exist

A phase report answers questions that the code, the tests and the git history do
not:

- **What was *actually* done**, as opposed to what the phase plan said would be
  done. The gap between the two is the most useful thing in the report.
- **What was verified**, and how — so a later reader can tell the difference
  between "this was tested" and "this looked fine".
- **What was deferred, and why.** A deferral with a reason is a decision; a
  deferral without one is a gap someone will discover later.
- **What is unresolved.** Open questions are the report's most valuable content,
  because they are the only place a wrong assumption is visible before it is
  built on.
- **Where to start next.**

---

## Naming and location

```
reports/
  README.md              this file
  phase-00-report.md
  phase-01-report.md
  …
  phase-11-report.md
```

`phase-NN-report.md`, zero-padded, at the repository root under `reports/`.
Reports are never edited after the phase closes, except to correct a factual
error — and a correction is marked. A report that changes its conclusions later
destroys the record of what was believed at the time.

---

## Required sections

Every report contains these, in this order. A missing section is an incomplete
report.

### 1. Phase

The number and name, matching `../roadmap/phases.md` exactly.

### 2. What was produced

A narrative of what exists now that did not before. Written for someone who was
not involved. **Not** a file list — that is §5. This section explains the
substance: the decisions made, the things built, the shape of the result.

### 3. What was verified

**Every claim of verification needs its method.** Not "the permission matrix
works" but "the permission matrix suite ran: 96 tests, 96 passing, on PostgreSQL
with RLS enabled". A verification without a method is a belief.

If something was **not** verified, say so here. An honest "the responsive layout
was checked at three widths by hand, not by an automated suite" is worth more
than an unqualified claim.

### 4. What was deferred, and why

Each deferral with:

- **What** was deferred.
- **Why** — the reason, not a restatement.
- **Which phase** picks it up, or that it is out of scope entirely.
- **What it costs to defer** — the risk of not having it yet.

A deferral with no reason is rejected. So is one whose reason is "no time".

### 5. Files created and modified

- **A count**, and then the list.
- Grouped by directory.
- For modifications, one line on what changed.
- **The count is checked against `git show --stat`**, not estimated.

### 6. Open questions for the human

The section that justifies the report's existence.

Each question:

- **The question**, stated so it can be answered without reading the code.
- **What prompted it** — the ambiguity, the contradiction, the missing
  information.
- **What was assumed in the meantime**, and what the assumption affects.
- **Which phase** is blocked or affected if it stays unanswered.
- **An identifier** — `OQ-1`, `OQ-2` — so it can be referenced from other
  documents.

An unanswered question that was quietly resolved by guessing is the failure this
section exists to prevent. **If the specification is ambiguous, the question
belongs here — not in a guess.**

### 7. Recommended next action

One action, specific and actionable. Not "continue to the next phase" but "answer
OQ-2, then begin Phase 1 with the project skeleton and the token block".

---

## Rules

1. **Write it when the phase closes**, while the detail is fresh.
2. **Be honest about what did not go well.** A report that records only successes
   is a marketing document. The problems are what the next phase needs to know.
3. **Every open question is numbered and carried forward** until it is answered.
   A question that disappears from later reports was either answered — and the
   answer is recorded — or it was forgotten, which is worse.
4. **No placeholder sections.** If a section genuinely does not apply, say why in
   one line. An empty heading is a defect.
5. **The report is written for the project's owner**, who has the specification
   and the authority to answer the open questions — not for a general audience.
6. **Commit it** with the phase's closing commit, `docs(reports): phase NN report`.

---

## The reports

| Report | Phase | Status |
|---|---|---|
| [`phase-00-report.md`](phase-00-report.md) | Foundation and architecture | Complete |
| [`phase-01-report.md`](phase-01-report.md) | Platform foundation | **Written mid-phase — the phase is open**, and the report says so |
| `phase-02-report.md` | Appointments and scheduling | Not written |
| `phase-03-report.md` | Customers, services, staff | Not written |
| `phase-04-report.md` | Treatment cycles | Not written |
| `phase-05-report.md` | Payments and debts | Not written |
| `phase-06-report.md` | Messages and notifications | Not written |
| `phase-07-report.md` | Campaigns, audiences, assistant | Not written |
| `phase-08-report.md` | Public site | Not written |
| `phase-09-report.md` | Customer panel | Not written |
| `phase-10-report.md` | Reports, settings, tenancy, licensing | Not written |
| `phase-11-report.md` | Hardening and full verification | Not written |

Rows are added to the table as each report is written; until then the entry is a
statement that it does not exist, which is true.

---

*Related: `../roadmap/phases.md` (what each phase promised),
`../roadmap/progress.md` (what is actually built),
`../roadmap/decisions.md` (the decisions the reports refer to).*
