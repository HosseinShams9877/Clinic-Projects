/**
 * The appointments pages' own extra copy: the edit popup and the cancel confirm.
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
