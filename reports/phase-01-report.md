# Phase 01 Report — Platform Foundation

**Status: open. This is not a closing report.**

Phase 1 has not closed. `../roadmap/progress.md` records it as *In progress*, and
this report is written mid-phase because the work session that started it could
not finish it, and could not run a single check. What follows is an honest
account of what now exists, what was verified and — the longer list — what was
not.

A phase that is finished but has no report is not finished. A phase that is
**not** finished and has no report is worse: the next session inherits a working
tree it cannot interpret. That is the gap this document closes.

---

## 1. Phase

**Phase 1 — Platform foundation.**

Goal, from `../roadmap/phases.md`: build the foundation every later phase stands
on — the project skeleton, the design tokens, the localization layer, the
database schema, tenant isolation, authentication, the permission primitive, the
React Query configuration, and the background worker process — **shipping no
feature page**.

---

## 2. What was produced

Roughly a hundred and twenty files, grouped into the eight areas below. The
deliberately incomplete ninth area is §2.9, which is the most important section
in this report.

### 2.1 The repository skeleton and its tooling

`package.json` with **every dependency pinned to an exact version — no `^`, no
`~`** — plus `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`,
`.prettierrc`, `.prettierignore`, `vitest.config.ts`, `vitest.setup.ts`,
`playwright.config.ts`, `next.config.mjs`, `prisma.config.ts` and `.nvmrc`.

The TypeScript configuration is **strict with the flags that matter for this
product** rather than the default strict set: `noUncheckedIndexedAccess` (an
array index is `T | undefined`, which is what a Jalali month grid actually is),
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
`noUnusedParameters`, `noImplicitReturns`, `useUnknownInCatchVariables` and
`verbatimModuleSyntax`. The single path alias is `@/* → ./src/*`.

**The lint configuration is where the architecture is enforced rather than
described.** `eslint.config.mjs` defines named restriction groups — `BARREL_ONLY`,
`CORE_STAYS_BELOW_MODULES`, `DATE_LIBRARY_IS_BEHIND_THE_BRIDGE`,
`HEADLESS_PRIMITIVES_ARE_BEHIND_THE_WRAPPER`, `LUCIDE_IS_BEHIND_THE_WRAPPER`,
`NO_COMPONENT_LIBRARY` — and applies them per-file-scope, with the comment that
"for any one file the **last** of these to match sets `no-restricted-imports`, so
the narrowest scope has to come last". `max-lines: 1000` is a lint rule, not a
convention: a file that crosses it fails lint rather than failing review.

Two rules are worth naming because they are the ones that keep the product
Persian:

- **`NO_PERSIAN_LITERAL`** — a Persian string literal, template element or JSX
  text in a render file is a lint error. The catalog is the only place Persian
  lives. (Comments are not AST nodes, so Persian in a comment is safe, and the
  rule says so.)
- **`NO_INLINE_LOCALIZATION`** — `new Intl`, `Intl.*` and `toLocale*` are banned
  outside the bridge. This is ADR-0010 made executable: a date must not depend on
  the ICU data of whichever machine is rendering it.

**There is no Tailwind.** The design system is a token block plus CSS Modules.
This was a decision, not an omission — `08-ui-design-system.md` supplies a
complete CSS-variable token set and forbids the Tailwind default palette, so
adopting Tailwind would mean adopting a framework whose defaults are the exact
thing the design system exists to prevent. It is disclosed in §6.

`eslint.config.mjs` is 486 lines — the largest file in the repository, and under
half the limit.

### 2.2 The design system, as tokens

`src/app/globals.css` carries the `:root` block from
`docs/knowledge/08-ui-design-system.md` §46 **value for value**, plus the derived
dark-mode re-declaration, in the canonical lowercase hex form the knowledge layer
records as authoritative. No colour, radius, shadow or spacing value was invented.

Every component is a CSS Module that consumes `var(--token)` and never a hex
literal. The enforcement is not only lint: the component tests assert against the
stylesheet text — for example

```ts
expect(CSS).toMatch(/\.control::placeholder\s*\{[^}]*color: var\(--ink-3\)/)
```

which is a way of pinning "this control uses the token" that survives a
refactor, and which fails if someone replaces the variable with the literal.

`src/app/layout.tsx` sets `dir="rtl"` and `lang="fa"` **once, at the document
root, and nowhere else**, so no component ever has to ask which direction it is
rendering in.

### 2.3 The localization layer

Eighteen files under `src/core/localization/`, covering every item Phase 1's step
3 named:

| Concern | File | What it does |
|---|---|---|
| Digits | `digits.ts` | Persian ↔ Latin, both directions |
| Jalali conversion | `jalali.ts` | `jalaliParts`, `fromJalaliParts`, `asLocalDate`, `isValidLocalDate`, leap years, month lengths |
| Jalali arithmetic | `jalali.ts` | `addLocalDays`, `addLocalMonths`, `diffLocalDays`, `compareLocalDates`, `todayLocalDate` |
| Month grids and weeks | `calendar.ts` | `jalaliMonthGrid`, `jalaliMonthWindow`, `jalaliWeek`, `weekColumnOf`, `JALALI_WEEK_START = 6` |
| Formatting | `format.ts` | `formatNumber`, `formatPercent`, `formatMoney`, `formatDate`, `formatTime`, `formatDateTime`, `formatPhone`, `isolateLtr` |
| Normalization | `normalize.ts` | ZWNJ, Arabic Yeh, Arabic Kaf, Arabic-Indic digits, for search and comparison |
| Templates | `message.ts` | `{name}` placeholders; a placeholder with no value throws a `ValidationError` naming it in the log while the user sees the catalog message |
| Copy | `catalog/` | Every label, in `common.ts` and `enums.ts`, plus `CoreMessageKey` and `VALIDATION_MESSAGES` |

Two positions are worth recording.

**The Jalali calendar owns its display layer.** ADR-0022 adopted `date-fns-jalali`
for calendar arithmetic; ADR-0010's original position was that the conversion be
computed in-house with no library. The reconciled position — recorded as a
supersession rather than a silent change — is that the *arithmetic* may be a
library but the *display* must not be, because `Intl`'s output depends on the
runtime's ICU data and differs between a developer's machine, the SaaS host and a
clinic's on-premise server. A date rendering one Jalali day wrong is the failure
this product cannot afford.

**`formatMoney` prints Persian digits and `٬`** (U+066C, the Arabic thousands
separator) and never a Latin comma, because a Latin separator in a RTL Persian
sentence renders as a bidi hazard rather than a number.

The layer targets **100% coverage** — lines, branches, functions, statements —
enforced by a per-directory threshold in `vitest.config.ts`, because every branch
in it is a correctness rule rather than a formatting preference.

### 2.4 The database schema

`prisma/schema.prisma` — **one schema file, 25 models**, portable across SQLite
and PostgreSQL. `03-data-model.md` §3.1's money rule is implemented: money is
`BigInt` in Rial, serialising as a string across JSON boundaries. There is **no
balance column** (immutable rule 8) and **no `debts` table** (ADR-0013), so
"debt deletion does not exist" is structural rather than promised — there is
nothing to delete.

Two portability decisions are load-bearing:

- **`provider` is a string literal, resolved through `prisma.config.ts`.** In
  Prisma 7 the datasource URL, the direct URL and the shadow database URL have all
  moved out of the schema file, and `env()` inside `provider` is rejected. The
  schema therefore declares `provider = "postgresql"` as a literal while
  `prisma.config.ts` supplies the connection — the mechanism documented in
  `setup/database-migration.md` §1.
- **No `enum` blocks.** A PostgreSQL enum has no SQLite equivalent, so every
  closed set lives in `src/core/constants/enums.ts` as a frozen `as const` object
  with a derived union type, and the column is a `String`. That is what makes the
  same schema file valid for both providers.

`tenantId` and `clinicId` are present on every tenant-scoped table, and the
indexes follow `03-data-model.md` with `tenantId` leading every composite.

### 2.5 Tenant isolation — the engine half

Three pieces were built:

**`prisma/migrations-pg/0001_tenant_isolation.sql`** (~290 lines) — RLS for
**24 tables**: `tenants` itself plus 23 tenant-scoped tables, grouped Clinic
structure, People and access, Customers, Appointments and services, Treatment
cycles and the ledger, Campaigns and messaging, and background work. Each table
gets `ENABLE` **and** `FORCE ROW LEVEL SECURITY`, and a policy with both `USING`
and `WITH CHECK`, against `current_setting('app.tenant_id', true)`. The file
documents and implements the three details that are each a correctness issue:

- **`FORCE`, not merely `ENABLE`** — a table's owner bypasses policies by default
  and the application connects as the owner;
- **`current_setting(..., true)`, not `SET LOCAL`** — `SET LOCAL` cannot take a
  bind parameter, so using it would mean interpolating the tenant id into SQL text
  and reintroducing the injection surface the design removes. The equivalent
  `set_config('app.tenant_id', $1, true)` is what the application will call, and
  its third argument `true` scopes the setting to the transaction, which is what
  makes it correct under connection pooling;
- **fail closed** — the setting is unset-most returns NULL, and `tenantId = NULL`
  is never true, so a query with no tenant context returns **zero rows**, never
  every row.

The file is **idempotent by design** (`DROP POLICY IF EXISTS` before each
`CREATE`), because `setup/database-migration.md` §7 requires the policies to be
re-applied after a `pg_restore`, which does not carry them.

**`scripts/check-rls-coverage.mjs`** — the CI check §4 names. It reads the models
out of `schema.prisma`, finds every model with a `tenantId` field, and asserts
that each has a policy carrying `ENABLE`, `FORCE`, `current_setting(..., true)`
and `WITH CHECK` — with the `tenants` policy additionally constrained on `"id"`.
It also checks the reverse direction: a policy for a table the schema does not
declare is a finding. It **fails closed** on a missing schema, no models, no
`migrations-pg/`, or no `.sql` files. This check exists because of a quiet
failure: the test suite runs on SQLite, which has no RLS, so a missing policy is
invisible to every other gate.

**`scripts/db-migrate-pg.mjs`** — `npm run db:migrate:pg`. It refuses a missing
URL, a non-PostgreSQL URL, a missing Prisma CLI, a missing `migrations-pg/` and an
empty file list; runs `prisma migrate deploy`; then applies each `.sql` through
`pg` in sorted order. Each file carries its own `BEGIN`/`COMMIT`, so the runner
does not wrap them in a second transaction.

### 2.6 The permission primitive

`src/modules/roles-permissions/`, built around `04-roles-permissions.md` §2:

- **16 permissions × 3 roles**, with §2.1's counts: `MANAGER` 16 (the locked
  column), `DOCTOR` 3, `SECRETARY` 12.
- **`effective(user) = (roleDefault(role) ∪ granted(user)) \ revoked(user)`** —
  the subtraction is last, so a permission both granted and revoked is **gone**.
  The matrix suite pins this precedence explicitly, because a `Set` built by
  adding grants after deleting revocations gives the opposite answer, and the two
  differ only on a row a UI should never write.
- **The manager column is locked** (`lib/manager-lock.ts`) and **self-escalation
  is prevented** (`lib/self-edit.ts`) — immutable rule 9, enforced server-side
  rather than by hiding a control.
- **The 8 toggles** (`lib/toggles.ts`) with the demo's rendered defaults:
  روشن on 1, 3, 4 and 8; خاموش on 2, 5, 6 and 7.

**The 96-case matrix is `tests/matrix.test.ts`.** Its arithmetic is
`16 × 3 × 2 = 96`: 48 `(role, permission)` pairs read two ways, through
`can(ctx, permission)` — what a module function actually branches on — and
through `effectivePermissions(role, overrides).includes(permission)` — what the
staff screen renders and counts.

The file's most important design decision is that **the expected marks are typed
out as literal slugs rather than computed from `ROLE_DEFAULTS`**. Computing them
"would assert that a value equals itself, and it would pass just as green if
`ROLE_DEFAULTS` were wrong in every cell." The literals are transcribed from §2's
مدیر / پزشک / منشی columns, which use a different representation from
`ROLE_DEFAULTS` (which writes `DOCTOR` as three *positions* of `PERMISSIONS`), so
the two agree only if the positions are right — and a separate test pins those
positions to §2.1's own numbering (1, 5 and 10 for the doctor).

`ROLE_DEFAULTS` is frozen at both levels, the record and each list, because every
authorisation decision in the product derives from it and it is shared module
state.

### 2.7 React Query

`src/core/query/` — six source files and five test files.

**`keys.ts`** is the interesting one. `05-conventions.md` §16.2 requires that
"every key is built by a helper in `src/core/query/keys.ts`. **No hook writes a
key array by hand**", with `tenantId` second, after a literal `'t'`. Making
`tenantId` a **branded** `TenantId` rather than a `string` changes the shape of
the mistake: a hook that forgets the tenant does not produce a subtly different
key, it fails to compile. `canonicalFilters` sorts and percent-encodes the filter
name and value, and the encoding is not cosmetic — a test asserts that
`{ a: '1&b=2' }` and `{ a: '1', b: '2' }` do not produce the same key, which they
did before the encoding was added. Two different queries sharing one cache entry
is a correctness bug, not a cache miss.

**`client.ts`** carries tenant-aware defaults with a deliberate asymmetry: reads
retry three times, **mutations never retry**. The reason is immutable rule 7 — a
re-sent payment cannot be corrected by deletion, because deletion does not exist.
A 4xx-shaped `AppError` is never retried on either path.

**`provider.tsx`** replaces the `QueryClient` **when the tenant changes**, during
render rather than in an effect. Both choices are load-bearing and both are
documented with their failure modes: an effect runs after the frame that would
already have shown the previous tenant's cache, and clearing the old client would
leave a response in flight with nothing to land in. The tenant id comes from a
context and `useQueryTenantId()` **throws** outside a provider rather than
falling back — a fallback would build a key whose second element is a placeholder,
which is exactly the cross-tenant cache collision the key builder exists to
prevent, through the one door it cannot see.

**`invalidate.ts`** implements §16.3's five-row table as five pure functions
returning key lists, plus an applier. The tests assert mostly what a change must
**not** touch, because that is where the table is specific: editing a campaign
filter returns **one** key and not the campaign (returning it would discard the
draft the user is editing), and a service price change **never** reaches
`payments` or `debts` — `Appointment.priceAtBooking` is a snapshot, so a price
change must not invalidate a historical payment.

**`optimistic.ts`** maps §16.4's five conditions to code and is tested on both
paths, as §16.4 demands: success replaces the guess with the server's answer, and
failure restores the exact snapshot **and then invalidates**, because restoration
alone is not enough when another actor may have changed the rows while the
mutation was in flight.

### 2.8 The components built

Only what Phase 1 needs to prove the primitives, and every one built from the
design system rather than from a component library:

- **`Button`** — variants, sizes, loading and disabled states, CSS Module.
- **The Persian form shell** — `Form` (React Hook Form + Zod), `Field`,
  `TextInput`, `TextArea`, `SubmitButton`, `FormError`, and `field-context.ts`.
  Error messages come from `VALIDATION_MESSAGES` in the catalog; the field's
  accessible description is wired, so the shell is axe-ready rather than merely
  unstyled.
- **`Icon`** — a wrapper over Lucide, with `icons.ts` as the named set. Lucide is
  `lucide-react` 1.49.0 and **its stroke width is set to 1.7 by the wrapper**;
  the design system's value is preserved rather than accepted from the library's
  default of 2. (`LUCIDE_IS_BEHIND_THE_WRAPPER` makes this structural: no file
  outside the wrapper may import `lucide-react`.)
- **`lib/cx.ts`** — the class-name joiner, with the `string | undefined` handling
  CSS Modules require.

### 2.9 What was **not** produced

This is the section the next session needs most. Each item is also in §4 with its
reason and its cost.

- **The Vazirmatn font files.** `layout.tsx` loads five `.woff2` files from
  `src/app/fonts/`, and **that directory does not exist**. There is no
  `.woff2`, `.woff`, `.ttf` or `.otf` anywhere in the project outside
  `node_modules`. The consequence is not cosmetic: `next/font/local` fails the
  build when a declared file is missing, so **the application does not currently
  build**, and DoD items 1 and 4 both fail.
- **The module override registry.** `phases.md` names it as a Phase 1 deliverable
  with its own DoD item (11): the static registry, `resolveModule()`, the typed
  contract, the Zod declaration schema, the settings-row declaration field, the
  fail-closed behaviour, and a test-only fixture. None of it exists — there is no
  `src/modules/registry/`, and a search for `resolveModule` across the repository
  returns nothing. `scripts/check-overrides.mjs` is written and its header states
  that "the mechanism itself is exercised by the test-only fixture under
  `src/modules/registry/tests/`" — **that fixture does not exist either**, so the
  check passes by finding nothing and its rules are unexercised.
- **`src/core/db/`** — the Prisma singleton, the tenant-injecting extension,
  `getTenantContext()`, `set_config` at the head of every transaction, and the
  production-boot refusal. This is §2.5's application half.
- **`auth`** — mobile + one-time code, HttpOnly session cookie, rotation on login.
- **`src/worker/`** — the separate process. `package.json` has a `worker` script
  pointing at `src/worker/main.ts`, which does not exist.
- **SQLite migrations** — there is no `prisma/migrations/` list at all.
- **`prisma/seed.ts`** — referenced by both `db:seed` and the `migrations.seed`
  field in `prisma.config.ts`; the file does not exist.
- **`src/modules/registry/`**, **`src/app/page.tsx`**, and the Radix wrappers
  (`dialog`, `popover`, `tooltip`, `dropdown-menu`) — three of the six Radix
  packages are installed and unused; the other three are not installed.
- **`e2e/`** — `playwright.config.ts` exists and points at `./e2e`, and the
  directory does not exist, so the e2e suite is configured but empty.

---

## 3. What was verified

**Almost nothing, and that is the headline.** No check script, no test runner, no
type checker, no linter, no formatter and no Prisma command was executed in this
work session. `node` could not be invoked at all, and `git` reports the directory
as not a repository.

So the honest form of this section is a table of **what the code says** — each
claim with the method by which it was read — followed by an explicit list of what
only execution can establish.

### 3.1 What was established by reading

| Claim | Method | Result |
|---|---|---|
| The repository contains no `TODO`, `FIXME`, `XXX`, `HACK`, `TBD` or "coming soon" | A repository-wide case-insensitive content search, excluding the demo | **Zero hits in code or documents.** Every match was prose about the rule itself, or the unrelated word "placeholder" (message templates, CSS `::placeholder`) |
| The permission matrix is 96 cases | Read `tests/matrix.test.ts`: two `it.each(PAIRS)` blocks over `PAIRS = ROLES.flatMap(…)`, `3 × 16 = 48` pairs, `48 × 2 = 96` | **96** ✓ |
| The roles hold 16, 3 and 12 permissions | Read §2.1's counts in the matrix test's own assertions, transcribed from `04-roles-permissions.md` §2 | ✓ |
| The RLS migration covers every tenant-scoped table | Read the migration's 24 `CREATE POLICY` statements and compared the table list against `schema.prisma`'s 25 models | **24 policies for 24 tables**; `license_keys` is the only model without one, and the migration states why |
| Every policy is forced *and* enabled, and both open and closed | Read each policy: `ENABLE` + `FORCE`, `USING` + `WITH CHECK`, `current_setting('app.tenant_id', true)` | ✓ |
| The schema has no `enum` blocks and no `env()` in `provider` | Read `schema.prisma`; listed every `model` and `enum` | **25 models, 0 enums** ✓ |
| The schema contains no balance column | Read the `Appointment` and `Customer` models | ✓ |
| No second schema file exists | A repository-wide listing | One `.prisma` file ✓ |
| Every dependency is pinned | Read `package.json` | No `^`, no `~` ✓ |
| No styled component library is present | Read `package.json` for `tailwindcss`, `@mui/*`, `@chakra-ui/*`, `antd`, `bootstrap`, `styled-components`, `@emotion/*` | **None** ✓ |
| No font files are committed | A repository-wide glob for `*.woff`, `*.woff2`, `*.ttf`, `*.otf` | **Only `node_modules` hits** — see §2.9 |
| The design tokens are used by variable, not by literal | Read the component stylesheets and the assertions in `tests/Form.test.tsx` that match `var(--ink-3)` against the CSS text | ✓ |
| The localization layer exposes the eight concerns §2.3 lists | Read `src/core/localization/index.ts` and each module's exported surface | ✓ |

### 3.2 What was **not** verified

Every item here is a claim the phase makes that **no one has tested**. They are
listed together because the distinction between "this was read and looks right"
and "this ran and passed" is the entire value of this section.

| Not verified | What would verify it |
|---|---|
| That the code compiles | `npm run typecheck` |
| That the code satisfies its own lint rules — including the Persian-literal ban, the barrel rule and `max-lines` | `npm run lint` |
| That any test passes, including the 96-case matrix | `npm run test` |
| That the localization layer reaches 100% coverage, and that the global 80% gate holds | `npm run test:coverage` |
| That `schema.prisma` is valid for SQLite **and** for PostgreSQL | `npm run check:schema`, `prisma validate`, `prisma format` |
| That the RLS migration applies to a real PostgreSQL and that a query with no tenant context returns zero rows | `npm run db:migrate:pg`, then the cross-tenant suite |
| That the check scripts themselves run — `check:files`, `check:i18n`, `check:overrides`, `check:rls` | `npm run verify` |
| That no file exceeds 1000 lines | `npm run check:files` |
| That the application builds or renders | `npm run build`, `npm run dev` |
| That any Persian text renders RTL in Vazirmatn | A running page; blocked further by the missing font files |
| That the formatting matches Prettier | `npm run format:check` |
| Anything about authentication, the worker, or tenant isolation at runtime | Those code paths do not exist yet |

**One structural caveat on the 96-case matrix.** It is 96 cases *by
construction* — the arithmetic is visible in the file and was read. That is not
the same as 96 passing tests, and this report does not claim it is. Phase 1's
rule was that the matrix must be **green** before any feature work begins; it has
never been run, so that gate has **not** been satisfied.

---

## 4. What was deferred, and why

Two kinds of item are in this table, and the distinction matters: things blocked
by the environment, which are not decisions, and things chosen, which are.

### 4.1 Blocked by the environment

The work session had no working package manager or task runner. `npm` could not
install or resolve, so `prisma generate` could not run, so the generated Prisma
client does not exist in the working tree. Every item below needs that client's
types, a live database, or a test run.

| Blocked | Why it could not be done | Cost of not having it |
|---|---|---|
| `src/core/db/`, the tenant-injecting extension, `getTenantContext()` | Imports `@/generated/prisma`, which does not exist. Writing it would break `tsc --noEmit` for the whole repository | The isolation design is unproven at the application layer. §2.5's SQL is the second layer; the first layer does not exist yet |
| `auth` | Needs the database and the generated client | DoD 9 unmet |
| `src/worker/` | Needs the generated client and a job table to claim from | DoD 12 unmet — and Phase 1's rule is explicit that a worker added later is a worker whose tenancy rules were designed as an afterthought |
| The SQLite migration list | `prisma migrate dev` needs a generated client and a resolvable CLI | DoD 1 — "clone/install/run locally with SQLite in under 10 minutes" — cannot be met without it |
| `prisma/seed.ts` | The client's import path cannot be verified without generating it | Both `db:seed` and `migrations.seed` dangle |
| The cross-tenant isolation suite | Needs a PostgreSQL server and the driver adapters installed | DoD 7 and 8 unmet |
| Every check script and every test | Need a working `node_modules` | **DoD 14, 16, 17 and 18 are unprovable**, and the 96-test gate is unsatisfied |
| Committing the work | `git` reports the directory as not a repository | The phase has no commit, so `progress.md`'s rule — "update this file in the same commit that completes the work" — cannot be followed, and §5's count cannot be checked against `git show --stat` |

### 4.2 Chosen deferrals

| Deferred | Why | Picked up by | What it costs |
|---|---|---|---|
| **The Vazirmatn font files** | They are a **licence-bearing asset** that must come from the product owner, not be fetched. `07-localization.md` §2 requires the font be self-hosted so an on-premise install renders with no internet — which means the files must be committed, and they are not. Fetching them from a CDN at build time would violate the requirement they exist to satisfy | **Immediately** — see §7 | The application does not build. This is the largest single gap in the phase |
| **The module override registry** | The mechanism is fully specified (`02-architecture.md` §13, `05-conventions.md` §15, ADR-0019), the CI check for it is written, and `phases.md` schedules it for Phase 1 with its own DoD item — but no part of the registry itself was built. Building it needs a module to override, and the only module that exists is `roles-permissions`, which has no `overrides/` folder | Phase 2, or the front of Phase 3 | Phase 1's DoD 11 cannot be met, and `check:overrides` passes vacuously — its rules are written but unexercised, so the check that will guard the first real override is itself untested |
| **The Jalali date picker and the cmdk searchable select** | Both were specified for step 3. Their **pure logic already exists and is covered** — `jalaliMonthGrid`, `jalaliMonthWindow`, `MONTH_NAMES`, `WEEKDAY_NAMES`, `normalizeForSearch`. What is missing is the React shell around it, which is the part that needs a running browser to be worth writing | Phase 2, with the first screen that needs a date | A date input is needed by the first appointment form; building it now, blind and unverified, was judged worse than building it against a running page |
| **The Radix wrappers** | Only three of the six primitives are installed (`dropdown-menu`, `popover`, `tooltip`); `dialog`, `select` and `tabs` are not | The phase that first needs each | None yet. The rule is "only what is used", so an unused wrapper is worse than an absent one |
| **`e2e/` specs** | `playwright.config.ts` is written and correct; there is no page to drive, because `src/app/` has a layout and no `page.tsx` | Phase 2 | The accessibility and responsive obligations are configured but not enforced |
| **The dark theme** | The design system has no dark mode (`08-ui-design-system.md` §1). A derived dark block exists in `globals.css` and `playwright.config.ts` pins `colorScheme: 'light'` so the suite never accidentally exercises it | **Undecided** — see OQ-4 | A theme nobody asked for is present in the stylesheet. It is inert, but it is surface that has to be maintained or removed |

---

## 5. Files created and modified

**127 files can be attributed to Phase 1.** Phase 0's 35 are unchanged in the
tree.

> **Method and its limitation.** `reports/README.md` requires the count to be
> checked against `git show --stat`. **`git` is unavailable in this session** —
> the environment reports the directory as not a repository — so the count comes
> from a working-tree enumeration (a repository-wide content search, which
> excludes git-ignored paths such as `node_modules`), and the split between
> *created* and *modified* is inferred from which files Phase 0's own report
> lists. It is therefore a **count of what is present**, not of what changed.
>
> Two further caveats, stated rather than smoothed over:
>
> - The enumeration found **160 project files** in total (203 minus the demo's 41
>   files and the 2 source documents). 35 (Phase 0) + 127 (Phase 1) = 162, so
>   **two files are unattributed.** One is almost certainly `.env.example`, which
>   Phase 0's report lists but which this session could neither read (a permission
>   rule denies `.env.*`) nor list. Resolving the other requires git history.
> - **`.gitignore` was modified** and is counted below among the root files even
>   though Phase 0 created it.

### `src/` — 83 files

**59 source files and 24 test files.**

| Group | Files |
|---|---|
| `src/app/` | `layout.tsx`, `globals.css`, `catalog.ts`, `theme.ts` — 4 |
| `src/core/components/button/` | `Button.tsx`, `Button.module.css`, `index.ts`, `tests/Button.test.tsx` — 4 |
| `src/core/components/form/` | `Form.tsx`, `Field.tsx`, `TextInput.tsx`, `TextArea.tsx`, `SubmitButton.tsx`, `FormError.tsx`, `field-context.ts`, `Form.module.css`, `index.ts`, `tests/Form.test.tsx` — 10 |
| `src/core/components/icons/` | `Icon.tsx`, `icons.ts`, `Icon.module.css`, `index.ts`, `tests/Icon.test.tsx` — 5 |
| `src/core/config/` | `env.ts`, `datasource.ts`, `index.ts`, `tests/env.test.ts` — 4 |
| `src/core/constants/` | `enums.ts`, `modules.ts`, `numbers.ts`, `index.ts` — 4 |
| `src/core/lib/` | `cx.ts`, `index.ts`, `tests/cx.test.ts` — 3 |
| `src/core/localization/` | `digits.ts`, `jalali.ts`, `calendar.ts`, `format.ts`, `normalize.ts`, `message.ts`, `types.ts`, `index.ts`, `catalog/{common,enums,index}.ts`, and 7 test files — 18 |
| `src/core/query/` | `keys.ts`, `client.ts`, `provider.tsx`, `invalidate.ts`, `optimistic.ts`, `index.ts`, and 5 test files — 11 |
| `src/core/tenant/` | `types.ts`, `lib/overrides.ts`, `index.ts`, `tests/overrides.test.ts` — 4 |
| `src/core/types/` | `brand.ts`, `errors.ts`, `index.ts`, `tests/brand.test.ts`, `tests/errors.test.ts` — 5 |
| `src/modules/roles-permissions/` | `catalog.ts`, `index.ts`, `types/index.ts`, `lib/{matrix,toggles,manager-lock,self-edit}.ts`, `tests/{matrix,toggles,manager-lock,escalation}.test.ts` — 11 |

### `scripts/` — 7 files

`check-file-length.mjs`, `check-i18n.mjs`, `check-overrides.mjs`,
`check-schema-portability.mjs`, `check-rls-coverage.mjs`, `db-provider.mjs`,
`db-migrate-pg.mjs`.

Each follows the same house style: a shebang, a long doc-comment header citing
the documents that require it, `/* ── Section ── */` dividers, and a
`Name: summary` line on success. **None of them has ever been executed.**

### `prisma/` — 2 files

`schema.prisma` (25 models), `migrations-pg/0001_tenant_isolation.sql` (24
tables).

### Repository root — 12 new files, 1 modified

New: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.mjs`,
`eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`,
`playwright.config.ts`, `prisma.config.ts`, `.prettierrc`, `.prettierignore`,
`.nvmrc`.

Modified: `.gitignore` — two negations added. The pre-existing `*.sql` under
"Local dumps" would have **silently discarded every migration file**, because
`prisma/migrations/**/migration.sql` matches it. The loss would not have been
visible: the files would simply never have appeared in a commit.

### `docs/roadmap/adr/` — 22 files

Phase 0 kept its 22 decisions in one `decisions.md`. That file is now an index
over 22 individual ADR files, `0001`–`0022`. Four were added in this phase's
documentation work: **0019** (the module override mechanism), **0020** (TanStack
Query alongside Server Components), **0021** (headless primitives only, no styled
component library) and **0022** (`date-fns-jalali` for arithmetic, display layer
owned in-house).

### `.claude/` — 1 new file

`settings.local.json`.

### Modified Phase 0 documents

`docs/roadmap/progress.md` (status and this phase's record),
`docs/knowledge/02-architecture.md` and `docs/knowledge/05-conventions.md` (§13
and §15, the override mechanism), `docs/knowledge/01-tech-stack.md` and
`docs/knowledge/07-localization.md` (the UI and data libraries).

---

## 6. Open questions for the human

Ten. Two are carried from Phase 0; the rest are new, and several are the kind
that quietly become wrong assumptions if they are not asked.

### OQ-1 — Does the public site have six pages or eight? *(carried from Phase 0)*

Unchanged, and unchanged in urgency: it affects Phase 8 only. ADR-0017 assumes
eight, because the demo implements eight and the demo has been the correct
tiebreaker twice.

### OQ-2 — Are the four remaining specification tables damaged? *(carried from Phase 0, half closed)*

The two tables that prompted this — the permission matrix and the behavioral
toggles — are recovered and now **enforced in code**, with the 96-case matrix
transcribing §2 independently of the implementation. The other half is open: the
campaign type table, the audience group table, the automatic message table and
the acquisition source table have **still not been re-checked against the demo**.
Both prior incidents produced answers that were wrong *plausibly*. Resolve before
Phase 6 and Phase 7.

### OQ-3 — Is a recomputable charge/payment total acceptable, given rule 8? *(carried from Phase 0)*

Unchanged. ADR-0014 stays *provisional*.

### OQ-4 — Is the dark theme wanted, or should it be removed?

**What prompted it.** The design system has **no dark mode** — §1 of
`08-ui-design-system.md` says so. A derived dark block nonetheless exists in
`src/app/globals.css`, and `playwright.config.ts` pins `colorScheme: 'light'` so
the suite never exercises it.

**What was assumed.** That it is inert and therefore harmless.

**Why that may be wrong.** It is unrequested surface in the stylesheet, it is
unreachable, and no test covers it — which means it will drift from the tokens it
mirrors and nobody will notice. Removing it is a one-file change now and a
regression hunt later.

**Affects:** Phase 2, if the answer is "remove it".

### OQ-5 — Where do the Vazirmatn font files come from, and may they be redistributed?

**What prompted it.** `layout.tsx` declares five `.woff2` files under
`src/app/fonts/` and none of them exists, so the build fails. The requirement is
that the font be **self-hosted and committed** (`07-localization.md` §2), which
cannot be satisfied by a build-time download.

**What was assumed.** Nothing — the files were not fabricated and no substitute
was substituted.

**What is needed.** The five weights (400/500/600/700/800) as `.woff2`, plus
confirmation of the licence that permits committing them to a repository that
ships to clinics.

**Affects:** Phase 1's closure. Nothing renders until this is answered.

### OQ-6 — Is the module override registry deferred, or does Phase 1 not close without it?

**What prompted it.** `phases.md` schedules it in Phase 1 with its own DoD item,
and `check-overrides.mjs` already names the test-only fixture that is supposed to
exercise it. Neither the registry nor the fixture exists.

**What was assumed.** That Phase 1 should be reported as open rather than closing
with an unmet DoD item.

**Affects:** Phase 1's closure, and Phase 3/10, which schedule the override
administration surface.

### OQ-7 — Which closed sets are still undocumented?

**What prompted it.** `06-constants.md` is the closed-set register, but four sets
referenced by the data model have no documented members: `leadStatus`,
`depositStatus`, `noShowReason`, and the `ServiceCategory` code names.

**What was assumed.** Nothing was invented; no code references them yet.

**Affects:** Phase 3 (services, customers), Phase 2 (no-show reasons).

### OQ-8 — `05-conventions.md` §16.2 rule 5 contradicts §16.3's own table

**What prompted it.** §16.2 rule 5 says keys "never contain a customer id, a
name, or a mobile number. … Identifiers only." §16.3's invalidation table names
"the customer's payment key" as something a recorded payment must invalidate.

**What was assumed.** §16.3 was implemented —
`queryKeys.payments.forCustomer(tenantId, customerId)` — and the contradiction is
recorded in the file's header rather than resolved silently, together with the
narrow convention that a filter value is an id, an enum member or a date and
never a label.

**Affects:** every phase that writes a query key. One sentence in one document
needs to change.

### OQ-9 — Does the widened coverage `include` change the global gate's meaning?

**What prompted it.** `vitest.config.ts`'s coverage `include` was widened to
`src/**/*.ts` and `src/**/*.tsx`. The global threshold is 80% lines, branches,
functions and statements. As more modules exist, 80% global stops meaning "the
product is well tested" and starts meaning "the product is mostly tested on
average" — a large well-covered module can carry a small untested one.

**What was assumed.** The threshold is kept as Phase 1 specified.

**Affects:** every phase. A per-module floor, or per-directory thresholds like
the one already set for `core/localization`, would say something stronger.

### OQ-10 — Prisma 7 requires a driver adapter, and `allow-scripts` blocks the install

**What prompted it.** Prisma 7 removed the built-in engine connection, so
`PrismaClient` requires `@prisma/adapter-better-sqlite3` or `@prisma/adapter-pg`
— both now in `package.json`. The npm `allow-scripts` gate blocks postinstall
scripts, and unresolved `ERESOLVE` warnings were observed during the last
install.

**What was assumed.** That the pinned versions are correct; this was not
confirmed by an install.

**Affects:** DoD 1 and 2. If the adapters do not install cleanly, nothing above
them runs.

---

## 7. Recommended next action

**Resolve OQ-5 and OQ-10, then run `npm run verify` — nothing else, before any
further Phase 1 code is written.**

The phase has accumulated roughly 127 files that no tool has ever looked at. The
risk now is not that something is missing; it is that something in those files is
wrong in a way that reading cannot reveal — a type that does not compile, a lint
scope that fires on the wrong files, a test that fails because a helper's
signature changed two edits later. Every one of those is invisible until the
first run, and every additional unverified file makes the first run harder to
diagnose.

Concretely, in this order:

1. **Obtain the five Vazirmatn `.woff2` files** (OQ-5) and confirm their licence.
   Without them the build fails at the first page rendered, which makes every
   later step harder to interpret.
2. **Make `npm install` work** (OQ-10) — resolve the `ERESOLVE` warnings and
   confirm the two Prisma driver adapters install.
3. **Run `npx prisma generate`, then `npm run verify`.** `verify` chains
   typecheck, lint, file length, i18n, overrides, schema portability, RLS coverage
   and the tests. Fix what it reports. **The 96-case matrix must be green before
   any feature work begins** — that is Phase 1's own rule, and it has never been
   satisfied.
4. **Only then**, finish the steps Phase 1 still owes: `src/core/db/` and
   `getTenantContext()`, `auth`, the worker process, the SQLite migration list,
   `prisma/seed.ts`, the override registry, and the cross-tenant suite against a
   real PostgreSQL.

Phase 2 must not begin before step 3 passes. The foundation's whole purpose is
that later phases can assume it; a foundation that has never been executed is an
assumption, not a foundation.

---

## A final note on method

Two things in this session were done deliberately and are worth carrying forward.

**Nothing was fabricated to fill a gap.** The five font files were not invented,
no substitute font was chosen, the override registry was not stubbed, and no
placeholder stands where an implementation should be. Every gap is named in §2.9
and §4 with its reason, because a plausible-looking stub in a foundation is worse
than an honest absence — the stub gets built on, and the absence gets fixed.

**Claims were separated from beliefs.** §3 is split in two for that reason: what
was established by reading, with the method named for each, and what only
execution can establish. The most important sentence in this report is that the
96-case matrix is 96 cases **by construction** and has never been run. A report
that blurred that distinction would be worth less than no report at all.

**Two defects were found by reading, and both were quiet:**

- `.gitignore`'s `*.sql` rule would have discarded every migration file without a
  single visible symptom.
- `canonicalFilters` produced the **same key for two different filter sets**, so
  two queries would have shared one cache entry. It was found by a test written
  alongside it, which is the argument for writing the test in the same sitting as
  the function.

---

## Appendix A — Deviations, judgement calls and defects found

Every place the built foundation departs from the design system, the
specification or the knowledge layer, and every defect found while building it.
None of these is a TODO; each is a decision that was made and is recorded here
rather than left for someone to discover.

### A.1 Design-system deviations

| What | Why |
|---|---|
| A sixth Button variant, `neutral` | The design system's five variants do not cover a secondary action that is neither `ghost` nor `danger`; §B of the demo's own stylesheet renders one |
| The §A3 spacing scale was reconciled rather than transcribed | §A3's table and the demo's `panel.css` disagree on one step; the demo's rendered value was taken, as it was for the permission matrix |
| The `:active` treatment is derived | The design system specifies hover and focus but not active; the derived value is documented in the stylesheet rather than left implicit |
| `control:focus-visible` was added | The specified focus treatment measured **1.1:1** against the surrounding surface — invisible. The added ring measures **3.98:1**, above the 3:1 non-text threshold |
| `--dark-danger-bg` was substituted | The token the design system names does not exist in its own §46 block |
| `.16s` was replaced by `var(--transition-control)` | A literal duration in one component and a token in another is how a design system drifts |
| One CSS Module per component family | §B's "one stylesheet per surface" is ambiguous for a shared component; the reading taken is the one the rule's own reason supports |
| The 22–30px branding icon size is omitted | No surface in Phase 1 has one; shipping an unused size is surface with no test |
| `THEME_COLOR` is a literal, not a `var()` | `themeColor` in Next's `Viewport` is emitted into a `<meta>` tag, where a CSS variable cannot resolve. It is the one colour literal outside the token block, and the file says so |
| The demo's `p { margin: 0 0 var(--s-3) }` and its `:focus-visible { border-radius: var(--r-xs) }` are **not** in the current `globals.css` | Both are global element rules; adopting them now would style prose that does not exist yet. Flagged, not forgotten |

### A.2 Contradictions inside the knowledge layer

| Contradiction | What was done |
|---|---|
| `07-localization.md` §2 lists the Vazirmatn weights as 400/500/700; `08-ui-design-system.md` §3 names 600 and 800 | The union (400/500/600/700/800) is shipped — a weight that is *not* shipped is synthesised by the browser, which thickens glyphs unevenly and changes the visual language |
| `03-data-model.md` line 23 says the entities are "documented in §5"; they are in §6 | The reference is wrong in the source document. Not corrected here, so the source stays as written |
| §4.3 discusses `chargedTotal`, `paidTotal` and `discountTotal`, and §2.1 names `birthMonth`/`birthDay`, but neither §2.1's Customer field list nor the schema carries them | Unresolved — see OQ-3 for the totals; the birthday fields are noted as absent rather than invented |
| `03-data-model.md` §6 and `02-architecture.md` §13.2 disagree on where a tenant's settings row lives | Resolved by adding a `TenantSettings` model. This is a model the data model did not ask for, and it is the largest additive change to the schema |
| `05-conventions.md` §16.2 rule 5 forbids a customer id in a query key; §16.3 requires the customer's payment key | §16.3 implemented, the conflict recorded in the file's header — **OQ-8** |
| The strategy's cross-tenant suite is required "on PostgreSQL only"; `scripts/check-schema-portability.mjs` covers only the *schema* half of §9 | The "apply the migrations to a real PostgreSQL" half is outstanding and has no script |
| No set of Persian labels exists for the eight behavioral toggles | Eight toggle codes were invented for the constants and their labels deferred, rather than inventing Persian copy the specification does not contain |

### A.3 Specification and localization findings

| Finding | Detail |
|---|---|
| `docs/knowledge/` contains **no U+200C** (ZWNJ) | The product's own Persian requires it. `ZWNJ` is now a named constant and is written through it, never as the literal character |
| The demo's orthography «غیرمنتظرهای» was corrected | The correct form carries a ZWNJ: «غیرمنتظرهای» |
| The Jalali year range is two ranges, not one | The supported span is not contiguous in the algorithm and is expressed as two ranges |
| The relative-date ladder has no documented value beyond six weeks | A fallback is implemented and its threshold is recorded; the document stops at six weeks |
| `normalizeForSearch` does not strip ARABIC TATWEEL (U+0640) | A known gap, left visible rather than silently half-applied |
| `VALIDATION_MESSAGES` is authored copy | The specification supplies validation *rules*, not Persian error strings. The wording is this project's and is flagged as such |
| `digits.ts` was reworked after an unreachable branch was found | The branch was unreachable because of an earlier guard; the rework removed it rather than leaving it untested |
| The environment's fixed UTC offset (UTC+3:30) is a decision, not an observation | Iran has had no DST since 2022. A fixed offset is pinned in constants with the reason, rather than consulting a timezone database that will change |

### A.4 Placement and structure

| Item | Note |
|---|---|
| `src/core/tenant/` | **Not one of the six core directories** `02-architecture.md` §6 lists. It was added because the tenant context is shared by every module and belongs below them |
| `src/modules/registry/` | Placed under `modules/` per ADR-0019, and **not built** — see §2.9 |
| `roles-permissions` ships without `components/`, `hooks/`, `api/` or `validation/` | The module contract requires the folders; this module's primitive is pure logic. The folders are absent rather than empty |
| The ADR log is split into 22 files with `decisions.md` as an index | Phase 0's single file was becoming unreadable; each ADR is now separately referenceable. `decisions.md` remains the entry point |
| `clinic_demo_ui_design_system_for_deepseek (1).md` is 1298 lines | Exempt as source material, not project output. The 1000-line rule governs the project |
| The 1000-line hook in `.claude/settings.json` excludes `.md`, `.json` and `.txt` | Deliberate: the rule is about source files, and the knowledge layer's documents are legitimately long |

### A.5 Tooling and environment

| Item | Note |
|---|---|
| **No check script, test, type check or lint has ever run** | The dominant fact of this phase. See §3.2 |
| `Read(.env.*)` denies `.env.example` | The new environment variables (`DATABASE_PROVIDER`, the driver-adapter settings) could not be added to the example file. They are documented in `src/core/config/env.ts` and `docs/setup/` instead — **and whether `.env.example` exists at all could not be confirmed** |
| npm's `allow-scripts` gate blocks postinstall scripts | Prisma's engines and the driver adapters depend on postinstall steps. Unresolved |
| `ERESOLVE` warnings were observed during the last install and were not investigated | They may be harmless; they have not been shown to be |
| Vitest's CSS-module handling returns a `Proxy`, and a CSS-module class is typed `string \| undefined` | Both are why `lib/cx.ts` exists and why component tests assert against stylesheet *text* rather than against computed classes |
| `@testing-library/react` registers its own `cleanup` **only if `afterEach` is a global** | `vitest.config.ts` sets `globals: false`, so the guard never fires and no cleanup was ever registered. Fixed in `vitest.setup.ts`, with the library's own source quoted as the evidence |
| Lucide is at 1.49.0 and its default stroke width is 2, not the design system's 1.7 | The `Icon` wrapper pins 1.7. The design system's value wins over the library's default |
| Only three of the six Radix primitives are installed | `dialog`, `select` and `tabs` are not, because nothing uses them yet. `package.json` is not a shopping list |
| Prisma 7's provider constraints were derived from `prisma_schema_build_bg.wasm` | The provider must be a literal, `env()` is forbidden inside it, and only one datasource is allowed. Verified against the shipped engine rather than the documentation |
| `package.json`'s `worker` script points at `src/worker/main.ts` | The file does not exist. It is a dangling script, not a working one |

---

*Phase 1 is open. See `../roadmap/progress.md` for its status and
`../roadmap/phases.md` for what it promised.*
