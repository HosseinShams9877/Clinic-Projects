# Roadmap — Phases

> Twelve phases. Each one has a single goal, deliverables, and a **measurable**
> definition of done. A phase is not complete until every item in its DoD is
> verified — the DoD is a gate, not a checklist of intentions.
>
> Effort is in **working days for one experienced full-stack developer** working
> with this knowledge layer as the specification. It assumes the design system is
> already provided (it is, in `08-ui-design-system.md`) and that no
> requirements are invented mid-phase.

---

## Summary

| Phase | Name | Days | Pages delivered |
|---|---|---|---|
| 0 | Foundation and architecture | 5–8 | — |
| 1 | Platform foundation | 20–27 | 1 |
| 2 | Appointments and scheduling | 14–18 | 3 |
| 3 | Customers, services, staff | 16–22 | 7 |
| 4 | Treatment cycles | 10–14 | 3 |
| 5 | Payments and debts | 12–16 | 4 |
| 6 | Messages and notifications | 12–16 | 1 |
| 7 | Campaigns, audiences, assistant | 14–20 | 1 |
| 8 | Public site | 12–16 | 8 |
| 9 | Customer panel | 10–14 | 4 |
| 10 | Reports, settings, tenancy, licensing | 14–18 | 3 |
| 11 | Hardening and full verification | 15–22 | — |
| | **Total** | **154–211** | **35** |

**Dependency shape:** 0 → 1 → 2 → {3, 4, 5} → 6 → 7 → {8, 9, 10} → 11.
Phase 3, 4 and 5 may be reordered among themselves. Phases 8, 9 and 10 may be
reordered among themselves. Nothing may start before Phase 1.

---

## Phase 0 — Foundation and architecture

**Goal.** Make every structural decision, produce the knowledge layer, and
initialize the repository — writing no application code.

**Deliverables.**

- The technology comparison and the stack decision, with the single background-worker exception (`01-tech-stack.md`).
- The multi-tenant architecture decision, the single-tenant mode, and the module architecture with the full 35-page mapping (`02-architecture.md`).
- The data model with the index strategy for every entity (`03-data-model.md`).
- The role and permission model, the 16 permissions, the 8 behavioral toggles (`04-roles-permissions.md`).
- Conventions, constants, localization, the design system, security, and the testing strategy (`05`–`10`).
- The roadmap: this file, `progress.md`, `decisions.md`.
- The setup guides: installation, deployment, single-tenant, licensing, database migration.
- Root files: `README.md`, `.gitignore`, `.env.example`, `LICENSE.md`.
- The `.claude/` folder: settings, agents, commands, context, memory.
- `reports/phase-00-report.md`.
- A local git repository on `main`, with commits per coherent unit and **no remote configured**.

**Definition of done.**

1. Every file in the required tree exists and contains real content — no placeholder, no `TODO`, no "coming soon". Verified by a repository-wide grep for `TODO`, `FIXME`, `TBD`, and `coming soon` returning zero hits.
2. All 11 knowledge documents exist and cross-reference correctly; every `[[link]]` and file reference resolves to a real file.
3. All 35 pages appear in the page → module mapping, and the coverage check sums to 35.
4. All 20 modules are listed, and each has a stated responsibility.
5. The permission table has 16 rows and 3 role columns; the behavioral toggle table has 8 rows with defaults.
6. The design system preserves every token value from the source, unmodified.
7. `git log` shows Conventional Commit messages; `git status` is clean; no `.env`, secret, or database file is tracked.
8. `git remote -v` is **empty**.
9. `reports/phase-00-report.md` names the files created, the verifications performed, what was deferred and why, and every open question.

**Dependencies.** None.

**Effort.** 5–8 days.

---

## Phase 1 — Platform foundation

**Goal.** Stand up the application skeleton with the pieces every later phase
depends on — project, design tokens, localization, database, tenant context,
authentication, the permission primitive, and the worker process — so that no
later phase has to invent them.

**Deliverables.**

- Next.js App Router project, TypeScript `strict`, ESLint with the import-boundary rule, Prettier, path aliases.
- The **token block** from `08-ui-design-system.md` §46 as global CSS variables, light and dark, plus the base component styles the design system defines.
- Vazirmatn self-hosted via `next/font/local`, RTL document root, the responsive shell.
- `src/core/localization/`: digits, Jalali, formatters, calendar, and the catalog skeleton — with the full unit suite from `10-testing-strategy.md` §3.4–3.5.
- Prisma schema: `Tenant`, `Clinic`, `User`, `Membership`, `AuditLog`, `Job`, and the tenant-scoped base pattern every later model follows.
- Migrations for SQLite (dev) and PostgreSQL (production), plus the portability guards.
- The PostgreSQL RLS policies and `FORCE ROW LEVEL SECURITY`, with the migration that emits them.
- `getTenantContext()` and the Prisma client extension that injects and asserts the tenant predicate.
- `auth`: password login for staff, session cookies, logout, password reset scaffolding.
- `roles-permissions`: the 16×3 matrix, overrides, the 8 toggles, and the `can()` / `requirePermission()` primitive — with its 100%-coverage test suite.
- `src/worker/` as a running process with the database-backed job table and claim semantics, and a health check.
- `account/login.html` — the customer login surface (mobile + OTP) and the staff login.
- The four panel shells (manager, doctor, secretary, customer) with their navigation, rendered from the permission set rather than hard-coded.
- **The module override registry** (`02-architecture.md` §13, ADR-0019): the static build-time registry, the `resolveModule()` resolver at the module boundary, the typed contract every override is checked against, the Zod-validated declaration schema, the tenant settings-row declaration field, and the fail-closed behaviour when an override is absent, invalid, or disabled. **No override is written in this phase** — the mechanism is built and tested with a test-only override fixture.
- CI: typecheck, lint, unit tests, coverage gate, file-length gate, axe on rendered shells.

**Definition of done.**

1. `npm run dev` starts; the login page renders in Persian, RTL, with Persian digits and Vazirmatn, with no external network request for the font.
2. A manager, a doctor and a secretary can each log in and land on a shell whose navigation matches their role exactly.
3. The permission matrix suite passes: **16 permissions × 3 roles × 2 directions = 96 tests green**, plus the 8 toggle tests.
4. The self-escalation suite passes in full (`10-testing-strategy.md` §6.1).
5. The cross-tenant suite passes **on PostgreSQL with RLS enabled**, including the "no tenant context returns zero rows" case.
6. The Jalali round-trip test passes across 200 years and agrees with ICU on every day in ۱۳۹۰–۱۴۵۰.
7. `src/core/localization` and `src/modules/roles-permissions` are at **100% line and branch coverage**.
8. The worker starts, claims a job, and completes it; killing it mid-job releases the claim after the timeout.
9. No file exceeds 1000 lines; the CI gate proves it.
10. A production boot against SQLite, or with RLS disabled on a tenant table, **refuses to start**.
11. The override resolver is proven fail-closed: a module with no declared override, a declaration naming an implementation absent from the registry, a malformed declaration, and an override that throws all resolve to the **default** implementation — and an override that fails the permission matrix or the cross-tenant suite is refused registration.

**Dependencies.** Phase 0.

**Effort.** 20–27 days.

---

## Phase 2 — Appointments and scheduling

**Goal.** Deliver the appointment lifecycle, the day grid, slot generation, and
the three-step booking popup — the surface everything else hangs off.

**Deliverables.**

- `appointments`: the entity, the **8-state lifecycle**, and the transitions each state permits.
- Slot generation from shifts, doctor hours, service duration, blocks and holidays — with the full unit suite.
- The three booking modes (fixed slot, time range, request) and the settings that select them.
- Slot blocks (بستن یک ساعت / بستن یک روز) and holiday handling behind the settings toggle.
- Auto-transitions: `AWAITING_ARRIVAL` on the day, `RESULT_NOT_RECORDED` two hours after the time.
- Reschedule and cancel, with the deposit policy on cancellation.
- `reception/appointments.html` — the day and week grid, drag-free create, the booking popup, arrival marking.
- `admin/appointments.html` — read-only oversight with filters.
- `doctor/dashboard.html` — «برنامه من», the doctor's own day with the quick-book shortcut behind its toggle.
- The worker job for lifecycle transitions.

**Definition of done.**

1. All 8 states are reachable and every illegal transition is refused — asserted, not eyeballed.
2. Slot generation passes its table of cases, including a full year of generated days with no missing or duplicated slot.
3. A booking made by a doctor, a secretary and a manager produces the same record shape; a booking attempted by a role without `manage_appointments` is refused on the server.
4. The double-booking guard holds under two concurrent requests for the same slot — one succeeds, one receives «این ساعت قبلاً رزرو شده است».
5. The three booking modes each behave as specified on the public booking shell (the shell renders in this phase; the public page is Phase 8).
6. A blocked hour and a blocked day each remove exactly the right slots.
7. The lifecycle worker transitions an appointment to `AWAITING_ARRIVAL` on the day and to `RESULT_NOT_RECORDED` two hours later, and the latter appears in the reception cartable.
8. All three pages render at desktop, tablet and mobile with no horizontal overflow, zero axe critical/serious violations, and no Latin digit or Gregorian date.
9. The doctor's quick-book shortcut is refused server-side when its toggle is off.

**Dependencies.** Phase 1.

**Effort.** 14–18 days.

---

## Phase 3 — Customers, services, staff

**Goal.** Deliver the customer record, the lead lifecycle, the service catalogue,
and staff administration — the three entities appointments refer to.

**Deliverables.**

- `customers`: the entity, mobile as the unique key with dedupe on creation, the profile, **lead lifecycle**, tags, medical notes, before/after consent.
- `services`: the catalogue, price and duration as the single source of truth, session count and interval defaults, deposit, activation/deactivation, site copy, care text, per-service doctor assignment.
- `staff`: users, memberships, invitations, password resets, staff status, and **leave requests** (doctor submits, manager approves).
- `reception/customers.html` — search, create, edit, the quick-add flow.
- `reception/leads.html` — the lead cartable with source and conversion.
- `admin/customers.html` — the customer list with filters and audience group entry points.
- `admin/customer.html` — the full profile: appointments, cycles, payments, balance, message history, consent.
- `doctor/customers.html` — the doctor's own patients only.
- `admin/services.html` — the catalogue with activation, not deletion.
- `admin/staff.html` — the staff list with the **permission matrix UI**, per-user overrides, the locked manager column, and the `الگو` / `دسترسی` tabs.
- The customer merge/dedupe rule when the same mobile already exists.

**Definition of done.**

1. Creating a customer whose mobile already exists in the tenant offers the existing record instead of creating a duplicate; the same mobile in a **different** tenant creates a new record with no leakage.
2. A lead converts to a customer on first booking, and the acquisition source survives the conversion.
3. A service cannot be deleted through any surface — the delete path does not exist, only deactivation.
4. Deactivating a service removes it from booking but leaves every past appointment and price intact.
5. The permission matrix UI accepts a change and the change takes effect on the **server** on the next request — verified by logging in as the affected user.
6. The manager column cannot be edited; attempting it is refused server-side and audited.
7. Every permission change writes an audit row with actor, target and the before/after set.
8. A doctor requesting another doctor's patient receives **404**, not 403.
9. All seven pages pass the accessibility, responsive and localization gates.

**Dependencies.** Phase 2.

**Effort.** 16–22 days.

---

## Phase 4 — Treatment cycles

**Goal.** Deliver the treatment-cycle engine — the mechanism that separates this
product from a calendar.

**Deliverables.**

- `cycles`: creation on transition to `COMPLETED` and on no earlier transition, with idempotency.
- Interval read from the **cycle**, not the service definition.
- `nextDueDate` computation, session numbering, completion, and unbounded courses.
- The contact list: entry when the due date has passed **and** no future appointment exists.
- Drop-out detection, the closed list of abandonment reasons, and exit on booking, abandonment or completion.
- The two cycle settings: no-show accumulation, and reschedule shifting subsequent due dates.
- `reception/cycles.html` — the contact list with contact results and next-contact dates.
- `admin/cycles.html` — read-only oversight, the drop-off curve entry point.
- `doctor/cycles.html` — the doctor's own cycles.
- The cycle next-due sweep worker job (hourly).
- Automatic entry into the «دوره تکمیل شده» audience group on completion.

**Definition of done.**

1. A cycle is created exactly once, on the transition to `COMPLETED`, and never on booking or arrival — asserted including a retried completion.
2. `nextDueDate` equals `lastSessionAt + cycle.intervalDays` across month and leap-month boundaries, with the full test table green.
3. Changing a service's default interval does **not** move an existing cycle.
4. A customer appears in the contact list only after the due date passes with no future appointment; booking removes them immediately.
5. The **third specification scenario** runs end to end: session 1 creates the cycle, a `NO_SHOW` is rescheduled, the missed session 4 surfaces in the contact list three days later, the second call books it, and the completed course enters the maintenance audience group.
6. An abandonment requires a reason from the closed list; no free-text reason reaches the database.
7. The sweep job moves due cycles into the contact list on schedule and is idempotent under a repeated run.
8. All three pages pass the accessibility, responsive and localization gates.

**Dependencies.** Phase 3 (customer and service records).

**Effort.** 10–14 days.

---

## Phase 5 — Payments and debts

**Goal.** Deliver money received, the balance, and debt follow-up — with the
balance computed and never stored.

**Deliverables.**

- `payments`: the appointment-level payment record, deposit capture, price at booking, refund on cancellation. The **only** writer of financial facts.
- Discount recording, with the name of who granted it and the secretary cap enforced server-side.
- `debts`: balance computation, the **4 buckets**, follow-up, due-date reschedule, reminder scheduling. Read and follow-up only — no delete path exists.
- The recomputable `chargedTotal` / `paidTotal` cache and its nightly reconciliation job.
- `reception/debts.html` — the four buckets, record payment, follow-up, promise-to-pay reschedule.
- `admin/debts.html` — read-only oversight.
- `doctor/debts.html` — visible only with the manager-granted permission.
- `account/payments.html` — the customer's own payment history and balance.

**Definition of done.**

1. The balance equals the sum of charges minus the sum of payments and discounts, across the full unit test table, including partial payments, deposits, discounts, and refunds.
2. **No `balance` column exists in the schema** — asserted by a schema test.
3. The nightly reconciliation job finds zero drift on the seeded clinic dataset, and a deliberately introduced drift fails loudly.
4. No surface, route, or module function can delete a payment or a debt — asserted by an enumeration test over the module's public surface.
5. A discount above the secretary cap is refused server-side, and the toggle being off refuses any discount at all.
6. Every discount writes an audit row naming the user who granted it (immutable rule 7).
7. The four debt buckets return exactly the expected sets at their boundary dates.
8. A payment recorded against another tenant's appointment is impossible — the cross-tenant suite covers the payment and debt paths.
9. All four pages pass the accessibility, responsive and localization gates.

**Dependencies.** Phase 3.

**Effort.** 12–16 days.

---

## Phase 6 — Messages and notifications

**Goal.** Deliver the seven automatic messages, the message catalog, the gateway,
and the secretary's work list that ties the day together.

**Deliverables.**

- `messages`: templates with variables, channel configuration (SMS / WhatsApp), send windows, daily caps, the gateway adapter, the raw send log.
- `notifications`: the **7 automatic messages** with triggers and timing, the per-customer delivery ledger, consent enforcement, and the "today's reminders" feed.
- The **90-day duplicate window** and the **one automatic message per day** priority order.
- Consent as a hard filter — no consent, no send, recorded as suppressed with a reason.
- `reception/desk.html` — **«میز کار امروز»**: the day's appointments, unrecorded results, arrivals, cycle contacts, due debts, new leads, and today's reminders, in one list.
- The «پیامها» settings tab surfaced (full editing lands with `settings` in Phase 10).
- The automatic dispatch worker job.

**Definition of done.**

1. All seven automatic messages fire on their specified trigger and at their specified time, verified against an injected clock.
2. A customer without consent receives nothing; the attempt is recorded as suppressed with a reason.
3. A second automatic message to the same customer within the 90-day window is suppressed, and the priority order (next-session appointment → financial → survey) decides which one is sent.
4. The daily cap holds at one automatic message per customer per day.
5. Messages outside the send window are held, not sent.
6. Every send, suppression and failure is recorded in the ledger and visible on the customer record.
7. Template variables substitute correctly, with Persian digits; an unknown placeholder fails validation in settings rather than at send time.
8. **The second specification scenario** runs end to end: the working day starts with 3 unrecorded results, 7 cycle contacts, 4 overdue debts and 2 new leads, and ends with an **empty list**.
9. The dispatch job is idempotent — a repeated run does not double-send.
10. `reception/desk.html` passes the accessibility, responsive and localization gates.

**Dependencies.** Phases 2, 4, 5.

**Effort.** 12–16 days.

---

## Phase 7 — Campaigns, audience groups, and the assistant

**Goal.** Deliver the eight campaign types, the eight ready-made audience groups,
and the Persian free-text assistant — always behind a human approval gate.

**Deliverables.**

- `audience-groups`: the **8 ready-made groups** as saved queries with live counts, the nightly refresh job, and ad-hoc group building.
- The **field allow-list** that makes medical data structurally inexpressible in a group predicate.
- `campaigns`: the **8 campaign types**, CRUD, audience + text + schedule, recurring campaigns, dispatch orchestration, and **attribution** of resulting appointments.
- `campaign-assistant`: Persian free text → a proposed audience group, message text and schedule. **No medical-data access.** Never sends.
- The human approval gate: a campaign cannot dispatch before approval (immutable rule 4).
- `admin/campaigns.html` — the builder, the assistant, the preview with live count, the approval step, and the results table.
- The campaign dispatch worker job (recurring and scheduled).

**Definition of done.**

1. All 8 audience groups evaluate to the correct sets against a seeded clinic dataset, and each uses its intended index.
2. A group predicate referencing a clinical field **fails to compile** — asserted with a type-level test.
3. All 8 campaign types can be created, scheduled and dispatched.
4. No campaign dispatches before human approval; the assertion is on the server, not the UI.
5. A campaign send to a customer without consent is suppressed, and the send is recorded on the customer record.
6. The 90-day duplicate window applies to campaign sends.
7. Appointments created by a campaign's recipients are attributed to that campaign, and the results table's counts match.
8. The assistant never returns or accepts a clinical field, and it never sends.
9. **The fourth specification scenario** runs end to end: the manager writes «یک کمپین بساز برای همه مشتریانی که تاریخ تولدشان در مهر است», the assistant proposes a group and text, the manager edits and approves, the campaign runs daily, and the results table shows the sends and the resulting appointments.
10. The dispatch job is idempotent and does not re-send a recurring campaign within its period.
11. `admin/campaigns.html` passes the accessibility, responsive and localization gates.

**Dependencies.** Phases 3, 6.

**Effort.** 14–20 days.

---

## Phase 8 — Public site

**Goal.** Deliver the eight public pages, the booking wizard, and lead capture
with source attribution.

**Deliverables.**

- `public-site`: the 8 pages — home, services, service detail, booking, doctors, about, contact, panels.
- The 76px public header, hero gradient, trust bar, service cards, doctor cards and before/after presentation — exactly as the design system specifies.
- The three-step booking popup wired to the real availability engine.
- The consultation form producing a **lead** with source attribution.
- Deposit handling when online booking requires a deposit (toggle 6).
- Before/after images gated on written consent (immutable rule 6).
- SEO basics, correct `lang`/`dir`, and the responsive public layout.

**Definition of done.**

1. All 8 pages render, with no horizontal overflow at mobile width and zero axe critical/serious violations.
2. **The first specification scenario** runs end to end from the public site: a service detail page → the three-step popup → a record created keyed on mobile with source Website and a confirmation message → the secretary's confirmation row → the reminder a day before → arrival → completion → **the cycle is created as «جلسه ۱ از ۶، موعد بعدی ۲۸ روز بعد»** → and session 2 is booked from the same popup.
3. A booking without a deposit is refused when toggle 6 is off, and accepted when on.
4. A booking on a holiday is not offered unless toggle 7 is on.
5. The consultation form creates a lead with the correct source, and it appears in the reception cartable.
6. No before/after image renders without recorded written consent.
7. Every public page uses Persian digits and Jalali dates only, and every booking time shown matches the generated availability.
8. The public pages make no request to any external host for fonts, styles or scripts.

**Dependencies.** Phases 2, 3, 5.

**Effort.** 12–16 days.

---

## Phase 9 — Customer panel

**Goal.** Deliver the customer's own surface: their appointments, their cycle
progress, their payments, and their consent.

**Deliverables.**

- `account/dashboard.html` — the next appointment, the cycle progress bar («جلسه ۳ از ۶»), and the latest care instructions.
- `account/appointments.html` — upcoming and past appointments, cancel and reschedule within policy.
- `account/care.html` — aftercare instructions from the service definition.
- `account/profile.html` — profile, and **consent management** including before/after revocation.
- Customer authentication (mobile + OTP) hardened: rate limiting, attempt limits, session lifetime.
- The ownership scoping that makes every customer route resolve the customer from the session and never from a parameter.

**Definition of done.**

1. A customer sees only their own data on every one of the four pages — the customer-isolation suite passes in full (`10-testing-strategy.md` §6.4).
2. No customer route accepts a `customerId`; a request cannot express another customer.
3. Requesting another customer's appointment, balance or profile by id returns **404**.
4. Cancelling within policy succeeds and applies the deposit policy; cancelling outside policy is refused with a specific Persian message.
5. Revoking before/after consent immediately hides the images and is recorded; revoking message consent suppresses all further sends.
6. The cycle progress bar matches the cycle's `completedSessions / totalSessions` exactly.
7. OTP: a wrong code is refused, attempts are limited, an expired code is refused, and a code is single-use.
8. All four pages pass the accessibility, responsive and localization gates at mobile width first.

**Dependencies.** Phases 2, 3, 4, 5, 6.

**Effort.** 10–14 days.

---

## Phase 10 — Reports, settings, tenancy, licensing

**Goal.** Deliver the retention reports, the full settings surface, tenant
administration for SaaS, and licensing for on-premise — completing the last
three pages.

**Deliverables.**

- `reports`: return rate, average sessions, cycle completion, no-show rate, the drop-off curve, last-visit distribution, doctor comparison. **No financial reports**, by design.
- `settings`: clinic identity, booking mode, working hours / shifts / holidays, cycle defaults, all message text and channels, the **8 toggles**, appointment lifecycle timings — across all six tabs, matching `admin/settings.html`.
- `tenant-management`: tenants, clinics/branches, memberships, provisioning, suspension. Active only when `MULTI_TENANT=true`.
- `license`: key issuance, validation, expiry, the on-premise install flow. Active only when `MULTI_TENANT=false`.
- Billing for SaaS (plan and subscription state), which the specification's MVP boundaries include.
- `admin/dashboard.html` — «داشبورد من» for the manager.
- `admin/reports.html`.
- `admin/settings.html`.
- **The override administration surface**: the operator path that sets a tenant's override declaration on its settings row, with the audit entry and the validation that only an `(module, implementation)` pair present in the build's registry may be selected. This completes the mechanism specified in `02-architecture.md` §13 and built in Phase 1.

**The first real override is not scheduled.** No phase in this roadmap writes
one, and none should: an override exists because a named customer asked for a
different implementation of a named module, and building one speculatively would
create a second implementation of a module with no tenant to serve and no
requirement to satisfy. When that request arrives it is scoped as its own piece
of work — a full module tree under the default's `overrides/` folder
(`05-conventions.md` §15.3), typed against the module's interface, and passing
the module's suite plus the permission matrix and the cross-tenant isolation
suite before it is registered (ADR-0019). It ships with the platform's release,
not on its own cadence.

**Definition of done.**

1. Every report computes from real data, is asserted against a seeded dataset with a known expected answer, and renders in Persian with Jalali ranges.
2. No report exposes a financial figure — asserted by an enumeration test over the `reports` module's public surface.
3. Every one of the six settings tabs persists and takes effect on the **server**: a toggled setting changes behaviour on the next request, verified per setting.
4. The 8 toggles are enforced server-side; each has its on and off test (§5.1 of `10-testing-strategy.md`).
5. With `MULTI_TENANT=false`, the tenant switcher is absent and `tenant-management` routes are unreachable; with `true`, the reverse. The same build and the same migrations serve both — verified by running the same suite in both modes.
6. A license key that is expired or invalid blocks the instance with a Persian explanation and does not destroy data.
7. The three pages pass the accessibility, responsive and localization gates.

**Dependencies.** Phases 3, 4, 5, 6, 7.

**Effort.** 14–18 days.

---

## Phase 11 — Hardening and full verification

**Goal.** Verify the whole product end to end, close the gaps that only appear
when everything runs together, and prepare the first release.

**Deliverables.**

- **Full end-to-end testing** of all four specification scenarios on PostgreSQL, from a clean database.
- **Accessibility verification** across all 35 pages: axe, keyboard, focus visibility, modal traps, labels, announcements.
- **Responsive verification** across all 35 pages at desktop, tablet and mobile.
- **Persian localization verification** across all 35 pages: no Latin digits, no Gregorian dates, Saturday week start, bidi isolation, typed catalog completeness.
- The **permission-matrix suite across all 3 roles** run against the complete application, not just the primitive.
- Cross-tenant, customer-isolation and worker-scoping suites against the complete application.
- Performance: the day grid, the contact list and the debt list asserted to use their intended indexes; slow-query logging enabled.
- Security review: dependency audit, header check, session hardening, upload validation, rate limits.
- Observability: structured logging, the audit log review surface, worker health and failure alerting.
- `setup/installation.md`, `setup/deployment.md` and `setup/single-tenant.md` verified by performing them on a clean machine.
- The release: version tag, changelog, and a seed dataset for demonstration.

**Definition of done.**

1. **All four specification scenarios pass end to end on PostgreSQL**, from a clean database, with no manual step.
2. All **35 pages** pass the accessibility gate: zero axe critical/serious violations, full keyboard reachability, visible focus.
3. All **35 pages** pass the responsive gate with no horizontal overflow at mobile width.
4. All **35 pages** pass the localization gate: zero Latin digits, zero Gregorian dates, Saturday week start, typed catalog with no missing key.
5. The **permission matrix suite passes in full** — 16 permissions × 3 roles × both directions — plus the 8 toggle tests, the self-escalation tests, and the last-manager invariant.
6. The cross-tenant suite passes on PostgreSQL with RLS live, including the forged-tenant and no-context cases.
7. The customer-isolation suite passes in full.
8. The worker's jobs all run idempotently under a double-run and under a mid-job kill.
9. Coverage targets from `10-testing-strategy.md` §11 are met and **enforced in CI**, and every gate in §12 blocks a merge.
10. `npm audit` reports no high or critical advisory in a runtime dependency.
11. A clean-machine install from `setup/installation.md` reaches a working login page, and a clean-machine deployment from `setup/deployment.md` does the same in production mode against PostgreSQL.
12. The identical test suite passes with `MULTI_TENANT=true` and `MULTI_TENANT=false`.
13. No file exceeds 1000 lines; no `TODO`, `FIXME` or placeholder exists anywhere in the repository.

**Dependencies.** All previous phases.

**Effort.** 15–22 days.

---

## Page coverage

All 35 pages, each against the phase that delivers it.

| # | Page | Panel | Phase |
|---|---|---|---|
| 1 | `account/login.html` | Customer auth | 1 |
| 2 | `reception/appointments.html` | Reception | 2 |
| 3 | `admin/appointments.html` | Manager | 2 |
| 4 | `doctor/dashboard.html` | Doctor | 2 |
| 5 | `reception/customers.html` | Reception | 3 |
| 6 | `reception/leads.html` | Reception | 3 |
| 7 | `admin/customers.html` | Manager | 3 |
| 8 | `admin/customer.html` | Manager | 3 |
| 9 | `doctor/customers.html` | Doctor | 3 |
| 10 | `admin/services.html` | Manager | 3 |
| 11 | `admin/staff.html` | Manager | 3 |
| 12 | `reception/cycles.html` | Reception | 4 |
| 13 | `admin/cycles.html` | Manager | 4 |
| 14 | `doctor/cycles.html` | Doctor | 4 |
| 15 | `reception/debts.html` | Reception | 5 |
| 16 | `admin/debts.html` | Manager | 5 |
| 17 | `doctor/debts.html` | Doctor | 5 |
| 18 | `account/payments.html` | Customer | 5 |
| 19 | `reception/desk.html` | Reception | 6 |
| 20 | `admin/campaigns.html` | Manager | 7 |
| 21 | `index.html` | Public | 8 |
| 22 | `services.html` | Public | 8 |
| 23 | `service-detail.html` | Public | 8 |
| 24 | `booking.html` | Public | 8 |
| 25 | `doctors.html` | Public | 8 |
| 26 | `about.html` | Public | 8 |
| 27 | `contact.html` | Public | 8 |
| 28 | `panels.html` | Public | 8 |
| 29 | `account/dashboard.html` | Customer | 9 |
| 30 | `account/appointments.html` | Customer | 9 |
| 31 | `account/care.html` | Customer | 9 |
| 32 | `account/profile.html` | Customer | 9 |
| 33 | `admin/dashboard.html` | Manager | 10 |
| 34 | `admin/reports.html` | Manager | 10 |
| 35 | `admin/settings.html` | Manager | 10 |

**Coverage check:** 1 + 3 + 7 + 3 + 4 + 1 + 1 + 8 + 4 + 3 = **35.** Every page is
delivered by exactly one phase. No page is unassigned.

---

## End-to-end scenario coverage

The four specification scenarios are not a final-phase activity only — each is
the definition of done for the phase that completes it, and all four are re-run
in full in Phase 11.

| Scenario | Completes in | Re-verified |
|---|---|---|
| One — a new customer, Instagram to first session | Phase 8 | Phase 11 |
| Two — a secretary's working day | Phase 6 | Phase 11 |
| Three — a six-session course, with a drop-off and a return | Phase 4 | Phase 11 |
| Four — a birthday campaign, from a Persian sentence to a booking | Phase 7 | Phase 11 |

---

*Related: `progress.md` (what is actually built), `decisions.md` (why),
`../knowledge/10-testing-strategy.md` (the suites each DoD refers to).*
