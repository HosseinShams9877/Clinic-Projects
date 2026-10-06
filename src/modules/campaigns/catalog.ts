/**
 * The Persian sentences and labels `campaigns` raises and renders.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and this file is the module's catalog — one of the exemptions the rule
 * names. Everything else in the module references these by key.
 *
 * ## The eight types
 *
 * `06-constants.md` §4.8 closes the set, and the labels are the phrases the manager
 * reads in the builder's type dropdown. Each type also carries the group it
 * preselects and the sentence it proposes, because a type is a *purpose* — a birthday
 * campaign is not a winback with different text, and the builder that offered the
 * eight types as an undifferentiated list would be offering eight names for one form.
 *
 * ## The status machine's six labels
 *
 * The six are `03` §2.6's own, and the five a manager acts on are the ones the row
 * renders. `AWAITING_APPROVAL` is the gate's own state and the one the sentence below
 * names, because a campaign parked there is a campaign no one has decided on, and the
 * honest thing to show is that the decision is the hold-up and whose it is.
 */

import type {
  CampaignScheduleKind,
  CampaignStatus,
  CampaignType,
  Channel,
} from '@/core/constants'
import { ZWNJ } from '@/core/localization'

/** Every catalog key this module can raise. */
export type CampaignsMessageKey =
  | 'campaigns.notFound'
  | 'campaigns.nameRequired'
  | 'campaigns.textRequired'
  | 'campaigns.groupRequired'
  | 'campaigns.scheduleRequired'
  | 'campaigns.notAwaitingApproval'
  | 'campaigns.notApproved'
  | 'campaigns.notActive'
  | 'campaigns.alreadyClosed'
  | 'campaigns.cannotApproveOwn'
  | 'campaigns.typeUnknown'
  | 'campaigns.groupNotActive'

export const MESSAGES: Readonly<Record<CampaignsMessageKey, string>> = {
  // The 404-not-403 rule's own sentence, for a campaign another clinic may well hold.
  'campaigns.notFound': 'این کمپین در این کلینیک وجود ندارد.',

  // The builder's field errors — the three a campaign cannot exist without.
  'campaigns.nameRequired': 'نام کمپین الزامی است.',
  'campaigns.textRequired': 'متن پیام الزامی است.',
  'campaigns.groupRequired': 'انتخاب گروه مخاطبان الزامی است.',
  'campaigns.scheduleRequired': 'زمان‌بندی کمپین الزامی است.',

  // The approval gate's own sentences, each naming the state the row is in.
  'campaigns.notAwaitingApproval': 'این کمپین برای تأیید ارسال نشده است.',
  'campaigns.notApproved': 'این کمپین هنوز تأیید نشده است و نمی‌تواند ارسال شود.',
  'campaigns.notActive': 'این کمپین فعال نیست.',
  'campaigns.alreadyClosed': 'این کمپین به پایان رسیده است.',

  // The approval may not be the person who created the draft: the gate is a second
  // pair of eyes, and approving one's own draft is the gate walked around.
  'campaigns.cannotApproveOwn': 'شما نمی‌توانید کمپینی را که خودتان ساخته‌اید تأیید کنید.',

  // A value the closed sets do not hold, reached from a form forwarding a string.
  'campaigns.typeUnknown': 'نوع کمپین نامعتبر است.',
  'campaigns.groupNotActive': 'این گروه مخاطبان غیرفعال است و قابل انتخاب نیست.',
}

/** The eight campaign types, as the builder's dropdown labels them. */
export const CAMPAIGN_TYPE_LABELS: Readonly<Record<CampaignType, string>> = {
  BIRTHDAY: 'تولد',
  WINBACK: 'بازگشت مشتری',
  NEXT_SESSION: 'جلسه بعدی',
  OCCASION: 'مناسبت',
  NEW_SERVICE: 'خدمت جدید',
  DEBT_REMINDER: 'یادآور بدهی',
  SURVEY: 'نظرسنجی',
  LOYALTY: 'وفاداری',
}

/**
 * One sentence per type, so the dropdown explains a type's purpose rather than only
 * naming it.
 */
export const CAMPAIGN_TYPE_DESCRIPTIONS: Readonly<Record<CampaignType, string>> = {
  BIRTHDAY: 'تبریک تولد به مشتریانی که ماه تولدشان در این ماه است.',
  WINBACK: 'دعوت مشتریانی که مدت زیادی است مراجعه نکرده‌اند.',
  NEXT_SESSION: 'یادآوری موعد جلسه بعدی دوره درمان.',
  OCCASION: 'پیام ویژه برای یک مناسبت یا رویداد کلینیک.',
  NEW_SERVICE: 'معرفی یک خدمت جدید به مشتریان.',
  DEBT_REMINDER: 'یادآوری مانده پرداخت به بدهکاران.',
  SURVEY: 'پرسش از رضایت مشتریانی که دوره‌شان تمام شده.',
  LOYALTY: 'قدردانی از مشتریان وفادار.',
}

/**
 * The group each type preselects in the builder — the type's purpose expressed as the
 * audience that purpose is for. A manager may change it; the preselect is what makes
 * the eight types different from one another on the first interaction.
 */
export const CAMPAIGN_TYPE_DEFAULT_GROUP: Readonly<Record<CampaignType, string>> = {
  BIRTHDAY: 'BIRTHDAY',
  WINBACK: 'DORMANT',
  NEXT_SESSION: 'CYCLE_DUE',
  OCCASION: 'LOYAL',
  NEW_SERVICE: 'LOYAL',
  DEBT_REMINDER: 'DEBTORS',
  SURVEY: 'COMPLETED_COURSE',
  LOYALTY: 'LOYAL',
}

/**
 * The proposed text of each type, as the assistant and the builder both seed it.
 *
 * Whole sentences and not concatenated fragments, for the reason
 * `07-localization.md` §7.3 states: the word order around «عزیز،» is not a thing a
 * concatenation can hold. Each carries the customer's name and the one fact the
 * campaign exists to deliver, and each ends with the one action the customer can take.
 */
export const CAMPAIGN_TYPE_DEFAULT_TEXT: Readonly<Record<CampaignType, string>> = {
  BIRTHDAY: `{name} عزیز، تولدتان مبارک. کلینیک آرزو می${ZWNJ}کند سالی پر از سلامتی در پیش داشته باشید. برای رزرو نوبت با ما تماس بگیرید.`,
  WINBACK: `{name} عزیز، مدت زیادی است به کلینیک نیامده‌اید. برای ادامه درمان شما را همراهی می${ZWNJ}کنیم. برای رزرو نوبت با ما تماس بگیرید.`,
  NEXT_SESSION: `{name} عزیز، موعد جلسه بعدی دوره درمان شما فرا رسیده است. لطفاً برای رزرو نوبت با کلینیک تماس بگیرید.`,
  OCCASION: `{name} عزیز، به مناسبت این رویداد، پیشنهاد ویژه‌ای برای شما داریم. برای رزرو نوبت با کلینیک تماس بگیرید.`,
  NEW_SERVICE: `{name} عزیز، خدمت جدیدی به کلینیک ما اضافه شده است. برای مشاوره و رزرو نوبت با ما تماس بگیرید.`,
  DEBT_REMINDER: `{name} عزیز، مبلغ {amount} تومان بابت خدمات دریافتی مانده است. لطفاً برای تسویه با کلینیک تماس بگیرید.`,
  SURVEY: `{name} عزیز، از نتیجه درمان شما رضایت داشتید؟ نظر شما برای بهتر شدن خدمات ما ارزشمند است.`,
  LOYALTY: `{name} عزیز، از اعتماد شما سپاسگزاریم. به عنوان مشتری وفادار، پیشنهاد ویژه‌ای برای شما داریم.`,
}

/** The status machine's six states, as the results table and the row render them. */
export const CAMPAIGN_STATUS_LABELS: Readonly<Record<CampaignStatus, string>> = {
  DRAFT: 'پیش‌نویس',
  AWAITING_APPROVAL: 'در انتظار تأیید',
  APPROVED: 'تأیید شده',
  ACTIVE: 'فعال',
  PAUSED: 'متوقف موقت',
  FINISHED: 'به پایان رسیده',
}

/**
 * The sentence the page shows beside a status, which is where the approval gate
 * becomes legible: a manager reading «در انتظار تأیید» knows the campaign sends
 * nothing until a second person approves it.
 */
export const CAMPAIGN_STATUS_HINTS: Readonly<Record<CampaignStatus, string>> = {
  DRAFT: 'این کمپین هنوز برای تأیید ارسال نشده است.',
  AWAITING_APPROVAL: 'این کمپین تا تأیید یک نفر دیگر ارسال نمی‌شود.',
  APPROVED: 'این کمپین تأیید شده و می‌توانید آن را فعال کنید.',
  ACTIVE: 'این کمپین فعال است و در زمان مقرر ارسال می‌شود.',
  PAUSED: 'این کمپین موقتاً متوقف شده است.',
  FINISHED: 'این کمپین به پایان رسیده است.',
}

/** The three schedule kinds, as the builder's schedule field labels them. */
export const CAMPAIGN_SCHEDULE_LABELS: Readonly<Record<CampaignScheduleKind, string>> = {
  ONE_TIME: 'یک‌بار',
  DAILY_AT: 'روزانه در ساعت مشخص',
  MONTHLY_DAY: 'ماهانه در روز مشخص',
}

/** The two channels, re-exported so the builder composes them from the module. */
export { CHANNEL_LABELS } from '@/modules/messages'

/**
 * The statuses a campaign may move to, from the state the row is in.
 *
 * The machine is: `DRAFT → AWAITING_APPROVAL → APPROVED → ACTIVE ⇄ PAUSED`, with
 * `FINISHED` reachable from `ACTIVE` and `PAUSED`. The gate is the edge into `ACTIVE`,
 * and it is the one edge that requires two columns to be set — the whole of
 * `03` §2.6's invariant.
 */
export const STATUS_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  DRAFT: ['AWAITING_APPROVAL'],
  AWAITING_APPROVAL: ['APPROVED', 'DRAFT'],
  APPROVED: ['ACTIVE', 'DRAFT'],
  ACTIVE: ['PAUSED', 'FINISHED'],
  PAUSED: ['ACTIVE', 'FINISHED'],
  FINISHED: [],
}
