/**
 * The interpreter — a Persian brief becomes a proposal, and nothing else.
 *
 * The two negatives the module's contract is (`types/index.ts`'s header gives them) are
 * properties of this function's signature before they are properties of its body:
 *
 * - **No clinical data.** The arguments are the brief and the clock. There is no
 *   `TransactionClient`, no tenant, no customer id — a function that cannot reach the
 *   database cannot read a `medicalHistory` column, and a caller that tried to pass one
 *   would not compile. The allow-list over at `audience-groups` is the second wall, and
 *   this function never touches it: it proposes a *group key*, and a key is a name.
 * - **Never sends.** The return is a `CampaignProposal`, which is three decisions a
 *   person still has to read. Nothing here writes a ledger row, and the module holds no
 *   function that could.
 *
 * ## Why the matching is phrases and not fragments
 *
 * The catalog's rows are whole phrases for the reason its own header gives — a fragment
 * matches the wrong purpose as happily as the right one — and this function is the
 * catalog's only reader, so a phrase added there is a phrase the assistant understands
 * and a phrase held in code is not. The rows are scanned in the catalog's own order,
 * which is most-specific first, and the first row the brief contains wins.
 *
 * ## Why a low-confidence proposal is still a proposal
 *
 * A brief that names no purpose the eight hold is not an error — the manager typed
 * something, and the honest answer is «این پیشنهاد بر اساس حدس ماست» beside a proposal
 * they edit. The confidence is how the page knows to show it, and a `null` type is how
 * the page knows the assistant did not read a purpose into the text.
 */

import { CampaignScheduleKind } from '@/core/constants'
import {
  asLocalTime,
  fromJalaliParts,
  jalaliParts,
  todayLocalDate,
  toUtcInstant,
} from '@/core/localization'
import { ValidationError } from '@/core/types'

import {
  CAMPAIGN_TYPE_DEFAULT_GROUP,
  CAMPAIGN_TYPE_DEFAULT_TEXT,
} from '@/modules/campaigns'

import {
  ASSISTANT_FALLBACK_TEXT,
  CAMPAIGN_TYPE_PHRASES,
  JALALI_MONTH_PHRASES,
  ONE_TIME_PHRASES,
  RECURRING_PHRASES,
} from '../catalog'
import type { CampaignBrief, CampaignProposal } from '../types'

/** The clinic-local hour a proposal's first run lands in, when the brief named no time. */
const DEFAULT_RUN_TIME = '09:00'

/** The confidence a brief that named a purpose holds. */
const HIGH_CONFIDENCE = 1

/** The confidence a brief that named none of the eight does. */
const LOW_CONFIDENCE = 0

/**
 * Reads a brief and proposes the campaign it describes.
 *
 * @throws ValidationError — the brief is empty, which is the one input the assistant
 *   cannot work from and the builder's own field error.
 */
export async function interpretCampaignBrief(args: {
  readonly brief: CampaignBrief
  readonly now: Date
}): Promise<CampaignProposal> {
  const text = args.brief.text.trim()
  if (text.length === 0) {
    throw new ValidationError('A campaign brief needs text to read.', {
      messageKey: 'campaignAssistant.briefRequired',
    })
  }

  // The ZWNJ a phrase carries is not the ZWNJ a keyboard produces, and a phrase that
  // differs from the typed text by one invisible character is a phrase missed.
  const normalized = normalize(text)

  const typeRow = CAMPAIGN_TYPE_PHRASES.find((row) =>
    row.phrases.some((phrase) => normalized.includes(normalize(phrase))),
  )
  const scheduleRow = RECURRING_PHRASES.find((row) =>
    row.phrases.some((phrase) => normalized.includes(normalize(phrase))),
  )

  const isRecurring = scheduleRow !== undefined
  const scheduleKind: CampaignScheduleKind = scheduleRow?.scheduleKind ?? CampaignScheduleKind.OneTime
  const month = monthNamed(normalized)

  return Object.freeze({
    type: typeRow?.type ?? null,
    audienceGroupKey: typeRow ? CAMPAIGN_TYPE_DEFAULT_GROUP[typeRow.type] : null,
    messageText: typeRow ? CAMPAIGN_TYPE_DEFAULT_TEXT[typeRow.type] : ASSISTANT_FALLBACK_TEXT,
    scheduleKind,
    // A recurring campaign starts now and the schedule carries its period; a one-time
    // one starts when the brief's month opens, or not soon enough to name a date for.
    scheduledAt: isRecurring
      ? args.now
      : month !== null
        ? firstRunInMonth(month, args.now)
        : null,
    scheduledTime: scheduleKind === CampaignScheduleKind.DailyAt ? DEFAULT_RUN_TIME : null,
    isRecurring,
    channel: args.brief.channel,
    confidence: typeRow !== undefined ? HIGH_CONFIDENCE : LOW_CONFIDENCE,
  })
}

/** The Jalali month a brief names, if it names one.
 *
 * A month is the whole of the date a birthday or occasion campaign needs, and a day the
 * brief named would be a day the proposal could not honour without a year.
 */
function monthNamed(normalized: string): number | null {
  const row = JALALI_MONTH_PHRASES.find((row) =>
    row.phrases.some((phrase) => normalized.includes(normalize(phrase))),
  )
  return row?.month ?? null
}

/**
 * The first morning of the named month, in the year it next falls in.
 *
 * A month already past this Jalali year is next year's month, because a proposal for a
 * date behind the clock is a proposal the campaign could never run on.
 */
function firstRunInMonth(month: number, now: Date): Date {
  const today = jalaliParts(todayLocalDate(now))
  const year = today.month >= month ? today.year + 1 : today.year
  const localDate = fromJalaliParts({ year, month, day: 1 })
  return toUtcInstant(localDate, asLocalTime(DEFAULT_RUN_TIME))
}

/**
 * Makes two spellings of one phrase comparable: the ZWNJ dropped, the whitespace
 * collapsed, so a phrase and a typed text meet on their letters.
 */
function normalize(value: string): string {
  return value.replace(/‌/g, '').replace(/\s+/g, ' ').trim()
}
