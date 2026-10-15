/**
 * The Persian surface of the settings screen.
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

export const IDENTITY_IMAGES_FIELDS = Object.freeze({
  title: 'تصاویر سایت',
  lead: 'تصویر صفحه‌ی اصلی و تصویر «درباره ما».',
  heroImage: 'تصویر صفحه‌ی اصلی',
  aboutImage: 'تصویر درباره ما',
  field: 'تصویر',
  empty: 'تصویری ثبت نشده است.',
  noFile: 'لطفاً ابتدا یک تصویر انتخاب کنید.',
  save: 'ذخیره تصویر',
  sessionExpired: 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.',
  clinicNotFound: 'کلینیک پیدا نشد.',
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
  debtGraceDays: 'مهلت تا سررسید (روز)',
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

export type SettingsMessageKey =
  | 'settings.saved'
  | 'settings.toggleDisabled'
  | 'settings.overrideNotInRegistry'
  | 'settings.invalidValue'

export const MESSAGES: Readonly<Record<SettingsMessageKey, string>> = Object.freeze({
  'settings.saved': 'تنظیمات ذخیره شد.',
  'settings.toggleDisabled': 'این اختیار در تنظیمات کلینیک روشن نیست.',
  'settings.overrideNotInRegistry': 'این ترکیب ماژول و پیاده‌سازی در این نسخه وجود ندارد.',
  'settings.invalidValue': 'یکی از مقادیر نامعتبر است.',
})