# Phase 09 Report — Customer Panel

## 1. Phase

**Complete**, started and completed ۱۴۰۵/۰۷/۱۶. Closed in commit `ef06130`
(`feat: phase 9 customer panel`), one commit, no WIP.

Phase 8 built the site a visitor sees. This phase builds the four pages a
customer sees after the OTP, and the rule that makes them safe is the one the
security document states as an absence: the panel has no permission primitive,
so a customer's scope is their own `customerId` and nothing else.

---

## 2. What was produced

**Two module halves, four pages, four Server Actions, two client islands.**

### 2.1 The panel's two module halves

| File | Surface |
|---|---|
| `appointments/lib/own-panel.ts` | `customerAppointments`, `cancelOwnAppointment`, `rescheduleOwnAppointment` |
| `customers/lib/own-panel.ts` | `readOwnProfile`, `updateOwnProfile`, `recordOwnConsent`, `ownCareInstructions` |

Each is the panel half of a module the desk already owns, and each replaces the
desk's permission with a `where` clause intersecting the tenant with the
session's own customer id. `09-security.md` §7 is the reason: a customer holds
none of the three roles, so a capability check would be a check that could not
fail, and the honest rule is a query. The desk's `cancelAppointment` opens with
`requirePermission`; these open with `loadOwnAppointment`, and the difference
between the two files is the whole of §7.

`rescheduleOwnAppointment` reuses the public booking path — the same day,
deposit and slot guards the wizard runs — under a `TenantPrincipal` whose role
is `public`. The permission primitive is never consulted on that path, which is
the honest reading of §7 rather than a bypass of the check the desk keeps.

### 2.2 The four pages

`src/app/account/(panel)/`, contributing no URL segment:

| Page | Reads |
|---|---|
| `/account` | the next session, the active cycle's progress bar, the latest care card |
| `/account/appointments` | upcoming and past, split at the same instant the policy measures |
| `/account/care` | one card per service the person has actually had |
| `/account/profile` | the person's own facts and their four consent flags |

`/account/payments` was already Phase 5's, and it is the fifth page the goal
names; nothing in it needed to change, because it was scoped by the session's
`customerId` the day it was written.

The dashboard is the panel home the nav table names — there is no
`/account/dashboard` route — so the Phase 1 placeholder at `(panel)/page.tsx`
is the dashboard, rewritten.

### 2.3 The four Server Actions

`src/app/_account/actions.ts` — cancel, reschedule, edit profile, record
consent. Each resolves the customer from the session and hands the session's
own `customerId` to the module. **No action accepts a customer id and none
reads one from the request**, which is DoD 2 as a property of the file's shape.

The cancellation is where the deposit policy lands. `cancelOwnAppointment`
returns the deposit the clinic received, and the action composes the policy
through `payments`' own `readPaymentSettings` and `refundAmountFor` — the same
split the desk's cancellation keeps, for the same reason: the money is that
module's. §4.3 below is why that composition lives in the action and not in the
module.

### 2.4 The two client islands

| File | Carries |
|---|---|
| `_account/appointment-actions.tsx` | cancel and reschedule, as the state machine permits them |
| `_account/profile-forms.tsx` | the profile form and the consent form |

`02-architecture.md` §6's split: the server component renders the read, the
island carries the write. A terminal row renders no buttons, so a person cannot
press one the module is certain to refuse.

### 2.5 Customer authentication hardened

`auth/lib/session.ts`, three constants and one function:

- `SESSION_IDLE_MS` — 30 minutes. The row's `expiresAt` is `now + IDLE`, so a
  session left alone for half an hour is dead at the next resolution.
- `SESSION_TTL_MS` — 24 hours, the absolute ceiling the idle window cannot
  slide past.
- `renewSession` — slides `expiresAt` forward on use, capped at
  `createdAt + TTL`. Called from `_shell/session.ts` on every panel request
  that is more than halfway to expiry, so a session in active use never dies of
  idleness and never outlives its day.

OTP hardening was already Phase 8's — `MAX_CODE_ATTEMPTS`, per-mobile and
per-IP rate limits, `CODE_TTL_MS` expiry, single-use, hash-only storage — and
DoD 7's four properties were closed then. This phase did not touch them.

### 2.6 The copy

`CUSTOMER_APPOINTMENTS_PAGE` in the appointments catalog and `CUSTOMER_PANEL`
in the customers catalog. `src/app/catalog.ts` is at ADR-0007's 1000-line
ceiling, so a new surface's copy goes in its own module's catalog, the way
Phase 8's public-site catalog did.

---

## 3. The scope is the `where`, and the answer for another customer's row is 404

Two of the three DoD tests are about the same fact, and a mock would have
asserted the mock — so all three run against a real SQLite file.

The first asserts the four reads return A's rows and not B's, and that the one
write a customer holds, naming B's appointment by id, raises `NotFoundError`
and **not** `PermissionError`. §6.3's 404-not-403 rule is strongest for a
customer: a 403 would confirm that another person's appointment exists at this
clinic, which is a disclosure the panel must not make to someone who has no
reason to know it. The panel has no permission primitive to raise in the first
place, so the answer could not be a 403 — and the row the caller could not see
was never loaded, which is what scoping the read rather than guarding after it
guarantees.

The second is a type-level assertion, because DoD 2 is a property of the
surface's *shape*. The four pages take no parameters at all; the islands and
the actions take ids of the row being acted on and nothing else. A `customerId`
prop added anywhere in the chain is a prop a caller could point at anyone, and
the suite stops compiling the day one appears.

The third asserts a cancellation a month out closes the row, releases the slot,
and reports the ۵۰۰٬۰۰۰ deposit; and one ninety minutes away is refused as
`appointment.customerCancelWindowClosed` and writes nothing. The refusal names
the window and the fix — call the clinic, because the desk can still do what
the customer cannot — which is what makes it a policy and not a silent no-op.

---

## 4. Two things worth recording

### 4.1 The cycle the dashboard reads had no seed

The first run of the isolation test failed on `customerCycles` returning `[]`:
the suite seeded appointments and no `TreatmentCycle`, so the dashboard's
progress bar had nothing to read and B's cycle was absent from A's page for the
wrong reason. The fix was to seed a course for each customer — the same
service, partway through — so the assertion is about the `where` and not about
an empty table. DoD 6's bar reads `completedSessions / totalSessions` from the
row the module returns, capped at 100 for an unbounded course.

### 4.2 The session test's one changed assertion

`openSession`'s `expiresAt` was asserted against `SESSION_TTL_MS` — the
absolute lifetime — before this phase, and the hardening made it
`SESSION_IDLE_MS`, the sliding window. One line in an existing twelve-test
suite changed to match; no test was added, because the instruction fixed this
phase's count at three.

### 4.3 The build failure: a Node module on a browser chunk

`npm run build` failed before any of the above was reachable:

```
TurbopackInternalError: the chunking context (unknown) does not support
external modules (request: node:async_hooks)
```

`own-panel.ts` imported `readPaymentSettings` and `refundAmountFor` from
`@/modules/payments`. That extended the appointments barrel's runtime graph to
`node:async_hooks` — `payments → staff → auth → @/core/db/context →
@/core/db/scope` — and the barrel is on a client-chunk path, because the public
booking wizard imports `weekDays` from it. A browser chunk cannot carry a Node
module, so the booking page failed to write.

The composition moved to `_account/actions.ts`, which is `'use server'` and can
reach anything. Re-tracing the graph afterwards: the appointments barrel visits
41 modules and hits `node:async_hooks` zero times; the customers barrel 33 and
zero.

The rule this generalises to, for the module after this one: **a barrel reached
by a client component has a Node-free runtime graph as a build constraint, not
a style preference.** A deep import is banned by lint, moving `weekDays` out of
the barrel was Phase 8 churn, and splitting the barrel would have broken the
architecture — so the server-only boundary is where a Node-bearing dependency
has to sit.

---

## 5. What was fixed during verification

Four lint findings and one build failure:

- **`no-empty-object-type` on `PanelActionResult`.** `T extends void ? {} : T`
  was the first attempt; `{ ok: true } & Record<string, never>` then failed to
  typecheck, because the intersection makes `ok` itself incompatible. The
  rule's own suggestion — `object` — is the one that satisfies both.
- **Three unused imports**, two of them the session constants the hardening
  made redundant once the one assertion changed, and `Channel` in the
  customers panel half, left over from an earlier shape of the consent write.

No existing test changed its assertions beyond the one `expiresAt` line. The
customers and appointments changes are additive: two new exports, one catalog
each.

---

## 6. `prisma/schema.prisma`

Untouched, still 1000 lines exactly. The phase added no model, no column and no
index: the panel reads what Phases 2–5 wrote, the cancellation window is a
constant the refusal names, and the session lifetimes are constants the
resolution reads.

---

## 7. Coverage

Not measured, and not a goal. The instruction fixed the test count at three;
the three are the three it named, one each, and each is asserted against the
database rather than against a mock because two of the three are `where`
clauses.

`renewSession` is new production code the three do not cover. It is wired into
`_shell/session.ts` and its policy — idle slides, absolute does not — is the
one the one changed session assertion states, but the function itself is not
exercised by a test this phase. That is the cap's cost, recorded here rather
than silently absorbed.

---

## 8. What is deferred

The axe and the responsive pass over the four pages — the same Chromium
blocker every phase records, eighth phase running. The pages are built to the
design system's tokens and breakpoints, every Persian string is digit-converted
and the progress bar carries `role="progressbar"` with the Persian sentence as
its `aria-label`, but none of it has been observed rendering.

Two DoD items were already closed by earlier phases and are not re-asserted
here:

- **DoD 5's image half** is Phase 8's gallery test — "renders the image once
  consent is recorded, and stops when it is revoked" — through the read's
  `revokedAt: null` term. The panel's revocation writes the same flags and
  evidence rows the desk's `recordConsent` writes, so the two cannot drift on
  what a consent change writes.
- **DoD 5's send half** is Phase 6's `notifications/lib/consent.ts`, which
  reads the latest `ConsentRecord` row before every send and records
  `SUPPRESSED` with a reason when it is absent. A revocation here is a row with
  `granted = false` and `source = 'customer-panel'`, so the suppression is
  immediate on the next dispatch and auditable from the ledger.
