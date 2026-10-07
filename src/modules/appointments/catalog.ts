/**
 * The Persian sentences and labels `appointments` raises and renders.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is the module's catalog — one of the two exemptions the
 * rule names. Everything else in the module references these by key.
 *
 * ## The sentences, and the fix each one names
 *
 * `07-localization.md` §8 requires a message to name the **fix**, and the four
 * refusals below each have a different one:
 *
 * | Key | The fix it names |
 * |---|---|
 * | `appointment.slotTaken` | Pick another time. The slot was taken between the grid rendering and the booking landing. |
 * | `appointment.closed` | Choose a different day. The clinic does not book this one. |
 * | `appointment.illegalTransition` | The record moved underneath the action; reload the page. |
 * | `appointment.quickBookDisabled` | A manager must turn the shortcut on in settings. |
 *
 * `appointment.slotTaken` is DoD 4's sentence, verbatim from the specification's
 * own wording, because it is the one a user sees under a genuine race and the one
 * the test suite asserts.
 */

import type { AppointmentStatus, BookingMode } from '@/core/constants'

import { ZWNJ } from '@/core/localization'

/** Every catalog key this module can raise. */
export type AppointmentsMessageKey =
  | 'appointment.slotTaken'
  | 'appointment.closed'
  | 'appointment.illegalTransition'
  | 'appointment.quickBookDisabled'
  | 'appointment.notFound'
  | 'appointment.blockOverlapsBooking'
  | 'appointment.depositRequired'
  | 'appointment.customerCancelWindowClosed'

/**
 * The sentence for each key.
 *
 * Typed as a `Record` over the union, so a key with no sentence is a compile error
 * rather than an empty string on a screen.
 */
export const MESSAGES: Readonly<Record<AppointmentsMessageKey, string>> = {
  // The sentence DoD 4 names, for the race the unique index exists to settle.
  'appointment.slotTaken': 'این ساعت قبلاً رزرو شده است. لطفاً ساعت دیگری را انتخاب کنید.',

  // The day the clinic does not book — a holiday with the toggle off, or a day the
  // doctor has closed entirely. Both are the same answer to the user.
  'appointment.closed': 'این روز قابل رزرو نیست. لطفاً روز دیگری را انتخاب کنید.',

  'appointment.illegalTransition': `این نوبت در حال حاضر قابل تغییر نیست. صفحه را دوباره بارگذاری کنید و دوباره تلاش کنید.`,

  'appointment.quickBookDisabled': `ثبت سریع نوبت برای پزشک غیرفعال است. از مدیر کلینیک بخواهید آن را در تنظیمات فعال کند.`,

  'appointment.notFound': 'این نوبت پیدا نشد.',

  // A block that would cover a booking the clinic already has cannot be created;
  // the sentence names the conflict so the receptionist knows which row to look at.
  'appointment.blockOverlapsBooking': `این بازه زمانی شامل نوبتی است که از قبل ثبت شده است و نمی${ZWNJ}توان آن را بست.`,

  // The public site cannot collect a deposit, so a service that requires one is not
  // bookable there until the clinic turns toggle 6 on. The sentence names the clinic,
  // because the person at the site cannot fix this and the desk can.
  'appointment.depositRequired': `این خدمت نیاز به پیش${ZWNJ}پرداخت دارد و از طریق سایت قابل رزرو نیست. لطفاً با کلینیک تماس بگیرید.`,

  // The customer's own cancellation window (Phase 9's `own-panel.ts`). The fix is to
  // call the clinic, because the desk can still cancel where the customer cannot.
  'appointment.customerCancelWindowClosed': `لغو نوبت فقط تا ۲۴ ساعت قبل از شروع جلسه امکان${ZWNJ}پذیر است. برای لغو در ساعات پایانی لطفاً با کلینیک تماس بگیرید.`,
}

/* ── §4.3 The 8 states, as §2.2's table labels them ───────────────────────── */

/**
 * The status labels, from the table `03-data-model.md` §2.2 renders.
 *
 * Named `APPOINTMENT_STATUS_LABELS` because that is the name
 * `scripts/check-i18n.mjs` derives from the set name `AppointmentStatus`, so the
 * day grid's badges and the check's own naming cannot drift apart.
 */
export const APPOINTMENT_STATUS_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  BOOKED: 'رزرو شده',
  AWAITING_ARRIVAL: 'منتظر پزشک',
  ARRIVED: 'حاضر شد',
  COMPLETED: 'انجام شد',
  NO_SHOW: 'عدم حضور',
  CANCELLED: 'لغو شد',
  RESCHEDULED: `جابه${ZWNJ}جا شد`,
  RESULT_NOT_RECORDED: 'نتیجه ثبت نشده',
}

/* ── §4.4 The three booking modes ─────────────────────────────────────────── */

/**
 * The booking modes, as the settings screen and the public booking shell name them.
 *
 * Each one is a sentence rather than a word, because the three are not three values
 * of one thing — they are three different promises the clinic makes about what a
 * booking *is*, and the label has to say which promise the manager is choosing.
 */
export const BOOKING_MODE_LABELS: Readonly<Record<BookingMode, string>> = {
  FIXED_SLOT: 'ساعت مشخص',
  TIME_RANGE: 'بازه زمانی',
  REQUEST: 'درخواست نوبت',
}

/**
 * The two ranges a `TIME_RANGE` clinic offers, as the specification's own example
 * names them: «صبح ۹ تا ۱۲» and «عصر ۱۶ تا ۲۰».
 *
 * The bounds are part of the label and not of the mode: the mode says "the customer
 * picks a half of the day", and the two halves are the halves an Iranian clinic
 * actually works. A clinic whose hours differ still offers these two, because the
 * alternative — deriving the ranges from the shifts — turns a label the customer
 * reads into a computed string that can be empty.
 */
export const TIME_RANGE_MORNING = 'صبح ۹ تا ۱۲'
export const TIME_RANGE_EVENING = 'عصر ۱۶ تا ۲۰'

/* ── Phase 9: the customer panel's own appointments surface ───────────────── */

/**
 * `account/appointments.html` — the customer's own list, as `09-security.md` §7
 * scopes it.
 *
 * The page's copy lives in this module's catalog and not in `src/app/catalog.ts`
 * because that file is at the length gate, and because the vocabulary is this
 * module's: the statuses the list badges are `APPOINTMENT_STATUS_LABELS`, and the
 * two refusals the actions can raise are `MESSAGES` keys above.
 */
export const CUSTOMER_APPOINTMENTS_PAGE = Object.freeze({
  title: 'نوبت‌های من',
  lead: 'نوبت‌های پیش‌رو و جلسات گذشته خود را اینجا ببینید.',
  /** The two halves of the list, as the split at the injected clock names them. */
  upcoming: {
    title: 'نوبت‌های پیش‌رو',
    empty: 'نوبت پیش‌رویی ثبت نشده است.',
  },
  past: {
    title: 'جلسات گذشته',
    empty: 'هنوز جلسه‌ای برگزار نشده است.',
  },
  columns: {
    date: 'تاریخ',
    time: 'ساعت',
    service: 'خدمت',
    doctor: 'پزشک',
    status: 'وضعیت',
  },
  actions: {
    cancel: 'لغو نوبت',
    reschedule: 'جابه‌جایی نوبت',
    cancelConfirm: 'این نوبت لغو شود؟',
  },
  /** The one line a successful cancellation renders, naming what the policy returns. */
  cancelled: 'نوبت شما لغو شد.',
  /** The sentence the deposit entitlement renders, when the policy returns anything. */
  refundNote: 'بیعانه شما طبق سیاست بازگشت وجه کلینیک بازگردانده می‌شود.',
  /** The sentence a reschedule renders. */
  rescheduled: 'نوبت شما جابه‌جا شد.',
  /** The form the reschedule dialog renders. */
  rescheduleForm: {
    title: 'جابه‌جایی نوبت',
    dateLabel: 'تاریخ جدید',
    timeLabel: 'ساعت جدید',
    submit: 'ثبت نوبت جدید',
  },
})
