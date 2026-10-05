# Phase 3 — Customers, Services, Staff

**Status.** Complete. `npm run build` and `npm run verify` both exit 0.
**Dates.** Started and completed ۱۴۰۵/۰۷/۱۳ (Gregorian 2026-10-05).
**Commit.** `feat: phase 3 customers services staff`

---

## 1. What this phase shipped

### The three modules

| Module | Files | Responsibility |
|---|---|---|
| `src/modules/customers/` | `lib/dedupe.ts`, `lib/leads.ts`, `lib/profile.ts`, `lib/queries.ts`, `catalog.ts`, `types/`, `index.ts` | The mobile dedupe, the lead cartable and its conversion, the profile and consent writes, and the three read scopes (clinic-wide, doctor's own, one profile) |
| `src/modules/services/` | `lib/manage.ts`, `lib/queries.ts`, `catalog.ts`, `types/`, `index.ts` | The catalogue's create/update/activate/deactivate — no delete — and the two reads the booking gate shares with the picker |
| `src/modules/staff/` | `lib/memberships.ts`, `lib/leave.ts`, `lib/audit.ts`, `catalog.ts`, `types/`, `index.ts` | The staff list, the permission-matrix write and the role change, the membership switch, the leave state machine, and `AuditLog`'s only writer |

All three follow `src/modules/appointments/` as it actually is: `index.ts`, `catalog.ts`,
`lib/`, `types/`, `tests/`. The task text listed `components/`, `hooks/`, `api/` and
`validation/` directories as part of the pattern; **`appointments/` has none of them**,
and a module here has no client components or hooks of its own — those live in
`src/app/_<feature>/`. Mirroring the real pattern meant four directories, not eight.

### The seven pages

| Page | Route | What it renders |
|---|---|---|
| Reception | `/reception/customers` | The customer file, searched by name or mobile over `searchName`, with lifecycle badges and the last visit |
| Reception | `/reception/leads` | The lead cartable with its counts, follow-up recording, and the manual-lead form |
| Manager | `/admin/customers` | The same file from the manager's wider scope |
| Manager | `/admin/customer/[id]` | The profile: appointment history, payment history, consent flags, the note, the profile edit |
| Manager | `/admin/services` | The catalogue with the doctors each service is bookable by, category, price, deposit and duration; create, edit, doctor assignment, activate/deactivate |
| Manager | `/admin/staff` | The staff list with per-membership permissions, the 16×3 matrix as a read-only reference, the leave table, and the audit trail |
| Doctor | `/doctor/customers` | «مراجعین من» — the caller's own patients, scoped by `primaryDoctorId` |

All seven are Tailwind only, RTL, Persian digits throughout. The two new controls —
`JalaliDatePicker` and `Combobox` — compose the form shell's `Field` through
`useControlWiring`, so no control can render without its label, its error slot and its
`aria-*` wiring. `Combobox` wraps `cmdk`, and both wrap `Popover` through the new
`src/core/components/popover/` so no component imports Radix directly
(`05-conventions.md` §17).

### The tests

48 files, 1116 tests. Phase 3 added 4 files, 18 tests, covering exactly the six
scenarios the phase asked for and nothing else:

| Scenario | File | DoD |
|---|---|---|
| The mobile dedupe — same mobile, same tenant offers the existing record; a different tenant creates a new one | `modules/customers/tests/dedupe.test.ts` (3) | 1a, 1b |
| A lead converts on its first booking and keeps its acquisition source | `modules/customers/tests/dedupe.test.ts` (1) | 2 |
| A service cannot be deleted, only deactivated | `modules/services/tests/deactivation.test.ts` (8) | 3, 4 |
| A permission change takes effect on the next request | `modules/staff/tests/permissions.test.ts` (4) | 5 |
| The manager column cannot be edited | `modules/staff/tests/permissions.test.ts` (1) | 6 |
| A doctor naming another doctor's patient gets 404, not 403 | `modules/customers/tests/doctor-scope.test.ts` (3) | 8 |

DoD 7 (the audit row) is asserted as part of the permission-change suite rather than as
a scenario of its own, because a permission change and its audit row are one
transaction's two writes and asserting them apart would be asserting a seam the module
does not have.

---

## 2. The nine DoDs

| DoD | Status | Where it is asserted |
|---|---|---|
| 1. Duplicate mobile offers the existing record; another tenant's same number is a new row with no leakage | **Green** | `dedupe.test.ts` — the unique index answers, and both tenants' reads are checked directly |
| 2. A lead converts on first booking and keeps its acquisition source | **Green** | `dedupe.test.ts` — `convertedFromLead`, `lifecycle`, `leadStatus` and `acquisitionSource` all asserted on the row |
| 3. A service cannot be deleted through any surface | **Green** | `deactivation.test.ts` — asserted as a property of the barrel (`Object.keys` holds no delete-ish name), not as a runtime refusal |
| 4. Deactivation removes it from booking and leaves history intact | **Green** | `deactivation.test.ts` — `loadBookableService` refuses, `bookableServices` omits it, and the past appointment's `priceAtBooking`, `depositAmount` and `durationMinutes` are unchanged |
| 5. A permission change takes effect on the server on the next request | **Green** | `permissions.test.ts` — resolved through `getTenantContext` from the affected person's session token, before and after, and `can()` flips both ways |
| 6. The manager column cannot be edited; the attempt is refused server-side and audited | **Green, one half by contract** | `permissions.test.ts` asserts the module's refusal, the unchanged row, and the refusal's `messageKey`. The **audit** of the refused attempt is written by the app tier (`_staff/actions.ts`), which is not unit-testable without a request; the test asserts the `messageKey` the action's `isManagerColumnRefusal` matches on, which is the wiring the audit depends on |
| 7. Every permission change writes an audit row with actor, target and before/after | **Green** | `permissions.test.ts` — actor, entity, entity id, subject, role, and both before/after sets asserted |
| 8. Another doctor's patient is 404, not 403 | **Green** | `doctor-scope.test.ts` — `NotFoundError` and explicitly *not* `PermissionError`; the rule is a `where` clause, not a post-read guard |
| 9. All seven pages pass the accessibility, responsive and localization gates | **Not observed.** Same blocker as Phases 1 and 2 | The static gates that *are* observable pass: `check:i18n` is clean, lint is clean including `jsx-a11y`, and the two new controls carry no ARIA warnings. The axe and responsive pass needs Playwright's Chromium, which this machine cannot download. See §4 |

---

## 3. What broke, and what it turned out to be

**The build's first failure was a temporal dead zone in the staff page.**
`src/app/admin/staff/page.tsx` evaluated `PERMISSION_LABELS_MATRIX` at module scope and
that array read `DOCTOR_DEFAULTS` and `SECRETARY_DEFAULTS`, which were declared two
statements later. `next build` collected the page's data and died with
`ReferenceError: Cannot access 'DOCTOR_DEFAULTS' before initialization`. The two Sets
now precede the array that reads them.

**The build's second failure was the two `TenantContext` types again.**
`getTenantContext` answers `core/db/scope`'s context — `userId: string` — and `can()`
reads `core/tenant`'s — `userId: UserId`. The test's helper now re-brands the resolved
context's three ids (`asUserId`, `asTenantId`, `asClinicId`) rather than casting, so the
conversion is visible and the brands stay honest at both ends.

**The test suite's only failures were missing columns, and one wrong assumption.**
`Appointment` has no `serviceName` column — the schema holds `serviceId` as a relation
and snapshots `priceAtBooking`, `depositAmount` and `durationMinutes`. The first draft of
the deactivation suite asserted a name snapshot that does not exist; the seeded `create`
also lacked `status` and `durationMinutes`, both required with no default. Fixed by
reading the model and asserting what the schema actually snapshots. **The history is
intact because the price and duration are snapshots; the *name* is not, and renaming a
service changes what a past appointment displays.** That is a schema property, not a
Phase 3 decision, and it is worth a look before Phase 5's accounting surface depends on
a name the catalogue can change.

**`recordConsent` read the ambient clock.** `lib/profile.ts:112` and `:113` used
`new Date()` for `grantedAt` and `revokedAt`, which the clock rule bans
(`05-conventions.md` §8). The function now takes `now: Date` and the action passes
`realClock()`. The module contract type in `modules/customers/types/index.ts` was
updated to match.

**Four lint findings were Persian text in components.** The date picker's three labels
moved to a new catalog namespace, `src/core/localization/catalog/controls.ts` — a
control owns no module and no surface, so the localization layer is where its labels
live. The staff page's four leave-column headers moved to `STAFF_PAGE.membership` in
`src/app/catalog.ts`.

**Radix was being imported directly by two controls.** `JalaliDatePicker` and
`Combobox` both imported `@radix-ui/react-popover`. The eslint config already names
`src/core/components/popover/` as one of six headless-wrapper directories, anticipated
but not yet built. It is built now — `Popover.tsx` owns the panel's token styling and
passes the primitives through, and both controls compose it. `Combobox` keeps its
`--radix-popover-trigger-width` because Radix sets that variable on the content itself.

**Invalid ARIA on the two controls' triggers.** `aria-invalid` and `aria-required` are
not valid on a button, and `jsx-a11y` flagged both controls. They moved to the hidden
`<input>` each control renders — the form field whose value is submitted and whose
state the two attributes describe. Lint now reports zero warnings.

**`Permission` needed a position-13 permission for the grant test.** The secretary
default is matrix positions 1–12, so `manage_campaigns` (13) is the permission the suite
grants and revokes: a real widening and a real narrowing, not a change the default
already held.

---

## 4. What did not run, and what is deferred

| Not done | Why | What closes it |
|---|---|---|
| **The coverage floors are red.** Global is 47.31% lines / 39.02% functions against the Phase-1-relaxed 60% floor; `src/modules/*/lib/**` is 68.97% lines / 57.79% branches against 95/90. The two **named** targets are green: `core/localization` at 80% and `roles-permissions` at 100% | The three new modules ship 20 lib files and the phase wrote the six scenarios it was asked for. The largest holes are `staff/lib/leave.ts` (3.57% — the whole state machine is untested), `customers/lib/profile.ts` (2.7%), `customers/lib/leads.ts` (35%) and `services/lib/queries.ts` (40%) | The instruction was "write exactly the 6 tests listed, no more" and "do not write tests to hit a number", so the floor was left red rather than padded. **A later session should decide which of those four files earn their own suites** — `leave.ts` is the one whose behaviour the spec states as a state machine, and it is the cheapest to cover well. The baseline at `a3dde5e` was not measured (the `git stash` needed was refused), so this report does not claim Phase 3 regressed the number |
| **DoD 9's axe and responsive pass** | Playwright's pinned Chromium cannot be downloaded on this machine. Same blocker as Phases 1 and 2 | Run `npm run e2e` and the axe pass over the seven pages on a machine that can fetch the browser, before Phase 11 |
| **DoD 6's audit of a refused attempt is covered by contract, not by a test** | The row is written by `_staff/actions.ts`, and a server action cannot run outside a Next request | An integration test that drives the action, or the e2e scenario that clicks a locked manager checkbox. The action's own docblock names the wiring; the assertion of `permission.managerColumnLocked` is what guards it |
| **The cross-tenant suite on PostgreSQL** | Needs a live PostgreSQL server. `check:rls` covers the policies statically and fails closed | A machine with PostgreSQL, before Phase 11 |

---

## 5. Two things a later phase should know

**The `ServiceDoctor` / `Appointment` / `DoctorWorkingHours` `doctorId` columns hold
`User` ids, not membership ids.** This was a defect in the first draft of the services
module's doctor assignment, fixed before the suite ran: `assignServiceDoctors` looks
memberships up by `userId` and writes `row.userId`, and `serviceDoctors` returns
`row.doctor.id`. Anything that joins these three tables to `Membership` will join
wrong. Phase 4's cycles surface is the next thing that reads them.

**The booking popup and the booking gate now share one read.** `loadPopupOptions`
(`src/app/_appointments/options.ts`) was rewired from its own service query to
`bookableServices`, so the list the popup offers and the gate `loadBookableService`
enforces are one function. A service deactivated between the popup opening and the form
submitting is refused by the gate, and the two cannot disagree. The *customer* read
stays in the app tier for now: the module's own reads are permission-scoped to a
question this popup does not ask (the desk's hundred most recent, including patients a
doctor's own scope would exclude). When `customers` has that read, it moves.

---

## 6. The gate

```
npm run build    →  17 routes, exit 0
npm run verify   →  db:generate · typecheck · lint · check:files · check:i18n
                   check:overrides · check:schema · check:rls · test
                   48 files, 1116 tests, exit 0
npm run lint     →  0 errors, 0 warnings
```

**Tests deleted to get the gate green: none.** Every failure was a defect in the code,
the schema assumption, or the fixture, fixed at the cause.
