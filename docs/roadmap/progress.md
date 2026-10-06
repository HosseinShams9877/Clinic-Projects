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
| 4 | Treatment cycles | **Complete** | ۱۴۰۵/۰۷/۱۳ | ۱۴۰۵/۰۷/۱۳ |
| 5 | Payments and debts | **Complete** | ۱۴۰۵/۰۷/۱۳ | ۱۴۰۵/۰۷/۱۳ |
| 6 | Messages and notifications | **Complete** | ۱۴۰۵/۰۷/۱۴ | ۱۴۰۵/۰۷/۱۴ |
| 7 | Campaigns, audiences, assistant | **Complete** | ۱۴۰۵/۰۷/۱۴ | ۱۴۰۵/۰۷/۱۴ |
| 8 | Public site | **Complete** | ۱۴۰۵/۰۷/۱۵ | ۱۴۰۵/۰۷/۱۵ |
| 9 | Customer panel | Not started | — | — |
| 10 | Reports, settings, tenancy, licensing | Not started | — | — |
| 11 | Hardening and full verification | Not started | — | — |

**Current phase:** Phase 8 is **complete**. Phase 9 has not started.

**Legend.** Not started · In progress · Blocked · Complete.

---

## What exists in the repository

| Area | State |
|---|---|
| Knowledge layer (`docs/knowledge/`, 11 files) | Complete |
| Roadmap (`docs/roadmap/`, 3 files) | Complete |
| Setup guides (`docs/setup/`, 5 files) | Complete |
| Changelog convention (`docs/changelog/`) | Complete |
| Phase reports (`reports/`) | Complete for Phases 0–8 |
| Root files (README, .gitignore, .env.example, LICENSE) | Complete |
| `.claude/` (settings, agents, commands, context, memory) | Complete |
| Package manifest | Complete — all dependencies pinned, no styled component library |
| Application code (`src/`) | Complete for Phases 1–8 — `core`, `modules/auth`, `modules/roles-permissions`, `modules/registry`, `modules/appointments`, `modules/customers`, `modules/services`, `modules/staff`, `modules/cycles`, `modules/payments`, `modules/debts`, `modules/notifications`, `modules/messages`, `modules/audience-groups`, `modules/campaigns`, `modules/campaign-assistant`, `modules/public-site`, the app shell, the four panel shells, the three scheduling pages, the seven customer/service/staff pages, the three cycles pages, the four payments/debts pages, the reception desk, the `admin/campaigns` page, the `Popover`/`Combobox`/`JalaliDatePicker` controls, and the eight public pages with their header, footer, booking wizard and consultation form |
| Prisma schema | Complete — one portable schema, 29 models, 1000 lines (ADR-0007’s ceiling, not past it), validating as SQLite and PostgreSQL |
| Migrations | Complete — the SQLite migration list and the PostgreSQL RLS policies |
| Vazirmatn | Complete — five weights self-hosted in `src/app/fonts/` with the OFL 1.1 licence and authors file |
| Test suite | 60 files, 1141 tests — complete for Phases 1–5; Phase 6 added the exactly-three tests its instruction fixed (the seven triggers, the consent suppression, the 90-day window and the priority order), Phase 7 added its own three (the eight audience groups, the approval gate, the assistant's closed sets), and Phase 8 added the three its DoD names (the holiday gate, the deposit gate, the consent-filtered gallery) |
| Verification gate | **`npm run verify` passes end to end** — generate, typecheck, lint, 5 checks, 1138 tests. The coverage thresholds are red; see `../reports/phase-07-report.md` §6 |
| End-to-end suite | Written but **not executed** — Playwright's pinned Chromium cannot be downloaded on the build machine. See `../reports/phase-02-report.md` §4 |

Phase 0 produced the specification for the codebase. Phase 1 produced the
codebase. Phase 2 produced the appointment lifecycle, the slot engine and the three
scheduling pages. Phase 3 produced the customer file and its leads, the service
catalogue, the staff panel and its audit trail. Phase 4 produced the treatment-cycle
engine and its contact list. Phase 5 produced the ledger — the only writers of a
financial fact, the computed balance, the debt buckets and the nightly
reconciliation that fails on drift. Phase 6 produced the messaging half of the
product — the seven triggers, the delivery ledger, consent as a hard filter, the
90-day window and the one-per-day priority order, and the desk's own morning.
Phase 7 produced the campaign half — the eight built-in audience groups and their
nightly refresh, the campaign and its two-column approval gate, and the assistant
that reads a Persian brief into a proposal without ever touching a clinical fact.
What did not run in this environment is recorded in `../reports/phase-07-report.md` §7 — the e2e execution, the behavioural
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

## Phase 4 — what was delivered

**Complete**, started and completed ۱۴۰۵/۰۷/۱۳. The closing report is
`../reports/phase-04-report.md`.

- [x] A cycle is created on the first `COMPLETED` and advanced on every one after,
      with the counts derived from the appointment rows and never incremented
- [x] The interval is read from the cycle and not the service, so a course the desk
      shortened stays shortened
- [x] The next-due date is computed through the localization layer's day arithmetic,
      so a boundary never walks back a month
- [x] The contact list's entry and exit rules — a cycle enters when its due date has
      passed and no future appointment exists, and exits on a booking, an
      abandonment, or a completion
- [x] The `cycles.next-due` worker job, registered beside `appointment.lifecycle`
- [x] `reception/cycles`, `admin/cycles` and `doctor/cycles`, sharing one table
- [ ] The axe and responsive pass over the three pages — same Chromium blocker as
      every phase before it

**Three pages, one shared table, three row actions.** The doctor's read is scoped by
`doctorId` in the query, so another doctor's courses are absent from the read and not
refused after it — the same rule Phase 3 established for the customer file.

---

## Phase 5 — what was delivered

**Complete**, started and completed ۱۴۰۵/۰۷/۱۳. The closing report is
`../reports/phase-05-report.md`; §4 records the one build failure whose fix a later
phase has to know about — the `payments` barrel reaching the browser bundle through
`@/app/catalog`.

- [x] **DoD 1** — `balance = Σ charges − Σ payments − Σ discounts`, asserted across a
      deposit, a partial payment, a discount and a refund, through the module's own
      writers and its own read
- [x] **DoD 2** — no `balance` column exists anywhere in `prisma/schema.prisma`;
      asserted by parsing the file, with the two models the balance is computed from
      named so the parser cannot pass vacuously
- [x] **DoD 3** — `payments.reconcile` re-derives every customer's three sums and
      **throws** when any drifted, because a reconciliation that quietly repaired
      itself would hide the second writer it exists to detect
- [x] **DoD 4** — no deletion in either barrel's runtime exports, enumerated by name
- [x] **DoD 5** — the discount toggle off refuses any discount at all, and the
      secretary's cap bounds the amount, where a NULL cap is no discount rather than
      no ceiling
- [x] **DoD 6** — every discount writes an audit row naming the granter, inside the
      same transaction as the receipt
- [x] **DoD 7** — the four buckets, worst-first, with an override taking precedence
      over the computed date
- [x] **DoD 8** — a payment against another tenant's appointment is answered absent by
      `findUnique({ where: { tenantId, id } })` and never written
- [ ] **DoD 9** — the axe and responsive pass over the four pages. Same Chromium
      blocker, fifth phase running

**Two modules, four pages, one worker job.** `payments` is the only writer of a
financial fact; `debts` is a computed view that writes nothing but the follow-up. The
three staff pages share one table and differ only in the copy block and the writes they
offer; the customer's own ledger is scoped by the session's `customerId` in the `where`
and carries no permission primitive at all.

**OQ-3 is closed.** The recomputable cache is written in the same transaction as the
receipt, re-derived nightly, and the reconciliation fails loudly on drift. The one
question the roadmap left for Phase 5 is answered.

---

## Phase 6 — what was delivered

**Complete**, started and completed ۱۴۰۵/۰۷/۱۴. The closing report is
`../reports/phase-06-report.md`; §4 records the four defects the tests found and the
fix for each — three of them in the ledger and the rule ordering, and one of them
the clock the ledger stamps its rows with.

- [x] **DoD (a)** — all seven automatic messages fire on their trigger against an
      injected clock, each carrying its customer and its values; and the five
      event-bounded kinds fall away at a later clock while the two state-based kinds
      remain, because a state has no lookback
- [x] **DoD (b)** — a customer without consent receives nothing, and the attempt is
      recorded as suppressed with a reason, a null `sentAt` and a null provider id;
      after consent, the same dispatch sends
- [x] **DoD (c)** — a second automatic message within the 90-day window is
      suppressed across every kind, and the priority order decides which one is sent
- [x] The seven triggers, the channel configuration, the send windows, the daily cap
      and the gateway adapter, behind the two module barrels
- [x] The `messages.dispatch` worker job, registered beside the other three
- [x] `reception/desk` — «میز کار امروز», seven permission-gated sections over the
      notifications module's reads
- [ ] The axe and responsive pass over the desk page — same Chromium blocker as every
      phase before it

**Two modules, one page, one worker job.** `notifications` answers which of the
seven messages is due and owns no send; `messages` answers whether it may be
delivered, and is the only writer of a ledger row. The priority list is read from the
constants module rather than restated in the dispatcher, because a reordering that
silently changed which message a customer receives would be invisible in review.

---

## Phase 7 — what was delivered

**Complete**, started and completed ۱۴۰۵/۰۷/۱۴. The closing report is
`../reports/phase-07-report.md`; §4 records the one build failure a later phase
has to know about — the argon2 import chain, which was an import chain and not an
argon2 problem, fixed by moving the campaign attribution out of
`appointments/lib/book.ts` and into the server-only booking action.

- [x] **DoD 1** — all eight built-in audience groups evaluate to the correct sets:
  exactly one customer per group and nobody else, the inactive customer and the
  lead excluded from every group, and a cycle whose customer already booked
  excluded
- [x] **DoD 2** — no campaign dispatches before approval: a draft is never scanned
  even when its `scheduledAt` has passed, a row forced to `ACTIVE` without the two
  approval columns is refused, and a campaign sends only through the real path —
  submit, a second person approves, activate
- [x] **DoD 3** — the assistant takes no transaction, no tenant and no customer id,
  rejects a clinical field at compile time and at read time, and answers a proposal
  whose fields stay inside the closed sets
- [x] `audience-groups`, `campaigns` and `campaign-assistant` behind their barrels,
  and `admin/campaigns` — the builder, the assistant and the results table
- [x] The `audience-groups.refresh` and `campaigns.dispatch` worker jobs, taking the
  registry from four kinds to six
- [ ] The axe and responsive pass over the campaign page — same Chromium blocker as
      every phase before it, sixth phase running

**Three modules, one page, two worker jobs.** `audience-groups` owns the eight
built-in groups as queries the tenant owns — seeded by the page and not by a
migration, so a later release can add a ninth. `campaigns` owns the approval gate,
and the attribution that links a booking to the campaign that last reached its
customer. `campaign-assistant` owns one thing — reading a Persian brief into a
proposal — and its barrel re-exports no write, so the guarantee is checkable. The
schema reached **1000 lines exactly**, ADR-0007's ceiling, met and not passed.

**OQ-2's remaining half is settled in code.** The two tables the open question left
to this phase — campaign types and audience groups — are enforced in `src/core/constants`
and `src/modules/audience-groups` and exercised by DoD 1. What stays open is the
behavioural check against the demo, which is the same Chromium and PostgreSQL gap as
every other phase, not a code gap.

---

## Phase 8 — what was delivered

**Complete**, started and completed ۱۴۰۵/۰۷/۱۵. The closing report is
`../reports/phase-08-report.md`; §3 records the one decision a later phase has to know
about — the two permission-free module paths, and why the public site's principal is a
module type and not a bypassed check.

- [x] **DoD 3** — a booking of a deposit-bearing service is refused while toggle 6 is
  off, because the gate reads the service's own row and not an amount the caller
  supplied
- [x] **DoD 4** — a booking on a holiday is refused while toggle 7 is off, through the
  same `loadSlotDay` the desk's grid consults
- [x] **DoD 6** — no before/after image renders without recorded written consent, and a
  revoked consent stops it rendering, because the gate is a `where` clause in the read
- [x] `public-site` behind its barrel — the eight pages' reads and all their Persian copy
- [x] The eight pages in `src/app/(public)/` with the 76px header and the shared footer,
  and the booking wizard and the consultation form as their two client islands
- [x] The two Server Actions, and the `bookPublicAppointment` and `createPublicLead`
  module paths they call
- [ ] The axe and responsive pass over the eight pages — same Chromium blocker as every
      phase before it, seventh phase running

**One module, eight pages, two actions.** `public-site` owns the catalogue, the team and
the gallery as reads a visitor sees, and the copy is in its own catalog because
`src/app/catalog.ts` is at ADR-0007's ceiling. The two writes are the two the phase's own
deliverable names, and each goes through the module the desk uses — same guards, same
sentences, with the staff permission replaced by the principal the action names. The
tenant is resolved from the host on every one of the eight, and no page receives one.

---

## Nothing is blocked

The session that opened this phase had no working package manager, so nothing had
ever been executed. That is no longer true, and nothing has been blocked since.
Node 24.19.0, npm 11.17.0 and git 2.50.1 all run, and the whole gate passes:

```
npm run build    →  32 routes, exit 0
npm run verify   →  db:generate · typecheck · lint · check:files · check:i18n
                   check:overrides · check:schema · check:rls · test
                   60 files, 1141 tests, exit 0
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
| OQ-1 — public page count (six vs eight) | Phase 8 | **closed by Phase 8.** All eight are built — `index`, `services`, `service-detail`, `booking`, `doctors`, `about`, `contact` and `panels` — in the `src/app/(public)/` route group, each mapped to the `public-site` module by `02-architecture.md` §9. The route group is what makes the count eight rather than six: the root `/` is already the panels' entry, so the eight live alongside it under a group that contributes no URL segment. What stays open is the visual check against the demo, the same Chromium gap every phase records. |
| OQ-2 — the two tables damaged by PDF extraction | before Phase 1 | **closed by Phase 7.** The two tables it was raised about are recovered and enforced in code: the 16 permissions and 3 role defaults in `src/core/constants/enums.ts`, and the 8 toggles with their default on/off states in `src/modules/roles-permissions` (the 96-case matrix in `tests/matrix.test.ts` transcribes `04-roles-permissions.md` §2 independently of the implementation). The other two of the four — the automatic message kinds with their triggers, and the send rules with their order, both in `src/core/constants` — were settled by Phase 6. The last two — campaign types and audience groups — are settled by this phase in `src/core/constants` and `src/modules/audience-groups`, exercised by the Phase 7 DoD 1 test. What remains open is not a table but the *behavioural* check against the demo, which is the Chromium and PostgreSQL gap every phase records. |
| OQ-3 — the recomputable balance cache | Phase 5 | **closed by Phase 5.** The cache is written in the same transaction as the receipt, re-derived nightly by `payments.reconcile`, and the reconciliation throws when it finds drift |

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
