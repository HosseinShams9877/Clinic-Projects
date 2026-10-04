# 05 — Conventions

> The rules that keep a codebase readable by a team that does not talk to each
> other every day. Any deviation is a review finding.

---

## 1. Language: English code, Persian interface

| Thing | Language | Example |
|---|---|---|
| Files, folders, modules | English | `treatment-cycles.ts` |
| Variables, functions, types, DB columns | English | `nextDueDate`, `completedSessions` |
| Comments and commit messages | English | `// interval comes from the cycle, not the service` |
| **Everything a user sees** | **Persian** | «موعد جلسه بعد» |
| Persian string literals in code | **Forbidden** | Strings live in the localization catalog |

There is no bilingual UI. There is no language switcher. Persian is not a
locale — it is the product. See `07-localization.md`.

**The one exception:** none. A pending or temporary English label is a defect,
not a shortcut. If a label is unknown, it is an open question in the phase
report, not a placeholder in the code.

---

## 2. TypeScript

- **`strict: true`.** No exceptions, no per-file overrides.
- **`any` is forbidden.** Use `unknown` and narrow. An `any` in a review is a
  blocking finding.
- **`as` casts** require a comment explaining why the compiler cannot know the
  type. A cast used to silence an error is a defect.
- **Non-null assertion (`!`)** requires a comment proving non-nullity. Prefer an
  explicit guard.
- **Branded types** for identifiers where mixing is a real risk:
  `TenantId`, `ClinicId`, `CustomerId`, `UserId`. Passing a `ClinicId` where a
  `TenantId` is expected must be a compile error — this is the cheapest possible
  defence against the isolation bug in `09-security.md`.
- **Discriminated unions** for anything with states: appointment status,
  campaign status, cycle status. Never a boolean pair or a bare string.
- **`exhaustive()` helper** in a `switch` over a union, so adding an enum member
  without handling it fails to compile.
- **No `enum`.** Use `as const` objects and derive the union type:

  ```ts
  export const AppointmentStatus = {
    Booked: 'BOOKED', AwaitingArrival: 'AWAITING_ARRIVAL', /* … */
  } as const
  export type AppointmentStatus = typeof AppointmentStatus[keyof typeof AppointmentStatus]
  ```
  Native `enum` emits runtime code, does not map to a portable DB column, and
  interacts badly with `isolatedModules`.

---

## 3. Naming

| Kind | Convention | Example |
|---|---|---|
| Files (modules, components) | `kebab-case.ts(x)` | `cycle-card.tsx` |
| React components | `PascalCase` | `CycleCard` |
| Hooks | `use` prefix, `camelCase` | `useTenantContext` |
| Functions, variables | `camelCase` | `computeNextDueDate` |
| Types, interfaces | `PascalCase`, **no `I` prefix** | `AudiencePredicate` |
| Constants objects | `PascalCase` + `as const` | `CampaignType` |
| Zod schemas | `<name>Schema` | `appointmentInputSchema` |
| DB models / columns | `PascalCase` model, `camelCase` field | `TreatmentCycle.nextDueDate` |
| DB tables | `snake_case` via `@@map` | `treatment_cycles` |
| Test files | `<subject>.test.ts` beside the subject | `slot-generation.test.ts` |

Booleans read as assertions: `isActive`, `hasConsent`, `canSend` — never
`active`, `consent`, `flag`.

---

## 4. Module boundaries

The full rules are in `02-architecture.md` §10. The enforceable summary:

1. A module's **`index.ts` barrel is its only public surface.** Everything else
   is private.
2. **No deep cross-module imports.** `@/modules/a` may import `@/modules/b`,
   never `@/modules/b/lib/thing`.
3. `core` never imports from `modules`. `app` and `worker` may import both.
4. **No file exceeds 1000 lines.** Enforced by a CI check, not by memory.

**How to split a file that reaches the limit:** by responsibility, guided by the
module's own subfolder contract — `components/`, `lib/`, `validation/`,
`types/`, `hooks/`, `api/`. Never split by taking the bottom half of the file.

---

## 5. Validation at the boundary

**Every value crossing a trust boundary is parsed by Zod before it reaches a
module function.** Boundaries are:

- Server Action arguments
- Route Handler request bodies, query strings, and params
- Form submissions
- Webhook payloads (SMS gateway, payment gateway)
- Environment variables (parsed once at startup, not read ad hoc)
- Values read back from `String` columns holding JSON

A module function's parameters are **already validated types** — it does not
re-parse and it does not accept `unknown`.

Schemas live in the module's `validation/` folder and are **shared between
client and server**, so a form and its handler cannot disagree about what is
valid.

**`tenantId`, `clinicId`, `userId`, and `role` are never part of an input
schema.** They are not fields. If a schema contains one, it is a security defect
(`04-roles-permissions.md` §3.3).

---

## 6. Server Actions

The obligations from choosing a full-stack framework (`01-tech-stack.md` §6):

- **Interactive and sub-second only.** If it can take a second, or it calls an
  external gateway in bulk, it belongs in the worker.
- **No bulk sending from a Server Action.** A campaign dispatch is a job.
- **A Server Action calls exactly one module function.** Business logic in the
  action body is a finding.
- **Every action re-derives the tenant context.** An action is a trust boundary,
  not an extension of the page that rendered it.
- Reserved for mutations. Reads happen in Server Components; a Server Action
  used to fetch data is a finding.

---

## 7. Errors

- **Three error classes:** `ValidationError` (user-correctable), `AuthError`
  (permission or session), `DomainError` (a violated business rule).
- **User-facing messages are Persian and specific.** «این ساعت قبلاً رزرو شده
  است» — not «خطا رخ داد». A generic message is a support ticket.
- **Internal detail never reaches the UI.** Stack traces, SQL, and Prisma error
  codes are logged, never rendered.
- **Domain rules throw; they do not return `null`.** A silent `null` becomes a
  wrong number on a screen. The three error classes are thrown and translated at
  the boundary.
- **No empty `catch`.** A swallowed error is a finding, without exception.
- **Fail loudly on invariant violations.** A drifted denormalised count is a
  loud failure, not a warning (`03-data-model.md` §4.3).

---

## 8. Money and dates

Two areas where a small mistake is expensive and invisible.

**Money**

- Stored as `BigInt` **Rial**; never a float, never a JS `Number`.
- Serialised as a **string** across any JSON boundary.
- Arithmetic goes through helpers in `src/core/lib/money.ts` — never inline `+`.
- Rendered through the money formatter (Toman, Persian digits, `٬` separator).
- A `number` appearing anywhere near an amount is a finding.

**Dates**

- **Two representations, always both** (`03-data-model.md` §3.1):
  `scheduledAt` (UTC `Date`) for arithmetic and ordering; `localDate`
  (`YYYY-MM-DD`, Jalali) + `localTime` (`HH:mm`) for display, day grids and
  uniqueness.
- **Never derive a local date from a `Date` at read time.** A timezone
  conversion at render is exactly the bug the dual representation exists to
  prevent.
- **No `new Date()` in business logic.** Time comes from an injected clock, so
  that slot generation and next-due computation are testable at any date.
- Comparison uses the shared helpers in `src/core/localization/jalali.ts`.

---

## 9. Styling

- **Tailwind v4 is the styling system.** No `*.module.css` exists under `src/`; a
  component is styled with utility classes, and the engine reads the global token
  block in `src/app/globals.css` through `@theme` — see `01-tech-stack.md` §1's
  reversal note for what changed and what did not.
- **Every colour, radius, shadow and spacing value comes from a token**
  (`08-ui-design-system.md`). A hard-coded hex is a finding, and so is an arbitrary
  value a token already states: `p-4` rather than `p-[16px]`, because `--spacing`
  is `--s-1` and `p-4` *is* 16px.
- **No palette but the token block's.** The default Tailwind palette is cleared to
  `initial` namespace by namespace in `@theme`, so `bg-red-500` does not resolve at
  all — and were it re-enabled, `bg-rose-500` would still be a finding, because the
  brand is a custom dusty-rose.
- **Logical properties only** — `ms-`/`me-` and `ps-`/`pe-` for inline margins and
  padding, `inset-inline-start` in an arbitrary property, never `ml-`/`pl-` or
  `left:`/`right:`. RTL is a hard constraint, and the physical utility is a Latin
  assumption baked into a class name.
- No inline `style` except for a genuinely dynamic value (a computed position, a
  progress width). A static inline style is a finding — the utility for it exists.
- Component state is expressed through the component's own props (`loading`,
  `disabled`), which select the utilities; not through ad-hoc attributes or
  hand-added class names at the call site.

---

## 10. Testing conventions

- **Colocated:** unit and integration tests live beside the subject in the
  module's `tests/` folder, named `<subject>.test.ts`.
- **e2e, accessibility, and responsive tests** live at the repo root under
  `e2e/`, named by scenario.
- **Every bug fix ships with the test that would have caught it.** No exceptions.
- **A permission with no negative test is unverified** — the negative half is
  mandatory (`10-testing-strategy.md`).
- Tests assert **behaviour**, not implementation. A test that breaks when a
  private function is renamed is a bad test.
- Time-dependent tests use the injected clock, never `vi.useFakeTimers()` on
  business logic that should have taken a clock.

---

## 11. Logging and the audit trail

- **Structured logs**, one line per event, with `tenantId`, `actorUserId`, and a
  correlation id. Never a bare `console.log` in committed code.
- **No PII in logs.** No phone number, no customer name, no medical note. Log
  identifiers, not people.
- **The audit log is not the application log.** Permission-sensitive actions —
  permission changes, discounts, payment corrections, campaign approvals,
  consent revocation — are written to `AuditLog` with the actor, and are
  queryable per tenant.
- Log at the boundary, not in every helper.

---

## 12. Comments

- **Comments explain *why*, never *what*.** `// interval comes from the cycle,
  not the service — otherwise a personalised schedule collapses` is a good
  comment. `// increment i` is not.
- **A comment referencing the specification** should name the section, e.g.
  `// spec §11: a cycle is created only on COMPLETED`.
- **No commented-out code.** Delete it; git remembers.
- Every non-obvious constant carries the reason it has that value.

---

## 13. Git and commits

- **Conventional Commits**, English, imperative mood:
  `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `build:`, `ci:`.
- **One coherent unit per commit.** A commit that mixes a refactor and a
  feature is a finding.
- Scope is the module: `feat(cycles): compute next due date from cycle interval`.
- **Never commit** secrets, `.env` files (except `.env.example`), or database
  files. `.gitignore` covers them; a commit that adds one is a defect to be
  reverted, not amended.
- **The repository is local.** No remote is configured and nothing is pushed.
- Before every commit: no secrets staged, tests green, no file over 1000 lines.

---

## 14. The forbidden list

A single place to check. None of these appear in this codebase:

| Forbidden | Instead |
|---|---|
| `any` | `unknown` + narrowing |
| `enum` | `as const` object + derived union |
| A hard-coded hex colour | a token from `08-ui-design-system.md` |
| A Persian string literal in a component | a key in the localization catalog |
| A `number` holding money | `BigInt` + the money helpers |
| `new Date()` in business logic | the injected clock |
| A client-supplied `tenantId`/`clinicId`/`role` in a schema | server-resolved context only |
| A deep cross-module import | the module's barrel |
| A file over 1000 lines | a split by responsibility |
| An empty `catch` | handle it or let it propagate |
| A `console.log` in committed code | the structured logger |
| A TODO or placeholder | resolve it, or raise it as an open question |
| Bulk work in a Server Action | a worker job |
| Physical CSS properties (`margin-left`) | logical properties |
| A date formatted at render | the stored `localDate` |

---

## 15. Naming for overridable modules

The mechanism is specified in `02-architecture.md` §13. This section is the
naming and validation contract an override must satisfy — the part a developer
writing one has to get exactly right.

### 15.1 Vocabulary

| Term | Meaning |
|---|---|
| **Default module** | `src/modules/<name>` — the implementation in the module list of `02-architecture.md` §7. Every tenant uses it unless an override is declared. |
| **Override module** | An implementation of the same module, contributed by a customer requirement, selected per tenant. |
| **Implementation id** | The stable, lowercase, kebab-case name an override is registered and declared under. |

"Override" is the word for the *thing*; the code never calls a module
"custom" — that implies a fork, which this is not.

### 15.2 Naming

| Thing | Convention | Example |
|---|---|---|
| Override module folder | `kebab-case`, named for the **tenant group it serves**, never for the module it replaces | `clinic-group-a/` — not `dashboard-custom/` |
| Implementation id | the folder name, exactly | `clinic-group-a` |
| Registry key | `"<module>/<implementationId>"` | `"dashboard/clinic-group-a"` |
| Exported interface type | `<Module>Module` in the default module's `types/` | `DashboardModule` |

**Why the folder is named for the tenant group and not the module.** The name is
the identity of an implementation, and an implementation belongs to a customer
relationship. `dashboard-custom` names a variation with no owner, so a second
customer's dashboard override has nowhere to go and the first folder quietly
becomes two customers' code. `clinic-group-a` can only ever mean one thing.

**A folder named after a customer is not a leak of their identity into the
build.** The name is a stable internal slug, chosen at the start of the
engagement; it is not the customer's legal name, and it never appears in a URL,
a log line, or the interface. Where the slug itself is commercially sensitive,
it is a neutral identifier agreed with the customer, not a disguised real name.

### 15.3 Location in the module tree

Overrides live **inside the module they replace**, in a sibling folder, so that
the default and every override are read together and a reviewer cannot approve a
change to one without seeing the other:

```
src/modules/<module>/
  components/            ┐
  lib/                   │
  validation/            ├─ the DEFAULT implementation
  types/                 │
  hooks/                 │
  api/                   ┘
  index.ts               ← the default's public surface
  overrides/
    <implementation-id>/
      components/
      lib/
      validation/
      types/
      hooks/
      api/
      tests/
      module.ts          ← the declaration (§15.4)
      index.ts           ← the override's public surface (§15.5)
```

Rules:

1. **An override is a full module tree**, with the same subfolder contract as
   every other module. It is not a single file, and not a monkey-patch of the
   default's internals.
2. **An override never imports the default's private modules.** It may import
   `@/modules/<module>` — the default's barrel — exactly as any other module
   would, but never `./lib/thing` from the parent. If it needs behaviour both
   implementations share, that behaviour moves into the default's **barrel** or
   into `src/core`, and the duplication is removed at the source rather than
   copied.
3. **`overrides/` is not part of the module's public surface.** The barrel at
   `src/modules/<module>/index.ts` does not re-export it. Only the registry
   references an override, and the registry is the only file that names one.
4. `overrides/` is covered by the module's own `tests/` obligation: every
   registered override runs the module's suite (`02-architecture.md` §13.5).

### 15.4 Declaring which module it replaces

An override declares its identity in `module.ts`, and the declaration is the
input to validation — not a comment, and not documentation:

```ts
import type { DashboardModule } from '../../types'

export const declaration = {
  module: 'dashboard',          // must exist in the module list (02-architecture §7)
  implementation: 'clinic-group-a',
  version: '1.0.0',
  exposes: 'DashboardModule',   // the interface in the default module's types/
} as const
```

Four fields, four jobs:

| Field | Validated against | Failure |
|---|---|---|
| `module` | the closed 20-module list | An override for a module that does not exist is a build error — the module list is a closed set, and an override never introduces a 21st module. |
| `implementation` | the folder name and the registry key | A mismatch means the registry entry and the declaration disagree about which code is running. |
| `version` | semver format, **platform-versioned** | Recorded for support, not resolved against: an override ships with the platform's release and is never upgraded independently (ADR-0019). |
| `exposes` | the interface name the override is typed as | This is the field that makes the contract checkable — see §15.5. |

The tenant's settings row (`02-architecture.md` §13.2) declares the *selection*:

```jsonc
{ "dashboard": { "implementation": "clinic-group-a", "version": "1.0.0" } }
```

A settings row may name only an `(module, implementation)` pair that exists in
the build's registry. A row naming anything else resolves to the default and
records an incident — it is never an error a customer sees.

### 15.5 What a valid override must export

The override's `index.ts` exports **exactly the default module's public
surface** — the same names, the same types, the same thrown error classes — and
the registry types it as that interface:

```ts
import type { DashboardModule } from '../../types'
import * as implementation from './implementation'

// A missing or mistyped export fails to compile. This is the contract check.
const override: DashboardModule = implementation
export default override
```

This is the whole validation strategy: **the contract is a TypeScript interface,
so conformance is a compile error rather than a runtime discovery.**

The interface in the default module's `types/` therefore has to be:

- **explicit** — a named, exported interface, not an inferred shape, so an
  override cannot accidentally satisfy it by exporting something adjacent;
- **total** — every function a caller may reach, with no optional member an
  override could simply omit;
- **free of implementation detail** — no parameter type that only the default's
  internals can construct;
- **stable** — changing it is a breaking change for every override of that
  module, and is treated as one in review.

### 15.6 How the core validates before loading

Validation is layered, cheapest first, and **every layer falls back to the
default rather than failing a request**:

| # | When | Check | On failure |
|---|---|---|---|
| 1 | **Compile time** | The registry types every override as its module's interface (§15.5); `module` is a member of the module-list union; `implementation` matches the folder. | The build fails. This is the only layer that can. |
| 2 | **Build time** | A CI check asserts every folder under `overrides/` has a `module.ts`, that its `declaration.implementation` equals its folder name, and that every entry in the registry resolves to a real barrel. | CI fails. |
| 3 | **Test time** | Every registered override runs its module's own suite plus the permission matrix and the cross-tenant isolation suite (`02-architecture.md` §13.5, `10-testing-strategy.md` §6.2). | CI fails. An override with no isolation test is unverified and is not registered. |
| 4 | **Startup** | The registry is built once; each entry's declaration is parsed by a Zod schema. A malformed declaration marks that entry invalid and it is not offered to the resolver. | The entry is dropped with a startup warning; the default serves that module. |
| 5 | **Resolution time** | `resolveModule()` looks up `(module, implementationId)`; a miss, an invalid entry, or a disabled entry resolves to the default (`02-architecture.md` §13.3). | The default runs. Never a blank page. |
| 6 | **Runtime** | An override that throws is contained: the tenant is served by the default, the override is disabled, and the tenant is notified (`09-security.md` §18). | The tenant is degraded, not down. |

**What validation deliberately does not do:** it does not load code the build
does not contain. There is no path-based dynamic import, no `eval`, no runtime
compilation, and no plugin loaded from disk. An override is a module that was
compiled, lint-bounded, and tested as part of this release; the database row
selects from a fixed set of names in that release's registry. That single
constraint is what keeps a per-tenant customisation mechanism from becoming a
per-tenant code-execution mechanism (ADR-0019).

---

## 16. Client data fetching with React Query

The split between Server Components and React Query is decided by `01-tech-stack.md`
§8.1.1. This section is how it is applied.

### 16.1 When to use which

**A Server Component** fetches when the data is needed to render the route:

- the initial load of a page or route segment;
- an SEO-critical surface — all of `public-site`;
- data that does not change while the user is on the screen — service copy,
  clinic identity, working hours, the staff list;
- a value that must be correct at the moment of render and is never re-read — a
  receipt, a booking confirmation;
- anything behind a permission check that must run **before** the render.

**React Query** fetches when the user will interact with the data repeatedly
within one session:

- a list the user filters, sorts, steps through, or works down;
- data another actor can change while the user is looking at it;
- polled data — the notification feed;
- a count that depends on a filter the user is still editing — the campaign
  preview;
- anything requiring an optimistic update — a reschedule, a contact result, a
  payment.

The five surfaces that qualify are named in `01-tech-stack.md` §8.1: the
appointment day grid, the cycle contact list, the debt list, the campaign builder
preview, and the notification feed.

**A surface never uses both for the same data.** Seeding a React Query cache from
a Server Component is a finding: it creates two sources of truth for one value and
the hydration mismatch arrives later, in production.

**Reads only.** React Query fetches. **Writes go through Server Actions**
(§6) — there is no `useMutation` that posts to a bespoke API route, and a
mutation hook exists to wrap a Server Action call, to invalidate keys, and to
roll back an optimistic update. Nothing else.

### 16.2 Query keys are tenant-scoped, always

Every key is built by a helper in `src/core/query/keys.ts`. **No hook writes a key
array by hand**, and no key omits the tenant.

```ts
// src/core/query/keys.ts — the only place a key is constructed
export const queryKeys = {
  appointments: {
    all:  (tenantId: TenantId) => ['t', tenantId, 'appointments'] as const,
    day:  (tenantId: TenantId, doctorId: UserId, localDate: LocalDate) =>
            [...queryKeys.appointments.all(tenantId), 'day', doctorId, localDate] as const,
  },
  cycles: {
    contactList: (tenantId: TenantId, filters: ContactListFilters) =>
            ['t', tenantId, 'cycles', 'contact-list', filters] as const,
  },
} as const
```

The rules:

1. **`tenantId` is the second element of every key**, immediately after a literal
   `'t'` marker. It is not optional and there is no variant without it.
2. **`tenantId` comes from the server-resolved context**, never from a component
   prop, a URL, or client state.
3. **Keys are hierarchical** — `['t', tenantId, 'appointments', 'day', …]` — so an
   invalidation can target one day, all days, or the whole module by prefix.
4. **Filters and pagination are part of the key, as a stable object.** An object
   literal built inline at every render changes identity and defeats the cache;
   the helper takes the filter object and serialises it deterministically.
5. **Keys never contain a name, a mobile number, or any other personal data —
   surrogate identifiers only.** A key is observable in devtools and in error
   reports, and a `cuid()` carries nothing about the person it identifies. A
   customer id is therefore permitted and is required by §16.3, whose payment row
   invalidates "the customer's payment key"; a customer's *mobile number* in the
   same position would be a leak.

**Why tenant-scoping is not a formality.** Two tenants share one browser only in
the operator's case, but a single tenant's user switching tenancy — a visiting
doctor with two memberships (`02-architecture.md` §2) — is ordinary. A key
without `tenantId` serves tenant A's cached rows to tenant B from memory, with no
query executed and no RLS predicate evaluated. **This is a cross-tenant leak that
the database cannot catch**, because the database is never asked. It is the single
most important rule in this section, and it is why the key builder is in `core`
rather than in each module.

### 16.3 Invalidation

**Invalidation is declared by the mutation that changes the data**, not by a timer
and not by a manual refetch in a component.

| Change | Invalidates |
|---|---|
| A reschedule or cancel | that doctor's affected days, and the appointment's own key |
| A payment recorded | the debt list, the customer's payment key, the affected buckets |
| A contact result recorded | the cycle contact list, and that cycle |
| A campaign filter edited | only the preview count key — nothing else |
| A service price changed | the service key and the `priceAtBooking`-dependent views, never a historical payment |

Rules:

- **Invalidate by prefix, as narrowly as correctness allows.** Invalidating
  `['t', tenantId]` is correct and wasteful; it is the fallback, not the default.
- **`staleTime` is set deliberately per query**, not globally to zero. A day grid
  the receptionist is working in has a short `staleTime`; a service list has a
  long one. A blanket `staleTime: 0` refetches on every focus and removes most of
  the benefit of having the cache.
- **No polling as a substitute for invalidation.** The notification feed polls
  because it has no mutation to key off. A list that could be invalidated and is
  instead polled is a finding.
- **Cross-module invalidation is expressed in keys, not by importing another
  module's hook.** A `payments` mutation invalidates a `debts` key through the
  shared key helper in `core`, which is legal because `core` is domain-free.

### 16.4 Optimistic updates

An optimistic update is allowed only when **all five** of these hold:

1. **The change is a single, local, reversible write.** Moving an appointment in
   the day grid qualifies. A campaign dispatch does not.
2. **The server is the authority and the response replaces the optimistic value.**
   On success the cache is updated with the server's answer, not left at the
   guess — the server may have recorded a different time, id, or price.
3. **A rollback is implemented, not assumed.** `onError` restores the exact
   previous cache snapshot, captured in `onMutate`, and then invalidates so the
   next read is authoritative. A missing rollback is a blocking finding.
4. **The user is told.** A silent rollback leaves the screen showing one thing and
   the database holding another. The failure surfaces as a Persian message
   (`07-localization.md` §8), naming what did not happen.
5. **Concurrency is handled.** The previous snapshot is cancelled (`cancelQueries`)
   before the optimistic write, so an in-flight refetch cannot overwrite it.

**Optimistic updates are tested on both paths** — success *and* failure/rollback
(`10-testing-strategy.md` §16.4). A test that only covers the happy path does not
cover the half of this feature that runs when something is wrong.

### 16.5 Error and loading states

- **Loading** uses the design system's own states (`08-ui-design-system.md` §22
  empty state, and the table/skeleton conventions), never a bare spinner in the
  middle of a page. A first load and a background refetch are **different states**:
  a refetch does not blank the screen.
- **Errors are Persian and specific** (§7). «فهرست نوبتهای امروز دریافت نشد» and a
  retry — not «خطا» and not an internal message.
- **Internal detail never reaches the UI** (§7). A query error's status, URL and
  payload go to the logger (§11) with the correlation id.
- **A failed query does not render an empty list.** "No data" and "could not
  load" look identical to a user and are completely different facts; rendering an
  empty state for a failure tells a receptionist the day is clear when it is not.
- **`retry` is bounded** — a small number of attempts with backoff — and never
  applied to a 4xx, which will not succeed on retry.
- **Every query has an error boundary above it** that renders the fallback for the
  surface, not the whole page.

---

## 17. UI component rules

**Every component is built from the design system.** `08-ui-design-system.md`
defines each component and each of its states. A component that is not in that
document is a new component, and a new component must look as though it belongs
to the same system (§45).

| Rule | |
|---|---|
| **Every component is built from the design system.** | Its colours, radii, shadows, spacing and font sizes come from the `:root` token block (§46). No component invents a value. |
| **Headless primitives are allowed for behaviour only.** | Radix and cmdk supply focus management, ARIA wiring and keyboard interaction. They supply no appearance. |
| **No styled component library.** | shadcn/ui, Material UI, Chakra, Ant Design and every equivalent are forbidden (`01-tech-stack.md` §8.8, ADR-0021). No component-framework theme may override a token. |
| **No icon font.** | Icons are Lucide components or inline SVG (`01-tech-stack.md` §8.2). A `@font-face` for an icon set is a finding. |
| **A new primitive is added to `01-tech-stack.md` §8 before it is used.** | A dependency added by a component is a stack decision, and a stack decision is recorded, not discovered in a diff. |
| **Every component has a story or a test exercising every state the design system defines.** | Including hover, focus-visible, disabled, loading, error and empty (`08-ui-design-system.md` §A8). A component with only its default state is incomplete, not minimal. |
| **No component imports `@radix-ui/*` or `cmdk` directly.** | They are wrapped in `src/core/components/**` and reachable only through that wrapper, so the token styling and the Persian-aware filter cannot be bypassed. |
| **Every component that renders a number renders Persian digits.** | Through the display primitives (`07-localization.md` §4), never by hand. |
| **Every interactive element has a visible focus state.** | `focus-visible` is an accessibility requirement, not a nicety. |

**The wrapper obligation.** A wrapper around a headless primitive is not a
pass-through. It owns the design system's styling for that component, the Persian
labels and `aria-label`s, the RTL behaviour, and — for cmdk — the Persian-aware
normalisation filter (`01-tech-stack.md` §8.4). A wrapper that forwards arbitrary
props which could defeat any of those is a finding.

**Keyboard and focus are tested, not assumed.** Every headless wrapper carries a
test for focus trapping, focus restoration, escape handling and keyboard
navigation (`10-testing-strategy.md` §17). These are precisely the behaviours a
headless primitive is adopted for, so they are precisely the behaviours that must
be proven — an untested wrapper around a tested library proves nothing about the
component the product ships.

---

*Related: `02-architecture.md` §10 (module and import rules) and §13 (the
override mechanism), `09-security.md` §18 (override isolation),
`07-localization.md` (the localization layer), `10-testing-strategy.md` (the
test obligations), `08-ui-design-system.md` (the token rule),
`01-tech-stack.md` §8 (the UI and data libraries).*
