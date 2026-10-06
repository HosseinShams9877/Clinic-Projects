/**
 * The `campaign-assistant` module's Persian sentences and — the thing no other module's
 * catalog holds — the keyword sets the interpreter matches a brief against.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a finding,
 * and the keyword rows below are Persian strings the same way the sentences are: they are
 * the phrases a manager actually writes, and a phrase held in code is a phrase only the
 * person who read the code can check. Keeping them here means the whole set is one read,
 * which is what makes a phrase added to the interpreter a phrase added to the catalog and
 * not a literal that drifted into the module.
 *
 * ## Why the keywords are whole phrases and not word fragments
 *
 * A fragment like «جدید» matches a birthday campaign about a new year as happily as it
 * matches a new service, and a fragment's ambiguity is a proposal the manager has to
 * correct rather than one the assistant got right. The rows are the phrases the eight
 * purposes are named in, and the interpreter takes the first row whose phrases the text
 * holds, scanning in the order below — «خدمت جدید» is read before «جدید» would ever be
 * reached, and «جلسه بعدی» before «بعدی».
 */

import type { CampaignScheduleKind, CampaignType } from '@/core/constants'

/** Every catalog key this module can raise. */
export type CampaignAssistantMessageKey = 'campaignAssistant.briefRequired'

export const MESSAGES: Readonly<Record<CampaignAssistantMessageKey, string>> = {
  // The builder's one field error — a brief too short for the assistant to read anything from.
  'campaignAssistant.briefRequired': 'برای پیشنهاد یک کمپین، چند کلمه درباره هدف آن بنویسید.',
}

/**
 * The phrases that name each type, most specific first.
 *
 * A row is a `CampaignType` and the phrases the manager's brief uses for its purpose. The
 * interpreter takes the first row whose phrases the text contains, so a brief that names
 * two purposes belongs to the one it named more specifically — a row above is the more
 * specific one, and the order below is the order the eight purposes narrow in.
 */
export const CAMPAIGN_TYPE_PHRASES: ReadonlyArray<{
  readonly type: CampaignType
  readonly phrases: readonly string[]
}> = [
  {
    type: 'NEW_SERVICE',
    phrases: ['خدمت جدید', 'خدمات جدید', 'خدمت‌های جدید', 'معرفی خدمت', 'خدمات جدیدمان'],
  },
  {
    type: 'NEXT_SESSION',
    phrases: ['جلسه بعدی دوره', 'جلسه بعدی', 'جلسه بعد', 'موعد جلسه', 'دوره بعدی', 'موعد بعدی'],
  },
  {
    type: 'DEBT_REMINDER',
    phrases: ['مانده پرداخت', 'مانده حساب', 'باقی‌مانده', 'بدهکار', 'بدهی', 'تسویه', 'پولشان'],
  },
  {
    type: 'SURVEY',
    phrases: ['نظرسنجی', 'رضایت‌سنجی', 'پرسشنامه', 'رضایت مشتری', 'نظر مشتری', 'از نتیجه درمان'],
  },
  {
    type: 'WINBACK',
    phrases: [
      'مدت زیادی است',
      'مدت‌هاست',
      'برنگشته‌اند',
      'برنگشتند',
      'نیامده‌اند',
      'دوباره بیایند',
      'بازگشت مشتری',
      'خوابیده',
    ],
  },
  {
    type: 'BIRTHDAY',
    phrases: ['تبریک تولد', 'ماه تولد', 'تولدشان', 'تولد مشتری', 'تولد', 'سالگرد'],
  },
  {
    type: 'LOYALTY',
    phrases: ['مشتری وفادار', 'وفادار', 'قدردانی', 'اعتمادشان', 'همراهی'],
  },
  {
    type: 'OCCASION',
    phrases: ['مناسبت', 'رویداد', 'جشن', 'ویژه', 'اعلام'],
  },
]

/** The phrases that ask for a recurring send, mapped to the schedule kind they mean. */
export const RECURRING_PHRASES: ReadonlyArray<{
  readonly scheduleKind: CampaignScheduleKind
  readonly phrases: readonly string[]
}> = [
  { scheduleKind: 'DAILY_AT', phrases: ['هر روز', 'روزانه', 'هر صبح'] },
  { scheduleKind: 'MONTHLY_DAY', phrases: ['در اول هر ماه', 'هر ماه', 'ماهانه'] },
]

/** The phrases that ask for a one-time send. */
export const ONE_TIME_PHRASES: readonly string[] = ['فقط یک بار', 'یک‌بار', 'یک بار']

/**
 * The sentence the assistant names its own uncertainty with, for a brief it could not
 * match to a purpose. The page renders it beside the proposal, so a manager reading the
 * type knows it is a default and not a reading of what they wrote.
 */
export const ASSISTANT_LOW_CONFIDENCE_HINT =
  'هدف کمپین از متن شما مشخص نشد؛ این پیشنهاد بر اساس حدس ماست. آن را بررسی و اصلاح کنید.'
