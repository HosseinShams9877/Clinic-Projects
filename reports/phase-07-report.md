# Phase 07 Report — Campaigns, Audiences, Assistant

## 1. Phase

**Complete**, started and completed ۱۴۰۵/۰۷/۱۴. Closed in commit `12544de`
(`feat: phase 7 campaigns audiences assistant`) over two WIP commits,
`7845e33` and `7f95cf3`.

Phase 6 left two of OQ-2's four tables unchecked against the demo — campaign
types and audience groups. This phase is the answer to both, and it is the last
module phase before the product's public surfaces.

---

## 2. What was produced

**Three modules, one page, two worker jobs.**

### 2.1 `audience-groups`

The eight built-in groups the specification names, each one a predicate over the
tenant's own customers. A group is a *query the tenant owns*, which is why the
eight are seeded by the page and not by a migration — a tenant seeded by a
migration is a tenant a later release cannot add a ninth group to. The module
owns the evaluators, the predicate combinators and the reads the pages render;
`lib/queries.ts` is the only writer of a group's membership count.

### 2.2 `campaigns`

The campaign entity, its schedule, its approval gate and its results table. The
approval gate is the phase's load-bearing rule: **no campaign dispatches before
it is approved**, and approval is two columns a forced row cannot fake. The
attribution read lives here (`lib/attribution.ts`) — a booking is linked to the
campaign that most recently reached its customer, read through `messages`' own
ledger ordering.

### 2.3 `campaign-assistant`

The reading of a Persian brief into a proposal. The module holds no database
client, no audience evaluation, no campaign write and no send — the signature of
`interpretCampaignBrief` is the guarantee, and a barrel that re-exported a write
would make that guarantee uncheckable. The proposal carries an audience group
*name*, which `campaigns` resolves against rows `audience-groups` own, so the
assistant never touches a customer id.

### 2.4 The two worker jobs

Registered beside the four that already existed, taking the registry from four
kinds to six:

| Kind | Cadence | Scope | Module |
|---|---|---|---|
| `audience-groups.refresh` | nightly | `each-tenant` | `audience-groups` |
| `campaigns.dispatch` | every 15 minutes | `own-tenant` | `campaigns` |

The refresh is the case `09-security.md` §8 names for `each-tenant` — every
tenant's groups re-evaluated, one scoped transaction per tenant — and it
enqueues its own successor inside the owning iteration's transaction, so one
nightly job does not become one per tenant. The dispatch job is the only thing
that turns a scheduled, approved campaign into sends, and its cadence is a
property of the job rather than of the queue.

### 2.5 `admin/campaigns`

The manager's campaigns surface — the builder, the assistant and the results
table. The three writes the builder needs are server actions, so the page holds
no form state; the two dropdown lists are built on the server and handed to the
client component as already-built props, because the module barrels are
server-only (§4).

---

## 3. Tests

The phase's instruction fixed the count at three files, one per definition of
done, and said not to chase a number. Nine cases across them:

| DoD | File | Cases |
|---|---|---|
| **DoD 1** — all 8 audience groups evaluate to the correct sets | `src/modules/audience-groups/tests/evaluation.test.ts` | 3 |
| **DoD 2** — no campaign dispatches before approval | `src/modules/campaigns/tests/approval-gate.test.ts` | 3 |
| **DoD 3** — the assistant never returns or accepts a clinical field | `src/modules/campaign-assistant/tests/no-clinical-data.test.ts` | 3 |

DoD 1 selects exactly one customer per group and nobody else, excludes the
inactive customer and the lead from every group, and excludes a cycle whose
customer already booked. DoD 2 never scans a draft even one whose
`scheduledAt` has passed, refuses a row forced to `ACTIVE` without the two
approval columns, and sends through the real path — submit, a second person
approves, activate. DoD 3 takes no transaction, no tenant and no customer id,
rejects a clinical field at compile time and at read time, and answers a
proposal whose fields stay inside the closed sets.

`src/worker/tests/registry.test.ts` kept its six cases and its expected-kinds
list grew by the two new jobs.

---

## 4. What was fixed during verification — the argon2 import chain

The phase's only build failure was not argon2. It was an import chain, and it
was the same class of failure Phase 5 recorded for `payments`.

`next build` died with `Module not found: Can't resolve
'@node-rs/argon2-wasm32-wasi'`. The chain was the booking popup
`src/app/_appointments/booking-dialog.tsx` — a **client** component — reaching
`@/modules/appointments/lib/book`, which imported `@/modules/campaigns` for the
attribution call, which imports `@/modules/messages`, which imports
`@node-rs/argon2`. argon2 cannot run in the browser, so the client bundle failed
to resolve it. **A lazy `await import()` would not have fixed this** — a dynamic
import is still resolved for the browser graph, which is the same finding Phase
5 made.

The fix was the Phase 5 pattern, applied by moving the attribution to the server
boundary:

- `src/modules/appointments/lib/book.ts` **no longer imports `@/modules/campaigns`**.
  The module's barrel reaches no module but `roles-permissions` again, so
  `appointments` stays client-safe.
- The attribution moved to `src/app/_appointments/actions.ts`, which is
  `'use server'` and may import anything. `createBookingAction` and
  `quickBookAction` now call `attributeAppointmentToCampaign` after the booking,
  inside the same tenant-scoped transaction, so the link is atomic with the slot
  it attributes.

This is the rule any future module that reaches a server-only barrel from a
client component must follow: **keep the barrel intact and move the call to the
server boundary**, never reach the barrel from the client and never split the
import to hide the reach.

---

## 5. `prisma/schema.prisma`

The schema is **1000 lines** — ADR-0007's ceiling, met exactly and not passed.
One file, both engines, validating as SQLite and PostgreSQL. The phase's models
(Campaign, AudienceGroup and their supporting entities) are the last the
specification calls for, and the schema reached its documented bound with them.

---

## 6. Coverage

**The coverage floors are still red, by instruction**, and left red as Phases
3–6 left them. Global remains against the relaxed 60% floor, with
`core/localization` at 80% and `roles-permissions` held at 100%. The phase wrote
three test files because the instruction fixed the count at three and said not
to write tests to hit a number. Phase 11 is where the posture is revisited and
the largest holes are decided on.

---

## 7. DoD 9 — unobserved, not failing

The axe and responsive pass over `admin/campaigns` has not run. Playwright's
pinned Chromium cannot be downloaded on this machine, so the e2e suite remains
written-but-unexecuted and DoD 9 stays unchecked — **the sixth phase running**
this has been true. The static gates that *are* observable pass: `check:i18n`
clean, lint clean with zero warnings, and the page is written to the design
system's breakpoints. A machine that can fetch the browser should run
`npm run e2e` and the axe pass before Phase 11.

---

## 8. What is deferred

- **The «پیامها» settings tab** — still Phase 10's, as Phase 6 deferred it. The
  reads, validation, defaults and seeding all exist and are exercised by the
  dispatch; the tab that edits them is a settings-form for the settings module
  Phase 10 builds.
- **A real provider adapter** — the interface and the console adapter are in
  place from Phase 6; a real SMS or WhatsApp adapter is a deployment choice.
- **The campaign results depth** — the results table renders the attribution
  counts; the per-campaign revenue figure the spec's §13 hints at is a Phase 10
  reporting surface, and computing it here would put an accounting read in the
  campaigns module.

Carried from the earlier phases, unchanged:

- **The cross-tenant suite against a live PostgreSQL** — `check:rls` covers the
  policies statically; the behavioural half remains unobserved, as it has since
  Phase 1.
- **The e2e suite** — written, not executed, for the same Chromium reason.

---

## 9. Verification summary

| Gate | Result |
|---|---|
| `npm run build` | ✅ green — the argon2 chain resolved by the §4 move |
| `npm run typecheck` | ✅ green |
| `npm run lint` | ✅ green |
| `check:files` | ✅ none over 1000 (`schema.prisma` at the ceiling exactly) |
| `check:i18n` | ✅ clean |
| `check:overrides` | ✅ clean |
| `check:schema` | ✅ valid for sqlite and postgresql |
| `check:rls` | ✅ tenant-scoped tables isolated |
| `npm run test` | ✅ green — three files and nine cases over Phase 6's 1129 |
| DoD 9 (axe + responsive) | ⚠️ unobserved — Playwright Chromium unavailable, sixth phase |

The gates were last run in the session that closed commit `12544de`; this record
was written afterwards and did not re-run them, per instruction.

---

## 10. What is open

Carried, unchanged from Phase 6:

- **The cross-tenant suite on PostgreSQL** and **the e2e suite** — both
  environmental, both documented in §7 and §8.
- **The coverage floors** — red by instruction, revisited in Phase 11.
- **OQ-2** — the two tables this phase was asked to settle (campaign types,
  audience groups) are now enforced in code in `src/core/constants` and
  `src/modules/audience-groups`, and exercised by DoD 1. The open half of OQ-2
  is closed by this phase. What remains is the *behavioural* check against the
  demo, which is the same Chromium and PostgreSQL gap, not a code gap.

---

*Phase 7 is closed. Phase 8 (the public site) is next.*
