# 07 — Localization (Persian, RTL, Jalali)

> The product is Persian. This is not a locale that can be switched off — it is
> the interface. Four things are mandatory in every surface: **Persian text,
> right-to-left layout, Persian digits, and the Jalali calendar.**

---

## 1. There is no locale switch

No language selector, no `i18n` negotiation, no English fallback, no
`Accept-Language` handling. One language, one direction, one calendar.

The benefit is that the localization layer is a **formatting and copy layer**,
not an internationalization framework. There is no plural-rules engine, no
message-extraction build step, and no untranslated-string class of bug in
production — a missing key fails a test, not a user.

---

## 2. The font

| Property | Value |
|---|---|
| Typeface | **Vazirmatn** |
| Delivery | Self-hosted, `next/font/local` |
| Weights | Regular 400, Medium 500, Bold 700 (as used by the design system) |
| Subsetting | Persian/Arabic range + Latin + Persian digits |
| Loading | `font-display: swap`, preloaded |
| CDN | **None** — no request to Google Fonts or any external host |

**Why self-hosted:** the on-premise install must render correctly with no
internet connection. A font fetched from a CDN at runtime would make the
product's typography depend on a third party's availability, in a clinic, on a
machine whose network the vendor does not control.

The font must be pinned to an exact version and committed to the repository. A
font upgrade is a visual change and follows the design-system rule in
`08-ui-design-system.md`.

The token block sets the family; components never name a font.

---

## 3. RTL is a hard constraint

`dir="rtl"` and `lang="fa"` are set on the document root. There is no LTR mode
and no bidirectional layout switch.

### 3.1 What this requires in CSS

**Logical properties only:**

| Never | Always |
|---|---|
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` |
| `padding-left` / `padding-right` | `padding-inline-start` / `padding-inline-end` |
| `left` / `right` (positioning) | `inset-inline-start` / `inset-inline-end` |
| `border-left` | `border-inline-start` |
| `text-align: left` | `text-align: start` |
| `float: left` | `float: inline-start` |

A physical property is a finding, because it is correct today and silently wrong
the moment a component is reused in a mirrored context.

### 3.2 What must never be mirrored

- **Persian digits and numerals** — never reversed, never flipped.
- **Phone numbers, booking codes, national IDs** — these are read
  left-to-right regardless of surrounding direction (§5).
- **Charts and graphs** — a time axis runs left-to-right in the source data;
  the axis is not reversed to match text direction.
- **The sidebar** is on the right in RTL, which is a `grid`/`flex` order
  consequence, not a hard-coded `right`.

### 3.3 Direction-aware icons

An icon that encodes direction — back, next, chevron, arrow — is mirrored
automatically by the layout in RTL because it is drawn as a symmetric path or is
marked `dir`-aware. An icon that encodes a real-world object (a phone handset, a
camera, a clock face) is **never** mirrored. The distinction is part of the icon
language in `08-ui-design-system.md`.

---

## 4. Persian digits are mandatory

Every number a user reads is rendered with Persian digits
(**۰۱۲۳۴۵۶۷۸۹**). There is no surface where Latin digits are acceptable, and no
"technical" screen exempt from the rule.

### 4.1 The conversion layer

One function converts a string of Latin digits to Persian digits. Nothing else
in the codebase performs this conversion.

```ts
toPersianDigits(value: string | number | bigint): string
toLatinDigits(value: string): string   // for input parsing, never for display
```

**Rules:**

- **Display always converts.** Values are stored and computed in Latin digits and
  converted at the render boundary, by a display primitive — not by hand in each
  component.
- **Input always normalises.** A user may type Persian or Latin digits; the input
  normaliser converts to Latin before validation, so a value typed as «۱۲۳» and
  a value typed as `123` are the same value. A form that rejects Persian-digit
  input is a defect — it is the natural way a Persian speaker types a number.
- **The thousands separator is `٬`** (U+066C, the Arabic thousands separator),
  not `,`.
- **Decimal separator** is `٫` (U+066B) if a decimal is ever displayed; money is
  an integer in Rial, so this should not arise in financial surfaces.

### 4.2 Where conversion happens

| Surface | Converted by |
|---|---|
| Text and table cells | the display primitive |
| Form inputs | normalised on input, converted for display |
| Server-rendered output in React | the same primitives — server and client render identically, so there is no hydration mismatch |
| Message templates (SMS/WhatsApp) | converted in the template renderer, because the recipient reads Persian digits |
| Logs, database, URLs, API payloads | **never converted** — Latin digits only |

Storing Latin and rendering Persian is the invariant. A Persian digit in the
database is a defect: it breaks sorting, comparison, and every parse.

---

## 5. Bidirectional isolation for numerals

A phone number, a booking code, a time like `10:30`, or a money string inside a
Persian sentence is a left-to-right run inside a right-to-left paragraph. Without
isolation the browser reorders the punctuation around it, and a phone number can
render with its leading zero at the wrong end.

**Every such run is wrapped in an isolation boundary** — a `<bdi>` element or the
equivalent Unicode isolate characters — with the run itself marked as LTR. This
is applied by the display primitives, so no component has to remember it.

The affected values: phone numbers, booking codes, invoice or payment
references, times, dates expressed as `YYYY/MM/DD`, URLs, and email addresses.

---

## 6. The Jalali calendar

Every date shown is Jalali (Solar Hijri). Gregorian is never displayed to a user.

### 6.1 Implementation: in-house, in `src/core/localization`

The conversion is implemented in this repository. It is a pure, dependency-free,
deterministic function with no reliance on the runtime's ICU data.

**Why not `Intl.DateTimeFormat('fa-IR-u-ca-persian')`:** it is convenient but its
output depends on the ICU version bundled with the Node runtime, which varies
between the developer's machine, the SaaS host, and the clinic's on-premise
server. A date that renders as one Jalali day on the build machine and another on
the clinic's machine is exactly the failure this product cannot afford. `Intl`
**is** used — as a cross-check inside the test suite, not as the runtime
implementation.

**Why not a third-party plugin:** the specification rejects jQuery-era plugin
dependencies. The conversion is a few hundred lines of well-tested pure
arithmetic, and it is core to every screen in the product.

### 6.2 The algorithm

Conversion goes through the **Julian Day Number**, which avoids the accumulated
drift that direct Gregorian↔Jalali arithmetic suffers:

```
gregorianToJdn(gy, gm, gd) → jdn
jdnToGregorian(jdn)        → { gy, gm, gd }
jdnToJalali(jdn)           → { jy, jm, jd }
jalaliToJdn(jy, jm, jd)    → jdn
```

Rules that the implementation must encode:

- **Month lengths:** months 1–6 are 31 days; months 7–11 are 30 days; month 12
  (اسفند) is 29 days in a common year and 30 in a leap year.
- **Leap years** follow the 33-year cycle of the Solar Hijri calendar, with the
  known exception years handled by an explicit break table rather than a formula
  — the formula alone is wrong for a handful of years in every cycle.
- **The year starts** on the day of the March equinox as observed, which the
  break table encodes.

### 6.3 Test obligations for the calendar

The calendar is the single highest-risk piece of pure logic in the product,
because a one-day error is invisible until a clinic acts on the wrong day.

- **Round-trip property test:** for every day in a range of at least 200 years,
  `jalaliToJdn(jdnToJalali(d)) === d` and the Gregorian equivalent round-trips
  identically.
- **Anchor vectors:** known Nowruz dates, known leap years, the last day of each
  month in a common and a leap year, and the boundary at year end
  (۲۹/۳۰ اسفند → ۱ فروردین).
- **Cross-check against `Intl`** with the Persian calendar across the same range.
  The test asserts the in-house implementation agrees with ICU — if a future
  Node version changes ICU, the test fails loudly rather than a screen silently
  changing.
- **Supported range:** at minimum ۱۳۹۰–۱۴۵۰ Jalali, asserted explicitly.

### 6.4 Presentation

| Element | Persian |
|---|---|
| Months | فروردین، اردیبهشت، خرداد، تیر، مرداد، شهریور، مهر، آبان، آذر، دی، بهمن، اسفند |
| Weekdays | شنبه، یکشنبه، دوشنبه، سهشنبه، چهارشنبه، پنجشنبه، جمعه |
| Week start | **شنبه** — the week starts on Saturday, not Sunday. Every calendar grid and every "this week" range obeys this. |
| Short date | `۱۴۰۵/۰۶/۲۹` |
| Long date | `۲۹ شهریور ۱۴۰۵` |
| Relative | امروز · فردا · دیروز · ۳ روز پیش · ۲ هفته دیگر |

**The week starting on Saturday is a behavioural requirement, not a formatting
one.** It governs slot generation, the "this week" report ranges, working-hours
configuration, and the appointment grid's column order. A calendar that starts on
Sunday is wrong even if every date on it is correct.

---

## 7. The localization module

```
src/core/localization/
  digits.ts        toPersianDigits, toLatinDigits, normalizeDigits
  jalali.ts        the conversion functions (§6.2)
  format.ts        date, time, money, number, percent, relative
  calendar.ts      week-start rules, month grids, ranges
  catalog/
    common.ts      shared labels (actions, states, empty states)
    <module>.ts    one catalog file per module
  index.ts         the public surface
```

### 7.1 The formatter API

```ts
formatDate(date: LocalDate, style: 'short' | 'long' | 'relative'): string
formatTime(time: LocalTime): string
formatDateTime(date: LocalDate, time: LocalTime): string
formatMoney(amountRial: bigint): string        // Toman, Persian digits, ٬
formatNumber(value: number | bigint): string
formatPercent(value: number): string
formatPhone(mobile: string): string            // Persian digits, isolated LTR run
```

No component formats a value inline. `new Intl.NumberFormat(...)` in a component
is a finding — it belongs in this module, where it is tested once.

### 7.2 The catalog

- Strings are keyed by **stable English keys**, namespaced per module, matching
  the constants in `06-constants.md`:

  ```ts
  AppointmentStatusLabel[AppointmentStatus.ResultNotRecorded]  // «نتیجه ثبت نشده»
  ```

- **A Persian string literal in a component is a finding** (`05-conventions.md`
  §14). Constants come from the enum; labels come from the catalog.
- Keys are typed, so a missing label is a **compile error**, not a runtime blank.
- The catalog is a plain object, not a runtime lookup with a fallback chain —
  there is no fallback language to fall back to.

### 7.3 Message templates

The seven automatic messages and every campaign message are Persian text with
variables:

```
{name} عزیز، موعد جلسه {sessionNumber} شما {date} ساعت {time} است.
```

Rules:

- **Every template is editable in settings.** None is hard-coded
  (`06-constants.md` §4.10).
- Placeholders are **whole tokens**, substituted by the template renderer, which
  also applies Persian-digit conversion to the substituted values.
- A template with an unknown placeholder **fails validation in settings**, at the
  moment a manager types it — not at send time, in front of a customer.
- Persian word order differs from English, so placeholders are positioned for
  Persian sentence structure. A template is never built by concatenating
  fragments in code; that produces ungrammatical Persian and is a finding.

---

## 8. Copy and tone

The interface addresses the clinic's staff and, in the customer panel, the
customer. The specification's register is **formal but plain** — «شما», never
«تو».

| Rule | Example |
|---|---|
| Formal second person | «نوبت شما ثبت شد» |
| No English words, no transliteration where a Persian word exists | «پیامک», not «SMS» in the UI — though «پیامک» is the accepted Persian term for SMS and is used |
| No Latin digits | «۳ جلسه», not «3 جلسه» |
| Specific over generic | «این ساعت قبلاً رزرو شده است» — not «خطا» |
| Empty states explain the next action | «هنوز مشتریای ثبت نشده. اولین مشتری را اضافه کنید.» |
| Error messages name the fix | «شماره موبایل باید ۱۱ رقم باشد» |
| No blame | «نتیجه این نوبت ثبت نشده» — not «شما ثبت نکردید» |
| No clinical claims | Rule 1 of `06-constants.md` §1 |

**Accessibility labels are Persian too.** `aria-label`, `alt` text, and form
labels are Persian strings from the catalog — an English `aria-label` is a
finding, and it is also invisible to review until a screen reader is used.

**Screen-reader-friendly formatting:** a Jalali date read aloud should be a long
date, not a numeric one, and a money value should carry its unit — the
accessible label is not always the visible string, which is why labels come from
the catalog rather than from the rendered output.

---

## 9. Testing obligations

Localization is verified explicitly, not assumed. Full suite in
`10-testing-strategy.md`:

- **No Latin digits in any rendered surface.** A test scans rendered output
  across the 35 pages and fails on `[0-9]` in user-visible text. This single
  assertion catches the most common regression in a Persian product.
- **No Latin/Gregorian date anywhere in the UI.**
- **Round-trip and anchor tests for the Jalali conversion** (§6.3).
- **Week starts on Saturday** in every calendar grid and every "this week" range.
- **Digit input round-trip:** typing «۱۲۳» and typing `123` produce the same
  stored value.
- **Bidi isolation:** a phone number inside a Persian sentence renders with its
  digits in the correct order.
- **No untranslated keys:** the catalog is typed, and a build-time check asserts
  every enum member in `06-constants.md` has a label.
- **Every page renders in RTL** with no horizontal overflow at mobile width.

---

*Related: `06-constants.md` (the closed sets that the catalog is keyed by),
`05-conventions.md` (the forbidden list), `08-ui-design-system.md` (the font, the
week-start rule's visual consequences, the icon language),
`10-testing-strategy.md` (the localization suite).*
