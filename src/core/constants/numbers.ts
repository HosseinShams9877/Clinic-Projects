/**
 * The numeric and structural constants of `docs/knowledge/06-constants.md` §5
 * and §6.
 *
 * Each carries the reason it has that value. A number in this file that a reader
 * cannot check against the specification is a number someone will eventually
 * "tidy".
 */

/* ── §5 Numeric and structural ────────────────────────────────────────────── */

/** Project rule, enforced by `npm run check:files` and by the review hook. */
export const MAX_FILE_LINES = 1000

/**
 * Spec §13 hard boundary. One person does not receive a repeat message within
 * 90 days — this is what makes a "recurring" campaign safe to leave running.
 */
export const DUPLICATE_MESSAGE_WINDOW_DAYS = 90

/** Spec §14 send rule: at most one automatic message per person per day. */
export const AUTOMATIC_MESSAGES_PER_DAY = 1

/**
 * `admin/settings.html` — «مبلغ پیشفرض بیعانه», ۵۰۰٬۰۰۰ تومان.
 *
 * Stored in **Rial**, so the setting is 5,000,000 Rial. The UI shows Toman
 * (`06-constants.md` §6).
 */
export const DEFAULT_DEPOSIT_RIAL = 5_000_000n

/**
 * Spec §4. An appointment whose outcome nobody recorded becomes
 * `RESULT_NOT_RECORDED` two hours past its slot. It is the only state that
 * raises its own alarm, so the interval is a product decision and not a tuning
 * knob.
 */
export const RESULT_NOT_RECORDED_AFTER_MINUTES = 120

/** Spec §13 — «خوابیدهها»: no visit for more than 90 days. */
export const DORMANT_THRESHOLD_DAYS = 90

/** Spec §13 — «تازهواردها»: first visit within the last 30 days. */
export const NEW_CUSTOMER_WINDOW_DAYS = 30

/** Spec §13 — «وفادارها»: more than five completed sessions. */
export const LOYAL_MIN_COMPLETED_SESSIONS = 5

/** Spec §13 — «یکباریها»: exactly one session, more than 60 days ago. */
export const ONE_TIMER_MAX_SESSIONS = 1
export const ONE_TIMER_MIN_DAYS_SINCE_VISIT = 60

/** Spec §13 — «دوره تکمیل شده»: more than one month after the last session. */
export const COMPLETED_COURSE_MIN_DAYS = 30

/** Spec §13 — «بازگشت خوابیدهها»: more than three months with no visit. */
export const WINBACK_THRESHOLD_DAYS = 90

/** `08-ui-design-system.md` §29. */
export const PUBLIC_HEADER_HEIGHT_PX = 76

/** `08-ui-design-system.md` §43 — the only breakpoint in the product. */
export const PANEL_BREAKPOINT_PX = 1000

/* ── §6 Currency ──────────────────────────────────────────────────────────── */

/**
 * The UI shows Toman; the database stores Rial. The conversion is a single
 * factor applied in `src/core/lib/money.ts` and nowhere else.
 */
export const RIAL_PER_TOMAN = 10n

/* ── Time zone ────────────────────────────────────────────────────────────── */

/**
 * The clinic's UTC offset, in minutes. Iran is **UTC+03:30** and has had no
 * daylight saving since 2022 (`10-testing-strategy.md`, "DST / timezone").
 *
 * **Why an offset and not an IANA zone name.** Deriving the clinic's wall clock
 * from `Intl` with `timeZone: 'Asia/Tehran'` would reintroduce exactly the
 * runtime-dependence ADR-0010 and ADR-0022 removed from the calendar: the
 * result would come from whichever tz database the Node runtime bundles, and
 * would differ between a developer's machine, the SaaS host and a clinic's
 * on-premise server. A fixed offset is arithmetic, and arithmetic is the same
 * everywhere.
 *
 * The cost is stated plainly: a clinic in a region with daylight saving would
 * need the offset to move twice a year, and this constant does not. The product
 * is Persian and Jalali; its market is Iran, where the offset is constant. The
 * value is an environment variable so an on-premise installer outside Iran can
 * set it, and `03-data-model.md` §3.1 already reasons from UTC+3:30.
 */
export const DEFAULT_CLINIC_UTC_OFFSET_MINUTES = 210

/* ── Localization range ───────────────────────────────────────────────────── */

/**
 * **The range the calendar is proven correct over.**
 *
 * `07-localization.md` §6.3: "Supported range: at minimum ۱۳۹۰–۱۴۵۰ Jalali,
 * asserted explicitly." It is the range `10-testing-strategy.md` §3.5 sweeps with
 * the round-trip property test and the `Intl` cross-check, so a date inside it is
 * a date the test suite has verified on the engine the code actually runs on.
 *
 * It is **not** the range `LocalDate` accepts — see `MIN_LOCAL_DATE_YEAR` below
 * for why a single range cannot serve both purposes.
 */
export const SUPPORTED_JALALI_YEAR_MIN = 1390
export const SUPPORTED_JALALI_YEAR_MAX = 1450

/**
 * **The range a `LocalDate` may hold.**
 *
 * Wider than the tested range, and deliberately so: `03-data-model.md` §2.1 gives
 * `Customer` a `birthDate`, and a seventy-year-old patient in 1405 was born in
 * 1335 — five years before `SUPPORTED_JALALI_YEAR_MIN`. Rejecting that date would
 * make the product unable to record its own customers, so the calendar's *proven*
 * range and the storage's *permitted* range cannot be the same numbers.
 *
 * What this range is actually for is catching a parse or an arithmetic error that
 * produced a four-digit year from nowhere. `0001-01-01` and `9999-12-29` are both
 * well-formed strings and neither is a date this product will ever hold, so both
 * are refused at the boundary rather than stored and discovered later.
 *
 * A date outside this range is a `ValidationError`; a date inside it but outside
 * the proven range is a date to be careful with, not a date to refuse.
 */
export const MIN_LOCAL_DATE_YEAR = 1300
export const MAX_LOCAL_DATE_YEAR = 1500

/* ── Mobile numbers ───────────────────────────────────────────────────────── */

/**
 * Iranian mobile numbers are eleven digits and begin `09`; the international
 * form is `+98` followed by the same ten digits.
 *
 * `03-data-model.md` §2.1 fixes the stored shape: "`mobile` (normalised, digits
 * only, stored `09xxxxxxxxx`)". `07-localization.md` §8 fixes the error wording:
 * «شماره موبایل باید ۱۱ رقم باشد». The two must agree, so the length lives here
 * and the message interpolates it.
 *
 * `Customer` is unique on `(tenantId, mobile)`, which is only a real constraint
 * if every writer stores the same shape — hence the single normaliser in
 * `core/localization/normalize.ts` and no ad-hoc trimming at call sites.
 */
export const MOBILE_DIGIT_LENGTH = 11
export const MOBILE_PREFIX = '09'
export const MOBILE_TRUNK_PREFIX = '0'
export const MOBILE_COUNTRY_CODE = '98'

/**
 * The ten digits `+98` is followed by — the number without its trunk prefix.
 *
 * `MOBILE_DIGIT_LENGTH - 1` is only correct because `MOBILE_PREFIX` is the trunk
 * prefix followed by exactly one digit. A country whose mobile prefix were two
 * digits after the trunk would need this recomputed, which is the point of
 * writing it as an expression rather than the literal `10`.
 */
export const MOBILE_NATIONAL_LENGTH = MOBILE_DIGIT_LENGTH - 1

/* ── Session and credential lifetimes ─────────────────────────────────────── */

/** `09-security.md` §10 — sessions have an absolute and an idle expiry. */
export const SESSION_ABSOLUTE_LIFETIME_HOURS = 12
export const SESSION_IDLE_LIFETIME_MINUTES = 120

/**
 * The «نوبتدهی» tab's three lifecycle timings, as the shipped defaults a clinic that
 * has never opened the tab gets (`03-data-model.md` §6 stores them on the settings
 * row and NULL is each of these).
 */
export const DEFAULT_SLOT_DURATION_MINUTES = 30
export const DEFAULT_REMINDER_LEAD_HOURS = 3
export const DEFAULT_BOOKING_HOLD_MINUTES = 15
/**
 * `09-security.md` §10 — one-time codes are "short-lived (minutes), single-use,
 * and rate-limited per mobile and per IP".
 */
export const OTP_LIFETIME_MINUTES = 5
export const OTP_MAX_ATTEMPTS = 5
export const OTP_LENGTH = 6

/**
 * Rate limits. The numbers are not in the specification; the *obligation* is
 * (`09-security.md` §10), and an obligation with no number is an obligation
 * nobody implements. These are the chosen values, recorded here so they are
 * reviewable in one place instead of being scattered through the auth module.
 */
export const OTP_REQUESTS_PER_MOBILE_PER_HOUR = 5
export const LOGIN_ATTEMPTS_PER_MOBILE_PER_HOUR = 10
export const LOGIN_ATTEMPTS_PER_IP_PER_HOUR = 50

/** `09-security.md` §10 — Argon2id, memory-hard. Node 24 implements it natively. */
export const ARGON2_MEMORY_KIB = 19456
export const ARGON2_TIME_COST = 2
export const ARGON2_PARALLELISM = 1
