# 03 — Data Model

> Seven core entities. Every index is listed with its exact column order and
> the query it exists to serve. No index is included "just in case".

---

## 1. The seven core entities

| # | Entity | Identity | One-line role |
|---|---|---|---|
| 1 | **Customer** | mobile number | The person. Mobile is the unique key. |
| 2 | **Appointment** | id | One session. One row per booked session. |
| 3 | **Service** | id | Price + duration source of truth. |
| 4 | **TreatmentCycle** | id | customer × service, with interval and progress. |
| 5 | **Payment** | id | One row per amount received; discounts recorded separately. |
| 6 | **Campaign** | id | A campaign; messages are its sends. |
| 7 | **AudienceGroup** | id | A saved query, re-evaluated nightly. Not a list. |

Supporting entities required by these seven — `Tenant`, `Clinic`, `User`,
`Membership`, `MessageTemplate`, `MessageSend`, `ConsentRecord`, `SlotBlock`,
`ClinicShift`, `DoctorWorkingHours`, `Holiday`, `JobQueue`, `AuditLog`,
`LicenseKey` — are documented in §5.

### 1.1 The three key modelling decisions

**Decision 1 — Mobile number is the customer's unique key.**
In Iran there is no national ID available to a clinic and customers do not
have email. If the key were the name, a clinic would accumulate duplicate
records within a year, and «تعداد مراجعه» and «آخرین مراجعه» — the inputs to
every audience group — would be wrong.
*Implementation consequence:* `@@unique([tenantId, mobile])`, and on new-customer
entry a duplicate mobile must **offer the existing record** rather than create a
second row.

**Decision 2 — `TreatmentCycle` is an independent entity, not fields on
`Appointment`.**
Interval and session count are held **per customer**. A doctor must be able to
write «هر ۳ هفته، ۶ جلسه» for one person and «هر ۴ هفته، ۸ جلسه» for another
without touching the service definition. Had these lived on the appointment,
personalising them would mean editing the shared service — corrupting the
default for everyone else.

**Decision 3 — `AudienceGroup` is a query, not a stored list.**
A stored list goes stale within two weeks and sends campaigns to people who
already visited. As a query re-evaluated nightly, it is always current — and
this is what makes «recurring» campaigns possible: a campaign that runs daily
and messages only the people who newly entered the group.

---

## 2. Entity detail

### 2.1 Customer

**PK:** `id` (String, cuid)
**Unique:** `(tenantId, mobile)` — Decision 1.
**FKs:** `tenantId → Tenant`, `primaryClinicId → Clinic`, `primaryDoctorId → User`

Fields: `mobile` (normalised, digits only, stored `09xxxxxxxxx`), `firstName`,
`lastName`, `birthDate` (Jalali parts — see §3), `acquisitionSource`,
`residenceArea`, `medicalHistory`, `sensitivities`, `doctorNote` (internal),
`lifecycle` (LEAD / CUSTOMER), `leadStatus`, `leadNextContactAt`,
`lastVisitAt`, `firstVisitAt`, `completedSessions`, consent flags
(`consentSms`, `consentWhatsApp`, `consentPhone`), `consentBeforeAfter`,
`isActive`.

`lastVisitAt`, `firstVisitAt` and `completedSessions` are **maintained
denormalisations** — they are sums/counts of immutable facts (appointments),
recomputable at any time, and are the inputs to every audience group. They are
not balances (see §4.3).

**Indexes**

| Index | Column order | Query it serves |
|---|---|---|
| `customer_mobile_key` | `(tenantId, mobile)` UNIQUE | «مشتری را با شماره موبایل پیدا کن» — the single hottest lookup in the product; used by the booking popup, the desk, and the reception search box. Also enforces dedupe. |
| `customer_tenant_lastvisit_idx` | `(tenantId, lastVisitAt)` | Candidate scan for groups خوابیدهها («آخرین مراجعه بیش از ۹۰ روز»), وفادارها, and the «مشتریان بر اساس آخرین مراجعه» report bucket. |
| `customer_tenant_firstvisit_idx` | `(tenantId, firstVisitAt)` | Group تازهواردها («اولین مراجعه در ۳۰ روز گذشته») and acquisition-source reporting. |
| `customer_tenant_sessions_idx` | `(tenantId, completedSessions)` | Group وفادارها («بیش از ۵ جلسه انجامشده»). |
| `customer_tenant_lifecycle_idx` | `(tenantId, lifecycle, leadStatus)` | The lead cartable (`reception/leads.html`) filtered by state, and the "new leads" alert. |
| `customer_tenant_doctor_idx` | `(tenantId, primaryDoctorId)` | «مراجعین من» in the doctor panel. |
| `customer_tenant_birth_idx` | `(tenantId, birthMonth, birthDay)` | Group متولدین این ماه — the birthday campaign. Stored as separate month/day integers so the query does not scan dates. |

### 2.2 Appointment

**PK:** `id`
**FKs:** `tenantId`, `clinicId`, `customerId`, `serviceId`, `doctorId`,
`cycleId` (nullable), `campaignId` (nullable — attribution)

Fields: `scheduledAt` (DateTime, UTC instant), `localDate` (String,
`YYYY-MM-DD` **Jalali**), `localTime` (String `HH:mm`), `durationMinutes`,
`status` (the 8 states), `source` (`WEBSITE` / `RECEPTION` / `PHONE` /
`INSTAGRAM` / `CAMPAIGN`), `priceAtBooking` (**snapshotted** — a later price
change must not alter past appointments), `depositAmount`, `depositStatus`,
`cancelledAt`, `cancelReason`, `rescheduledToId`, `noShowReason`,
`resultRecordedAt`, `isSlotBlock` (a block is an appointment-like row that
holds a slot without a customer — see §2.7).

**The 8 states** (four of them automatic):

| State | Entered when | By |
|---|---|---|
| `BOOKED` رزرو شده | appointment created | automatic |
| `AWAITING_ARRIVAL` منتظر پزشک | the appointment day arrives | **automatic** |
| `ARRIVED` حاضر شد | receptionist records arrival | منشی |
| `COMPLETED` انجام شد | service performed — **this is the point that creates the cycle** | پزشک یا منشی |
| `NO_SHOW` عدم حضور | receptionist confirms non-arrival | منشی |
| `CANCELLED` لغو شد | cancelled before the appointment | مشتری یا منشی |
| `RESCHEDULED` جابهجا شد | date changed; a new appointment is created and linked | either |
| `RESULT_NOT_RECORDED` نتیجه ثبت نشده | **automatic**, 2 hours past the slot with no status recorded | automatic |

`RESULT_NOT_RECORDED` is the most important state in the model: without it an
appointment whose outcome was never recorded stays "today" forever, drops out
of sight, is never followed up, never generates a next cycle, and never appears
in the drop-off report. It is a self-raised alarm. It surfaces **only** in the
reception cartable — never on the manager or doctor dashboard, per the second
workflow rule.

**Indexes**

| Index | Column order | Query it serves |
|---|---|---|
| `appt_tenant_doctor_date_idx` | `(tenantId, doctorId, localDate)` | The day grid for one doctor — «برنامه من». The most-executed query in the product. |
| `appt_tenant_clinic_date_idx` | `(tenantId, clinicId, localDate)` | The clinic-wide day grid (manager view) and the reception desk. |
| `appt_tenant_status_sched_idx` | `(tenantId, status, scheduledAt)` | (a) the «نتیجه ثبت نشده» cartable; (b) the automatic lifecycle sweep (BOOKED → AWAITING_ARRIVAL, → RESULT_NOT_RECORDED); (c) **the debt query** — see §4.3. |
| `appt_tenant_customer_sched_idx` | `(tenantId, customerId, scheduledAt DESC)` | The customer's appointment history on the profile and in «نوبتهای من». |
| `appt_tenant_cycle_idx` | `(tenantId, cycleId)` | Sessions of a treatment cycle («جلسه ۳ از ۶»). |
| `appt_tenant_campaign_idx` | `(tenantId, campaignId)` | Campaign attribution — «۹ نوبت حاصل از این کمپین». |
| `appt_slot_unique` | `(tenantId, doctorId, scheduledAt)` UNIQUE, `WHERE isSlotBlock = false` | Prevents double-booking the same doctor at the same instant. **This is the only partial index in the schema**; see §5 for its portable representation. |

### 2.3 Service

**PK:** `id` **FKs:** `tenantId`, `clinicId`
**Unique:** `(tenantId, name)`

Fields: `name`, `category` (پوست / لیزر / تزریق / مو), `price`,
`durationMinutes`, `depositAmount`, `defaultSessions`, `defaultIntervalDays`,
`isActive` (**never deleted** — immutable rule 10), `siteDescription`,
`beforeCare`, `afterCare`, `notSuitableFor`, `showPriceOnSite`.

**Indexes**

| Index | Column order | Query it serves |
|---|---|---|
| `service_tenant_active_idx` | `(tenantId, isActive, category)` | Public service list, booking popup service picker. Inactive services are excluded but remain for history. |
| `service_tenant_name_key` | `(tenantId, name)` UNIQUE | Prevents two services with the same name in one clinic. |

Related join table **`ServiceDoctor`** (`tenantId`, `serviceId`, `doctorId`)
with PK `(serviceId, doctorId)` — it determines which doctors a customer sees
on the public site.

### 2.4 TreatmentCycle

**PK:** `id` **FKs:** `tenantId`, `customerId`, `serviceId`, `doctorId`
**Unique:** `(tenantId, customerId, serviceId, startedAt)` — allows a repeat
cycle of the same service later, but not two identical ones on the same day.

Fields: `intervalDays` (**snapshotted from the cycle, not read live from the
service** — see the rule in §2.4.1), `totalSessions`, `completedSessions`,
`currentSessionNumber`, `startedAt`, `lastSessionAt`, `nextDueDate`,
`status` (`ACTIVE` / `DUE` / `AT_RISK` / `COMPLETED` / `ABANDONED`),
`abandonmentReason` (closed list), `inContactList` (bool), `lastContactAt`,
`nextContactAt`.

#### 2.4.1 Cycle rules that shape the schema

1. **A cycle is created when an appointment reaches `COMPLETED`** — not at
   booking, not at arrival. Creating at booking would fill the contact list
   with people who never had a session.
2. **Interval is read from the cycle, not the service.** A customer whose third
   session slipped by a week must have their fourth slip too, or the treatment
   spacing collapses.
3. **`nextDueDate = lastSessionAt + cycle.intervalDays`.**
4. **Enters the contact list** when `nextDueDate` has passed and **no future
   appointment exists for that cycle**. Without the second condition, anyone
   who already booked gets called anyway — the fastest way to make the list
   worthless.
5. **Leaves the contact list** when: a new appointment is booked for the cycle,
   or منشی records «منصرف شد» with a reason, or the cycle completes.
6. **`abandonmentReason` is a closed list** (قیمت / نتیجه نگرفت / عوارض /
   دور بودن مسیر / وقت نداشتن / نامشخص). Free text is not analysable, and this
   list is what tells the manager whether the problem is price or outcome.

**Indexes**

| Index | Column order | Query it serves |
|---|---|---|
| `cycle_tenant_status_due_idx` | `(tenantId, status, nextDueDate)` | The daily contact list — «دورههای فعال با موعد رسیده». The primary revenue query in the product. |
| `cycle_tenant_due_idx` | `(tenantId, nextDueDate)` | The hourly next-due sweep that flips `ACTIVE` → `DUE`. |
| `cycle_tenant_customer_idx` | `(tenantId, customerId)` | The cycle table on the customer profile and in the customer panel progress bar. |
| `cycle_tenant_doctor_idx` | `(tenantId, doctorId, status)` | «چرخه درمان» in the doctor panel; the manager's per-doctor drop-off analysis. |
| `cycle_tenant_completed_idx` | `(tenantId, status, lastSessionAt)` | Group دوره تکمیل شده and the «کمپین دوره نگهدارنده» trigger. |

### 2.5 Payment

**PK:** `id` **FKs:** `tenantId`, `appointmentId` (**required**), `customerId`,
`recordedByUserId`, `discountByUserId` (nullable)

Fields: `amount`, `method` (نقدی / کارت / آنلاین), `paidAt`, `kind`
(`DEPOSIT` / `PARTIAL` / `FINAL` / `REFUND`), `discountAmount`,
`discountReason`, `discountByUserId`, `note`.

**Invariants**

- Every payment attaches to **one specific appointment**, never merely to the
  customer — otherwise per-appointment balance is lost.
- `discountAmount` is a **part of** the total, not an addition to it.
- A discount always records **who applied it** (immutable rule 7).
- There is **no delete path**. A correction is a new `REFUND` row.
- The appointment's `priceAtBooking` is the charge; a later price change does
  not touch it.

**Indexes**

| Index | Column order | Query it serves |
|---|---|---|
| `payment_tenant_appt_idx` | `(tenantId, appointmentId)` | Sum of payments for one appointment (per-appointment balance). |
| `payment_tenant_customer_paid_idx` | `(tenantId, customerId, paidAt DESC)` | Customer payment history and the customer panel «پرداختهای من». |
| `payment_tenant_paid_idx` | `(tenantId, paidAt)` | Daily/monthly received totals; the `paidTotal` recomputation. |

Related table **`Discount`** is not separate — discounts live on the payment row
because a discount is only ever meaningful in the context of a charge, and
splitting it would allow a discount with no charge.

### 2.6 Campaign

**PK:** `id` **FKs:** `tenantId`, `audienceGroupId`, `createdByUserId`,
`messageTemplateId`

Fields: `name`, `type` (the 8 types), `channel` (`SMS` / `WHATSAPP`),
`audienceGroupId`, `audienceLockedAt`, `messageText`, `isRecurring`,
`scheduleKind` (`ONE_TIME` / `DAILY_AT` / `MONTHLY_DAY`), `scheduledAt`,
`scheduledTime`, `dailyCap`, `status` (`DRAFT` / `AWAITING_APPROVAL` /
`APPROVED` / `ACTIVE` / `PAUSED` / `FINISHED`), `approvedByUserId`,
`approvedAt`, `sentCount`, `resultingAppointmentCount`.

**Invariant:** `status` cannot reach `ACTIVE` without `approvedByUserId` and
`approvedAt` — "no bulk sending without human approval" is a schema-level
constraint, not a UI convention.

**Indexes**

| Index | Column order | Query it serves |
|---|---|---|
| `campaign_tenant_status_idx` | `(tenantId, status, scheduledAt)` | The campaign dispatch scan for due campaigns. |
| `campaign_tenant_type_idx` | `(tenantId, type)` | Campaign list grouping and per-type performance. |

Related table **`MessageSend`** — the delivery ledger (this is what makes
"a person receives no duplicate message within 90 days" enforceable and what
lets the customer profile list every message ever sent):

`id`, `tenantId`, `customerId`, `campaignId` (nullable), `automaticKind`
(nullable — one of the 7), `templateId`, `channel`, `renderedText`, `sentAt`,
`status` (`QUEUED` / `SENT` / `DELIVERED` / `FAILED` / `SUPPRESSED`),
`suppressedReason` (no consent / daily cap / send window / duplicate window),
`providerMessageId`, `error`.

| Index | Column order | Query it serves |
|---|---|---|
| `send_tenant_customer_sent_idx` | `(tenantId, customerId, sentAt DESC)` | The 90-day duplicate check and the customer profile message list. |
| `send_tenant_status_queued_idx` | `(tenantId, status, sentAt)` | The worker's dispatch queue. |
| `send_tenant_campaign_idx` | `(tenantId, campaignId)` | Campaign result counts. |

### 2.7 AudienceGroup

**PK:** `id` **FKs:** `tenantId`, `createdByUserId` (null for the 8 built-ins)

Fields: `key` (stable slug for the 8 built-ins), `name`, `isBuiltIn`,
`predicate` (JSON-serialised, see §5), `predicateVersion`, `lastRefreshedAt`,
`lastCount`, `isActive`.

**Invariant:** a group stores a **predicate**, never a member list. The count
is a cache; membership is computed. This is Decision 3 and it is what makes the
recurring birthday campaign correct a year later.

**Indexes**

| Index | Column order | Query it serves |
|---|---|---|
| `group_tenant_key_key` | `(tenantId, key)` UNIQUE | Looking up the 8 built-ins. |
| `group_tenant_refresh_idx` | `(tenantId, isActive, lastRefreshedAt)` | The nightly refresh job scan. |

**Group predicate → index coverage map.** Each built-in group is written to be
answerable from the indexes in §2.1–§2.4:

| Group | Predicate (abridged) | Served by |
|---|---|---|
| متولدین این ماه | `birthMonth = currentJalaliMonth` | `customer_tenant_birth_idx` |
| خوابیدهها | `lastVisitAt < now − 90d` AND `completedSessions ≥ 1` | `customer_tenant_lastvisit_idx` |
| موعد رسیده | active cycle, `nextDueDate` passed, no future appointment | `cycle_tenant_status_due_idx` |
| وفادارها | `completedSessions > 5` | `customer_tenant_sessions_idx` |
| بدهکاران | `charged − discount − paid > 0` AND due passed | `payment_tenant_customer_paid_idx` + `appt_tenant_status_sched_idx` |
| تازهواردها | `firstVisitAt ≥ now − 30d` | `customer_tenant_firstvisit_idx` |
| دوره تکمیل شده | cycle `COMPLETED` and `lastSessionAt ≤ now − 30d` | `cycle_tenant_completed_idx` |
| یکباریها | `completedSessions = 1` AND `lastVisitAt < now − 60d` | `customer_tenant_sessions_idx` |

`یکباریها` deserves a note: the specification calls it the group clinics never
see and usually their largest — people who came once, were satisfied, and were
never reminded.

---

## 3. Dates, times and money

### 3.1 Dual date representation

Every scheduled thing stores **both**:

- `scheduledAt: DateTime` — the UTC instant. Canonical, used for ordering,
  "N days from now" arithmetic, and "next due" computation.
- `localDate: String` (`YYYY-MM-DD`, **Jalali years**) and `localTime: String`
  (`HH:mm`) — clinic-local, used for day grids, display, and uniqueness.

Why both: the slot's real identity to the clinic is "10:30 on 29 Shahrivar",
not an instant. Storing only an instant makes every day-grid query a timezone
conversion, and Iranian time (UTC+3:30) is exactly the kind of offset that
produces off-by-one-day bugs that appear only in production. Storing the local
date makes the day-grid query a string equality on an indexed column, and makes
Jalali display a formatting concern rather than a conversion.

`localDate` is Jalali because the UI never shows a Gregorian date; storing it
Gregorian would mean converting on every read. Conversion happens once, on
write.

**Money is `BigInt`, in Rial.** Prisma `BigInt` maps to `INTEGER` on SQLite and
`BIGINT` on PostgreSQL — portable across both. Money is never a float, and never
a `Number` in transport: it serialises as a **string** over JSON boundaries to
avoid precision loss.

---

## 4. Balance — computed, never stored

### 4.1 The formula

```
balance = (Σ appointment.priceAtBooking) − (Σ payment.discountAmount) − (Σ payment.amount)
dueDate = appointment.scheduledAt + settings.debtGraceDays
```

### 4.2 Where each term comes from

- **`priceAtBooking`** — snapshotted on the appointment at booking, so a later
  price change does not retroactively alter what a customer owes.
- **`discountAmount`** — recorded on the payment row, with the name of whoever
  applied it.
- **`amount`** — every receipt is its own row with date and method.
- **`dueDate`** — derived from the appointment plus the clinic's configured
  grace period.

### 4.3 Why there is no `balance` column

Storing it means the first time a payment is corrected or reversed, the number
is silently wrong and nobody can tell which of the two figures is right.
Computing at read time is the only trustworthy option. Consequently **there is
no `debts` table**, and therefore no `debts` index.

**How the debt list is indexed anyway.** Because
`dueDate = scheduledAt + grace` is monotonic in `scheduledAt`, a query for
"debts due before X" translates into a range scan on `scheduledAt`, served by
`appt_tenant_status_sched_idx (tenantId, status, scheduledAt)`. The four debt
buckets (بیش از ۳۰ روز / بیش از ۷ روز / گذشته از سررسید / نزدیک سررسید)
are four ranges over the same index.

**Performance cache, explicitly not a balance.** For the بدهکاران audience
group, `Customer` carries `chargedTotal` and `paidTotal` — running sums of
immutable ledger facts, updated in the same transaction as the fact. These are
**recomputable caches of facts, not a stored balance**: the balance is still
computed as `chargedTotal − discountTotal − paidTotal` at read time, and a
nightly reconciliation job recomputes both sums from the ledger and fails
loudly on any drift. Storing the two *inputs* and computing the *derived value*
keeps immutable rule 8 intact while keeping the group query off a full scan.

> Resolved in `docs/roadmap/adr/0014-recomputable-…md` (Phase 1, OQ-3): the
> cache stays, because the rule it touches names the thing it protects — rule 8
> forbids storing *the balance*, and these are its inputs. The reconciliation
> that keeps it honest is a blocking test in Phase 5, not an operational habit.

### 4.4 Fixed financial rules

- Debt deletion does not exist; a discount is recorded with the recorder's name.
- Every payment attaches to a specific appointment, never to the customer.
- Deposits: the stated amount is required unless the manager has allowed
  online booking without a deposit. Refund on cancellation follows clinic
  policy (full / half / none), set in settings.

---

## 5. Portability constraints (SQLite ⟷ PostgreSQL)

The schema must work on both engines with no per-engine branching, because
development is SQLite and production is PostgreSQL (`setup/database-migration.md`).

| Avoided feature | Portable representation |
|---|---|
| Native **enums** | `String` column + a constants module + Zod validation at every boundary. The database does not enforce it; tests do. |
| **Arrays** | A join table (`ServiceDoctor`) or a child table. Never a delimited string. |
| **JSONB** | `String` holding JSON, parsed through a Zod schema on read. Used only for `AudienceGroup.predicate` and settings blobs. |
| **Partial / filtered indexes** | Used in exactly **one** place — `appt_slot_unique` — because double-booking prevention cannot be expressed otherwise. Represented portably as a plain unique index over a nullable `slotKey` column, which is `NULL` for slot blocks (and `NULL` is not compared in a unique index on either engine). Documented as the single sanctioned escape hatch. |
| `citext` | Store normalised lowercase in the application layer. |
| `tsvector` / full-text search | `LIKE` with a normalised `searchName` column. At clinic data volumes this is sufficient and works identically on both engines. |
| `CREATE INDEX CONCURRENTLY` | Not used; migrations run in a maintenance window. |
| DB-generated UUIDs | IDs generated in the application (cuid), so both engines behave identically. |

The one escape hatch is listed in `setup/database-migration.md` with its
justification and a test that asserts the invariant holds on both engines.

---

## 6. Supporting entities (summary)

| Entity | Purpose | Key indexes |
|---|---|---|
| `Tenant` | The SaaS customer | `slug` UNIQUE |
| `Clinic` | Branch within a tenant | `(tenantId, name)` UNIQUE |
| `User` | A person who can log in | `(tenantId, mobile)` UNIQUE |
| `Membership` | User × Tenant + role + clinic scope + overrides | `(userId, tenantId)` UNIQUE, `(tenantId, role)` |
| `MessageTemplate` | Editable text of the 7 automatic messages | `(tenantId, automaticKind, channel)` UNIQUE |
| `ConsentRecord` | Channel consent, with timestamp and source | `(tenantId, customerId, channel)` |
| `BeforeAfterImage` + consent | Revocable written consent per image | `(tenantId, customerId)` |
| `SlotBlock` | A closed hour or day | modelled on `Appointment` with `isSlotBlock` |
| `ClinicShift` | Clinic working shifts | `(tenantId, clinicId, weekday)` |
| `DoctorWorkingHours` | Per-doctor sub-ranges of the shifts | `(tenantId, doctorId, weekday)` |
| `Holiday` | Official and clinic holidays | `(tenantId, localDate)` |
| `LeaveRequest` | Doctor leave → manager approval | `(tenantId, doctorId, status)` |
| `JobQueue` | Worker job table with claim semantics | `(status, runAt)` |
| `AuditLog` | Permission-sensitive actions | `(tenantId, at DESC)`, `(tenantId, actorUserId, at DESC)` |
| `LicenseKey` | On-premise licence | `key` UNIQUE |

---

## 7. Cross-entity invariants (enforced in the module layer + tests)

1. `Appointment.customerId` must belong to the same `tenantId` — asserted by
   every write path and covered by the cross-tenant test suite.
2. A cycle is created **only** on transition to `COMPLETED`, exactly once per
   appointment (idempotent on retry).
3. `completedSessions` on a cycle equals the count of its `COMPLETED`
   appointments — reconciled nightly.
4. `nextDueDate` is never in the past while `status = ACTIVE`.
5. A payment's `customerId` must equal its appointment's `customerId`.
6. `MessageSend` requires a consent record for the channel, or
   `status = SUPPRESSED` with a reason.
7. `Campaign.status = ACTIVE` requires an approver and an approval timestamp.
8. No hard delete exists on `Service`, `Payment`, or `Appointment`. Services
   deactivate; payments reverse; appointments cancel or reschedule.

---

*Related: `02-architecture.md` (tenant boundary and modules), `09-security.md`
(RLS over these tables), `04-roles-permissions.md` (who may write what),
`setup/database-migration.md` (the §5 escape hatch in practice).*
