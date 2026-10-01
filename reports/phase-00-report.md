# Phase 00 Report — Foundation and Architecture

---

## 1. Phase

**Phase 0 — Foundation and architecture.**

Goal, from `../roadmap/phases.md`: make every structural decision, produce the
knowledge layer, and initialize the repository — **writing no application code**.

---

## 2. What was produced

Phase 0 produced the specification *for* the codebase, not the codebase. The
repository now contains a complete, internally consistent knowledge layer, a
scheduled roadmap, a recorded set of architectural decisions, five operational
setup guides, and a local git repository. There is no `package.json`, no `src/`,
no Prisma schema and no test — deliberately, and that absence is itself the
phase's main output.

### 2.1 The stack decision

The required first deliverable was a rigorous comparison of a separate Node.js
backend with a Next.js frontend (Option A) against a Next.js full-stack
application (Option B), across twelve named dimensions.

**Option B was adopted**, and the expected exception was confirmed: a **separate
lightweight background worker process**. The comparison is in
`../docs/knowledge/01-tech-stack.md`, and the outcome is recorded as ADR-0001 and
ADR-0002.

The critical distinction made, which the phase prompt anticipated but did not
state: the worker is a separate **process**, **not a separate codebase**. It
imports the same modules, the same Prisma schema, the same migrations and the
same localization layer, and ships in the same release. It is a process boundary.
A second codebase would duplicate every tenancy, permission, cycle and message
rule and drift from the first — which is precisely the failure the exception was
meant to avoid, not introduce.

The comparison found Option B wins on nine dimensions, ties on three, and Option
A wins on none **for this product** — but the document states honestly where
Option A would have won (four named conditions, none of which hold here) and
names the one thing it does better: isolating long-running work, which is exactly
what the worker exception addresses.

### 2.2 The multi-tenant architecture

`tenantId` is the primary boundary (a SaaS customer — a legal unit), `clinicId`
is secondary (a branch within a tenant, nullable). Access is through a
`Membership` join entity (`User ──< Membership >── Tenant`) carrying the role,
permitted clinic ids and per-user overrides — never an ownership model, because a
doctor works at two clinics and a manager consults at another, and ownership
cannot express either without duplicating identity.

**One PostgreSQL database for all tenants**, with row-level security as a second
layer. The alternatives — a database per tenant and a schema per tenant — were
rejected on migration multiplication (a schema change must be applied to every
tenant database, each able to fail independently), on operational cost, and on
the observation that a new tenant should be a row, not an infrastructure
operation. ADR-0003.

Three details in the RLS design are worth naming because each is a correctness
issue that a first pass typically gets wrong:

- **`FORCE ROW LEVEL SECURITY`, not merely `ENABLE`** — a table's owner bypasses
  policies by default, and the application typically connects as the owner.
- **`set_config('app.tenant_id', $1, true)`, not `SET LOCAL`** — `SET LOCAL`
  cannot take a bind parameter, so using it would require interpolating the
  tenant id into SQL text, reintroducing the exact injection surface the design
  exists to remove. The third argument scopes the setting to the transaction,
  which is required for correctness under connection pooling.
- **Fail closed** — `current_setting('app.tenant_id', true)` returns NULL when
  unset, and `tenantId = NULL` is never true, so a query without a tenant context
  returns zero rows rather than every row.

`MULTI_TENANT=false` enables single-tenant mode **without any schema change and
without any logic change** (ADR-0004): the flag gates only the tenant switcher and
the reachability of the `tenant-management` and `license` route trees. The
isolation machinery stays in place and inert. Both migration directions are
documented, and the single-tenant → SaaS direction is a `tenantId` substitution
precisely because the schema was never simplified.

### 2.3 The module architecture

Twenty modules under `src/modules/<name>/`, each with the same internal contract
(`components/`, `lib/`, `validation/`, `types/`, `hooks/`, `api/`, `tests/`,
`index.ts`). `src/app/` is thin routing only. Import discipline is enforced by
rule and planned by tooling: a module's barrel is its only public surface, and no
deep cross-module imports. No file may exceed 1000 lines — and because that is a
proxy for "one file, one responsibility", the convention document specifies that
a file hitting the limit is split **by responsibility**, guided by the module's
own subfolders, never by taking the bottom half.

**All 35 pages are mapped to modules**, in five tables, with an explicit coverage
check: 8 public + 6 customer + 11 manager + 4 doctor + 6 reception = 35. Every
page maps; no module in the list is unreferenced.

The phase prompt warned specifically that a previous attempt missed the
`notifications` module. It is present, and its boundary against the easily
confused modules is stated explicitly:

| Pair | The line |
|---|---|
| `notifications` vs `messages` | `notifications` owns **when** and **to whom** (triggers, timing, consent, caps, the delivery ledger). `messages` owns **what text** and **transport** (templates, channels, gateway, send log). |
| `campaigns` vs `campaign-assistant` | `campaigns` dispatches. `campaign-assistant` only proposes, never sends, and its field allow-list excludes all medical data. |
| `audience-groups` vs `customers` | `customers` owns records. `audience-groups` owns **queries over** them. |
| `debts` vs `payments` | `payments` writes financial facts. `debts` reads them and derives a balance, and structurally cannot create, alter or delete one. |

`notifications` maps on three surfaces (`reception/desk.html`,
`reception/cycles.html`, `account/profile.html`), owns the seven automatic
messages, and shares the settings "پیامها" tab with `messages`.

**One modelling point worth recording:** a **Lead is not a separate entity**. The
specification states that a lead becomes a customer on first booking, preserving
its acquisition source. It is therefore one entity with a lifecycle, owned by
`customers`, and `reception/leads.html` is a filtered cartable view — the same
reasoning the specification itself used when it rejected a stored audience list
in favour of a query.

### 2.4 The role and permission model

The specification's own permission matrix table was destroyed by PDF extraction —
its columns were interleaved, and a naive reading produces a matrix in which the
secretary has permissions the manager lacks. **Rather than reconstructing it by
guesswork, it was recovered from the demo's rendered source**
(`admin/staff.html`), which is the artefact someone actually built and reviewed.
Cross-validation: the spec states the secretary مریم صالحی has «۱۲ دسترسی از ۱۶»,
and the recovered matrix gives the secretary role exactly 12 of 16. The
reconstruction is confirmed, not assumed. `../docs/knowledge/04-roles-permissions.md`.

**The same defect appeared a second time** in the behavioral-toggles table, and
was resolved the same way — from `admin/settings.html`. My first reconstruction
from the damaged spec was wrong on **four of the eight toggles**. The demo's
rendered defaults are authoritative and are what the knowledge layer records:

| # | Toggle | Default |
|---|---|---|
| 1 | پزشک بتواند از برنامه خودش نوبت ثبت کند | **on** |
| 2 | پزشک بتواند ساعت خودش را ببندد | **off** |
| 3 | منشی بتواند تخفیف بدهد | **on** |
| 4 | منشی بتواند سررسید بدهی را جابهجا کند | **on** |
| 5 | منشی بتواند قیمت خدمت را تغییر دهد | **off** |
| 6 | رزرو آنلاین بدون بیعانه مجاز باشد | **off** |
| 7 | اجازه رزرو در روزهای تعطیل | **off** |
| 8 | ثبت خودکار لید از فرم سایت | **on** |

This is raised as **OQ-2** below, not because the answer is unknown, but because
the *pattern* — the specification's extracted tables being unreliable — is itself
something the specification's author should know about.

The eight toggles are recorded with the crucial distinction the demo states in its
own card footnote: «هر سوئیچ اینجا معادل یک قاعده در سمت سرور است، نه
پنهانکردن یک دکمه.» Each is a server-side rule, and each has a required test.

### 2.5 The data model

`../docs/knowledge/03-data-model.md` covers every entity with primary keys,
foreign keys, unique constraints, and **every index with its exact column order,
the query it serves, and the reason it exists**. `tenantId` is the leading column
of every composite index.

Three modelling decisions are recorded with their reasoning:

- **Mobile as the unique key** — it is the customer's identity in a clinic, and
  it is what deduplicates the same person arriving from Instagram, the phone, and
  the front desk. Unique per tenant, not globally.
- **`TreatmentCycle` as an independent entity**, not fields on `Appointment`
  (ADR-0011). Three concrete reasons, the strongest being that the interval is a
  property of the **cycle**: «فاصله از دوره خوانده میشود، نه از تعریف خدمت». With
  fields on appointments there is nowhere to record the cycle's own interval, and
  a settings change would silently reschedule dozens of in-flight courses.
- **`AudienceGroup` as a query, not a stored list** (ADR-0012) — because a
  snapshot goes stale in exactly the way that causes a visible error: a customer
  who revokes consent at 10am is still in last night's list at 2pm, and the
  campaign messages her. The query evaluates consent at the moment of send.

Two further decisions with non-obvious consequences:

- **Money is `BigInt` Rial, serialised as a string** (ADR-0008). Rial rather than
  Toman because the gateways operate in Rial and storing the display unit
  introduces a rounding decision in a dozen places. A string across JSON because
  `JSON.stringify` throws on a `BigInt` and `JSON.parse` would silently lose
  precision.
- **Dual date representation** (ADR-0009): a UTC `scheduledAt` for arithmetic and
  ordering, plus a Jalali `localDate` string and `localTime` for display, day
  grids and uniqueness. The day grid asks "everything on ۱۵ مهر" — that is a
  string equality, indexable and exact. Deriving it from `scheduledAt` at read
  time makes every such query depend on the server's timezone being correct,
  which it will not always be.

**The `debts` table does not exist** (ADR-0013). A debt is an appointment with an
outstanding computed balance. A debt row would be a stored conclusion — the thing
immutable rule 8 forbids — and, more seriously, it would create a delete path,
which immutable rule 7 forbids. With no table, "debt deletion does not exist" is
**structural rather than promised**: there is nothing to delete. The debt list is
served by the appointment index because `dueDate = scheduledAt + grace` is
monotonic, so the four buckets are four ranges on one ordered column.

### 2.6 Localization

`../docs/knowledge/07-localization.md`. The significant decision is ADR-0010: the
**Jalali conversion is implemented in-house**, not via
`Intl.DateTimeFormat('fa-IR-u-ca-persian')`. The reason is that `Intl`'s output
depends on the ICU data bundled with the Node runtime, which differs between a
developer's machine, the SaaS host, and a clinic's on-premise server — so a date
could render as one Jalali day on the build machine and another on the clinic's
machine. That is the failure this product cannot afford: a clinic acting on the
wrong day. `Intl` is used **inside the test suite** as a cross-check, so a future
Node version changing ICU fails the test loudly rather than changing a screen
silently.

Also recorded: **the week starts on شنبه**, and that is stated as a behavioural
requirement rather than a formatting one — it governs slot generation, "this
week" report ranges, working-hours configuration and the appointment grid's
column order.

### 2.7 The design system

`../docs/knowledge/08-ui-design-system.md` preserves all 47 sections of the
supplied design system, with the §46 token block reproduced **verbatim**, in its
canonical lowercase form. Every token value is unmodified. No colour, radius,
shadow or spacing value was invented, and the document states the enforceable
rules that follow — most importantly that **the Tailwind default palette is
forbidden**, because the brand is a custom dusty-rose (`#b56b6b`) and
`bg-rose-500` is a different colour that merely looks similar.

**One discrepancy was resolved and recorded.** `--ink-3` is defined as `#9C8A85`
in the design system's theme file but overridden to `#817169` in the brand
stylesheet. The document records `#817169` as in force, with the discrepancy
noted, rather than silently picking one.

### 2.8 Security and testing

`../docs/knowledge/09-security.md` documents the two isolation layers with the
design assumption stated plainly: **Layer 1 (application filtering) will
eventually have a bug**, and Layer 2 (RLS) exists so that bug returns zero rows
instead of another clinic's customers. It also documents the honest gap — SQLite
in development has no RLS — with four mitigations and an explicit residual-risk
statement, rather than pretending the gap does not exist.

`../docs/knowledge/10-testing-strategy.md` defines the full suite: unit tables for
slot generation, cycle arithmetic, balance computation, Persian digits and Jalali
conversion; integration tests; the four specification scenarios as end-to-end
specs; the **96-test permission matrix (16 permissions × 3 roles × both
directions)**; the security suites (self-escalation, cross-tenant, ownership
scoping, customer-panel isolation, worker scoping); accessibility; responsive;
localization; and coverage targets enforced in CI — with **100% required** on
`core/localization` and `roles-permissions`, because every branch of those is a
correctness or security rule.

The cross-tenant suite runs on **PostgreSQL with RLS live**, not SQLite, because
SQLite has no RLS to test.

### 2.9 The roadmap

Twelve phases, 0 through 11, totalling **152–209 working days**, each with a goal,
deliverables, a measurable definition of done, dependencies and an effort range.
All 35 pages are assigned to exactly one phase, with a coverage check summing to
35. The four specification scenarios are each the definition of done for the
phase that completes them, and all four are re-run in full in Phase 11.

Phase 11 carries the required final-phase verification: full end-to-end testing of
all four scenarios on PostgreSQL, accessibility across all 35 pages, responsive
across all 35 pages, Persian localization across all 35 pages, and the permission
matrix run against the complete application rather than only the primitive.

### 2.10 Decisions recorded

Eighteen ADRs in `../docs/roadmap/decisions.md`. Each records the decision, the
alternatives **rejected** with the reason, and the consequences **accepted** —
including the costs. ADR-0014 is marked *provisional* rather than accepted,
because it is a compromise the specification did not explicitly authorise (OQ-3).
ADR-0017 is marked *provisional* for the same reason (OQ-1).

### 2.11 Setup guides

Five documents covering installation, deployment (both SaaS and on-premise),
single-tenant mode, licensing, and the SQLite→PostgreSQL path. Notable positions
taken:

- **A production boot refuses to start** against SQLite, or with RLS disabled on
  a tenant-scoped table, or without a valid licence in single-tenant mode — a
  loud failure at boot rather than a quiet one at runtime.
- **An expired licence does not stop the product.** A clinic whose licence lapsed
  by a week still has customers with appointments tomorrow; locking the product
  would turn patients away over a commercial disagreement that has nothing to do
  with them. The licence degrades, it does not withhold. The only hard stops are
  no key at all, and a failed signature — which are unlicensed installations, a
  different situation from a lapsed one.
- **A restored database is not trusted until `npm run test:isolation` passes
  against it.** `pg_restore` does not carry RLS policies, so a restore silently
  missing them is a database where every tenant can read every other tenant, and
  nothing looks wrong.

---

## 3. What was verified

Each claim with the method used.

| Claim | Method | Result |
|---|---|---|
| Every required file exists with real content | A repository-wide search for `TODO`, `FIXME`, `TBD`, `coming soon`, and placeholder markers | **Zero hits** |
| All 35 pages are mapped to modules | Manual enumeration in five tables, with an arithmetic coverage check | **8 + 6 + 11 + 4 + 6 = 35** ✓ |
| All 20 required modules exist and none is unreferenced | Each module checked against the page mapping | ✓ |
| The permission table has 16 permissions across 3 roles | Counted; cross-validated against the demo's rendered matrix and against the spec's «۱۲ دسترسی از ۱۶» for the secretary role | **16 × 3, secretary = 12** ✓ |
| The behavioral toggle table has 8 rows with defaults | Read from `admin/settings.html`, the rendered source | 8 ✓ |
| The design system tokens are unmodified | The §46 block compared against the source | Identical ✓ |
| `notifications` is present and distinct | Explicit boundary statement against `messages`; three mapped surfaces | ✓ |
| No secret, `.env` or database file is tracked | `git status` and a check of the staged set | ✓ |
| No remote is configured | `git remote -v` | **Empty** ✓ |
| Every cross-reference resolves | Each `[[link]]` and file path checked against the tree | ✓ |
| Both migration directions are documented | `02-architecture.md` §5 and `setup/single-tenant.md` §8–§9 | ✓ |
| Every entity has an index strategy | Per-entity tables in `03-data-model.md`, `tenantId` leading in every composite | ✓ |
| The two damaged specification tables were recovered, not guessed | Both recovered from the demo's rendered source and cross-validated | ✓ |

### What was **not** verified

Stated explicitly, because an unqualified claim is worth less than an honest
qualification:

- **The specification's ambiguity is not resolved.** Three open questions remain
  (§6). They were assumed, not confirmed.
- **Nothing about the application is verified**, because no application exists.
  Every test described in the testing strategy is a requirement, not a result.
- **The demo's page count note is stale** — see below.
- **The Persian specification file cannot be searched** with normal tooling (see
  §7). Its content was read linearly instead. A search-based verification of its
  content was therefore not performed.

### A note on the demo's own documentation

The demo folder's README states that the manager panel has 14 pages and the
reception panel 10. **The actual demo contains 11 and 6**, which matches the
specification (نسخه ۳). The README is stale. The knowledge layer follows the
demo's actual files and the specification, not its README. Recorded here so the
next reader does not treat the README as authoritative.

---

## 4. What was deferred, and why

| Deferred | Why | Picked up by |
|---|---|---|
| **Secretary performance report** in the manager panel | The specification defers it explicitly, and for a good reason: a *correct* measure of a secretary's work was never defined, and a wrong measure is worse than none — it would drive behaviour the clinic does not want. The empty work list is the intended replacement, and it is a better one: it measures the outcome (no customer lost) rather than the activity. | **Not in scope.** Out of the product, not deferred to a phase. |
| **A service-recording page** | Service recording currently happens inside the appointments table, which is sufficient and avoids a second place where the same fact is written. | **Not in scope.** |
| **Inventory and consumables** | A separate scope and not a differentiator for this product. Building it would delay the cycle engine, which is the differentiator. | **Not in scope.** |
| **The application itself** | Phase 0 is defined as producing no application code. Every structural decision had to precede the first file. | Phase 1 onward |
| **The Jalali algorithm's exact break table** | The algorithm and its test obligations are specified; the table's values are a Phase 1 implementation detail, verified by the 200-year round-trip and the ICU cross-check rather than by being transcribed in Phase 0. | Phase 1 |
| **The final 1000-line split plan per module** | Planning file-by-file splits before the code exists would be guesswork. The rule, the enforcement and the splitting method are specified. | Per phase |
| **The precise SMS and payment gateway adapters** | Vendor choice is a deployment decision, not an architecture one. The adapter interface and the message ledger are specified. | Phase 6 / Phase 5 |

**Cost of each deferral.** The three out-of-scope items reduce the product's
scope, which is the specification's own decision and is recorded in
`06-constants.md` §3 so that no later phase quietly adds them back. The remaining
deferrals have no cost beyond sequencing: they depend on code that does not exist
yet.

---

## 5. Files created and modified

**35 files created. 0 modified** — the repository had no tracked content before
this phase.

Verified with `git show --stat` on the Phase 0 commit, not estimated.

### `docs/knowledge/` — 11 files

The required knowledge layer, `00` through `10`:

1. `00-overview.md` — the entry point; what the product is, who uses it, the shape, the reading order
2. `01-tech-stack.md` — the 12-dimension comparison, the decision, the worker exception, rejected alternatives
3. `02-architecture.md` — multi-tenancy, single-tenant mode, the 20 modules, the 35-page mapping, import rules, the worker
4. `03-data-model.md` — every entity, every index with its query, dates, money, invariants
5. `04-roles-permissions.md` — the 16 permissions, the 3 roles, overrides, the locked manager column, the 8 toggles
6. `05-conventions.md` — language, TypeScript, naming, modules, validation, errors, the forbidden list
7. `06-constants.md` — the ten immutable rules, the closed sets, the numeric constants, MVP boundaries
8. `07-localization.md` — Persian, RTL, Persian digits, bidi, the Jalali calendar, the catalog
9. `08-ui-design-system.md` — all 47 sections preserved; the token block verbatim
10. `09-security.md` — the two layers, RLS, the SQLite gap, escalation, the customer panel, the worker, secrets
11. `10-testing-strategy.md` — unit, integration, the 96-test matrix, the security suites, the 4 scenarios, CI gates

### `docs/roadmap/` — 3 files

12. `phases.md` — 12 phases with goals, deliverables, measurable DoD, dependencies, effort ranges, and the 35-page coverage table
13. `progress.md` — the living status file
14. `decisions.md` — 18 ADRs

### `docs/setup/` — 5 files

15. `installation.md`
16. `deployment.md`
17. `single-tenant.md`
18. `licensing.md`
19. `database-migration.md`

### `docs/changelog/` — 1 file

20. `README.md` — the changelog convention

### `reports/` — 2 files

21. `README.md` — the report convention
22. `phase-00-report.md` — this report

### Repository root — 5 files

23. `README.md` — the project overview with the 13 required sections
24. `.gitignore` — Node, Next, Prisma, env, OS, IDE and build artefacts; the SQLite dev database; `.env*` except `.env.example`
25. `.gitattributes` — line-ending normalisation, so the repository behaves identically on Windows, macOS and Linux and every file does not show as modified on a machine with a different `core.autocrlf`
26. `.env.example` — every environment variable with inline documentation and no values
27. `LICENSE.md` — proprietary

### `.claude/` — 6 files

28. `settings.json` — permissions and hooks
29. `context.md` — the source-of-truth pointer, the ten immutable rules, the current phase and DoD, the 1000-line rule, Persian/Jalali mandate, server-side permissions
30. `memory.md` — dated decisions carried between sessions
31. `agents/code-reviewer.md`
32. `agents/test-writer.md`
33. `agents/design-system-guardian.md`

### `.claude/commands/` — 2 files

34. `commands/phase-status.md`
35. `commands/check-boundaries.md`

---

## 6. Open questions for the human

Three. None blocks Phase 1. Each should be answered before the phase it affects.

### OQ-1 — Does the public site have six pages or eight?

**The question.** The specification states «شش صفحه» (six pages) for the public
site in one section, and lists eight distinct public surfaces in another. Which
is correct?

**What prompted it.** The specification's tables were damaged by PDF extraction
(§2.4), so the discrepancy cannot be resolved from the extracted text alone. The
narrative sections describe eight genuinely distinct surfaces — a home, a service
list, a service detail with price and session count, a booking flow, a doctor
list, an about, a contact, and a panel-entry page. The supplied demo implements
eight. The number six appears once, unqualified.

**What was assumed.** **Eight pages**, per ADR-0017, because the demo is the
rendered and reviewed artefact and has been the correct tiebreaker twice already
in this project. The assumption affects `02-architecture.md` §9 (a two-row
difference in the page mapping), `phases.md` Phase 8, and the effort range for
Phase 8 — slightly narrower if the answer is six.

**If it stays unanswered.** Phase 8 is affected. Nothing before it is. The cost of
being wrong is one extra or one missing page.

**Affects:** Phase 8.

### OQ-2 — The specification's extracted tables are unreliable

**The question.** Two tables in the specification were rendered unusable by PDF
extraction, and in both cases a **reasonable reading produces a wrong answer**.
Should the source `.txt` be regenerated from the original, and are there other
tables with the same defect that have not yet been noticed?

**What prompted it.** The permission matrix's columns were interleaved — a naive
reading gives the secretary permissions the manager lacks. The behavioral toggle
table had the same defect, and my reconstruction from it was **wrong on four of
the eight toggles**. Both were recovered from the demo's rendered source
(`admin/staff.html`, `admin/settings.html`) and cross-validated — the recovered
permission matrix matches the specification's own statement that the secretary
مریم صالحی has «۱۲ دسترسی از ۱۶», which is a strong independent confirmation.

**What was assumed.** The demo's rendered source is authoritative where the
extracted specification is ambiguous. This is recorded, not silent. The recovered
values are in `04-roles-permissions.md` §2 and §4.

**Why this is raised despite being resolved.** The two damaged tables were found
because they happened to be read carefully. **The failure mode is that a third
damaged table exists somewhere that was read as prose and accepted without
noticing.** The knowledge layer should be re-checked against the demo and against
a clean source before it is treated as final — specifically: the campaign type
table, the audience group table, the automatic message table, and the acquisition
source table.

**Affects:** all phases. Cheapest to resolve before Phase 1.

### OQ-3 — Is a recomputable charge/payment total acceptable, given immutable rule 8?

**The question.** Immutable rule 8 says the balance is computed, never stored.
The «بدهکاران» audience group must filter customers by whether they owe money,
which requires aggregating every appointment and payment for every customer — a
query that grows with the clinic's entire history. Is storing **`chargedTotal`
and `paidTotal`** as a recomputable cache, with the balance still computed as
their difference at read time and reconciled nightly, acceptable?

**What prompted it.** It is the one place in the design where rule 8 and a
performance requirement pull against each other. The position taken is that it
does not violate the rule: `chargedTotal` and `paidTotal` are **sums of ledger
facts**, each append-only and auditable; the balance itself is still computed,
still never stored, and still reproducible from the appointment and payment
records alone. If the cache were dropped entirely, nothing would be lost — it is
recomputable in one query.

**What was assumed.** The cache is acceptable, marked **provisional** in ADR-0014
rather than accepted outright, and the nightly reconciliation fails loudly on
drift so the failure is visible rather than silent.

**If the answer is no.** The cache is removed, the `بدهکاران` predicate becomes a
live aggregate, and the group is documented as the one slow group. Nothing else
changes — no other decision depends on it.

**Affects:** Phase 5.

---

## 7. Recommended next action

**Answer OQ-2, then begin Phase 1.**

OQ-2 first, and specifically the four tables it names — the campaign types, the
audience groups, the automatic messages, and the acquisition sources. It is the
cheapest question to resolve now and the most expensive to discover later, because
a damaged table read as prose produces a knowledge layer that looks correct and is
wrong in a way no test can catch: the test would be written against the same wrong
reading. Phase 1 does not depend on those four tables, but Phases 6 and 7 do, and
by then they will be built on.

OQ-1 and OQ-3 are not urgent — they affect Phase 8 and Phase 5 respectively, and
each is recorded with a provisional decision that is cheap to reverse.

**Then Phase 1**, in this order: the project skeleton and the token block first
(so every screen from the first commit renders in the real design system, in
RTL, in Vazirmatn), then the localization layer with its tests (because every
later screen depends on it and it is the highest-risk pure logic in the product),
then the Prisma schema, the RLS migrations, `getTenantContext()`, `auth`, and the
permission primitive — with the 96-test matrix passing before any feature work
begins. The worker process comes with the same phase, because the cycle and
message jobs are the product's central mechanism and a worker added later is a
worker whose tenancy rules were designed as an afterthought.

---

## A final note on method

Two things in this phase were done differently from a first pass, and both are
worth carrying forward:

**Nothing ambiguous was guessed.** Where the specification was unusable, the
question was raised rather than resolved by assumption — and where a rendered
source existed, it was used as evidence rather than replaced by a plausible
reconstruction. The toggle table is the proof: my first reconstruction was wrong
on half its rows, and it was wrong *plausibly*.

**One tool limitation was worked around, not hidden.** The Persian specification
file cannot be searched with standard text tooling — its encoding is
presentation-form glyphs, and a search for words it definitely contains returns
nothing. It was read linearly instead. This is recorded here so a later reader
does not conclude from a failed search that a section is missing.

---

*Phase 0 closed. See `../roadmap/phases.md` for Phase 1.*
