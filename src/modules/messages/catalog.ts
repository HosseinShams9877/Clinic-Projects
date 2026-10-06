/**
 * The Persian sentences and labels `messages` raises and renders, and the seven
 * default templates a tenant starts with.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is the module's catalog — one of the exemptions the rule
 * names. Everything else in the module references these by key.
 *
 * ## The seven default templates
 *
 * `03-data-model.md` §2.6 gives `MessageTemplate` one row per automatic kind per
 * channel, and `02-architecture.md` §6 names the seven moments. The text below is
 * what a tenant that has never opened the «پیامها» tab sends, written as whole
 * sentences rather than concatenated fragments for the reason
 * `07-localization.md` §7.3 states: a template assembled from parts produces
 * ungrammatical Persian, and the word order around «عزیز،» is not a thing a
 * concatenation can hold.
 *
 * Each is stored through `ensureDefaultTemplates`, which seeds the rows a tenant is
 * missing and leaves the ones the clinic edited alone — a default that overwrote a
 * clinic's own wording would be a default nobody can trust.
 *
 * ## Placeholders, and the allow-list that makes an unknown one a settings error
 *
 * Each kind names the placeholders its template may contain, and DoD 7 requires that
 * an unknown one fail **at settings time** rather than at send time. The allow-list
 * is a property of the kind and not of the template: `{amount}` in a survey is a
 * placeholder a clinic could not have filled from anything, and refusing it where
 * the text is written is how a message that would have rendered an empty gap never
 * reaches a customer.
 */

import type { AutomaticMessageKind, Channel, MessageSendStatus } from '@/core/constants'
import { ZWNJ } from '@/core/localization'

/** Every catalog key this module can raise. */
export type MessagesMessageKey =
  | 'messages.templateMissing'
  | 'messages.placeholderUnknown'
  | 'messages.kindUnknown'

export const MESSAGES: Readonly<Record<MessagesMessageKey, string>> = {
  // A kind reached the sender with no template and no default, so the message has no
  // text. The sentence names the settings tab, which is the only place the text is.
  'messages.templateMissing': `متن این پیام در تنظیمات ثبت نشده است. از مدیر کلینیک بخواهید آن را در زبانه «پیام${ZWNJ}ها» تکمیل کند.`,

  // The sentence DoD 7 names for a placeholder the kind does not hold, raised where
  // the template is written and not where the message is sent.
  'messages.placeholderUnknown': `این متن دارای متغیرهای ناشناخته است. فقط متغیرهای این نوع پیام قابل استفاده هستند.`,

  // A kind the constants module does not hold reached the sender.
  'messages.kindUnknown': 'نوع پیام نامعتبر است.',
}

/**
 * The placeholders each automatic message's template may contain.
 *
 * The names are the `07-localization.md` §7.3 tokens the renderer substitutes, and
 * the set is what the settings screen of Phase 10 will validate against — keyed by
 * kind so a clinic editing one message cannot reach into another's record.
 */
export const TEMPLATE_PLACEHOLDERS: Readonly<
  Record<AutomaticMessageKind, readonly string[]>
> = {
  BOOKING_CONFIRMATION: ['name', 'date', 'time'],
  APPOINTMENT_REMINDER: ['name', 'date', 'time'],
  AFTERCARE: ['name', 'serviceName'],
  NEXT_SESSION_REMINDER: ['name', 'sessionNumber', 'date'],
  BALANCE_REMINDER: ['name', 'amount'],
  NO_SHOW_FOLLOW_UP: ['name', 'serviceName'],
  SURVEY: ['name', 'serviceName'],
}

/**
 * The shipped text of the seven automatic messages, keyed as the template row's own
 * `(automaticKind, channel)` pair is.
 *
 * Every sentence carries the customer's name and the one fact the message exists to
 * deliver: the slot, the service, the session number, the amount or the question. A
 * sentence that named neither would be a message with no information in it, which is
 * how a clinic's automatic messages get muted.
 */
export const DEFAULT_TEMPLATES: Readonly<
  Record<AutomaticMessageKind, string>
> = {
  BOOKING_CONFIRMATION: `{name} عزیز، نوبت شما در تاریخ {date} ساعت {time} ثبت شد.`,
  APPOINTMENT_REMINDER: `{name} عزیز، یادآور می${ZWNJ}شویم که فردا، {date} ساعت {time} نوبت شماست.`,
  AFTERCARE: `{name} عزیز، از حضور شما در جلسه {serviceName} متشکریم. لطفاً مراقبت${ZWNJ}های بعد از جلسه را طبق دستور پزشک رعایت کنید.`,
  NEXT_SESSION_REMINDER: `{name} عزیز، موعد جلسه {sessionNumber} دوره درمان شما در تاریخ {date} است. برای رزرو نوبت با کلینیک تماس بگیرید.`,
  BALANCE_REMINDER: `{name} عزیز، مبلغ {amount} تومان بابت خدمات دریافتی مانده است. لطفاً پرداخت را انجام دهید.`,
  NO_SHOW_FOLLOW_UP: `{name} عزیز، جلسه {serviceName} شما انجام نشد. لطفاً برای تعیین زمان جدید با کلینیک تماس بگیرید.`,
  SURVEY: `{name} عزیز، از نتیجه جلسه {serviceName} شما رضایت داشتید؟ نظر شما برای بهتر شدن خدمات ما ارزشمند است.`,
}

/**
 * The two channels a message travels on, as the settings tab labels them.
 *
 * Named `CHANNEL_LABELS` because that is the name `scripts/check-i18n.mjs` derives
 * from the set name `Channel`.
 */
export const CHANNEL_LABELS: Readonly<Record<Channel, string>> = {
  SMS: 'پیامک',
  WHATSAPP: 'واتساپ',
}

/**
 * The ledger's five statuses, as the customer record and the desk's feed render them.
 */
export const SEND_STATUS_LABELS: Readonly<Record<MessageSendStatus, string>> = {
  QUEUED: 'در صف ارسال',
  SENT: 'ارسال شد',
  DELIVERED: 'تحویل داده شد',
  FAILED: 'ارسال ناموفق',
  SUPPRESSED: 'ارسال نشد',
}

/**
 * Why a message was held back, as the customer record shows it beside the row.
 *
 * The four reasons are `03` §2.6's own list, and a reason a customer or a clinic
 * cannot act on is not worth recording — each sentence names the thing that would
 * change the answer.
 */
export const SUPPRESSED_REASON_LABELS: Readonly<Record<string, string>> = {
  NO_CONSENT: 'مشتری با این канал موافقت نکرده است',
  DUPLICATE_WINDOW: 'پیام دیگری در ۹۰ روز گذشته ارسال شده است',
  DAILY_CAP: 'سقف پیام روزانه تکمیل شده است',
  SEND_WINDOW: 'خارج از ساعت ارسال',
  TEMPLATE_MISSING: 'متن پیام ثبت نشده است',
}
