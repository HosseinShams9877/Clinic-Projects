/**
 * The Persian surface of the settings screen — the six tabs' names, every field's
 * label, and the eight toggles' own sentences.
 *
 * The eight toggles' labels land here because this is the screen that renders them
 * (`04-roles-permissions.md` §4's table carries the Persian, and the constants
 * module deliberately holds the codes only). A label is typed over the `Toggle`
 * union, so a ninth toggle without a sentence is a compile error.
 */

import type { AutomaticMessageKind, BookingMode, DepositRefundPolicy } from '@/core/constants'
import type { Toggle } from '@/modules/roles-permissions'
import type { SettingsTab } from './types'

/** The page's own name and scope, as the settings page renders them. */
export const SETTINGS_FIELDS = Object.freeze({
  title: 'تنظیمات',
  lead: 'پیکربندی کلینیک، نوبت‌دهی، ساعات کاری و پیام‌ها.',
  save: 'ذخیره',
}) satisfies Record<string, string>

/** The six tabs' names, as the page's tab bar renders them. */
export const SETTINGS_TAB_LABELS: Readonly<Record<SettingsTab, string>> = Object.freeze({
  identity: 'اطلاعات کلینیک',
  booking: 'نوبتدهی',
  'working-hours': 'ساعات کاری',
  cycle: 'چرخه درمان',
  messages: 'پیام‌ها',
  options: 'اختیارات',
})

/** The sentence under the tab bar, naming what the tab changes. */
export const SETTINGS_TAB_LEADS: Readonly<Record<SettingsTab, string>> = Object.freeze({
  identity: 'نام و نشانی که مشتری و سایت می‌بینند.',
  booking: 'نحوه نوبت‌دهی، زمان‌بندی نوبت‌ها و سقف تخفیف منشی.',
  'working-hours': 'ساعات کاری هفتگی و روزهای تعطیل کلینیک.',
  cycle: 'رفتار پیش‌فرض موتور چرخه درمان.',
  messages: 'متن هر پیام خودکار و کانال ارسال آن.',
  options: 'اختیاراتی که به نقش‌ها درون صفحه می‌دهید.',
})

/* ── «اطلاعات کلینیک» ───────────────────────────────────────────────────── */

export const IDENTITY_FIELDS = Object.freeze({
  tenantName: 'نام کلینیک',
  clinicName: 'نام شعبه اصلی',
  phone: 'تلفن تماس',
  address: 'نشانی',
  save: 'ذخیره اطلاعات کلینیک',
}) satisfies Record<string, string>

/* ── «نوبتدهی» ───────────────────────────────────────────────────────────── */

export const BOOKING_MODE_LABELS: Readonly<Record<BookingMode, string>> = Object.freeze({
  FIXED_SLOT: 'اسلات ثابت',
  TIME_RANGE: 'بازه زمانی',
  REQUEST: 'درخواستی',
})

export const BOOKING_FIELDS = Object.freeze({
  mode: 'نحوه نوبت‌دهی',
  slotDurationMinutes: 'مدت هر اسلات (دقیقه)',
  reminderLeadHours: 'زمان ارسال یادآور (ساعت قبل)',
  bookingHoldMinutes: 'نگه‌داشتن اسلات رزرو شده (دقیقه)',
  secretaryDiscountCap: 'سقف تخفیف منشی (تومان)',
  depositRefundPolicy: 'سیاست بازگرداندن بیعانه',
  /** The label of the empty option, which is the policy the manager has not set. */
  none: 'تعیین نشده',
  save: 'ذخیره نوبتدهی',
}) satisfies Record<string, string>

export const DEPOSIT_REFUND_LABELS: Readonly<Record<DepositRefundPolicy, string>> = Object.freeze({
  FULL: 'کامل',
  HALF: 'نصف',
  NONE: 'هیچ',
})

/* ── «ساعات کاری» ────────────────────────────────────────────────────────── */

export const WORKING_HOURS_FIELDS = Object.freeze({
  shifts: 'ساعات کاری هفتگی',
  holidays: 'روزهای تعطیل',
  weekday: 'روز هفته',
  startTime: 'شروع',
  endTime: 'پایان',
  addShift: 'افزودن ساعت کاری',
  noShifts: 'ساعت کاری ثبت نشده است.',
  holidayDate: 'تاریخ تعطیلی',
  holidayTitle: 'عنوان',
  isOfficial: 'تعطیلی رسمی',
  addHoliday: 'افزودن تعطیلی',
  noHolidays: 'تعطیلی ثبت نشده است.',
  remove: 'حذف',
  save: 'ذخیره ساعات کاری',
}) satisfies Record<string, string>

/** The seven days, Saturday first, as the shift table's header renders them. */
export const WEEKDAY_LABELS = Object.freeze([
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
]) satisfies readonly string[]

/* ── «چرخه درمان» ────────────────────────────────────────────────────────── */

export const CYCLE_FIELDS = Object.freeze({
  noShowAddsToContactList: 'عدم حضور، مشتری را به لیست تماس می‌آورد',
  rescheduleShiftsDueDates: 'جابه‌جایی یک جلسه، سررسیدهای بعدی را هم جابه‌جا می‌کند',
  save: 'ذخیره چرخه درمان',
}) satisfies Record<string, string>

/* ── «پیام‌ها» ───────────────────────────────────────────────────────────── */

export const MESSAGES_FIELDS = Object.freeze({
  sendWindowStart: 'شروع ساعت ارسال',
  sendWindowEnd: 'پایان ساعت ارسال',
  dailyMessageCap: 'سقف پیام روزانه',
  duplicateWindowDays: 'فاصله تکرار پیام (روز)',
  save: 'ذخیره پیام‌ها',
}) satisfies Record<string, string>

/**
 * The seven automatic messages, as the tab names each one it offers a field for.
 *
 * The channel's own labels are `messages`'s, because that module owns the two; these
 * are the seven the tab renders, keyed over the constants' own codes so an eighth
 * message is a key with no sentence.
 */
export const AUTOMATIC_KIND_LABELS: Readonly<Record<AutomaticMessageKind, string>> = Object.freeze({
  NEXT_SESSION_REMINDER: 'یادآور جلسه بعد',
  BOOKING_CONFIRMATION: 'تأیید رزرو',
  APPOINTMENT_REMINDER: 'یادآور نوبت',
  AFTERCARE: 'مراقبت پس از جلسه',
  NO_SHOW_FOLLOW_UP: 'پیگیری عدم حضور',
  BALANCE_REMINDER: 'یادآور مانده‌حساب',
  SURVEY: 'نظرسنجی',
})

/* ── «اختیارات» ──────────────────────────────────────────────────────────── */

/**
 * §4's eight rows: a label, and the sentence that says what turning it on permits.
 * The description is the one the screen owes the person flipping it, because a
 * toggle whose consequence is not stated is a toggle set by guesswork.
 */
export const TOGGLE_LABELS: Readonly<
  Record<Toggle, { readonly label: string; readonly description: string }>
> = Object.freeze({
  DOCTOR_SELF_BOOKING: {
    label: 'پزشک خودش نوبت می‌گذارد',
    description: 'پزشک می‌تواند بدون کمک منشی، برای خودش نوبت ثبت کند.',
  },
  DOCTOR_CLOSE_OWN_HOURS: {
    label: 'پزشک خودش ساعاتش را می‌بندد',
    description: 'پزشک می‌تواند درخواست مرخصی بدهد تا ساعاتش از تقویم برداشته شود.',
  },
  SECRETARY_DISCOUNT: {
    label: 'منشی تخفیف ثبت می‌کند',
    description: 'منشی می‌تواند روی رسید تخفیف ثبت کند، تا سقف تعیین‌شده.',
  },
  SECRETARY_MOVE_DUE_DATE: {
    label: 'منشی سررسید را جابه‌جا می‌کند',
    description: 'منشی می‌تواند تاریخ سررسید بدهی را که مشتری قول داده جابه‌جا کند.',
  },
  SECRETARY_EDIT_PRICE: {
    label: 'منشی قیمت را ویرایش می‌کند',
    description: 'توصیه نمی‌شود — قیمت باید یکدست بماند.',
  },
  ONLINE_BOOKING_NO_DEPOSIT: {
    label: 'رزرو آنلاین بدون بیعانه',
    description: 'بدون بیعانه، نرخ عدم حضور بالا می‌رود.',
  },
  BOOKING_ON_HOLIDAYS: {
    label: 'رزرو در روزهای تعطیل',
    description: 'روزهای تعطیل مانند روزهای عادی قابل رزرو می‌شوند.',
  },
  AUTO_LEAD_FROM_SITE_FORM: {
    label: 'ساخت خودکار لید از فرم سایت',
    description: 'ارسال فرم مشاوره، خودکار یک لید در کارتابل منشی می‌سازد.',
  },
})

export const OPTIONS_FIELDS = Object.freeze({
  toggles: 'اختیارات نقش‌ها',
  overrides: 'پیاده‌سازی‌های اختصاصی',
  overrideModule: 'ماژول',
  overrideImplementation: 'پیاده‌سازی',
  addOverride: 'افزودن پیاده‌سازی اختصاصی',
  removeOverride: 'حذف',
  save: 'ذخیره اختیارات',
  noOverrides: 'این کلینیک پیاده‌سازی اختصاصی ندارد.',
}) satisfies Record<string, string>

/** Every message the settings actions can raise, for the catalog's completeness. */
export type SettingsMessageKey =
  | 'settings.saved'
  | 'settings.toggleDisabled'
  | 'settings.overrideNotInRegistry'
  | 'settings.invalidValue'

export const MESSAGES: Readonly<Record<SettingsMessageKey, string>> = Object.freeze({
  'settings.saved': 'تنظیمات ذخیره شد.',
  // The toggle the caller's action needs is off on this clinic's settings row.
  'settings.toggleDisabled': 'این اختیار در تنظیمات کلینیک روشن نیست.',
  // The pair the operator named is not one this build's registry holds.
  'settings.overrideNotInRegistry':
    'این ترکیب ماژول و پیاده‌سازی در این نسخه وجود ندارد.',
  'settings.invalidValue': 'یکی از مقادیر نامعتبر است.',
})
