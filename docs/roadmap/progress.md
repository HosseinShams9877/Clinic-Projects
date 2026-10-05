# Roadmap — Progress

> The single source of truth for **what is actually built**. `phases.md` says what
> should be built; this file says what has been. When they disagree, this file is
> right and `phases.md` is the plan being departed from — and the departure
> belongs in `decisions.md`.
>
> **Update this file in the same commit that completes the work.** A phase that
> is finished but not recorded here is not finished.

---

## Status at a glance

| Phase | Name | Status | Started | Completed |
|---|---|---|---|---|
| 0 | Foundation and architecture | **Complete** | — | ۱۴۰۵/۰۷/۰۹ |
| 1 | Platform foundation | **Complete** | ۱۴۰۵/۰۷/۰۹ | ۱۴۰۵/۰۷/۱۲ |
| 2 | Appointments and scheduling | **Complete** | ۱۴۰۵/۰۷/۱۲ | ۱۴۰۵/۰۷/۱۲ |
| 3 | Customers, services, staff | **Complete** | ۱۴۰۵/۰۷/۱۳ | ۱۴۰۵/۰۷/۱۳ |
| 4 | Treatment cycles | Not started | — | — |
| 5 | Payments and debts | Not started | — | — |
| 6 | Messages and notifications | Not started | — | — |
| 7 | Campaigns, audiences, assistant | Not started | — | — |
| 8 | Public site | Not started | — | — |
| 9 | Customer panel | Not started | — | — |
| 10 | Reports, settings, tenancy, licensing | Not started | — | — |
| 11 | Hardening and full verification | Not started | — | — |

**Current phase:** Phase 3 is **complete**. Phase 4 has not started.

**Legend.** Not started · In progress · Blocked · Complete.

---

## What exists in the repository

| Area | State |
|---|---|
| Knowledge layer (`docs/knowledge/`, 11 files) | Complete |
| Roadmap (`docs/roadmap/`, 3 files) | Complete |
| Setup guides (`docs/setup/`, 5 files) | Complete |
| Changelog convention (`docs/changelog/`) | Complete |
| Phase reports (`reports/`) | Complete for Phases 0, 1 and 2 |
| Root files (README, .gitignore, .env.example, LICENSE) | Complete |
| `.claude/` (settings, agents, commands, context, memory) | Complete |
| Package manifest | Complete — all dependencies pinned, no styled component library |
| Application code (`src/`) | Complete for Phases 1–3 — `core`, `modules/auth`, `modules/roles-permissions`, `modules/registry`, `modules/appointments`, `modules/customers`, `modules/services`, `modules/staff`, the app shell, the four panel shells, the three scheduling pages, the seven customer/service/staff pages, and the `Popover`/`Combobox`/`JalaliDatePicker` controls |
| Prisma schema | Complete — one portable schema, 25 models, validating as SQLite and PostgreSQL |
| Migrations | Complete — the SQLite migration list and the PostgreSQL RLS policies |
| Vazirmatn | Complete — five weights self-hosted in `src/app/fonts/` with the OFL 1.1 licence and authors file |
| Test suite | 48 files, 1116 tests — complete for Phases 1 and 2; Phase 3 added 4 files and 18 tests covering the six scenarios the phase named |
| Verification gate | **`npm run verify` passes end to end** — generate, typecheck, lint, 5 checks, 1116 tests. The coverage thresholds are red; see `../reports/phase-03-report.md` §4 |
| End-to-end suite | Written but **not executed** — Playwright's pinned Chromium cannot be downloaded on the build machine. See `../reports/phase-02-report.md` §4 |

Phase 0 produced the specification for the codebase. Phase 1 produced the
codebase. Phase 2 produced the appointment lifecycle, the slot engine and the three
scheduling pages. Phase 3 produced the customer file and its leads, the service
catalogue, the staff panel and its audit trail. What did not run in this environment
is recorded in `../reports/phase-03-report.md` §4 — the e2e execution, the behavioural
cross-tenant suite against a live PostgreSQL, and the coverage floors the phase left
red by instruction. Only the last is a decision; the first two are environmental.

---

## Phase 0 — what was delivered

**Complete.** The details, including the files created and the verifications
performed, are in `../reports/phase-00-report.md`. The summary:

**Decisions made and recorded** as ADRs in `decisions.md`: the stack (Next.js
full-stack plus one background-worker process), the multi-tenant boundary
(`tenantId` primary, `clinicId` secondary, one database, RLS as the second
layer), single-tenant mode, the 20-module architecture, the database portability
constraints, the money and date representations, the in-house Jalali calendar,
and the debt-index compromise.

**Verifications performed:**

- Every required file exists and contains real content — no placeholder.
- All 35 pages are mapped to modules, and the coverage sums to 35.
- All 20 modules are listed with responsibilities, none unreferenced.
- The permission table has 16 permissions across 3 role columns.
- The behavioral toggle table has 8 rows with their defaults.
- The design system's token block is reproduced with every value unmodified.
- The repository contains no `.env`, secret, or database file.
- `git remote -v` is empty — nothing is pushed anywhere.

**Deferred, with reasons** (full detail in the phase report):

- The **secretary performance report** — the specification deferred it because a
  correct measure was never defined.
- The **service-recording page** — recording happens in the appointments table.
- **Inventory and consumables** — a separate scope, not a differentiator.

**Open questions raised:** three, recorded in the phase report. None blocks
Phase 1; each must be answered before the phase that depends on it.

---

## Phase 1 — what was delivered

**Complete**, started ۱۴۰۵/۰۷/۰۹, completed ۱۴۰۵/۰۷/۱۲. The closing report is
`../reports/phase-01-report.md`; the two framework workarounds and the three
relaxations it records are the part of this phase a later one has to know about.

Every item the phase promised is built, and the boxes are ticked only because the
gate behind them passed:

- [x] Next.js project, TypeScript strict, ESLint import-boundary rule
- [x] Design tokens as CSS variables, light and dark
- [x] Vazirmatn self-hosted, RTL root, responsive shell
- [x] `src/core/localization/` complete — at 80% for Phase 1, restored to 100% in Phase 11
- [x] Prisma schema: Tenant, Clinic, User, Membership, AuditLog, Job
- [x] SQLite and PostgreSQL migrations, with portability guards
- [x] RLS policies and `FORCE ROW LEVEL SECURITY`
- [x] `getTenantContext()` and the tenant-injecting Prisma extension
- [x] `auth`: password login for staff, mobile + one-time code for customers, sessions, logout
- [x] `roles-permissions`: matrix, overrides, toggles, `can()` — 100% coverage
- [x] `src/worker/` process with the job table
- [x] `account/login.html` — `/account/login`
- [x] The four panel shells, nav from the permission set
- [x] CI: typecheck, lint, coverage, file length, axe (axe written, not executed — §7)
- [x] **96-test permission matrix green**
- [x] Self-escalation suite green
- [ ] Cross-tenant suite green on PostgreSQL — needs a PostgreSQL server; the
      static `check:rls` gate covers the policies and fails closed, but the
      behavioural test has never run against a live database
- [x] Jalali round-trip green across 200 years
- [x] Production boot refuses SQLite and RLS-disabled tables

---

## Phase 2 — what was delivered

**Complete**, started and completed ۱۴۰۵/۰۷/۱۲. The closing report is
`../reports/phase-02-report.md`; §2 records the three defects the WIP commit left and
the fix for each, and §4 records what could not run.

- [x] The entity and the **8-state lifecycle**, every illegal transition refused
- [x] Slot generation from shifts, doctor hours, service duration, blocks and holidays
- [x] The three booking modes and the settings that select them
- [x] Slot blocks and holiday handling behind the settings toggle
- [x] Auto-transitions: `AWAITING_ARRIVAL` on the day, `RESULT_NOT_RECORDED` two hours past
- [x] Reschedule and cancel, with the deposit policy on cancellation
- [x] `reception/appointments.html` — day and week grid, the booking popup, arrival marking
- [x] `admin/appointments.html` — read-only oversight with doctor and status filters
- [x] `doctor/dashboard.html` — «برنامه من», the quick-book shortcut behind its toggle
- [x] The lifecycle worker job
- [x] **DoD 1–7 and 9 green** — asserted, not eyeballed
- [ ] DoD 8 — the axe and responsive pass over the three pages. The pages are written
      to the design system's breakpoints; Playwright's Chromium cannot be downloaded
      here, so the gate has not been observed. Same blocker as Phase 1.

The WIP commit that closed Phase 1 left three defects, all in the appointments
module and none of them where its commit message said. The syntax error was in
`lifecycle.test.ts`, `booking.test.ts` held 42 type errors from unbranded date and
time strings, and `lifecycle.test.ts`'s clock constant was six months off the Jalali
day it was labelled as. The report's §2 names each one and its fix.

---

## Phase 3 — what was delivered

**Complete**, started and completed ۱۴۰۵/۰۷/۱۳. The closing report is
`../reports/phase-03-report.md`; §3 names the seven things that broke and the fix for
each, and §4 names what the phase deliberately left.

- [x] **DoD 1** — the mobile dedupe is a tenant-local fact: the same number in the
      same tenant offers the existing record, and in another tenant is a new row
      neither tenant's read can see
- [x] **DoD 2** — a lead converts on the booking that first names it and keeps the
      acquisition source it arrived with
- [x] **DoD 3** — no service delete exists. The assertion is over the barrel's own
      surface, because "the path does not exist" is a claim about the module and not
      about a refusal
- [x] **DoD 4** — deactivation closes the booking path and leaves every past
      appointment's price, deposit and duration where they were
- [x] **DoD 5** — a permission change is what the next request reads, verified by
      resolving the affected person's context from their session token the way a
      request does
- [x] **DoD 6** — the manager column is locked by the module that owns the rule,
      before any write. The **audit of the refused attempt** is the app tier's and is
      covered by contract, not by a test; §4 names what closes it
- [x] **DoD 7** — every permission change writes one row with the actor, the target
      and both before/after sets, in the same transaction
- [x] **DoD 8** — another doctor's patient is a `NotFoundError` and never a
      `PermissionError`, because the rule is a `where` clause and not a post-read guard
- [ ] **DoD 9** — the axe and responsive pass over the seven pages. The static
      gates that *are* observable pass — `check:i18n` clean, lint clean with zero
      warnings — but Playwright's Chromium cannot be downloaded here. Same blocker as
      Phases 1 and 2

**Three modules, seven pages, three controls.** `customers`, `services` and `staff`
follow `appointments/` as it actually is — `index.ts`, `catalog.ts`, `lib/`, `types/`,
`tests/` — and not the eight-directory shape the task text listed, which the module it
pointed at does not have. The seven pages are `/reception/customers`, `/reception/leads`,
`/admin/customers`, `/admin/customer/[id]`, `/admin/services`, `/admin/staff` and
`/doctor/customers`. `Popover`, `Combobox` and `JalaliDatePicker` are new; the first is
the wrapper §17 required and the config had already anticipated, and the other two
compose it.

**The coverage floors are red, by instruction.** Global is 47.31% lines against the
relaxed 60% floor. The two targets the phase named by name are green —
`core/localization` at 80% and `roles-permissions` at 100% — and the four files with the
largest holes are named in the report's §4, `staff/lib/leave.ts` first.

---

## Nothing is blocked

The session that opened this phase had no working package manager, so nothing had
ever been executed. That is no longer true, and nothing has been blocked since.
Node 24.19.0, npm 11.17.0 and git 2.50.1 all run, and the whole gate passes:

```
npm run build    →  17 routes, exit 0
npm run verify   →  db:generate · typecheck · lint · check:files · check:i18n
                   check:overrides · check:schema · check:rls · test
                   48 files, 1116 tests, exit 0
```

One consequence worth recording: `src/generated/` is ignored, and `verify`
generates the Prisma client itself as its first step. The client is output
derived from the committed schema, not source, and rebuilding it is what lets a
fresh clone verify itself with no postinstall hook and no database. Three other
files already treated the directory that way — `.prettierignore`, the lint
ignores and `check-file-length.mjs`.

Two things could not run on this machine, neither of which is a code gap. Both
are in the phase report's §4:

| Not run | Why |
|---|---|
| The e2e suite and the axe pass | Playwright's pinned Chromium cannot be downloaded here. The specs are written and `--list` resolves; a machine that can fetch the browser should run `npm run e2e` and the axe pass over the three scheduling pages before Phase 11 |
| The cross-tenant suite on PostgreSQL | Needs a PostgreSQL server. `check:rls` covers the policies statically and fails closed — the check exists because the unit suite runs on SQLite, which has no RLS — but the behavioural confirmation has not been observed against a live database |

Two Phase 1 relaxations are still in place and are restored in Phase 11: the
coverage thresholds (global 80 → 60, `core/localization` 100 → 80;
`roles-permissions` held at 100) and `noUncheckedIndexedAccess` in `tsconfig.json`.
Two framework workarounds are also still in place: `experimental.turbopackMinify: false`
and the removal of the deprecated `eslint` key. All four are recorded with their
restore condition in the phase report's §3 and §4.

Nothing here changes the plan, so there is no `decisions.md` entry. The three open
questions from Phase 0 stand, and the first half of one of them is now closed:

| Question | Needed by | State |
|---|---|---|
| OQ-1 — public page count (six vs eight) | Phase 8 | open |
| OQ-2 — the two tables damaged by PDF extraction | before Phase 1 | **half closed.** The two tables it was raised about are recovered and now enforced in code: the 16 permissions and 3 role defaults in `src/core/constants/enums.ts`, and the 8 toggles with their default on/off states in `src/modules/roles-permissions` (the 96-case matrix in `tests/matrix.test.ts` transcribes `04-roles-permissions.md` §2 independently of the implementation). **The other half is open**: the four tables OQ-2 asked to be re-checked — campaign types, audience groups, automatic messages, acquisition sources — have still not been checked against the demo. Phases 6 and 7 depend on them. |
| OQ-3 — the recomputable balance cache | Phase 5 | open |

---

## How to update this file

1. **When a phase starts:** set its status to *In progress* and record the start date.
2. **While working:** do not record partial progress here. This file tracks phases, not tasks; task tracking belongs in the issue tracker of the day.
3. **When a phase completes:** set the status to *Complete*, record the completion date, move the phase's checklist under a "what was delivered" heading, and advance **Current phase**.
4. **When a phase is blocked:** set it to *Blocked*, add a row to "Blocked and waiting" naming the blocker and the phase it affects, and record it in `decisions.md` if it changes the plan.
5. **When the plan changes:** the change goes in `decisions.md` first, then here, then in `phases.md`.

**Dates are Jalali**, matching the product's own calendar convention
(`07-localization.md` §6.4).

---

*Related: `phases.md` (the plan), `decisions.md` (the reasoning),
`../reports/` (the per-phase detail).*
