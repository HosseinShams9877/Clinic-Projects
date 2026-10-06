/**
 * The Persian sentences and labels `notifications` raises and renders.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is the module's catalog — one of the exemptions the rule
 * names. Everything else in the module references these by key, and the desk reads
 * them through the barrel.
 *
 * ## The seven automatic messages
 *
 * `06-constants.md` §4.10 closes the set and the priority order; `02-architecture.md`
 * §6 names the moments. A label is the desk's name for the message, and the timing
 * string is the one-line description of when it fires — the two things the
 * «یادآوری‌های امروز» feed and the future «پیامها» settings tab render side by side,
 * because a clinic that cannot tell when a message is sent cannot tell whether it
 * should be.
 *
 * The priority order (`06-constants.md` §4.10, restated in `03`'s index table) is
 * next-session appointment → financial → survey, and the seven rows below are in
 * that order so a reader of this file reads the order a customer is served in.
 */

import type { AutomaticMessageKind } from '@/core/constants'
import { ZWNJ } from '@/core/localization'

/** Every catalog key this module can raise. */
export type NotificationsMessageKey =
  | 'notifications.templateMissing'
  | 'notifications.kindUnknown'

export const MESSAGES: Readonly<Record<NotificationsMessageKey, string>> = {
  // A tenant has no template for a kind and channel and no shipped default exists for
  // it, so the send cannot be rendered. The sentence names the settings tab, which is
  // the only place the text exists.
  'notifications.templateMissing': `متن این پیام در تنظیمات ثبت نشده است. از مدیر کلینیک بخواهید آن را در زبانه «پیام${ZWNJ}ها» تکمیل کند.`,

  // A kind the constants module does not hold reached the dispatcher. It is a defect
  // in the caller, and the sentence is honest about that rather than about the clinic.
  'notifications.kindUnknown': 'نوع پیام نامعتبر است.',
}

/**
 * The desk's name for each of the seven automatic messages.
 *
 * Named `AUTOMATIC_KIND_LABELS` because that is the name `scripts/check-i18n.mjs`
 * derives from the set name `AutomaticMessageKind`, so the feed's rows and the
 * check's own naming cannot drift apart.
 */
export const AUTOMATIC_KIND_LABELS: Readonly<Record<AutomaticMessageKind, string>> = {
  BOOKING_CONFIRMATION: 'تأیید رزرو نوبت',
  APPOINTMENT_REMINDER: 'یادآوری روز قبل',
  AFTERCARE: 'مراقبت‌های بعد از جلسه',
  NEXT_SESSION_REMINDER: 'یادآوری جلسه بعدی',
  BALANCE_REMINDER: 'یادآوری مانده‌حساب',
  NO_SHOW_FOLLOW_UP: 'پیگیری عدم حضور',
  SURVEY: 'نظر سنجی',
}

/**
 * One sentence per message naming **when** it fires.
 *
 * The seven timings are the specification's own: on booking, the day before the
 * session, right after a completed session, when the cycle's next session is due,
 * when a balance is past its due date, the day after a no-show, and a week after a
 * completed course. Each is phrased as a fact about the clock and not about a
 * button, because these are the sentences the «پیامها» tab shows beside its toggle
 * and a clinic reads them to decide whether to turn a message off.
 */
export const AUTOMATIC_KIND_TIMING: Readonly<Record<AutomaticMessageKind, string>> = {
  BOOKING_CONFIRMATION: 'هنگام ثبت نوبت',
  APPOINTMENT_REMINDER: 'یک روز قبل از نوبت',
  AFTERCARE: 'پس از ثبت نتیجه جلسه',
  NEXT_SESSION_REMINDER: 'هنگام نزدیک شدن موعد جلسه بعدی',
  BALANCE_REMINDER: 'پس از گذشتن سررسید مانده‌حساب',
  NO_SHOW_FOLLOW_UP: 'یک روز بعد از عدم حضور',
  SURVEY: 'یک هفته بعد از اتمام جلسه',
}

/**
 * The two sentences the desk's reminder feed needs for a row the rules held back
 * rather than sent, so a held message is visible as held and not as missing.
 */
export const HELD_LABELS = {
  /** A message queued while the clinic's send window is closed. */
  queued: 'در صف ارسال (خارج از ساعت ارسال)',
  /** A message the rules kept back, with the reason the ledger records. */
  suppressed: 'ارسال نشد',
} as const
