# 04 — Roles & Permissions

> The permission model is the product's spine. The specification says it
> directly: **«سطح دسترسی باید در سمت سرور بررسی شود، نه با پنهان کردن دکمه.»**
> Access level must be checked on the server, not by hiding a button.

---

## 1. The three roles

| Role | Code | Persian | Count | Nature |
|---|---|---|---|---|
| Manager | `MANAGER` | مدیر | typically 1 | Owns the clinic. Full access, permanently. |
| Doctor | `DOCTOR` | پزشک | 1–10 | Sees own schedule, own customers, own cycles. |
| Secretary | `SECRETARY` | منشی | 1–5 | The operational hub: books, receives, follows up. |

There are exactly three. The specification removed every other role it
considered, and `admin/staff.html` offers no fourth option in its role control.

---

## 2. The 16 permissions

**Source of record.** The specification's own matrix table (spec §2) was
destroyed in PDF→text extraction — the reading order is scrambled and the
mark counts per block are inconsistent. The matrix was therefore reconstructed
from the **live rendered table in `clinic/admin/staff.html`**, which stores each
cell as an explicit `<input type="checkbox" checked>` and is unambiguous. It was
then cross-validated against the same file's user list, where منشی مریم صالحی is
labelled «۱۲ دسترسی از ۱۶» — an exact match to the secretary default derived
independently. See `reports/phase-00-report.md` (OQ-2).

`✓` = granted by default · `—` = not granted · مدیر is always «همیشه».

| # | Slug | دسترسی | توضیح | مدیر | پزشک | منشی |
|---|---|---|---|---|---|---|
| 1 | `view_own_schedule` | دیدن برنامه روز خودش | هر پزشک فقط نوبتهای خودش | همیشه | ✓ | ✓ |
| 2 | `view_all_schedules` | دیدن برنامه همه پزشکان | نمای کل کلینیک | همیشه | — | ✓ |
| 3 | `manage_appointments` | ثبت و جابهجایی نوبت | ایجاد، لغو و انتقال نوبت | همیشه | — | ✓ |
| 4 | `record_appointment_result` | ثبت نتیجه نوبت | حاضر شد / نیامد / لغو | همیشه | — | ✓ |
| 5 | `view_own_customer_records` | دیدن پرونده مراجعین خودش | سوابق، دورهها، یادداشت | همیشه | ✓ | ✓ |
| 6 | `view_all_customers` | دیدن پرونده همه مشتریان | کل بانک مشتریان | همیشه | — | ✓ |
| 7 | `view_debts` | دیدن ماندهحساب | فهرست بدهکاران | همیشه | — | ✓ |
| 8 | `record_payment` | ثبت دریافت وجه | ثبت پرداخت و تخفیف | همیشه | — | ✓ |
| 9 | `follow_up_debt` | پیگیری بدهی | تماس و ثبت نتیجه | همیشه | — | ✓ |
| 10 | `view_own_cycles` | دیدن چرخه درمان خودش | دورههای مراجعین خودش | همیشه | ✓ | ✓ |
| 11 | `act_on_cycles` | اقدام روی چرخه درمان | تماس، جابهجایی جلسه | همیشه | — | ✓ |
| 12 | `manage_leads` | کارتابل لید | لیدهای سایت و اینستاگرام | همیشه | — | ✓ |
| 13 | `manage_campaigns` | ساخت و اجرای کمپین | ارسال پیام گروهی | همیشه | — | — |
| 14 | `manage_services` | تعریف خدمت و قیمت | افزودن خدمت، تغییر قیمت | همیشه | — | — |
| 15 | `manage_clinic_settings` | تغییر تنظیمات کلینیک | ساعات، نوبتدهی، پیامها | همیشه | — | — |
| 16 | `manage_users` | مدیریت کاربران و دسترسی | افزودن کاربر، تغییر سطح | همیشه | — | — |

### 2.1 Role defaults

| Role | Default grants | Count |
|---|---|---|
| `MANAGER` | 1–16, **locked** | 16 |
| `DOCTOR` | 1, 5, 10 | **3** |
| `SECRETARY` | 1–12 | **12** |

The doctor default is deliberately minimal: a doctor sees **only their own**
schedule, **only their own** patients' records, and **only their own** cycles.
They cannot see the clinic-wide schedule, the full customer bank, the debt list,
or any money at all. `admin/staff.html` states the consequence as a warning on
the page: **«دکتر فقط مراجعین خودش را میبیند»** — a doctor opening another
doctor's patient must be refused by the server.

### 2.2 Per-user overrides

The role default is a **starting point**, not a ceiling. Each user has an
override set on top of it, edited in the user modal (title: «دسترسی دکتر آرش
کیانی», with the note «نقش: پزشک — تغییرات فقط برای همین کاربر اعمال میشود»).

Live examples from `admin/staff.html`, which also serve as the arithmetic check
on the defaults above:

| User | Role | Shown as | Override |
|---|---|---|---|
| مریم صالحی | منشی | ۱۲ از ۱۶ | none — role default |
| سحر رحیمی | منشی | ۱۰ از ۱۶ | −2 from default |
| دکتر آرش کیانی | پزشک | ۵ از ۱۶ | +2 over default |
| دکتر سارا نادری | پزشک | ۴ از ۱۶ | +1 over default |

Effective permission set:

```
effective(user) = (roleDefault(role) ∪ granted(user)) \ revoked(user)
```

Overrides are stored per `Membership`, not per `User` — a visiting doctor who
works at two tenants has different permissions at each
(`02-architecture.md` §2).

### 2.3 The manager column is locked

The manager column renders as a static «همیشه» badge, never a checkbox. The
page states why:

> **«ستون مدیر قفل است — اگر مدیر بتواند دسترسی خودش را بردارد، کلینیک
> میتواند بدون هیچ مدیری بماند.»**
>
> *The manager column is locked. If a manager could remove their own access,
> the clinic could be left with no manager at all.*

This is a **structural** guarantee, enforced in three places:

1. The UI renders no control for it.
2. The `roles-permissions` module rejects any write that would remove a
   permission from a `MANAGER` membership.
3. A database-level invariant check inside the same transaction refuses to
   commit a tenant whose last active `MANAGER` would lose `manage_users` or
   `manage_clinic_settings`.

A tenant with zero managers is unrecoverable without operator intervention, so
it is prevented rather than repaired.

---

## 3. Enforcement: server-side, every time

`admin/staff.html` carries this alert, and it is the rule for the whole system:

> **«قاعده اول: هر چیزی که قابل تغییر است، فقط اینجا و در تنظیمات عوض میشود…
> هیچ کاربری نمیتواند دسترسی خودش را بالا ببرد.»**
>
> *Rule one: everything that is changeable changes only here and in settings…
> No user can raise their own access.*

And the specification's own implementation note (spec §2):

> «سطح دسترسی باید در سمت سرور بررسی شود، نه با پنهان کردن دکمه. اگر فقط منو
> را مخفی کنیم، منشی با دانستن آدرس صفحه به گزارش مالی میرسد. هر سوئیچ در این
> ماتریس باید معادل یک قاعده در لایه سرویس باشد.»
>
> *Access level must be checked server-side, not by hiding a button. If we only
> hide the menu, a secretary who knows the page URL reaches the financial report.
> Every switch in this matrix must correspond to a rule in the service layer.*

### 3.1 The `can()` primitive

`roles-permissions` owns exactly one enforcement primitive, and every module
calls it:

```ts
can(ctx: TenantContext, permission: Permission): boolean
requirePermission(ctx: TenantContext, permission: Permission): void  // throws
```

The context is always the **server-resolved** one from `getTenantContext()`
(`02-architecture.md` §11). There is no overload that accepts a role, a user id,
or a permission list from a caller, a request body, or a cookie. This is what
makes "no user can raise their own access" true rather than aspirational: there
is no code path through which a client can supply a permission.

### 3.2 Why the check lives in the module, not the page

The same module function is called by a Server Component, a Server Action, a
Route Handler, **and the background worker**. If the check sat in the page, the
worker and every route handler would bypass it. Placing `requirePermission` at
the module boundary means there is no path to data that skips a decision.

### 3.3 The four escalation paths, and how each is closed

| Attack | Closed by |
|---|---|
| Set `tenantId`/`clinicId` in a form field or query string | Nothing reads a client-supplied tenant. Resolution is from `Membership` only. |
| Call a page URL directly, bypassing a hidden menu item | The page's module call performs `requirePermission`; the page renders a 403 regardless of how it was reached. |
| Grant oneself a permission via the permissions form | The write path requires `manage_users` and validates that the actor is not the subject; a user cannot edit their own membership. |
| Remove the last manager's access | §2.3 — rejected at module and transaction level. |

### 3.4 Permission → owning module

Each permission is enforced by exactly one module, so there is a single place to
audit:

| Permission | Enforced by |
|---|---|
| `view_own_schedule`, `view_all_schedules`, `manage_appointments`, `record_appointment_result` | `appointments` |
| `view_own_customer_records`, `view_all_customers`, `manage_leads` | `customers` |
| `view_debts`, `follow_up_debt` | `debts` |
| `record_payment` | `payments` |
| `view_own_cycles`, `act_on_cycles` | `cycles` |
| `manage_campaigns` | `campaigns` |
| `manage_services` | `services` |
| `manage_clinic_settings` | `settings` |
| `manage_users` | `staff` + `roles-permissions` |

**Scope refinement inside a permission.** Two permissions are additionally
narrowed by ownership, not only by role:

- `view_own_schedule` returns appointments where `doctorId = ctx.userId`.
  `view_all_schedules` returns all of the tenant's.
- `view_own_customer_records` and `view_own_cycles` filter to customers whose
  `primaryDoctorId` matches, or where the customer has an appointment with that
  doctor.

The ownership predicate is applied **inside the module query**, next to the
`tenantId` predicate — never in a component. A doctor with
`view_own_customer_records` who opens another doctor's patient URL gets a 404,
not a redacted page: the record does not exist within their scope, and returning
"forbidden" would confirm the record's existence.

---

## 4. The 8 behavioral toggles

Distinct from the matrix. The specification draws the line precisely:

> «تفاوتش با ماتریس این است که ماتریس میگوید "چه کسی چه صفحهای را دارد" و
> اینها میگویند "در آن صفحه چقدر اختیار دارد".»

*The matrix says who has which page; these say how much authority they have
inside that page.*

They live in **تنظیمات › اختیارات** (`admin/settings.html`, tab `t5`,
«اختیاراتی که واگذار میکنید»). Defaults below are read from the live demo.

| # | Toggle | Description | Default | Effect when ON |
|---|---|---|---|---|
| 1 | پزشک بتواند از برنامه خودش نوبت ثبت کند | میانبر رزرو روی ساعتهای خالی داشبورد پزشک | **روشن** | A booking shortcut appears on empty slots in the doctor dashboard. |
| 2 | پزشک بتواند ساعت خودش را ببندد | بدون نیاز به تأیید مدیر | **خاموش** | A doctor may close their own hours without manager approval. |
| 3 | منشی بتواند تخفیف بدهد | سقف تخفیف در خط بعد تعیین میشود | **روشن** | A secretary may apply a discount, capped by «سقف تخفیف منشی». |
| 4 | منشی بتواند سررسید بدهی را جابهجا کند | برای قول پرداخت مشتری | **روشن** | A secretary may move a debt's due date when the customer promises payment. |
| 5 | منشی بتواند قیمت خدمت را تغییر دهد | توصیه نمیشود — قیمت باید یکدست بماند | **خاموش** | A secretary may edit a service price. Off by recommendation: the price must stay uniform. |
| 6 | رزرو آنلاین بدون بیعانه مجاز باشد | بدون بیعانه، نرخ عدم حضور بالا میرود | **خاموش** | Online booking completes without a deposit. Off because no-show rate rises. |
| 7 | اجازه رزرو در روزهای تعطیل | برای کلینیکهایی که شیفت فوقالعاده میگذارند | **خاموش** | Booking is allowed on holidays and closed days, for clinics running exceptional shifts. |
| 8 | ثبت خودکار لید از فرم سایت | فرم مشاوره مستقیم به کارتابل منشی | **روشن** | The site consultation form creates a lead directly in the secretary's cartable. |

The page closes with the rule that makes them meaningful:

> «هر سوئیچ اینجا معادل یک قاعده در سمت سرور است، نه پنهانکردن یک دکمه.»

*Every switch here is equivalent to a server-side rule, not the hiding of a
button.*

**Toggle 6 and the permission matrix interact.** With toggle 6 off, the deposit
rule applies: the stated deposit amount is required
(«مبلغ پیشفرض بیعانه», default ۵۰۰٬۰۰۰ تومان). With it on, a booking completes
without a deposit — the clinic accepts the higher no-show rate deliberately.

**Toggle 3 is bounded by a numeric setting, not itself.** «سقف تخفیف منشی» is a
separate field in the نوبتدهی tab. The toggle grants the capability; the ceiling
bounds it. Setting the ceiling to zero is the same as turning the toggle off,
which is why the UI states «سقف تخفیف در خط بعد تعیین میشود».

---

## 5. Two further settings-level rules

Present in تنظیمات › چرخه درمان and enforced in the `cycles` module — recorded
here because they read like behavioural toggles but sit with the cycle engine:

| Rule | Default |
|---|---|
| «اگر مشتری دو جلسه پشتسرهم نیامد، به فهرست تماس منشی اضافه شود» — two consecutive no-shows add the customer to the secretary's contact list | **ON** |
| «جابهجایی جلسه، موعد جلسات بعدی را هم جلو/عقب ببرد» — rescheduling a session shifts subsequent due dates | **ON** |

The second is the one that keeps treatment spacing honest: without it, moving
one session forward silently compresses every remaining interval.

---

## 6. Testing obligations

Every rule in this document is a test, specified in full in
`10-testing-strategy.md`:

- **16 permissions × 3 roles × 2 directions = 96 tests** — a positive test that
  the permitted role succeeds and a negative test that each non-permitted role
  is refused. The negative half is the half that matters.
- **The 8 toggles**, each with on/off behaviour asserted server-side.
- **Self-escalation:** a secretary calling the permission-update path is
  refused; a manager cannot remove their own `manage_users`.
- **Ownership scoping:** a doctor requesting another doctor's patient receives
  a 404.
- **Last-manager invariant:** the transaction that would remove the final
  manager's access fails.

A permission with no negative test is treated as unverified.

---

*Related: `02-architecture.md` §11 (where the check runs in the request
lifecycle), `09-security.md` (tenant isolation and the audit log),
`10-testing-strategy.md` (the full matrix suite), `03-data-model.md`
(`Membership`, `AuditLog`).*
