# Phase 2 — Appointments and Scheduling

**Status.** Complete. `npm run verify` passes end to end.
**Dates.** Started and completed ۱۴۰۵/۰۷/۱۲ (Gregorian 2026-10-04).
**Commit.** `feat: phase 2 appointments and scheduling`

---

## 1. What this phase shipped

### The module (`src/modules/appointments/`)

| File | Responsibility |
|---|---|
| `lib/status.ts` | The 8-state transition relation. `APPOINTMENT_TRANSITIONS` is `Record<Status, readonly Status[]>`, so a status added to the constants without a row is a compile error. `canTransition`, `isTerminal`, `isSweepTransition`, `CARTABLE_STATUSES` |
| `lib/slots.ts` | Slot generation from shifts, doctor working hours, service duration, blocks and holidays |
| `lib/settings.ts` | The three booking modes (fixed slot, time range, request) and the settings that select them; the toggles the module reads |
| `lib/book.ts` | `bookAppointment`, `bookOwnAppointment`, `blockHours`, `rescheduleAppointment`, `cancelAppointment` with the deposit policy |
| `lib/transition.ts` | The transitions a person records: `recordArrival`, `recordResult`, `recordNoShow` |
| `lib/lifecycle.ts` | The sweep: `promoteToAwaitingArrival`, `flagUnrecordedResults`, `runLifecycleSweep` |
| `lib/queries.ts` | The grid queries and `unrecordedCartable` — the alarm's only surface |
| `lib/job.ts` | The worker job that calls the sweep on its tick |
| `catalog.ts` | Every Persian string the module owns, as a typed key |

### The pages

| Page | Route | What it renders |
|---|---|---|
| Reception | `/reception/appointments` | Day grid, week grid, and the cartable behind a tab bar. Day navigation, arrival marking, the booking popup. Runs the sweep on the way to rendering |
| Manager | `/admin/appointments` | The same day, read-only — `writable: false` renders no «نوبت جدید» and no row actions — with doctor and status filters |
| Doctor | `/doctor` | «برنامه من»: the caller's own column, with the quick-book shortcut rendered only when `DOCTOR_SELF_BOOKING` is on |

All three are Tailwind only, reading the `:root` token block through `@theme`. The
booking popup carries the Jalali week strip in its date step and the searchable
customer select in its third step. Digits are Persian throughout and the layout is
RTL.

### The tests

44 files, 1098 tests. Phase 2 added 4 files (69 tests) on top of Phase 1's 1073:

- `tests/status.test.ts` — DoD 1. All 8 states reachable, every illegal transition
  refused, no skipping the awaiting step, nothing leaves a terminal state.
- `tests/slots.test.ts` — DoD 2. The case table, including a full year of generated
  days with no missing or duplicated slot.
- `tests/booking.test.ts` — DoD 3, 4, 6 and 9, against a real SQLite file. Booking
  by a manager, a secretary and a refusal for a role without
  `manage_appointments`; the double-booking guard under two concurrent requests
  answering «این ساعت قبلاً رزرو شده است»; a blocked hour and a blocked day; the
  quick-book refusal server-side when its toggle is off.
- `tests/lifecycle.test.ts` — DoD 7. The sweep promotes on the day, flags two hours
  past the slot, and the flagged row appears in the reception cartable and nowhere
  else.

---

## 2. What was actually broken, and what the fix was

The WIP commit's message named `booking.test.ts`. Two of the three defects were
elsewhere.

### The syntax error was in `lifecycle.test.ts`

`tsc` reported one error: `lifecycle.test.ts(168,2): error TS1128`. A bracket-balance
pass over the file showed a depth of −1 at the end, and the per-line trace showed
the function `booking()` closing at line 166 and a stray `)` at line 168 pushing the
depth negative. The `)` was removed. **`booking.test.ts` had no syntax error** — it
had 42 type errors, below.

### `booking.test.ts` — 42 type errors, one root cause

The helper `bookArgs()` and the inline calls passed plain strings where the module's
branded `LocalDate` and `LocalTime` are expected. `DAY` and `SLOT` were
`'1405-01-04' as const` and `'10:00' as const` — string literals, not branded
values. Fixed by branding the two constants with `asLocalDate()` / `asLocalTime()`,
typing `bookArgs()`'s patch as `LocalTime`, and wrapping every inline literal. Zero
errors after.

### `lifecycle.test.ts` — three failing tests, one root cause

Three "leaves a later slot alone" tests failed. The cause was the clock constant:
`NOW = new Date('2026-10-04T14:00:00Z')`, with a comment asserting it is
`1405-01-04`. It is not — the library converts `2026-10-04` to **`1405-07-12`**, more
than six months past the day the fixtures sit on. The sweep derived "today" from the
clock and compared it against the stored Jalali day, so every fixture the suite
called *later* compared as *earlier*, and the sweep reached all of them.

Fixed by setting `NOW` to `2026-03-24T14:00:00Z`, which the library converts to
`1405-01-04`. The test's own comment now states that the instant must land on the
constant as the library converts it, not merely be labelled as it — so the next
reader does not re-make the assumption. The `booking()` fixture's `scheduledAt` was
also hardcoded to the wrong instant; it is now derived from the stored local date,
the local time and the offset through `toUtcInstant`, so the two representations of
one row can no longer disagree.

### Four unused imports

`assertTransition` in `lifecycle.ts`, `MESSAGES` in `status.ts`, `AppErrorOptions` in
`transition.ts`, `LocalDate` in `booking.test.ts`. All four removed — none was
referenced. Lint is clean.

---

## 3. The DoD, gate by gate

| DoD | State | Evidence |
|---|---|---|
| 1 — all 8 states reachable, every illegal transition refused | **Pass** | `status.test.ts`, 13 assertions over the relation |
| 2 — slot generation, a full year with no missing or duplicate | **Pass** | `slots.test.ts` |
| 3 — same record shape from doctor, secretary, manager; refusal without the permission | **Pass** | `booking.test.ts`, three bookings and the refusal |
| 4 — double-booking guard under two concurrent requests | **Pass** | `booking.test.ts`, `appointment.slotTaken` |
| 5 — the three booking modes | **Pass (logic)** | `settings.ts` and the slots suite. The public booking shell is Phase 8 |
| 6 — a blocked hour and a blocked day remove exactly the right slots | **Pass** | `booking.test.ts` and `slots.test.ts` |
| 7 — the worker's two transitions, the alarm in the reception cartable | **Pass** | `lifecycle.test.ts`, 12 tests |
| 8 — three pages, no overflow, no axe critical, no Latin digit | **Not verified — see §4** | The pages render; the gates could not run |
| 9 — the quick-book shortcut refused server-side when its toggle is off | **Pass** | `booking.test.ts`, `appointment.quickBookDisabled` |

---

## 4. What is deferred, and what could not run

**The accessibility and responsive gates (DoD 8) are not verified in this phase.**
The three pages are written to the design system's responsive rules — the day grid
renders a stacked card list below the 1000px breakpoint and a table above it, with
no `overflow-x` path that clips — but Playwright's Chromium cannot be downloaded on
this machine. This is the same blocker Phase 1 recorded, and it is still open. A
machine that can fetch the browser should run `npm run e2e` and the axe pass over
these three pages before Phase 11's full verification.

**The cross-tenant suite on PostgreSQL.** Unchanged from Phase 1: needs a live
PostgreSQL server. `check:rls` covers the policies statically and fails closed.

**The e2e suite.** Not executed, same blocker.

**The public booking shell.** DoD 5's *behaviour* is verified in the logic and slot
suite; the shell itself renders in Phase 8, per the roadmap's dependency shape.

---

## 5. Nothing left broken

No file is left with a syntax error, a type error, or a failing test. `npm run build`
produces the route table with `/reception/appointments`, `/admin/appointments` and
`/doctor` all server-rendered on demand. `npm run verify` passes all eight gates:
generate, typecheck, lint, `check:files`, `check:i18n`, `check:overrides`,
`check:schema`, `check:rls`, and 1098 tests.

The four relaxations Phase 1 recorded are unchanged and still scheduled for Phase 11:
the coverage thresholds (global 60, `core/localization` 80, `roles-permissions` 100),
`noUncheckedIndexedAccess`, `experimental.turbopackMinify: false`, and the removed
`eslint` key.

---

## 6. Open questions

Carried, unchanged: OQ-1 (public page count, Phase 8), OQ-2 (the four tables awaiting
the demo re-check, Phases 6 and 7), OQ-3 (the recomputable balance cache, Phase 5).

One observation, not a blocker: the doctor's column header takes the doctor's name
from the day's first row and falls back to the panel's title when the day is empty.
The membership's own name is the `users` module's, which Phase 3 builds; the fallback
is honest about that and can be replaced when the module exists.

---

*Next: Phase 3 — Customers, services, staff. See `../roadmap/phases.md`.*
