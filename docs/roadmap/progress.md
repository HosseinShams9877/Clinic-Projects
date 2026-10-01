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
| 1 | Platform foundation | Not started | — | — |
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

**Current phase:** none. Phase 0 is closed; Phase 1 has not begun.

**Legend.** Not started · In progress · Blocked · Complete.

---

## What exists in the repository

| Area | State |
|---|---|
| Knowledge layer (`docs/knowledge/`, 11 files) | Complete |
| Roadmap (`docs/roadmap/`, 3 files) | Complete |
| Setup guides (`docs/setup/`, 5 files) | Complete |
| Changelog convention (`docs/changelog/`) | Complete |
| Phase reports (`reports/`) | Complete for Phase 0 |
| Root files (README, .gitignore, .env.example, LICENSE) | Complete |
| `.claude/` (settings, agents, commands, context, memory) | Complete |
| Application code (`src/`) | **Does not exist** — by design |
| Package manifest | **Does not exist** — created in Phase 1 |
| Test suite | **Does not exist** — created in Phase 1 |

The repository at the end of Phase 0 contains **documentation only**. There is no
`package.json`, no `src/`, no schema, no test. That is the intended state: Phase 0
produces the specification for the codebase, not the codebase.

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

Not started. When it begins, the definition of done from `phases.md` becomes the
checklist below.

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

Nothing is blocked. The three open questions from Phase 0 are recorded in
`../reports/phase-00-report.md` and each is needed only by a later phase:

| Question | Needed by |
|---|---|
| OQ-1 — public page count (six vs eight) | Phase 8 |
| OQ-2 — the two tables damaged by PDF extraction | Already resolved from the demo; confirm before Phase 1 |
| OQ-3 — the recomputable balance cache | Phase 5 |

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
