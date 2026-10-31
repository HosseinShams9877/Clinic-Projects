/**
 * 👈 ویرایش موقتِ یک مرحله از قسط — توکن‌هایی که در `note` قسط نگه داشته می‌شوند.
 *
 * قسط‌ها سررسید و مبلغ هر مرحله را از «اولین سررسید + بازه‌ی ماهانه» محاسبه می‌کنند.
 * ولی پنل اجازه می‌دهد کاربر برای **همین یک مرحله** تاریخ یا مبلغ را تغییر دهد؛ این
 * تغییر نباید روی مراحل بعدی اثر بگذارد. به همین دلیل تغییر در `note` قسط با دو
 * نشانه ذخیره می‌شود و فقط تا زمانی که چیزی پرداخت نشده خوانده می‌شود:
 *
 * - `OVERRIDE:YYYY-MM-DD` — تاریخ سررسید موقت (تقویم جلالی)
 * - `OVERRIDE_AMOUNT:<ریال>` — مبلغ موقتِ این مرحله
 *
 * قوانین خواندن (در همه‌ی نمایش‌ها یکسان):
 *
 * 1. تا زمانی که `paidAmount === 0n` است مقدار موقت جایگزین مقدار استاندارد می‌شود.
 * 2. به محض پرداخت، توکن‌ها نادیده گرفته می‌شوند و تاریخ استاندارد
 *    (اولین سررسید + تعداد پرداختی × بازه) نشان داده می‌شود.
 * 3. وقتی طرح جدیدی برای باقی‌مانده بازتعریف می‌شود، توکن‌ها باید از noteی جدید
 *    پاک شوند تا ویرایش موقت به طرح جدید نشت نکند.
 */

import {
  asLocalDate,
  isValidLocalDate,
  toUtcInstant,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'

const OVERRIDE_DATE_RE = /OVERRIDE:(\d{4}-\d{2}-\d{2})/
const OVERRIDE_AMOUNT_RE = /OVERRIDE_AMOUNT:(\d+)/

/**
 * تاریخ سررسید موقتی که در `note` نگه داشته شده — یا `null` اگر توکن نیست یا
 * معتبر نیست. تاریخ جلالی است (`YYYY-MM-DD`).
 */
export function overrideDueInNote(note: string | null): string | null {
  const match = note?.match(OVERRIDE_DATE_RE)
  const value = match?.[1]
  if (!value || !isValidLocalDate(value)) return null
  return value
}

/** تاریخ سررسید موقت به‌عنوان `LocalDate`، یا `null`. */
export function overrideDueLocalDate(note: string | null): LocalDate | null {
  const value = overrideDueInNote(note)
  return value ? asLocalDate(value) : null
}

/**
 * مبلغ موقتِ این مرحله (ریال) که در `note` نگه داشته شده — یا `null`.
 * فقط زمانی معنی دارد که قسط هنوز پرداخت نشده باشد.
 */
export function overrideAmountInNote(note: string | null): bigint | null {
  const match = note?.match(OVERRIDE_AMOUNT_RE)
  if (!match?.[1]) return null
  return BigInt(match[1])
}

/**
 * `note` بدون توکن‌های ویرایش موقت. برای ساختن طرحِ جدید در «بازتعریف کل بدهی»
 * استفاده می‌شود تا ویرایش موقتِ مرحله‌ی قبل به طرح جدید نشت نکند.
 */
export function stripOverrideTokens(note: string | null): string | null {
  if (!note) return null
  const cleaned = note
    .replace(OVERRIDE_DATE_RE, '')
    .replace(OVERRIDE_AMOUNT_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned === '' ? null : cleaned
}

/**
 * `note` جدید با هر دو توکنِ ویرایش موقت. توکن‌های قبلی جایگزین می‌شوند و
 * بقیه‌ی `note` دست‌نخورده باقی می‌ماند.
 */
export function withOverrideTokens(
  note: string | null,
  overrideDate: string,
  overrideAmount: bigint,
): string {
  const cleanNote = stripOverrideTokens(note) ?? ''
  return `OVERRIDE:${overrideDate} OVERRIDE_AMOUNT:${overrideAmount.toString()} ${cleanNote}`.trim()
}

/**
 * سررسید مؤثری که باید برای نمایش، دسته‌بندی و شمارش به کار برود — یعنی همان
 * تاریخی که جدول‌ها نشان می‌دهند.
 *
 * وقتی قسط هنوز پرداخت نشده (`paidAmount === 0n`) و `note` تاریخ موقت دارد، همان
 * تاریخ موقت برگردانده می‌شود؛ در غیر این صورت سررسید استاندارد (`dueAt` خود قسط).
 * این تابع قوانین خواندنِ بالا را برای جاهایی که فقط یک `Date` می‌خواهند (مثل
 * محاسبه‌ی دسته‌های «امروز»/«فردا» در صفحه‌ی اقساط) یک‌جا نگه می‌دارد تا شمارش و
 * نمایش یکسان بمانند.
 */
export function effectiveDueInstant(
  note: string | null,
  paidAmount: bigint,
  dueAt: Date,
  midnight: LocalTime,
): Date {
  if (paidAmount === 0n) {
    const override = overrideDueInstant(note, midnight)
    if (override) return override
  }
  return dueAt
}

/**
 * مبلغ مؤثرِ این مرحله — مبلغ موقت وقتی قسط هنوز پرداخت نشده، وگرنه مبلغ استاندارد.
 */
export function effectiveAmount(note: string | null, paidAmount: bigint, amount: bigint): bigint {
  if (paidAmount === 0n) {
    const override = overrideAmountInNote(note)
    if (override !== null) return override
  }
  return amount
}

/**
 * اطلاعات طرحِ قسطیِ قدیمی که با نشانه‌ی `TOTAL:<count>:<label>:<amount>` در `note`
 * نگه داشته می‌شده است — یا `null` اگر نیست.
 *
 * 👈 این نشانه باید از `note`ی **پاک‌شده از توکن‌های ویرایشِ موقت** خوانده شود:
 * `withOverrideTokens` توکن‌های `OVERRIDE:…` را **قبل از** بقیه‌ی note می‌نویسد، پس
 * `startsWith('TOTAL:')` بعد از یک ویرایشِ موقت دیگر کار نمی‌کند و طرحِ قسطی
 * quietly نادیده گرفته می‌شد. این تابع همان semanticsِ قدیمی را حفظ می‌کند
 * (`parts[3]` نبود ⇒ fallback به `fallbackAmount`).
 */
export function legacyTotalInNote(
  note: string | null,
  fallbackAmount?: bigint,
): { readonly count: number; readonly amount: bigint } | null {
  const cleaned = stripOverrideTokens(note)
  if (!cleaned?.startsWith('TOTAL:')) return null
  const parts = cleaned.split(':')
  const count = Number(parts[1] || 1)
  const amount = parts[3] !== undefined && parts[3] !== '' ? BigInt(parts[3]) : (fallbackAmount ?? 0n)
  return { count, amount }
}

/**
 * لحظه‌ی سررسیدِ موقت را از `note` می‌سازد — یا `null` اگر توکنی نیست.
 *
 * @param midnight نیمه‌شب به‌عنوان `LocalTime` (معمولاً `fromClockParts({ hour: 0, minute: 0 })`)
 * @param utcOffsetMinutes اختلاف ساعت کلینیک؛ وقتی پاس داده نشود از پیش‌فرض ماژول
 *   localization استفاده می‌شود (همان پیش‌فرضی که جدول سمت کلاینت بهره می‌برد).
 */
export function overrideDueInstant(
  note: string | null,
  midnight: LocalTime,
  utcOffsetMinutes?: number,
): Date | null {
  const localDate = overrideDueLocalDate(note)
  if (!localDate) return null
  return toUtcInstant(localDate, midnight, utcOffsetMinutes)
}
