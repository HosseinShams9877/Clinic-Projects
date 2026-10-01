# 10 — Testing Strategy

> The permission matrix is the product's spine (`04-roles-permissions.md`) and
> tenant isolation is its survival (`09-security.md`). Both are verified by
> exhaustive tests, not by review. **A permission with no negative test is
> treated as unverified.**

---

## 1. Principles

1. **The negative case is the test.** That a permitted role can do something is
   table stakes. That every *other* role cannot is the assertion that protects
   the product.
2. **Test the rules that cost money or leak data, exhaustively; test the rest
   proportionately.** Slot generation, cycle arithmetic, balance, the permission
   matrix and tenant isolation get exhaustive coverage. A presentational
   component gets a smoke test.
3. **Every bug fix ships with the test that would have caught it.**
4. **Tests run against the same engine as production for anything involving
   isolation.** The cross-tenant suite runs on PostgreSQL in CI, where RLS is
   live (`09-security.md` §5).
5. **No production data in tests, ever.** Factories produce synthetic data.
6. **Deterministic.** Time comes from an injected clock; tests do not sleep on
   wall-clock.

---

## 2. Layers and tools

| Layer | Tool | Scope | Speed |
|---|---|---|---|
| **Unit** | Vitest | Pure logic: no database, no network, no React render | Milliseconds |
| **Integration** | Vitest + a real database | One module through its public surface, against a real schema | Tens of ms |
| **Component** | Vitest + Testing Library | Render, interaction, accessibility roles | Tens of ms |
| **e2e** | Playwright | The four end-to-end scenarios, across the real app | Seconds |
| **Cross-cutting** | Playwright + axe | Accessibility, responsive, RTL, Persian localization | Seconds |

The database for integration and e2e is **PostgreSQL** in CI (RLS live) and
SQLite locally (fast loop). Both run in the pipeline; the PostgreSQL run is the
one that gates a merge.

---

## 3. Unit tests — the exhaustive set

These are the pieces where a subtle error is invisible in review and expensive in
production. Each is tested against a table of cases, not a single happy path.

### 3.1 Slot generation

From the four inputs — clinic shifts, doctor working hours, service duration,
existing appointments and blocks.

| Case | Assertion |
|---|---|
| Empty day | Every slot in the shift, at the service's duration step |
| Overlapping appointment | That slot is removed; adjacent slots survive |
| Partial overlap | A slot that would overlap by one minute is removed |
| Slot block (closed hour) | All slots in that hour are removed |
| Slot block (closed day) | No slots for the day |
| Holiday | No slots; override only when the holiday toggle is on (`06-constants.md` §4 toggle 7) |
| Doctor working hours narrower than the shift | Only the intersection |
| Doctor working hours *outside* the shift | Empty, not an error |
| Service duration longer than the remaining shift | The trailing slot is not offered |
| DST / timezone | Iran has no DST since 2022; the test asserts a full year of days generates the expected slot count |
| Week starts on Saturday | The grid's first column is شنبه (`07-localization.md` §6.4) |
| Fixed-slot vs time-range vs request mode | Each mode produces its specified public-site behaviour |

### 3.2 Cycle arithmetic

| Case | Assertion |
|---|---|
| Completion creates a cycle | Only on transition to `COMPLETED` — not on booking, not on `ARRIVED` |
| Idempotency | A retried completion does not create a second cycle |
| Interval source | Read from the **cycle**, not the service — changing the service default does not move an existing cycle |
| `nextDueDate` | `lastSessionAt + cycle.intervalDays`, exactly, across month boundaries and leap months |
| Session numbering | `currentSessionNumber` increments once per completed session |
| Completion | Cycle completes when `completedSessions === totalSessions` |
| Unbounded service | `totalSessions = null` never completes |
| Enters contact list | `nextDueDate` passed **and** no future appointment for that cycle |
| Does *not* enter | A future appointment exists — this is the assertion that keeps the list useful |
| Leaves contact list | On new booking, on «منصرف شد» with a reason, on completion |
| Abandonment requires a reason | From the closed list only |
| Reschedule shifts subsequent due dates | When the setting is on (`04-roles-permissions.md` §5) |
| Two consecutive no-shows | Adds to the contact list when the setting is on |

### 3.3 Balance computation

| Case | Assertion |
|---|---|
| No payments | Balance = appointment `priceAtBooking` |
| Full payment | Balance = 0 |
| Partial payment | Balance = price − received |
| Deposit only | Balance = price − deposit, and the deposit is a `DEPOSIT` row |
| Discount | Balance = price − discount − received (the discount is part of the total, never additional) |
| Refund | Increases the balance; the original payment remains visible |
| Price changed after booking | The past appointment's charge does not move |
| Multiple appointments | Summed per appointment, never across customers |
| **Never stored** | A schema test asserts no `balance` column exists (immutable rule 8) |
| Cache reconciliation | The nightly recomputation matches the computed value; a mismatch fails loudly |
| Debt buckets | Each of the four buckets returns the exact expected set at a boundary date |

### 3.4 Persian digits

| Case | Assertion |
|---|---|
| Display | Latin input renders as Persian digits |
| Input, Persian | Typing «۱۲۳» validates as `123` |
| Input, Latin | Typing `123` validates as `123` |
| Round trip | `toLatinDigits(toPersianDigits(s)) === s` for every digit and mixed strings |
| Separator | Thousands separator is `٬`, never `,` |
| Money | Rendered in Toman with Persian digits |
| Storage | Nothing Persian-digit ever reaches the database or a URL |
| Empty and null | Do not throw |

### 3.5 Jalali conversion

The highest-risk pure logic in the product (`07-localization.md` §6.3).

| Case | Assertion |
|---|---|
| Round trip, 200 years | `jalaliToJdn(jdnToJalali(d)) === d` for every day |
| Round trip, Gregorian | Same, through the Gregorian conversion |
| Nowruz anchors | Known first-day-of-year dates |
| Leap years | A common year's اسفند has 29 days; a leap year's has 30 |
| Month lengths | 31 for months 1–6, 30 for 7–11 |
| Year boundary | ۲۹/۳۰ اسفند → ۱ فروردین |
| ICU cross-check | Agrees with `Intl` with the Persian calendar across the whole range |
| Supported range | ۱۳۹۰–۱۴۵۰ asserted explicitly |
| Week start | Saturday |

### 3.6 Other unit targets

- **Permission resolution:** `effective(user) = (roleDefault ∪ granted) \ revoked`,
  including a user with no overrides, only grants, only revocations, and both.
- **Audience predicate building:** each of the 8 built-ins produces the expected
  predicate; **a clinical field cannot be expressed** — a type-level test
  (`@ts-expect-error`) proves it.
- **Message template rendering:** variables substitute, digits convert, an
  unknown placeholder is rejected at validation time.
- **Money helpers:** no float ever appears; `BigInt` arithmetic and string
  serialisation.
- **Relative dates:** امروز / فردا / دیروز / N روز پیش at boundaries.

---

## 4. Integration tests

One module through its public surface, against a real schema.

- **Tenant context is applied** to every query the module issues.
- **A query without a tenant context throws**, not returns empty
  (`09-security.md` §4.3).
- **The Prisma client extension injects the tenant predicate** — asserted by
  querying a model that exists in two tenants and asserting only one's rows come
  back.
- **Writes carry `WITH CHECK` semantics** — an attempt to insert a row with
  another tenant's id fails.
- **Audit rows are written** for every audited action (§ `09-security.md` §13),
  with the right actor and target.
- **Consent suppression** — a customer without consent is excluded and recorded
  as `SUPPRESSED` with a reason.
- **The 90-day duplicate window** — a second message inside 90 days is
  suppressed.
- **The daily cap** — a second automatic message in a day is suppressed, and the
  priority order (next-session appointment → financial → survey) is honoured.
- **Send window** — a message outside the allowed window is not sent.

---

## 5. The permission matrix suite

**16 permissions × 3 roles × 2 directions = 96 tests.** Both directions are
mandatory.

`✓` = the operation must succeed. `—` = the operation must be **refused**
(403, or 404 where ownership scoping applies — `09-security.md` §6.3).

| # | Permission | مدیر | پزشک | منشی |
|---|---|---|---|---|
| 1 | `view_own_schedule` | ✓ | ✓ | ✓ |
| 2 | `view_all_schedules` | ✓ | — | ✓ |
| 3 | `manage_appointments` | ✓ | — | ✓ |
| 4 | `record_appointment_result` | ✓ | — | ✓ |
| 5 | `view_own_customer_records` | ✓ | ✓ | ✓ |
| 6 | `view_all_customers` | ✓ | — | ✓ |
| 7 | `view_debts` | ✓ | — | ✓ |
| 8 | `record_payment` | ✓ | — | ✓ |
| 9 | `follow_up_debt` | ✓ | — | ✓ |
| 10 | `view_own_cycles` | ✓ | ✓ | ✓ |
| 11 | `act_on_cycles` | ✓ | — | ✓ |
| 12 | `manage_leads` | ✓ | — | ✓ |
| 13 | `manage_campaigns` | ✓ | — | — |
| 14 | `manage_services` | ✓ | — | — |
| 15 | `manage_clinic_settings` | ✓ | — | — |
| 16 | `manage_users` | ✓ | — | — |

**How the negative half is tested:** for each permission and each non-permitted
role, the test calls the **module function directly** (not the page) with that
role's context and asserts it throws — and separately requests the **page URL**
and asserts the response is a refusal. Testing only the page would miss a module
reachable from the worker or a Route Handler; testing only the module would miss
a page that renders before the check.

**The manager column is asserted as 16/16 in every test**, and a dedicated test
attempts to remove a manager permission and expects a rejection
(immutable rule 9).

### 5.1 The 8 behavioral toggles

Each toggle gets a server-side test — the toggle's meaning is a rule, not a
hidden button (`04-roles-permissions.md` §4).

| # | Toggle | On | Off |
|---|---|---|---|
| 1 | Doctor books from own schedule | Succeeds | Refused |
| 2 | Doctor closes own hours | Succeeds | Refused (manager approval required) |
| 3 | Secretary gives discount | Succeeds up to the cap | Refused |
| 3b | Discount **above** the cap | Refused in both states | Refused |
| 4 | Secretary moves a debt due date | Succeeds, and is audited | Refused |
| 5 | Secretary edits a service price | Succeeds | Refused |
| 6 | Online booking without deposit | Booking completes | Booking requires the deposit |
| 7 | Booking on a holiday | Slots offered | No slots |
| 8 | Lead auto-created from the site form | Lead appears in the cartable | No lead created |

---

## 6. Security test suites

Beyond the matrix. These are the tests that would catch a real incident.

### 6.1 Self-escalation

| Test | Expected |
|---|---|
| Secretary calls the permission-update path | Refused |
| Doctor calls the permission-update path | Refused |
| Manager grants **themself** a permission | Refused (actor === subject) |
| Manager changes their **own** role | Refused |
| Manager removes their own `manage_users` | Refused |
| Any user edits their own membership | Refused |
| Removing the last active manager's access | The transaction fails; the tenant still has a manager |
| A permission payload naming a role instead of a user | Refused — the schema has no role field |

### 6.2 Cross-tenant isolation

Run against **PostgreSQL with RLS live**.

| Test | Expected |
|---|---|
| Tenant A queries a customer that exists only in B, by known id | **Zero rows** — not an error, not the row |
| Tenant A inserts a row with B's `tenantId` | Rejected by `WITH CHECK` |
| Tenant A updates a B row by known id | Zero rows affected |
| Tenant A deletes a B row by known id | Zero rows affected |
| The same mobile exists in A and B | Each tenant sees exactly its own record, with its own history |
| A join across `Customer` → `Appointment` | Cannot bridge tenants; the join table carries `tenantId` too |
| A query issued with **no** tenant context | **Zero rows** — fail closed, never all rows |
| A query issued with a **forged** `tenantId` in the body | Ignored; the resolved context wins |
| Tenant A's aggregate reports | Contain no contribution from B, not even a count |
| The worker iterating tenants | Each job runs in its own scoped transaction; a job cannot see two tenants at once |

### 6.3 Ownership scoping

| Test | Expected |
|---|---|
| Doctor requests another doctor's patient | **404**, not 403 (a 403 confirms the record exists) |
| Doctor lists customers | Only their own |
| Doctor lists cycles | Only their own patients' |
| Doctor requests the clinic-wide schedule without `view_all_schedules` | Refused |
| Doctor requests the debt list without `view_debts` | Refused |
| A doctor with a manager-granted `view_debts` override | Succeeds — overrides apply |

### 6.4 Customer panel isolation

| Test | Expected |
|---|---|
| Customer A requests customer B's appointments by id | 404 |
| Customer A submits a `customerId` parameter | There is no such parameter — the request cannot express it |
| Customer A requests another customer's balance | 404 |
| Customer A lists reports or staff | Refused |
| Customer A cancels B's appointment by id | Refused |
| Customer A revokes their own consent | Succeeds, and subsequent sends are suppressed |
| Customer A requests an unauthenticated panel page | Redirected to login |
| An expired session on any customer route | Redirected; no partial render |

### 6.5 Worker and session

| Test | Expected |
|---|---|
| A worker job runs without a tenant scope | Throws (does not run) |
| A worker job attempts a privileged operation (permission change, payment) | Refused |
| The session cookie is read after logout | Invalid |
| The session id rotates on login | Asserted |
| A production boot against SQLite | Refuses to start |
| A production boot with RLS disabled on a tenant table | Refuses to start |

---

## 7. End-to-end scenarios

The four real paths from the specification, driven through the real application.
Each is one Playwright spec, and each is a Definition of Done for its phase.

### 7.1 Scenario one — a new customer, Instagram to first session

The full chain: the customer sees a before/after laser image on Instagram → the
service page (price, session count, «مناسب چه کسانی نیست») → the three-step
booking popup (service → day and time → name and mobile → deposit) → the record
is created keyed on mobile, the appointment is `BOOKED` with source Website, and
a confirmation SMS is queued → the secretary's work list shows a «تأیید نوبت»
row and makes a short welcome call → the reminder goes one day before with a
reschedule link → on the day, the status moves to `AWAITING_ARRIVAL`
**automatically** → the customer arrives and the secretary marks `ARRIVED` → the
doctor opens the record, performs the service, marks `COMPLETED` → **the cycle is
created: session 1 of 6, next due 28 days later** → the doctor receives payment
and books session 2 **inside the same popup** → the customer panel shows the next
appointment, the «جلسه ۱ از ۶» bar, and the aftercare instructions.

**Assertions that matter:** the cycle is created at `COMPLETED` and not earlier;
the next appointment is booked from the completion popup; the customer panel
reflects all of it.

### 7.2 Scenario two — a secretary's working day

Time-stamped in the specification, and reproduced as such: the work list opens
with 3 unrecorded results from yesterday, 7 cycle contacts, 4 overdue debts, 2
new leads → the 3 results are recorded (two `COMPLETED`, one `NO_SHOW`) → the day
grid is left open and each arrival is marked `ARRIVED` → a phone call «امروز وقت
دارید؟» on an empty 11:30 slot → the booking popup opens with that time → 7 cycle
contacts are made (3 book on the spot, 2 later, 2 do not answer) → 2 new site
leads arrive, one books and becomes a customer → 4 overdue debtors: one pays
online, two promise next week and their due dates move, one does not answer →
the «اولین زمان آزاد» shortcut serves two phone calls → **at the end of the day
the list is empty**.

**The design criterion, asserted directly:** *if the secretary's list is empty at
the end of the day, no customer was lost.* This is the replacement for a
"secretary performance report".

### 7.3 Scenario three — a six-session course, with a drop-off and a return

A cycle of 6 sessions at a 4-week interval, following the dates in the
specification: session 1 completed and the cycle created, next due ۳ آبان →
reminder the day before → session 2 done, session 3 booked → ۱ آذر marked
`NO_SHOW` (the customer was travelling) and **rescheduled to ۸ آذر** → session 3
completed, session 4 due ۶ دی → ۶ دی the customer does not book and **three days
later appears in the cycle contact list** → a call returns «بعداً تماس میگیرم»,
setting the next contact to ۱۶ دی → the second call books ۲۰ دی → sessions 5 and 6
complete → the cycle completes and enters the «دوره تکمیل شده» group, so the
maintenance campaign reaches her.

**Assertions that matter:** the `NO_SHOW` → reschedule conversion; the customer
appearing in the contact list only after the due date passed with no future
appointment; the contact result setting the next contact date; the completion
entering the audience group. The specification names the two places revenue was
saved — the no-show converted to a rescheduled appointment, and the fourth
session found a month later — and both are asserted.

### 7.4 Scenario four — a birthday campaign, from a Persian sentence to an appointment

The manager writes «یک کمپین بساز برای همه مشتریانی که تاریخ تولدشان در مهر
است» → the assistant proposes the group (birth month = مهر, SMS consent yes, last
visit under 12 months) with a live count → it proposes message text with the name
variable, an offer, a deadline, channel SMS, and a send time of the birthday
morning → the manager edits the text, changes the percentage, and **gives final
approval** → the campaign is saved as recurring, runs each morning, and sends
only to that day's birthdays → every send is recorded on the customer's record,
so nobody receives a duplicate within 90 days → incoming calls are converted to
appointments by the secretary, and those appointments are **attributed to the
campaign** → the campaign table shows the send count and the resulting
appointment count.

**Assertions that matter:** no send occurs before human approval (immutable rule
4); a customer without consent is excluded even though the assistant selected
them (rule 5); the attribution count matches the appointments actually created.

---

## 8. Accessibility

Every one of the 35 pages, in the final phase, verified with a real browser.

| Check | Tool | Threshold |
|---|---|---|
| Automated violations | axe-core | **Zero** critical or serious violations |
| Keyboard reachability | Playwright | Every interactive element reachable in a sensible order |
| Focus visible | Playwright | Every interactive element shows the focus ring (`08-ui-design-system.md` §9) |
| Focus trap | Playwright | Modal traps focus and restores it on close |
| Escape closes | Playwright | Modal closes on Escape |
| Labels | axe + manual | Every input has a Persian label (`07-localization.md` §8) |
| Contrast | axe | Body text and every status badge meet AA against its own background |
| Headings | Manual | One H1 per page; no skipped levels |
| Status messages | Manual | Errors and confirmations are announced, not only coloured |
| Icons | Manual | Decorative icons are hidden from assistive tech; meaningful ones have a Persian label |
| Live regions | Manual | Booking and payment confirmations are announced |

Contrast is a real risk in this design system, because the warm palette is
low-contrast by nature: the muted ink tones on warm off-white must be checked,
not assumed.

---

## 9. Responsive

| Check | Assertion |
|---|---|
| Breakpoint | ≤ 1000px switches to the off-canvas sidebar and 16px padding (`08-ui-design-system.md` §43) |
| No horizontal overflow | Asserted on every page at mobile width |
| Tables | Horizontally scrollable at mobile, never clipped |
| Public navigation | Collapses to a hamburger |
| Touch targets | Preserved at mobile |
| Booking popup | Fully usable at mobile width |
| Calendar / scheduler | Grids collapse without losing the day |
| RTL at mobile | No mirrored-scroll artefacts |
| Every page renders | All 35 pages at desktop, tablet and mobile |

---

## 10. Persian localization suite

Per `07-localization.md` §9:

- **No Latin digit in any rendered surface** across the 35 pages — the single
  highest-value assertion in the suite.
- **No Gregorian date** anywhere in the UI.
- **Persian digit input round-trips.**
- **Bidi isolation:** a phone number inside a Persian sentence displays in the
  correct order.
- **Week starts on Saturday** in every grid and every "this week" range.
- **Every enum member has a label** — a build-time check over
  `06-constants.md`'s closed sets.
- **No Persian string literal in a component** — a lint rule, asserted in CI.
- **Message templates:** variables render, digits convert, an unknown placeholder
  fails validation in settings rather than at send time.
- **`lang="fa"` and `dir="rtl"`** on every page.

---

## 11. Coverage targets, enforced in CI

| Scope | Line | Branch | Enforcement |
|---|---|---|---|
| `src/core/localization/**` (digits, Jalali, money) | **100%** | 100% | Blocks the build |
| `src/modules/*/lib/**` (domain logic) | **95%** | 90% | Blocks the build |
| `src/modules/roles-permissions/**` | **100%** | 100% | Blocks the build |
| `src/modules/*/validation/**` | 95% | — | Blocks the build |
| `src/app/**` and components | 70% | — | Reported, not blocking |
| Global | 80% | — | Blocks the build |

**100% on the localization and permissions packages is deliberate.** They are
small, pure, and every branch of them is a correctness or security rule. A
partially covered permissions module is a partially verified permission model.

**Coverage is a floor, not a goal.** A module at 95% whose negative cases are
untested is worse than one at 85% whose are tested; the matrix in §5 and the
suites in §6 are what actually gate a phase.

---

## 12. CI gates

A merge is blocked by any of:

1. Any test failing.
2. Coverage below a target in §11.
3. An axe **critical** or **serious** violation.
4. A file over **1000 lines**.
5. A Persian string literal outside the catalog.
6. A deep cross-module import (`02-architecture.md` §10).
7. A hard-coded hex colour, or a Tailwind palette class
   (`08-ui-design-system.md` A1–A2).
8. A high-severity advisory in a runtime dependency (`09-security.md` §15).
9. The cross-tenant suite failing **on PostgreSQL**.
10. Any `TODO`, `FIXME`, or placeholder in a committed file.

The accessibility and localization suites run on every pull request, not only at
the end of the project — a defect found in the final phase costs far more than
one found the day it was introduced.

---

## 13. Test data

- **Factories, not fixtures.** Each test creates the data it needs, in the tenant
  it needs.
- **Two tenants minimum in every isolation test**, seeded deterministically.
- **The same mobile number exists in both tenants** — this is the fixture that
  catches the most common isolation bug.
- **A clinic with a realistic shape** for e2e: several doctors, several services,
  services with and without a session count, customers in every audience group,
  debts in all four buckets, and appointments in all eight states.
- **Persian names, real-looking mobiles, Persian service names** — so that RTL
  and digit bugs surface in tests rather than in a clinic.
- **No production data.** Ever. Stated as a policy in
  `setup/installation.md`.

---

## 14. What is not covered, and why

Stated so it is not assumed:

- **SMS and payment gateway behaviour.** Their sandboxes are tested; their
  outages, latency and duplicate deliveries are handled by the worker's retry and
  idempotency logic, which *is* tested. The vendors themselves are not.
- **The public site's visual result on every device.** Responsive is asserted at
  defined breakpoints, not on a device farm.
- **Load and performance.** The product's scale (a clinic, hundreds of
  customers) is far below where performance testing is meaningful. The indexes
  in `03-data-model.md` are the design's answer, and the day-grid queries are
  asserted to use them.
- **A malicious database operator** (`09-security.md` §17).
- **Localization into a second language.** There is only Persian.

---

## 15. Definition of Done for testing, per phase

No phase is complete until:

1. Every new module has unit tests at its target coverage.
2. Every new permission has both its positive and its negative test.
3. Every new tenant-scoped table has a cross-tenant test.
4. Every new page has been rendered at desktop, tablet and mobile widths.
5. Every new page passes axe with zero critical or serious violations.
6. Every new page passes the Latin-digit and Gregorian-date scan.
7. Every bug fixed in the phase has the test that would have caught it.

The final phase runs the complete suite: all 35 pages, the full permission
matrix, the isolation suites, the four scenarios, accessibility, responsive, and
Persian localization — against PostgreSQL.

---

*Related: `09-security.md` (what the isolation suites protect),
`04-roles-permissions.md` (the matrix the suite verifies),
`07-localization.md` §9 (the localization assertions),
`08-ui-design-system.md` (§9 the states, §43 the breakpoints),
`03-data-model.md` (the indexes the query tests assume),
`roadmap/phases.md` (which phase owns which suite).*
