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
| 1 | Platform foundation | **In progress** | ۱۴۰۵/۰۷/۰۹ | — |
| 2 | Appointments and scheduling | Not started | — | — |
| 3 | Customers, services, staff | Not started | — | — |
| 4 | Treatment cycles | Not started | — | — |
| 5 | Payments and debts | Not started | — | — |
| 6 | Messages and notifications | Not started | — | — |
| 7 | Campaigns, audiences, assistant | Not started | — | — |
| 8 | Public site | Not started | — | — |
| 9 | Customer panel | Not started | — | — |
| 10 | Reports, settings, tenancy, licensing | Not started | — | — |
| 11 | Hardening and full verification | Not started | — | — |

**Current phase:** Phase 1, *In progress*, started ۱۴۰۵/۰۷/۰۹.

**Legend.** Not started · In progress · Blocked · Complete.

---

## What exists in the repository

| Area | State |
|---|---|
| Knowledge layer (`docs/knowledge/`, 11 files) | Complete |
| Roadmap (`docs/roadmap/`, 3 files) | Complete |
| Setup guides (`docs/setup/`, 5 files) | Complete |
| Changelog convention (`docs/changelog/`) | Complete |
| Phase reports (`reports/`) | Complete for Phase 0; Phase 1 in `phase-01-report.md` |
| Root files (README, .gitignore, .env.example, LICENSE) | Complete |
| `.claude/` (settings, agents, commands, context, memory) | Complete |
| Package manifest | Complete — all dependencies pinned, no styled component library |
| Application code (`src/`) | In progress — `core` and `modules/roles-permissions`; the app shell is partial |
| Prisma schema | Complete — one portable schema, 25 models, validating as SQLite and PostgreSQL |
| Migrations | Partial — the PostgreSQL RLS policies exist; no SQLite migration list yet |
| Test suite | In progress — unit tests for `core` and the `roles-permissions` matrix |
| Verification gate | **`npm run verify` passes end to end** — generate, typecheck, lint, 5 checks, 886 tests |

Phase 0 produced the specification for the codebase. Phase 1 is producing the
codebase, and it is not closed: the items in "Blocked and waiting" below are the
part of it that could not be completed in the environment this work session ran
in, and `../reports/phase-01-report.md` records each one with its reason.

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

## Phase 1 — checklist

**In progress**, started ۱۴۰۵/۰۷/۰۹. Per rule 2 below, the boxes are not ticked as
work proceeds — a box is ticked when the phase closes, so that a partially
finished phase cannot look finished from this file. Progress *within* the phase
is recorded in `../reports/phase-01-report.md`, which is written and updated as
the phase runs.

- [ ] Next.js project, TypeScript strict, ESLint import-boundary rule
- [ ] Design tokens as CSS variables, light and dark
- [ ] Vazirmatn self-hosted, RTL root, responsive shell
- [ ] `src/core/localization/` complete, at 100% coverage
- [ ] Prisma schema: Tenant, Clinic, User, Membership, AuditLog, Job
- [ ] SQLite and PostgreSQL migrations, with portability guards
- [ ] RLS policies and `FORCE ROW LEVEL SECURITY`
- [ ] `getTenantContext()` and the tenant-injecting Prisma extension
- [ ] `auth`: password login, sessions, logout
- [ ] `roles-permissions`: matrix, overrides, toggles, `can()` — 100% coverage
- [ ] `src/worker/` process with the job table
- [ ] `account/login.html`
- [ ] The four panel shells, nav from the permission set
- [ ] CI: typecheck, lint, coverage, file length, axe
- [ ] **96-test permission matrix green**
- [ ] Self-escalation suite green
- [ ] Cross-tenant suite green on PostgreSQL
- [ ] Jalali round-trip green across 200 years
- [ ] Production boot refuses SQLite and RLS-disabled tables

---

## Blocked and waiting

**The environmental blocker is cleared.** The session that opened this phase had
no working package manager, so nothing had ever been executed; that is no longer
true. Node 24.19.0, npm 11.17.0 and git 2.50.1 all run, and the whole gate now
passes:

```
npm run verify  →  db:generate · typecheck · lint · check:files · check:i18n
                   check:overrides · check:schema · check:rls · test
                   24 files, 886 tests, exit 0
```

One consequence worth recording: `src/generated/` is ignored, and `verify`
generates the Prisma client itself as its first step. The client is output
derived from the committed schema, not source, and rebuilding it is what lets a
fresh clone verify itself with no postinstall hook and no database. Three other
files already treated the directory that way — `.prettierignore`, the lint
ignores and `check-file-length.mjs`.

What remains is specification work and code, not environment:

| Remaining item | Why it is still open |
|---|---|
| SQLite migration list (`prisma/migrations/`) | Not written. `prisma migrate dev` now runs, but the migration list has to be authored and committed. |
| `getTenantContext()` and the tenant-injecting Prisma extension | Not written. The generated client exists, so this is unblocked. |
| `prisma/seed.ts` | Not written. `prisma.config.ts` already points both `db:seed` and `migrations.seed` at it. |
| `auth` — password login for staff, mobile + OTP for customers | Not written. |
| `src/worker/` process | Not written. |
| `src/app/page.tsx` and the panel shells | Not written; the root layout and the fonts are in place. |
| The module override registry | Not written; OQ-6 decides whether Phase 1 owns it. See the phase report. |
| Cross-tenant isolation suite on PostgreSQL | Needs a PostgreSQL server. |
| The ten open questions OQ-1…OQ-10 | Answered or closed in `../reports/phase-01-report.md`. |

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
