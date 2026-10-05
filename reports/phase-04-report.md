# Phase 04 Report — Treatment Cycles

**Status: closed.**

Phase 4 is complete. The build is green (routes added: `reception/cycles`,
`admin/cycles`, `doctor/cycles`), `npm run verify` passes at **1121 tests across
50 files**, and the work is committed. What follows is what shipped, what was
fixed, and what remains open.

---

## 1. Phase

**Phase 4 — Treatment cycles.**

Goal, from `../roadmap/phases.md`: deliver the treatment-cycle engine — the
mechanism that separates this product from a calendar. A cycle is created on the
transition to `COMPLETED` and never earlier; its interval is read from the cycle
and not the service; its due date drives the desk's contact list.

---

## 2. What was produced

### 2.1 The `cycles` module

`src/modules/cycles/`, following the `appointments` pattern — `index.ts`,
`lib/`, `types/`, `catalog.ts`, `tests/`.

- **`lib/creation.ts`** — `recordCompletedSession`, the module's core. A cycle
  is created on the first completed session and advanced on every one after;
  three anchors resolve a completion to its cycle, in order: the appointment's
  own `cycleId`, the tenant's open cycle for the same `(customer, service,
  doctor)`, then a new row. The counts are **derived from the appointment rows**
  and never incremented, which is what makes a retried completion a no-op by
  construction.
- **`lib/next-due.ts`** — `nextDueInstant`: `lastSessionAt + intervalDays`,
  computed through the localization layer's day arithmetic so a due date never
  walks back a month at a boundary.
- **`lib/status.ts`** — the cycle status set and its transition guard, mirroring
  the appointments state machine's shape.
- **`lib/contact-list.ts`** — the list's entry and exit rules: a cycle enters
  when its due date has passed **and** no future appointment exists, and exits on
  a booking, an abandonment, or a completion.
- **`lib/queries.ts`** — the reads the three pages render.
- **`lib/settings.ts`** — `readUtcOffsetMinutes`, shared with the appointments
  module's booking path.
- **`lib/job.ts`** — the worker's `cycles.next-due` handler, registered in the
  worker's job registry beside `appointment.lifecycle`.

### 2.2 The three pages

- `src/app/reception/cycles/` — the desk's contact list, with the three row
  actions (record contact result, book, abandon).
- `src/app/admin/cycles/` — the manager's read-only oversight with the two
  writes that close a course (complete, abandon with reason).
- `src/app/doctor/cycles/` — the doctor's own courses, scoped by `doctorId` in
  the query rather than by a guard after it.

All three render through a shared `src/app/_cycles/cycles-table.tsx`, with the
Jalali week strip, RTL, Persian digits, and the catalog for every Persian string.

### 2.3 The worker job

`cycles.next-due` — the hourly sweep that moves a cycle into the contact list
when its due date has passed with no future appointment. Registered in
`src/worker/registry.ts` beside the appointments lifecycle job. The registry now
holds **two** kinds; the registry test was updated to assert both.

### 2.4 The schema

`TenantSettings.cycleSettings` — a JSON-in-String column owning the two cycle
settings `04-roles-permissions.md` §5 keeps with the cycle engine (no-show
accumulation, and reschedule shifting subsequent due dates). NULL is both
settings at their documented ON default.

---

## 3. Tests

**Five new tests — exactly the five the phase's rules named, and no more.**

| # | Scenario | File | DoD |
|---|---|---|---|
| 1 | A cycle is created once on `COMPLETED`, never on booking or arrival; a retried completion is one session | `tests/creation.test.ts` | 1 |
| 2 | `nextDueDate` = `lastSessionAt + intervalDays` across a Mehr→Aban boundary | `tests/creation.test.ts` | 2 |
| 3 | Changing a service's default interval does not move an existing cycle | `tests/creation.test.ts` | 3 |
| 4 | The contact list's entry and exit rules | `tests/contact-list.test.ts` | 4, 6 |
| 5 | The list's exit on a booking — the point the whole list depends on | `tests/contact-list.test.ts` | 4 |

**Suite total: 1121 tests across 50 files.** Everything green.

---

## 4. What was fixed during verification

Four issues surfaced between the WIP commit and the passing gate. All four are
recorded here because each one is the kind that reads as "obvious" after the
fact and is invisible before it:

- **`lifecycle.test.ts` had a syntax error at line 168** — a duplicate `})` at
  the end of the file, from an earlier session. Removed. The state machine's
  tests then ran and exposed the next item.
- **`BOOKED → ARRIVED` was skipped in `creation.test.ts`.** The state machine
  (correctly) refuses that transition; the test had to walk `BOOKED →
  AWAITING_ARRIVAL → ARRIVED` the way a real day does. This was a **test bug**,
  not a module bug — and the state machine refusing it is the module doing its
  job.
- **The completion was not written before `recordCompletedSession` ran.** The
  module counts the appointment rows whose `status = COMPLETED`, so the test had
  to set the status (and `resultRecordedAt`) first — the same handoff
  `recordResultAction` makes in production.
- **The third test needed a second customer.** The module's second anchor
  attaches a completion to the tenant's open cycle for the same `(customer,
  service, doctor)` — which is correct behaviour, and not what that case is
  about. A distinct customer starts a distinct course and the new interval is
  read.
- **`registry.test.ts` was updated** to assert both job kinds
  (`appointment.lifecycle`, `cycles.next-due`), and the second handler's
  presence.

---

## 5. The `schema.prisma` length

The schema grew past its 1000-line ceiling during this phase — the
`cycleSettings` column plus its comment took it to **1006 lines**. The rule in
`02-architecture.md` §10 is a gate, and it failed the verify until the file came
back under it. Six lines of comment were trimmed; the file is now within the
limit and the gate is green.

`ADR-0007` forbids a second schema file, so the fix is comment discipline rather
than splitting — which is the correct shape: the file is one file, and the
comments are what yield when the length gate bites.

---

## 6. Coverage

**The coverage floors remain red**, exactly as Phase 3 left them, and for the
same reason: the phase's instruction was five test scenarios and "do not chase a
number". The four largest holes are named below so a later session can decide
which earns a suite.

- `src/modules/cycles/lib/creation.ts` — the largest single file in the module,
  covered only by the three creation tests above.
- `src/modules/cycles/lib/contact-list.ts` — covered by the two list tests.
- `src/modules/cycles/lib/queries.ts` — the read paths, not unit-tested.
- `src/modules/cycles/lib/job.ts` — the sweep handler, covered by the worker's
  own tests but not by a cycles-module suite.

This is the same posture Phase 3 recorded, and Phase 11 is where it is revisited.

---

## 7. DoD 9 — unobserved, not failing

The accessibility and responsive gates over the three cycle pages were not run.
Playwright's pinned Chromium cannot be downloaded on this machine — the same
blocker Phase 1 recorded, and the same one that has now prevented the gate for
four phases running.

The pages are written to the design system's breakpoints and its tokens, so the
**expectation** is that they pass; but the report claims nothing more than that,
and the gate is marked **unobserved** rather than passing. It is recorded in
`reports/phase-02-report.md` §7 and `reports/phase-03-report.md` §3 as well, and
Phase 11 is where all thirty-five pages are verified together.

---

## 8. What was deferred

- **The `reception/cycles` page's inline booking popup** — the row action opens
  the appointments booking path rather than a cycles-owned popup. The
  appointments popup is the one the product uses everywhere; a second one built
  in the cycles module would be a second place the same three steps live. The
  delegation is deliberate, and the phase report names it so a later session
  does not read it as an omission.
- **The campaign audience group** — the «دوره تکمیل شده» group is a saved query
  that Phase 7 owns (`03-data-model.md` §2.7, Decision 3). The cycle reaching
  `COMPLETED` is what makes the predicate true; the predicate itself is Phase 7's
  to write. The module produces the state the predicate reads.

---

## 9. Verification summary

| Gate | Result |
|---|---|
| `npm run build` | ✅ green |
| `npm run typecheck` | ✅ green |
| `npm run lint` | ✅ green |
| `check:files` | ✅ 271 files, none over 1000 |
| `check:i18n` | ✅ clean |
| `check:overrides` | ✅ clean |
| `check:schema` | ✅ valid for sqlite and postgresql |
| `check:rls` | ✅ 24 tenant-scoped tables isolated |
| `npm run test` | ✅ **1121 tests, 50 files, all passing** |
| DoD 9 (axe + responsive) | ⚠️ unobserved — Playwright Chromium unavailable |

---

## 10. What is open

- **The cross-tenant suite against a live PostgreSQL** — Phase 1's `check:rls`
  covers the policies statically; the behavioural half remains unobserved, as it
  has since Phase 1.
- **The e2e suite** — written, not executed, for the same Chromium reason.
- **The coverage floors** — red, documented above, to be revisited in Phase 11.
- **The four unbuilt headless wrappers** — `dialog`, `dropdown-menu`, `tabs`,
  `tooltip`. `popover` and `combobox` are the two that exist. A component that
  needs one of the four builds it rather than importing the primitive, as
  `eslint.config.mjs`'s `HEADLESS_WRAPPER_DIRECTORIES` states.

---

*Phase 4 is closed. Phase 5 (payments and debts) is next and has not started.*