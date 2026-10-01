# Context

> Loaded at the start of every session. This file is the **pointer**, not the
> source of truth — it tells you where the truth is and which rules must never be
> broken from memory.

---

## 1. The source of truth

**`docs/knowledge/` is the specification.** It was produced in Phase 0 and every
decision in it was made deliberately, with its alternatives recorded. Nothing in
this file overrides it, and nothing in a conversation overrides it.

| Document | Answers |
|---|---|
| `docs/knowledge/00-overview.md` | What the product is; where to start |
| `docs/knowledge/01-tech-stack.md` | Why this stack; what may be added |
| `docs/knowledge/02-architecture.md` | Modules, pages, imports, the worker |
| `docs/knowledge/03-data-model.md` | Entities, columns, indexes |
| `docs/knowledge/04-roles-permissions.md` | The 16 permissions, 3 roles, 8 toggles |
| `docs/knowledge/05-conventions.md` | How to write code here |
| `docs/knowledge/06-constants.md` | The immutable rules and the closed sets |
| `docs/knowledge/07-localization.md` | Persian, RTL, digits, Jalali |
| `docs/knowledge/08-ui-design-system.md` | Every token and component. **Binding** |
| `docs/knowledge/09-security.md` | Tenancy, RLS, sessions, consent |
| `docs/knowledge/10-testing-strategy.md` | What must be tested, and how |
| `docs/roadmap/phases.md` | What to build now |
| `docs/roadmap/progress.md` | What is actually built |
| `docs/roadmap/decisions.md` | Why (the ADRs) |
| `reports/` | What went wrong, and the open questions |

**The product specification** is the Persian text file in the repository root.
**The UI demo** is in `clinic/`. Where the specification's extracted tables are
ambiguous, **the demo's rendered source is authoritative** — that tiebreak has
already been needed twice (see `reports/phase-00-report.md`, OQ-2).

---

## 2. The ten immutable rules

From `docs/knowledge/06-constants.md` §1. **A feature that requires breaking one
is not built.** These are not guidelines.

1. **No diagnosis, no treatment advice, no outcome guarantee.** Medical questions go to a doctor. This is a professional duty and a legal risk.
2. **Access is enforced on the server.** Hiding a menu is not access control.
3. **Medical data is separate from the assistant and campaigns.** Grouping uses behavioural and financial data only.
4. **No bulk send without human approval.**
5. **Customer consent outranks the clinic's wishes.**
6. **Before/after images only with written consent, revocable at any time.**
7. **Debt deletion does not exist.** A discount is recorded with the name of who granted it.
8. **Balance is computed, never stored.**
9. **No user changes their own access.**
10. **A service is deactivated, never deleted.** History must stay intact.

---

## 3. The rules that are broken most often

Each of these is a review finding, and each has already been thought about so it
does not need to be thought about again.

| Rule | Why it is easy to break | Where |
|---|---|---|
| **Persian digits everywhere** | Latin digits are the default of every library and every `toString()` | `07-localization.md` §4 |
| **Jalali dates only** | `new Date().toLocaleDateString()` is the obvious call | `07-localization.md` §6 |
| **No Persian string literal in a component** | Typing the label right there is faster | `05-conventions.md` §14 |
| **Tokens, never hex** | The design system's colours look like normal colours | `08-ui-design-system.md` §A |
| **No Tailwind default palette** | `bg-rose-500` is one keystroke from the brand | `08-ui-design-system.md` §A2 |
| **`BigInt` for money, never `number`** | TypeScript accepts a number silently | `05-conventions.md` §8 |
| **Logical CSS properties** | `margin-left` works fine — until RTL | `07-localization.md` §3.1 |
| **No file over 1000 lines** | Files grow one function at a time | `05-conventions.md` §4 |
| **No deep cross-module import** | It is the shortest path to the thing you need | `02-architecture.md` §10 |
| **`tenantId` never in an input schema** | Almost every other system passes it | `09-security.md` §3 |
| **No `enum`** | `enum` is the idiomatic TypeScript choice | `05-conventions.md` §2 |

---

## 4. Current phase

**Phase 0 — Foundation and architecture — is complete.** The repository contains
documentation only; there is no application code, no `package.json` and no
schema. That is the intended state.

**Next: Phase 1 — Platform foundation.**

Its definition of done, restated (full version in `docs/roadmap/phases.md`):

1. `npm run dev` starts; the login page renders in Persian, RTL, Persian digits, Vazirmatn, with no external font request.
2. A manager, a doctor and a secretary each log in and land on a shell whose navigation matches their role exactly.
3. **The permission matrix suite passes: 16 permissions × 3 roles × 2 directions = 96 tests green**, plus the 8 toggle tests.
4. The self-escalation suite passes in full.
5. The cross-tenant suite passes **on PostgreSQL with RLS enabled**, including "no tenant context returns zero rows".
6. The Jalali round-trip passes across 200 years and agrees with ICU on every day in ۱۳۹۰–۱۴۵۰.
7. `core/localization` and `roles-permissions` are at **100% line and branch coverage**.
8. The worker starts, claims a job, completes it, and recovers a claim after a kill.
9. No file exceeds 1000 lines.
10. A production boot against SQLite, or with RLS disabled, **refuses to start**.

**Start Phase 1 in this order:** token block → localization layer → Prisma schema
→ RLS migrations → `getTenantContext()` → `auth` → the permission primitive →
the worker process. The permission matrix passes before any feature work begins.

---

## 5. The 1000-line rule

**No file may exceed 1000 lines.** Enforced by a hook in `.claude/settings.json`
and by a CI check.

When a file approaches the limit, **split it by responsibility**, guided by the
module's own subfolders — `components/`, `lib/`, `validation/`, `types/`,
`hooks/`, `api/`. **Never split by taking the bottom half of the file**, and
never by creating `thing-2.ts`.

If a file cannot be split by responsibility, that is a signal the module's
boundary is wrong — which is worth raising, not working around.

---

## 6. Persian and Jalali are mandatory

Not optional, not a later pass, not a styling detail.

- **Persian text.** Every user-visible string. An English label is a defect, not
  a placeholder.
- **Persian digits.** ۰۱۲۳۴۵۶۷۸۹ everywhere a user reads a number. Stored Latin,
  rendered Persian. `٬` as the thousands separator.
- **Jalali dates.** Every date shown. Gregorian is never displayed.
- **RTL.** `dir="rtl"` on the document root. Logical CSS properties only.
- **The week starts on شنبه.** A behavioural requirement, not a formatting one —
  it governs slot generation, report ranges and grid column order.
- **Vazirmatn**, self-hosted. No CDN, so the product works offline.

**A screen that is functionally correct and shows Latin digits is not correct.**

---

## 7. Permissions are enforced on the server

**Hiding a menu is not access control.** (Immutable rule 2.)

- Every permission check happens in a **module function**, so the worker, Server
  Actions and Server Components all pass through it.
- `tenantId`, `clinicId`, `userId` and `role` **are never input** — they are
  resolved from the session, per request.
- **A permission with no negative test is unverified.** Both directions are
  mandatory for all 16 permissions across all 3 roles.
- **No user changes their own access** (rule 9), including a manager.
- **The manager column is locked** — a clinic cannot be left with no manager.
- Ownership scoping returns **404, not 403** — a 403 confirms the record exists.

---

## 8. When something is ambiguous

**Ask. Do not guess.**

The Phase 0 report records three open questions resolved by documented
assumption rather than by guessing (`reports/phase-00-report.md` §6). That is the
standard: assume explicitly, record the assumption, and raise the question.

- **`TODO` and placeholder are forbidden.** Resolve it, or raise it.
- **A deferred item keeps its reason** and is recorded, never dropped silently.
- **A new architectural decision gets an ADR** in `docs/roadmap/decisions.md`
  before it is implemented.
- **A change to the immutable rules or the closed sets requires an ADR**
  (ADR-0016).

---

## 9. Working agreements

- **English in code, Persian in the interface.** No exceptions.
- **Conventional Commits**, English, imperative. `feat(cycles): …`
- **The repository is local.** No remote, no push.
- **Never commit** secrets, `.env` files (except `.env.example`), or database
  files.
- **Tests**: a bug fix ships with the test that would have caught it.
- **Update `docs/roadmap/progress.md`** in the same commit that completes the
  work.
- **Close every phase with a report** in `reports/`.
