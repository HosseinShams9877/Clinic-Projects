# Phase 11 — Hardening and full verification

**Status.** Closed with two gates unobserved and one gate failing. Everything the
environment could hold was verified; the three things it could not are named
below with the exact reason, rather than reported as done.

**The numbers.** `npm run verify` is green at **70 test files and 1264 tests**
(Phase 10 closed at 64 files and 1179). `npm run build` compiles and writes
**39 routes**. Typecheck, lint and all five `check:*` gates pass. The identical
suite passes with both `MULTI_TENANT=true` and `MULTI_TENANT=false`.

---

## 1. What was verified

| Gate | Result |
|---|---|
| `npm run verify` (typecheck, lint, 5 `check:*` scripts, the suite) | **Green — 70 files, 1264 tests** |
| `npm run build` | **Green — 39 routes, compiled successfully** |
| The suite under `MULTI_TENANT=false` | **Green — the same 1264 tests** |
| The four specification scenarios, end to end from a clean database | **Green — 10 tests, on SQLite** (see §3) |
| `noUncheckedIndexedAccess` restored | **On — 41 errors found and fixed** |
| The §11 coverage floors restored | **On — the gate runs, and fails** (see §4) |
| `check:rls` | **Green — 24 tenant-scoped tables, all four clauses** |
| No file over 1000 lines / no TODO or FIXME | **Green — 0 files, 0 markers** |
| Persian literals outside a catalog | **Green — 0 in production code** (427 hits, all comments) |
| `npm audit` on runtime dependencies | **4 high advisories, all in `prisma`'s tree** (see §5) |
| The permission matrix, 16 permissions × 3 roles, both directions | **Green — the 96-case matrix plus escalation, toggles and the last-manager invariant** |
| The worker's claim under contention | **Green — a second worker's conditional claim matches nothing** |
| The install path from `setup/installation.md` | **Performed — see §6** |
| The release | **1.0.0 tagged, changelog written, seed dataset verified** |

### The two relaxations, and what restoring them exposed

**`noUncheckedIndexedAccess` — ON in `tsconfig.json`.** The flag added `| undefined`
to 41 sites: index-signature lookups and array element access. The fixes fell into
four kinds, and one of them was a latent bug:

- `src/app/_settings/settings-forms.tsx` (27 errors) — the root cause was a prop
  typed `{ readonly save: string; readonly [key: string]: string }`. An index
  signature cannot be checked against the catalog, so the compiler could not see a
  missing key. Replaced with `FieldLabels<C> = Readonly<Record<keyof C, string>>`
  over each tab's own catalog constant, imported as a **type** so the client chunk
  gains no runtime dependency on a barrel that reaches Prisma.
- **The latent bug that the typing exposed:** `OptionsForm`'s override remove
  button read `labels.remove`, but `OPTIONS_FIELDS` defines `removeOverride`. The
  index signature had been hiding a key that does not exist. The button rendered an
  empty label; now it renders the catalog's.
- Array element access in `desk/page.tsx` — three parallel arrays
  (`sections` / `headings` / `links`) indexed in a map, so a heading and a link
  could silently disagree. Replaced with one typed array carrying its own link, so
  no index access remains.
- Optional access in `request.ts` and `tenant.ts` (a forwarded header's first
  label), and explicit narrowing in `cycles/lib/creation.ts`,
  `staff/tests/permissions.test.ts` and `payments/tests/schema-shape.test.ts`.
  The narrowing in `creation.ts` replaced a comment that claimed the flag was off
  — the flag was off then, and it is on now.

**The §11 coverage floors — restored in `vitest.config.ts`.** The global floor is
back at 80 and `src/core/localization/**` at 100, where Phase 1 put them.
`src/modules/roles-permissions/**` never left 100. See §4 for what the restored
floors exposed.

### The tests written this phase

Five new files, 85 tests — each named by a definition of done, none written to
move a number:

| File | Tests | What it holds |
|---|---|---|
| `src/modules/debts/tests/buckets.test.ts` | 10 | The four buckets at their exact boundaries — `PastDue` on days 0–6, `Over7Days` from day 8, `Over30Days` from day 31, and not a day earlier |
| `src/modules/settings/tests/read-write.test.ts` | 19 | All six tabs written and read back through the module's own reader, plus the defaults a tenant that never opened the page sees |
| `src/modules/license/tests/keys.test.ts` | 11 | Phase 10's DoD 6: a key that lapses blocks the instance and leaves every tenant, clinic and audit row where a renewal finds them |
| `src/modules/tenant-management/tests/provision.test.ts` | 16 | §2.3's invariant — the last manager is refused, not removed — and suspension as a flag rather than a delete |
| `src/modules/public-site/tests/reads.test.ts` | 19 | The shop front: the deactivated service's absence, consent in the read, the wizard's slots from the real engine, and the tenant boundary |
| `src/scenarios/tests/scenarios.test.ts` | 10 | The four specification scenarios, chained end to end (§3) |

---

## 2. The bug the phase found and fixed

**A deactivated service still appeared on a doctor's public card.**

`publicServices` filters `isActive: true` and `publicService` returns `null`, so a
deactivated service's own page renders a 404 — but `publicDoctors` read
`ServiceDoctor` with `where: { tenantId }` alone, so the doctor's card kept naming
a service the catalogue had stopped selling. A visitor following it reached a
booking the wizard then had to refuse.

The read now filters `service: { isActive: true }`, so the catalogue and the team
page cannot disagree. The test that caught it is
`src/modules/public-site/tests/reads.test.ts` — and it failed first, which is the
point of writing it before fixing.

---

## 3. The four specification scenarios

**Green — 10 tests, from a clean database, with no manual step**, in
`src/scenarios/tests/scenarios.test.ts`. Each drives the chain *between* the
modules, which is what a per-module suite cannot reach:

- **One — Instagram to first session:** the desk records a lead, the visitor reads
  the catalogue and the wizard's slots, the booking path's dedupe converts the
  lead, and the acquisition source survives the conversion.
- **Two — a secretary's working day:** three sessions booked, promoted, arrived;
  one completed, one a no-show, one left without a result and flagged by the
  sweep's two-hour threshold.
- **Three — a six-session course:** the cycle is created on the first *completion*
  and never on the booking, a second completion extends the same course, a
  drop-off closes it with a reason, and a return opens a new one.
- **Four — a birthday campaign:** a Persian sentence is read into a type, an
  audience and a message; the campaign is submitted, approved by a *different*
  manager (self-approval is refused), activated and dispatched; and a booking the
  campaign brought is attributed to it.

**The engine choice, recorded rather than hidden.** The specification asks for
these on PostgreSQL. PostgreSQL is not available in this environment (§3 of the
unobserved gates), so the chain runs against the real SQLite file the rest of the
suite uses, and the isolation assertions it makes are the extension's, not RLS's.
A chain green here is a chain green against **one** engine. The PostgreSQL run
remains unobserved.

---

## 4. The gates that are not green

### The coverage floor — restored, and failing

The floors are back where §11 put them. `npm run test:coverage` enforces them and
**fails**:

| Scope | Floor | Actual | Verdict |
|---|---|---|---|
| `src/core/localization/**` | 100 | **100** | passes |
| `src/modules/roles-permissions/**` | 100 | **100** | passes |
| Global | 80 | **44.18 lines / 32.85 branches** | **fails** |
| `src/modules/*/lib/**` | 95 | **68.37 lines / 52.49 branches** | **fails** |
| `src/modules/*/validation/**` | 95 | **77.27 lines** | **fails** |

**Why the floor fails, and why it was not filled.** The global number has sat
below even the relaxed 60% floor since Phase 3 — Phase 10's report recorded the
same. Closing it would mean writing tests for `staff/lib/leave.ts` (3.57%),
`payments/lib/reconcile.ts` (10%), `payments/lib/queries.ts` (25%),
`settings/lib/overrides.ts` (0%), `tenant-management/lib/queries.ts` (0%),
`worker/main.ts` (0%) and the other lib modules whose writes no page exercises
directly. Those tests would exist to move a number, and the instruction for this
phase named that as the thing not to do: *"If a coverage target cannot be met
without such a test, report it as a gap rather than writing the test."*

**What was done instead:** the tests named by definitions of done — the four
buckets, the six settings tabs, the license key, tenant provisioning, the public
reads and the four scenarios. `public-site/lib/reads.ts` went from 11% to
**100% lines**, and `settings/lib/write.ts` is at 100.

**The gate is now enforced.** Phase 10's report noted that the floor had never
blocked anything, because `npm run verify` does not run coverage. The floor is
restored in `vitest.config.ts` and `npm run test:coverage` fails loudly on it.
That is the honest state: the floor exists, it blocks, and the code is below it.
`npm run verify` remains the green gate; coverage is the red one, reported as such.

### `npm audit` — 4 high advisories, all transitive through Prisma

```
@prisma/client@7.10.0 → prisma@7.10.0 → mysql2@3.15.3   (2 high)
@prisma/client@7.10.0 → prisma@7.10.0 → @prisma/config → deepmerge-ts  (1 high)
```

`mysql2 <=3.23.0` carries an auth-plugin downgrade and an unbounded zlib inflate;
`deepmerge-ts <8.0.0` a stack exhaustion on recursive object graphs. Neither is a
dependency this product uses — the runtime connects through `better-sqlite3` and
`pg` — but `prisma` is a transitive of the runtime `@prisma/client`, so `--omit=dev`
does not exclude them, and DoD 10 is not met.

**Why it was not fixed.** npm's only offered remedy is `prisma@6.19.3`, a breaking
major downgrade of the ORM the whole data layer is built on, and the phase's own
rule — do not break the build at the end of a hardening pass — weighs against
guessing at an override for a connector the product never loads. **Reported as a
finding, not papered over.**

---

## 5. The gates that stayed unobserved

Two gates could not be observed in this environment. Both were attempted three
times, both stopped at three, and neither was worked around.

### 1. The accessibility and responsive pass — axe on all 37 pages

```
npx playwright install chromium
→ 403 AccessDenied: "this service is not available in your location"
   https://cdn.playwright.dev/builds/cft/153.0.8010.12/win64/chrome-win64.zip
```

Three attempts, three identical 403s. The CDN is unreachable from this location, so
the pinned Chromium never lands and no Playwright suite can run. **The axe and
responsive pass is recorded as unobserved** — it has been unobserved for ten
phases and it is still unobserved, because the alternative was a claim with no
browser behind it.

What *is* verified without a browser: the two login pages' source is asserted in
`e2e/login.spec.ts`, and `check:i18n` scans every committed file for Latin digits,
Gregorian dates and missing catalog keys.

### 2. The cross-tenant suite on PostgreSQL

No live PostgreSQL exists here. Ports 5432/5433 are closed on `127.0.0.1`,
`localhost` and `::1`; there is no `psql`, `postgres` or `pg_ctl` on the PATH; and
the Docker daemon is installed but not running — and the instruction for this
phase forbade starting a container, so it stayed down. Three attempts, then stop.

**The isolation suite itself exists and passes — on SQLite, where the tenant
extension is the only enforcement.** The 24 tenant-scoped tables' RLS policies are
checked by `npm run check:rls` against the committed PostgreSQL migrations, but
running them against a live engine is the assertion that is missing, and it is the
one §12's gate 9 names.

### 3. The clean-machine install

The machine is not clean — `node_modules` is already installed — so a true
clean-machine verification was not possible. What **was** performed, into a scratch
database:

```
npm run db:migrate    → All migrations applied
npm run db:seed       → Seeded 2 tenants: 10 users with 10 memberships, and 16 customers
                       aria — 1 MANAGER, 2 DOCTOR, 2 SECRETARY · 8 customers
                       parsian — 1 MANAGER, 2 DOCTOR, 2 SECRETARY · 8 customers
                       Isolation fixture: 09121111111 is a staff mobile in both tenants
npm run worker        → structured JSON logs, health on :3100, 6 job kinds, polled 2 tenants
npm run dev           → Ready in 1119ms
GET /login            → <html lang="fa" dir="rtl" class="vazirmatn…">
```

The login page is Persian, right-to-left, in the self-hosted Vazirmatn, with
**zero external `src` or `href` fetches** — the page renders with the network
disconnected, which is `installation.md` §10's last criterion. The worker's health
endpoint answers `degraded` on a fresh seed, which is the documented state for a
process that has polled but not yet claimed a job.

---

## 6. The release

**1.0.0.** `package.json` bumped, the tag created, and the changelog's first entry
written to `docs/changelog/README.md` — in the format the changelog itself
prescribes: Persian-first, grouped by what a clinic notices, with the upgrade
notes and a `Security` entry for the tenancy and consent changes.

The seed dataset (`prisma/seed.ts`) was verified by running it: two tenants, the
shared-mobile isolation fixture, every role, customers across the audience groups,
and Persian names throughout.

---

## 7. What Phase 12 should inherit

1. **A browser.** The axe and responsive pass is the oldest unobserved gate in the
   project, and it is the only one that needs an environment change rather than
   code.
2. **A PostgreSQL instance.** The cross-tenant suite and the four scenarios are
   written and green on SQLite; both are written to run against PostgreSQL and
   neither has.
3. **The coverage floor.** The modules below 95% are named in §4. `leave.ts`,
   `reconcile.ts` and the two `queries.ts` files are the ones whose absence the
   floor measures.
4. **The Prisma transit advisories.** Either `prisma@8` closes them or an override
   is validated; the breaking downgrade was out of scope here.

---

*Related: `docs/roadmap/progress.md` (the phase ledger), `docs/changelog/README.md`
(the release the phase cut), `10-testing-strategy.md` §11–§12 (the floors and the
gates).*
