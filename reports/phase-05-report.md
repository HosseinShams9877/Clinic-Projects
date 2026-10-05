# Phase 05 Report — Payments and Debts

**Status: closed.**

Phase 5 is complete. The build is green (routes added: `reception/debts`,
`admin/debts`, `doctor/debts`, `account/payments`), `npm run verify` passes at
**1124 tests across 53 files**, and the work is committed. What follows is what
shipped, what was fixed, and what remains open.

---

## 1. Phase

**Phase 5 — Payments and debts.**

Goal, from `../roadmap/phases.md`: money received, the balance, and debt
follow-up — with the balance **computed and never stored**. `payments` is the
only writer of a financial fact; `debts` is a computed view over the ledger and
writes nothing but the follow-up.

---

## 2. What was produced

### 2.1 The `payments` module

`src/modules/payments/`, following the `appointments` pattern — `index.ts`,
`lib/`, `types/`, `catalog.ts`, `validation/`, `tests/`.

- **`lib/record.ts`** — `recordPayment` and `recordRefund`, the only two writers
  of a `payments` row. A `REFUND` carries a negative `amount`, which is what
  makes `Σ amount` the paid side of the balance in both directions. A discount
  records `discountByUserId` and writes an audit row naming the granter inside
  the same transaction (immutable rule 7).
- **`lib/balance.ts`** — `appointmentBalance`, `customerBalance` and `asBalance`,
  the one place `03-data-model.md` §4.1's formula lives:
  `charged − discount − paid`, from aggregates over the unit table.
- **`lib/discount.ts`** — `assertDiscountAllowed`, the server-side guard: toggle 3
  off refuses any discount at all (manager included), and the secretary's cap
  bounds the amount, where a NULL cap is no discount rather than no ceiling.
- **`lib/cache.ts`** — `recomputeCustomerTotals` and `cachedCustomerBalance`, the
  recomputable sums §4.3 permits. The cache is written inside the same
  transaction as the receipt.
- **`lib/reconcile.ts`** — `runReconciliation`, re-deriving every customer's
  three sums, correcting the ones that drifted, and **throwing when any did**.
  A reconciliation that quietly repaired itself would hide the second writer it
  exists to detect.
- **`lib/job.ts`** — the worker's `payments.reconcile` handler, rescheduling its
  own next tick inside the same transaction as the work.
- **`lib/queries.ts`** — the customer's ledger: the balance and the receipts in
  one scope, so «پرداخت‌های من» cannot show a number the rows disagree with.
- **`lib/settings.ts`** — the three financial settings, where NULL is a decision
  the clinic has not made: no cap, no refund policy, no discount toggle.
- **`validation/record-payment.ts`** — the Zod schema the form validates against.

### 2.2 The `debts` module

`src/modules/debts/`, the same shape.

- **`lib/queries.ts`** — `contactList`, `clinicDebts`, `doctorDebts` and
  `customerDebts`, each gated on `view_debts` and scoped by a `where` clause.
  The doctor's read is scoped by `doctorId` in the query, so another doctor's
  debts are absent from the read and not refused after it.
- **`lib/buckets.ts`** — `bucketOf` and `effectiveDueInstant`, the four
  severities the desk stacks worst-first, with the override taking precedence
  over the computed date.
- **`lib/follow-up.ts`** — `recordFollowUp` and `rescheduleDueDate`, the two
  writes a debt carries, both gated on `follow_up_debt`. Neither takes a balance
  as an argument: a module that did would be trusting a number a caller computed
  instead of the ledger it is computed from.
- **`lib/settings.ts`** — the grace days, the `SECRETARY_MOVE_DUE_DATE` toggle
  and the tenant's clock offset.

### 2.3 The four pages

- `src/app/reception/debts/` — the desk's follow-up queue, with the three row
  writes: record a payment, record a follow-up, move the due date.
- `src/app/admin/debts/` — the manager's read-only oversight, no row action,
  because the write that settles a debt belongs to the desk's permission.
- `src/app/doctor/debts/` — the doctor's own, granted by override.
- `src/app/account/(panel)/payments/` — the customer's own receipts and balance,
  scoped by the session's `customerId` in the `where`, with no permission
  primitive at all.

The three staff pages render one shared `src/app/_debts/debts-table.tsx` and
differ only in the copy block and the writes they offer. The desk's three forms
live in `src/app/_debts/debts-forms.tsx` and compose three Server Actions in
`src/app/_debts/actions.ts`, which run no business rule of their own and map
every failure to a Persian sentence.

### 2.4 The worker job

`payments.reconcile` is registered in `src/worker/registry.ts` beside the
appointments lifecycle sweep and the cycles next-due sweep — the third handler,
and the module's only producer of work.

### 2.5 The schema

One migration, `prisma/migrations/20261005130000_payments_debts/`, adds the
`payments` table, the three recomputable `Customer` sum columns, the financial
settings on `TenantSettings` and the follow-up columns on `appointments`. There
is **no `balance` column anywhere**; the two RLS policies for the new tables are
in the same migration list.

---

## 3. Tests

**Three tests, as the phase's instruction fixed the count.** Each one is a thing
a wrong answer would be silent about — money, the schema's shape, and a function
that does not exist.

| File | DoD | What it asserts |
|---|---|---|
| `src/modules/payments/tests/balance.test.ts` | 1 | The balance across a deposit, a partial payment, a discount and a refund, written through the module's own writers and read through its own read: charged ۱٬۰۰۰٬۰۰۰, discount ۱۰۰٬۰۰۰, paid ۳۰۰٬۰۰۰, balance ۶۰۰٬۰۰۰ |
| `src/modules/payments/tests/schema-shape.test.ts` | 2 | No model in `prisma/schema.prisma` declares a field named `balance`, read by parsing the file the migrations run against, with the two models the balance is computed from named so the parser cannot pass vacuously |
| `src/modules/debts/tests/no-delete-path.test.ts` | 4 | Neither module's public barrel offers a function whose name is a deletion — `delete`, `remove`, `void`, `cancel`, and the rest of that vocabulary — enumerated over the barrel's runtime exports |

The other six DoDs are held by the code rather than by a suite, and the phase's
instruction was explicit that no fourth test be written for them: the discount
cap and toggle are `assertDiscountAllowed`'s two throws; the audit row is written
in `record.ts` inside the transaction; the four buckets are `bucketOf`; the
cross-tenant payment is `findUnique({ where: { tenantId, id } })` answering
absent rather than refused; the four pages are built on the design system's
tokens and breakpoints, which is the gate DoD 9 names and which the environment
cannot run (§7).

---

## 4. What was fixed during verification

Three failures, all in the build and lint gates, none in the tests.

**The `payments` barrel reached the browser bundle.** `next build` failed with
`Module not found: Can't resolve '@node-rs/argon2-wasm32-wasi'`, traced through
`global-error.tsx` → `@/app/catalog` → `@/modules/payments` → `lib/record.ts` →
`@/modules/staff` → `lib/memberships.ts` → `@/modules/auth` → `password.ts`.
`payments` is the only module in `src/` that imports the `staff` barrel, and that
barrel's graph contains the Argon2 hashing path, which resolves to a browser
package that is not installed.

The fix was the one the codebase already uses: **client components may value-
import only a client-safe barrel.** `appointments`, `customers`, `cycles` and
`services` are — their `lib` reaches no module but `roles-permissions`. The two
label maps the desk's form needs are now read by the reception page on the server
and handed to the client component as already-built option lists, and the
re-export of the two maps was removed from `@/app/catalog`, which `global-error`
imports. The module's barrel keeps its writers; the browser keeps its labels.

This is worth knowing before Phase 6: **a module that records an audit is a
server-only surface, and its label maps are props, not imports, from a client
component.**

**Server Actions must be async.** `asAmount` was a synchronous exported function
in a `'use server'` file, which Turbopack rejects. It is now a private helper —
it had no caller outside the file.

**A branded `LocalDate` and a narrowed enum.** `formatDate` takes the branded
type and the form's two closed sets are strings until the action narrows them;
both were fixed at the call site rather than by loosening either type.

---

## 5. The `schema.prisma` length

The schema is **899 lines** — under the 1000-line ceiling, so `check:files` and
`check:schema` both passed without comment discipline being needed. The comment
density stayed as it was; the phase's models are few.

---

## 6. Coverage

**The coverage floors remain red**, exactly as Phases 3 and 4 left them, and for
the same reason: the phase's instruction was three tests and "do not chase a
number". The four largest holes, named so a later session can decide which earns
a suite:

- `src/modules/payments/lib/record.ts` — the module's largest file, covered only
  by the one balance test, which exercises both writers but not the discount
  guard's two throws or the refund policy's three branches.
- `src/modules/debts/lib/follow-up.ts` — the two writes, not unit-tested.
- `src/modules/debts/lib/buckets.ts` — the bucket arithmetic, not unit-tested.
- `src/modules/payments/lib/reconcile.ts` — the drift detection, not unit-tested.

Phase 11 is where the posture is revisited.

---

## 7. DoD 9 — unobserved, not failing

The accessibility and responsive gates over the four pages were not run.
Playwright's pinned Chromium cannot be downloaded on this machine — the same
blocker Phase 1 recorded, and the same one that has now prevented the gate for
five phases running.

The pages are written to the design system's breakpoints and its tokens, render
the shared table the three staff pages share, and use the existing `Combobox` and
`JalaliDatePicker` controls, so the **expectation** is that they pass; but the
report claims nothing more than that, and the gate is marked **unobserved**.
Phase 11 is where all the pages are verified together.

---

## 8. What was deferred

- **The reminder scheduling** the roadmap names beside the follow-up — the
  `debtNextContactAt` column is written by «ثبت پیگیری» and read by the desk's
  list, but no job yet turns a passed `nextContactAt` into a queued message. That
  is Phase 6's `messages` half of the same fact, and a job written now would be
  a handler for a module that does not exist.
- **The e2e permission matrix over the four pages** — the positive and negative
  permission cases are the module's own `requirePermission` calls, and the
  phase's instruction was that no test be written for them. They are unobserved
  rather than verified, as in Phase 4 §7.

---

## 9. Verification summary

| Gate | Result |
|---|---|
| `npm run build` | ✅ green |
| `npm run typecheck` | ✅ green |
| `npm run lint` | ✅ green |
| `check:files` | ✅ 300 files, none over 1000 |
| `check:i18n` | ✅ clean |
| `check:overrides` | ✅ clean |
| `check:schema` | ✅ valid for sqlite and postgresql |
| `check:rls` | ✅ 24 tenant-scoped tables isolated |
| `npm run test` | ✅ **1124 tests, 53 files, all passing** |
| DoD 9 (axe + responsive) | ⚠️ unobserved — Playwright Chromium unavailable |

---

## 10. What is open

Carried from the earlier phases, unchanged:

- **The cross-tenant suite against a live PostgreSQL** — `check:rls` covers the
  policies statically; the behavioural half remains unobserved, as it has since
  Phase 1.
- **The e2e suite** — written, not executed, for the same Chromium reason.
- **The coverage floors** — red, documented in §6, to be revisited in Phase 11.
- **OQ-2's second half** — the four tables the open question asked to be
  re-checked (campaign types, audience groups, automatic messages, acquisition
  sources). Phases 6 and 7 depend on them.
- **OQ-3 — the recomputable balance cache** — **closed by this phase.** The
  cache is written in the same transaction as the fact, re-derived nightly by
  `payments.reconcile`, and the reconciliation throws when it finds drift. The
  one question the roadmap left for Phase 5 is answered.

---

*Phase 5 is closed. Phase 6 (messages and notifications) is next.*
