---
description: Show the current phase, its definition of done, and what remains
allowed-tools: Read, Glob, Grep, Bash(git log:*), Bash(git status:*)
---

Report the project's current state, concisely. Do not summarise the whole
roadmap — report where we are and what is next.

## 1. The phase

Read `docs/roadmap/progress.md` and report:

- **Current phase**, by number and name.
- **Status** — not started, in progress, blocked, or complete.
- **Which phases are complete**, and their completion dates.

## 2. The definition of done

Read the current phase's DoD from `docs/roadmap/phases.md` and **restate it
verbatim** — not a summary. These are the gates; paraphrasing them loses the
precision that makes them gates.

For a partially complete phase, mark each DoD item:

- **met** — and the evidence (which test, which check, which file)
- **not met**
- **unknown** — and say what would settle it

If you cannot verify an item from the repository, say so. **Do not mark an item
met because it looks likely.**

## 3. What is built

```
git log --oneline -15
git status --short
```

Report the recent commits and any uncommitted work.

## 4. What remains

- The DoD items not yet met, in the order they must be done.
- Any blocker recorded in `docs/roadmap/progress.md` under "Blocked and waiting".
- **Any open question from `reports/` that affects this phase.** Check the
  reports' OQ list against the current phase's number — an unanswered question
  that blocks the current phase takes priority over everything else.

## 5. The next action

**One action**, specific and actionable. Not "continue with the phase" but the
next concrete step, named.

---

If the current phase's DoD is fully met and evidenced:

1. Say so plainly.
2. Remind that `docs/roadmap/progress.md` must be updated **in the same commit**
   that completes the work.
3. Remind that the phase is not closed until `reports/phase-NN-report.md` exists,
   with the sections required by `reports/README.md`.
4. Name the next phase.

**Keep the whole report under 60 lines.** It is a status check, not a document.
