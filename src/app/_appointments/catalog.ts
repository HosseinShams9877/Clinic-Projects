/**
 * The appointments pages' own extra copy: the edit popup, the cancel confirm, and
 * the booking popup's locked-slot badge.
 *
 * The main app catalog sits at its 1000-line cap, so the booking-management surfaces
 * Phase 3 adds keep their Persian here, beside the components that render them. The
 * rule is the usual one: no Persian literal in a component, every sentence a key in a
 * catalog, and the lint allowlist covers this per-directory catalog file.
 */

/** The edit popup: the manager's and secretary's in-place correction of a booking. */
export const EDIT_POPUP = {
  trigger: 'ویرایش نوبت',
  title: 'ویرایش نوبت',
  doctor: 'پزشک',
  service: 'خدمت',
  localDate: 'تاریخ',
  localTime: 'ساعت',
  chooseService: 'یک خدمت انتخاب کنید',
  save: 'ذخیره تغییرات',
  cancel: 'انصراف',
  close: 'بستن',
} as const

/** The cancel confirmation: the one destructive row action the desk guards. */
export const CANCEL_CONFIRM = {
  trigger: 'لغو نوبت',
  title: 'لغو این نوبت؟',
  body: 'نوبت لغو می‌شود و ساعت آزاد می‌شود. ردیف پاک نمی‌شود و وضعیت آن «لغو شد» می‌ماند.',
  confirm: 'بله، لغو کن',
  dismiss: 'بازگشت',
} as const

/** The «بستن یک ساعت» popup: closing an empty slot the clinic does not want offered. */
export const BLOCK_POPUP = {
  trigger: 'بستن یک ساعت',
  title: 'بستن یک بازه',
  duration: 'مدت (دقیقه)',
  reason: 'دلیل (اختیاری)',
  save: 'بستن بازه',
  cancel: 'انصراف',
  close: 'بستن',
} as const

/**
 * The shorten-confirm dialog: the desk's answer to a service that runs longer than
 * the doctor's own slot.
 */
export const SHORTEN_POPUP = {
  title: 'مدت خدمت با نوبت این پزشک هم‌خوان نیست',
  bodyStart: 'این خدمت ',
  bodyMiddle: ' دقیقه است، اما نوبت‌های این پزشک ',
  bodyEnd: ' دقیقه‌ای است. آیا می‌خواهید با زمان کمتر ثبت شود؟',
  confirm: 'بله، با زمان کمتر ثبت کن',
  dismiss: 'نه، زمان دیگری انتخاب می‌کنم',
} as const

/**
 * The booking popup's locked-slot badge.
 */
export const LOCKED_SLOT = {
  badge: 'از جدول',
  hint: 'تاریخ و ساعت از روی جدول انتخاب شده و قابل تغییر نیست. برای تغییر، این پنجره را ببندید و روی خانه دیگری بزنید.',
} as const

/**
 * The booking popup's free-slot grid.
 */
export const SLOT_PICKER = {
  label: 'ساعت‌های آزاد',
  empty: 'برای این پزشک در این روز ساعت آزادی نمانده است. روز یا پزشک دیگری را انتخاب کنید.',
  loading: 'در حال خواندن ساعت‌های آزاد…',
  doctorFirst: 'ابتدا پزشک و روز را انتخاب کنید تا ساعت‌های آزاد نمایش داده شود.',
  error: 'خطا در خواندن ساعت‌های آزاد.',
} as const

/**
 * The «ثبت نتیجه» popup: a completed session's outcome note, and the payment that
 * may accompany it.
 */
export const RESULT_POPUP = {
  trigger: 'ثبت نتیجه',
  title: 'ثبت نتیجه نوبت',
  note: 'یادداشت نتیجه (اختیاری)',
  notePlaceholder: 'مثلاً: جلسه چهارم، پوست واکنش خوبی نشان داد.',
  moneySection: 'پرداخت این جلسه',
  chargedLabel: 'مبلغ خدمت',
  alreadyPaidLabel: 'پرداخت‌شده پیش از این',
  balanceLabel: 'مانده پس از این پرداخت',
  paidAmount: 'مبلغ پرداختی (تومان)',
  paidAmountHint: 'خالی بگذارید اگر پرداختی ثبت نمی‌شود.',
  method: 'روش پرداخت',
  discount: 'تخفیف (تومان)',
  discountReason: 'دلیل تخفیف',
  discountReasonPlaceholder: 'مثلاً: تخفیف وفاداری',
  save: 'ثبت نتیجه و پرداخت',
  saveNoteOnly: 'ثبت نتیجه',
  cancel: 'انصراف',
  close: 'بستن',
  moneyInvalid: 'مبلغ وارد شده معتبر نیست.',
} as const

/**
 * The three payment methods, labelled for the result dialog's own method select.
 */
export const RESULT_PAYMENT_METHOD_LABELS = {
  CASH: 'نقد',
  CARD: 'کارت',
  ONLINE: 'آنلاین',
} as const