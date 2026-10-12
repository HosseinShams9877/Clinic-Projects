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
 *
 * The dialog is the *booking*'s confirm and not a validation: the service and the
 * doctor are both valid, and what the dialog asks is whether the desk accepts a
 * booking whose length is shorter than the service the customer asked for. A "no"
 * is a different time or a different doctor, both of which the form behind it can
 * take.
 */
export const SHORTEN_POPUP = {
  title: 'مدت خدمت با نوبت این پزشک هم‌خوان نیست',
  /** The sentence around the two numbers: the service's length and the doctor's step. */
  bodyStart: 'این خدمت ',
  bodyMiddle: ' دقیقه است، اما نوبت‌های این پزشک ',
  bodyEnd: ' دقیقه‌ای است. آیا می‌خواهید با زمان کمتر ثبت شود؟',
  confirm: 'بله، با زمان کمتر ثبت کن',
  dismiss: 'نه، زمان دیگری انتخاب می‌کنم',
} as const

/**
 * The booking popup's locked-slot badge — the mark on step 2 when the popup was
 * opened from a grid cell and the day and the time are the facts the desk already
 * chose by clicking. The lock is the popup's own, not a permission: the desk
 * changes the slot by returning to the grid, not by editing the step.
 */
export const LOCKED_SLOT = {
  badge: 'از جدول',
  hint: 'تاریخ و ساعت از روی جدول انتخاب شده و قابل تغییر نیست. برای تغییر، این پنجره را ببندید و روی خانه دیگری بزنید.',
} as const