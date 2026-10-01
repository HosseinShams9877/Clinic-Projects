# 06 — Constants & Immutable Rules

> Everything in this file is a **constant of the product**, not a preference.
> Code must import these values from a single module; none may be re-typed,
> re-invented, or overridden locally.

---

## 1. The Ten Immutable Rules

From the specification, §15 — «قواعدی که در هیچ نسخهای تغییر نمیکنند»
(*rules that change in no version*). They are reproduced verbatim, with the
enforcement mechanism that makes each one structural rather than aspirational.

### Rule 1

> **هیچ تشخیص، توصیه درمانی یا تضمین نتیجهای از سمت سیستم. سؤال پزشکی به پزشک
> میرود. این هم مسئولیت حرفهای است هم ریسک حقوقی.**

*No diagnosis, treatment advice, or outcome guarantee from the system. A medical
question goes to a doctor. This is both a professional responsibility and a legal
risk.*

**Enforced by:** no module contains medical content generation. The
`campaign-assistant` field allow-list (§4) excludes every clinical field. There
is no code path in which the system answers a clinical question; the only
behaviour available is to refer it to a doctor.

### Rule 2

> **دسترسی در سرور اعمال میشود. پنهان کردن منو، کنترل دسترسی نیست.**

*Access is enforced on the server. Hiding a menu is not access control.*

**Enforced by:** `requirePermission()` at the module boundary
(`04-roles-permissions.md` §3.1). Every module entry point calls it. A page
handler that only hides a link is a defect. The 96-test permission matrix exists
to prove this.

### Rule 3

> **داده پزشکی از دستیار و کمپین جداست. گروهبندی فقط با داده رفتاری و مالی.**

*Medical data is separate from the assistant and from campaigns. Grouping uses
only behavioural and financial data.*

**Enforced by:** the audience-group predicate grammar has no clinical field in
its type. Grouping is expressible only in terms of visit history, session counts,
balances and dates. The type system makes a clinical grouping impossible to write.

### Rule 4

> **هیچ ارسال گروهی بدون تأیید انسان.**

*No bulk send without human approval.*

**Enforced by:** `Campaign.status` cannot reach `ACTIVE` without
`approvedByUserId` and `approvedAt` (`03-data-model.md` §2.6). The
campaign-assistant drafts; a human presses approve. There is no code path that
moves a campaign to `ACTIVE` without an actor.

### Rule 5

> **رضایت مشتری بر خواست کلینیک مقدم است.**

*Customer consent takes precedence over the clinic's wishes.*

**Enforced by:** consent is checked in the `notifications` and `messages`
dispatch path, downstream of every other filter. A customer without consent for a
channel is removed from the recipient set even when a manager has explicitly
selected them — and the removal is recorded as `SUPPRESSED` with a reason, so it
is visible rather than silent.

### Rule 6

> **تصویر قبل و بعد فقط با رضایت کتبی، و قابل لغو در هر زمان.**

*Before/after images only with written consent, revocable at any time.*

**Enforced by:** a `BeforeAfterImage` requires a consent record with a
timestamp. Revocation is a first-class operation that removes the image from
every surface, including the public site, without deleting the audit trail of the
consent itself.

### Rule 7

> **حذف بدهی وجود ندارد؛ تخفیف با نام ثبتکننده ثبت میشود.**

*Debt deletion does not exist; a discount is recorded with the name of whoever
recorded it.*

**Enforced by:** the `debts` module is read-and-follow-up only and has no write
path to `Payment`. Every discount row carries `discountByUserId`. There is no
delete operation on a payment anywhere in the codebase — a correction is a
`REFUND` row, which leaves both facts visible.

### Rule 8

> **مانده محاسبه میشود، ذخیره نمیشود.**

*Balance is computed, never stored.*

**Enforced by:** there is no `balance` column. The value is derived at read time
(`03-data-model.md` §4). The only stored figures are running sums of immutable
ledger facts, which are recomputable caches reconciled nightly — and the balance
itself is still computed from them, never persisted.

### Rule 9

> **هیچ کاربری دسترسی خودش را تغییر نمیدهد.**

*No user changes their own access.*

**Enforced by:** the permission-update path requires `manage_users` and rejects
any actor whose id equals the subject id. Additionally the manager column is
locked (`04-roles-permissions.md` §2.3), and a transaction-level invariant
refuses to leave a tenant without a manager.

### Rule 10

> **خدمت غیرفعال میشود، حذف نمیشود — تاریخچه باید سالم بماند.**

*A service is deactivated, never deleted — history must remain intact.*

**Enforced by:** no delete path exists on `Service`. Deactivation sets
`isActive = false`, which removes it from the public list and the booking picker
while every historical appointment, cycle and payment still resolves its name and
price.

---

## 2. Demo boundaries vs. the real product

From §15 «مرزهای نسخه نمایشی» (*the demo build's boundaries*). This table exists
so that nobody mistakes a demo shortcut for a product decision.

| Subject | In the real product | In the demo |
|---|---|---|
| Database | Real database, with backups | Sample data in static pages |
| Login | One-time code + secure session | No authentication |
| Payment | Iranian gateway + temporary slot lock until payment confirmation | Simulated payment |
| SMS / WhatsApp | SMS panel + WhatsApp Business | Text display only, nothing sent |
| Campaign assistant | Language model bounded by §1 rule 3 and §13 constraints | Pre-defined |
| Automatic status | Runs hourly on a schedule | Four ready scenarios |
| SMS panel / send | Real | Nothing is sent |

**Consequence for Phase 0:** none of these demo shortcuts may leak into the
architecture. In particular, the demo's "no authentication" and "simulated
payment" are the two that most often get copied forward by accident.

---

## 3. Deliberately deferred

From §15 «آنچه عمداً به نسخه بعد موکول شد» (*what was deliberately postponed*).

| Deferred | Reason (verbatim intent) |
|---|---|
| Secretary work report in the manager panel | Defining a correct measure came first; until a good definition exists, producing the number is harmful. |
| Service-record page | Currently done in the appointments table; it will be added if a real need appears. |
| Inventory and consumables | Separate scope; it is not a platform differentiator. |

**Rule:** these are **out of scope**, not "coming soon". They must not appear in
any phase of the roadmap, must not be scaffolded with empty modules, and must not
be mentioned in the UI as planned features.

---

## 4. Enumerations

These are the closed sets the whole product depends on. They live as frozen
objects in a constants module, are validated by Zod at every boundary, and are
stored as `String` because native database enums are not portable
(`03-data-model.md` §5).

### 4.1 Roles

```
MANAGER   مدیر
DOCTOR    پزشک
SECRETARY منشی
```

### 4.2 Permissions (16)

```
view_own_schedule            دیدن برنامه روز خودش
view_all_schedules           دیدن برنامه همه پزشکان
manage_appointments          ثبت و جابهجایی نوبت
record_appointment_result    ثبت نتیجه نوبت
view_own_customer_records    دیدن پرونده مراجعین خودش
view_all_customers           دیدن پرونده همه مشتریان
view_debts                   دیدن ماندهحساب
record_payment               ثبت دریافت وجه
follow_up_debt               پیگیری بدهی
view_own_cycles              دیدن چرخه درمان خودش
act_on_cycles                اقدام روی چرخه درمان
manage_leads                 کارتابل لید
manage_campaigns             ساخت و اجرای کمپین
manage_services              تعریف خدمت و قیمت
manage_clinic_settings       تغییر تنظیمات کلینیک
manage_users                 مدیریت کاربران و دسترسی
```

Role defaults: `MANAGER` = all 16 (locked) · `DOCTOR` = 3 · `SECRETARY` = 12.
Full matrix and rationale: `04-roles-permissions.md`.

### 4.3 Appointment status (8)

```
BOOKED              رزرو شده        automatic
AWAITING_ARRIVAL    منتظر پزشک      automatic (day arrives)
ARRIVED             حاضر شد         recorded by staff
COMPLETED           انجام شد        recorded by staff — creates the cycle
NO_SHOW             عدم حضور        recorded by staff
CANCELLED           لغو شد          customer or staff
RESCHEDULED         جابهجا شد      either; a new appointment is linked
RESULT_NOT_RECORDED نتیجه ثبت نشده  automatic (2h past the slot, unrecorded)
```

Four are automatic, four are recorded by a person. `RESULT_NOT_RECORDED`
surfaces **only** in the reception cartable — never on the manager or doctor
dashboard. See `03-data-model.md` §2.2.

### 4.4 Booking modes (3)

| Mode | Persian | Customer sees on the site | Secretary does |
|---|---|---|---|
| Fixed slot | ساعت مشخص | Real slots: ۱۰:۰۰، ۱۰:۳۰، ۱۱:۰۰ | Confirms only — the appointment is already in the grid |
| Time range | بازه زمانی | «صبح ۹ تا ۱۲» or «عصر ۱۶ تا ۲۰» with remaining capacity | Sets the exact time and informs the customer |
| Request | درخواست نوبت | Service, preferred day, phone number — **no time at all** | Calls and books it |

Fixed slot is the default. The specification's note on why all three must exist:
most clinics start on «درخواست نوبت» because they do not yet trust online
booking, and migrate to «ساعت مشخص» after two months when they see the
conversion rate — and if the platform cannot make that migration a switch, the
clinic replaces the software. The mode changes both the public site's behaviour
and the reception panel's.

### 4.5 Cycle status

```
ACTIVE      فعال
DUE         موعد رسیده
AT_RISK     در خطر
COMPLETED   تکمیل شده
ABANDONED   منصرف شده
```

### 4.6 Abandonment reasons (closed list)

```
PRICE           قیمت
NO_RESULT       نتیجه نگرفت
SIDE_EFFECTS    عوارض
DISTANCE        دور بودن مسیر
NO_TIME         وقت نداشتن
UNKNOWN         نامشخص
```

Closed on purpose: the list is what tells the manager whether the problem is
price or outcome. Free text would not be analysable.

### 4.7 Acquisition sources (5)

| Source | Background | Foreground |
|---|---|---|
| Instagram | `#FDEAF3` | `#B8437E` |
| WhatsApp | `#E6F4EA` | `#2F7D4F` |
| Website | `#EAEEFB` | `#4A5BB5` |
| Phone | `#FDF0E3` | `#A96E28` |
| Referral | `#F0EBFA` | `#6B52AB` |

These five are the source tags used across the panels; the colour pairs are part
of the design system and may not be substituted (`08-ui-design-system.md`).

### 4.8 Campaign types (8)

| Type | Persian | Audience | Recurrence |
|---|---|---|---|
| `BIRTHDAY` | تولد | Birth month = current month, with SMS consent | Monthly / on the day |
| `WINBACK` | بازگشت خوابیدهها | No visit for over 3 months, at least one completed session | Monthly |
| `NEXT_SESSION` | جلسه بعد دوره | Cycle due, no future appointment | Daily |
| `OCCASION` | مناسبت | Everyone with consent | One time |
| `NEW_SERVICE` | خدمت جدید | Interested in the related category | One time |
| `DEBT_REMINDER` | یادآوری بدهی | Overdue | Weekly |
| `SURVEY` | نظرسنجی | 3 days after service | Recurring |
| `LOYALTY` | تشکر از وفادارها | More than 5 visits | Seasonal |

### 4.9 Audience groups (8) — the built-in set

Each is a **saved query re-evaluated nightly**, never a stored list.

| # | Group | Persian | Predicate |
|---|---|---|---|
| 1 | Birthday | متولدین این ماه | Birth month = current Jalali month |
| 2 | Dormant | خوابیدهها | Last visit > 90 days ago · at least 1 completed session |
| 3 | Cycle due | موعد رسیده | Active cycle · due date passed · no future appointment |
| 4 | Loyal | وفادارها | More than 5 completed sessions |
| 5 | Debtors | بدهکاران | Balance > 0 · due date passed |
| 6 | New | تازهواردها | First visit within the last 30 days |
| 7 | Completed course | دوره تکمیل شده | All sessions done · more than a month ago |
| 8 | One-timers | یکباریها | Exactly one session, more than 60 days ago |

The specification's note on group 8 is worth preserving in the product's
thinking: «یکباریها» is the group clinics never see and usually their largest —
people who came once, were satisfied, and were never reminded.

### 4.10 Automatic messages (7)

| # | Message | Persian | Timing | Content intent |
|---|---|---|---|---|
| 1 | Booking confirmation | تأیید رزرو | Immediately | Service, doctor, date, time, address, booking code |
| 2 | Appointment reminder | یادآوری نوبت | 1 day before (configurable) | Reminder + reschedule link — the most effective no-show reducer |
| 3 | Aftercare | مراقبت پس از خدمت | A few hours later | Service recommendations; reduces weak results and repeat contact |
| 4 | Next session reminder | یادآوری جلسه بعد | 3 days before due date | «موعد جلسه ۴ نزدیک است» + booking invitation |
| 5 | Balance reminder | یادآوری مانده | On due date and 7 days after | Amount + online payment link |
| 6 | No-show follow-up | پیگیری عدم حضور | The next day | Non-accusatory tone + a fresh appointment offer |
| 7 | Survey | نظرسنجی | 3 days later | One question, 5-point scale; low answers go to the secretary cartable |

**Send rules (binding):**

- Only inside the allowed sending window.
- Full respect for per-channel consent.
- **At most one automatic message per person per day**, by priority:
  next-session appointment → financial → survey.
- Every send is recorded on the customer's record.

Text of all seven is editable in settings; **none may be hard-coded in code**.

### 4.11 Debt buckets (4)

```
OVER_30_DAYS     بیش از ۳۰ روز
OVER_7_DAYS      بیش از ۷ روز
PAST_DUE         گذشته از سررسید
DUE_SOON         نزدیک سررسید
```

All four are ranges over the same index — see `03-data-model.md` §4.3.

### 4.12 Channels

```
SMS         پیامک
WHATSAPP    واتساپ
```

---

## 5. Numeric and structural constants

| Constant | Value | Source |
|---|---|---|
| Maximum lines per file | **1000** | Project rule; enforced in CI |
| Duplicate-message window | **90 days** — one person does not receive a repeat message within 90 days | Spec §13 hard boundaries |
| Automatic messages per person per day | **1** | Spec §14 send rules |
| Default deposit amount | **۵۰۰٬۰۰۰ تومان** | `admin/settings.html` |
| Secretary discount cap | configured in settings (نوبتدهی tab) | `admin/settings.html` |
| Default reminder offset | **1 day before** (configurable) | Spec §14 |
| `RESULT_NOT_RECORDED` trigger | **2 hours** past the slot | Spec §4 |
| Dormant threshold | **90 days** since last visit | Spec §13 |
| New-customer window | **30 days** since first visit | Spec §13 |
| Loyal threshold | **more than 5** completed sessions | Spec §13 |
| One-timer threshold | **1 session**, more than **60 days** ago | Spec §13 |
| Completed-course window | more than **1 month** after the last session | Spec §13 |
| Win-back threshold | more than **3 months** with no visit | Spec §13 |
| Public header height | 76px | Design system |
| Panel breakpoint | ≤ 1000px | Design system |

---

## 6. Currency and number constants

| Constant | Value |
|---|---|
| Currency | Iranian **Toman** in the UI, stored in **Rial** |
| Storage type | `BigInt` (maps to `INTEGER` on SQLite, `BIGINT` on PostgreSQL) |
| Transport | **String** across JSON boundaries — never a JS `Number`, never a float |
| Digits in the UI | **Persian digits (۰۱۲۳۴۵۶۷۸۹) — mandatory, always** |
| Digit separators | Persian thousands separator `٬` (e.g. ۵۰۰٬۰۰۰) |
| Calendar in the UI | **Jalali — mandatory, always** |
| `localDate` storage format | `YYYY-MM-DD` in **Jalali** years |

---

## 7. What "constant" means here

1. These values are defined **once**, in a single constants module in
   `src/core`, and imported everywhere.
2. No value in this file may be duplicated as a literal anywhere else in the
   codebase. A repeated literal is a defect.
3. Persian labels live in the localization layer keyed by these codes
   (`07-localization.md`), not beside them.
4. Changing any value in §1 requires a new ADR in `roadmap/decisions.md`. §1 is
   not editable by a normal change.

---

*Related: `04-roles-permissions.md` (the matrix and the 8 toggles),
`03-data-model.md` (how these enums are stored), `07-localization.md` (the
Persian labels), `08-ui-design-system.md` (the source-tag colours),
`roadmap/decisions.md` (the ADRs that may amend §1).*
