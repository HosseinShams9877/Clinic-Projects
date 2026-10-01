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

- **CSS Modules** per component, plus the global token block.
- **Every colour, radius, shadow and spacing value comes from a token**
  (`08-ui-design-system.md`). A hard-coded hex is a finding.
- **No Tailwind default palette.** The brand is a custom dusty-rose; a
  `bg-rose-500` is a finding.
- **Logical properties only** — `margin-inline-start`, not `margin-left`;
  `padding-block`, not `padding-top`/`bottom`. RTL is a hard constraint.
- No inline `style` except for a genuinely dynamic value (a computed position, a
  progress width). A static inline style is a finding.
- Component state lives in class names (`is-loading`, `is-disabled`), not in
  ad-hoc attributes.

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

*Related: `02-architecture.md` §10 (module and import rules),
`07-localization.md` (the localization layer), `09-security.md` (the isolation
rules these conventions protect), `10-testing-strategy.md` (the test
obligations), `08-ui-design-system.md` (the token rule).*
