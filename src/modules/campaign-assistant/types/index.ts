/**
 * The `campaign-assistant` module's own vocabulary.
 *
 * The assistant is the one surface in the product that turns a manager's sentence into a
 * campaign proposal, and its contract is two negatives the types below are the shape of:
 *
 * - **No clinical data.** `interpretCampaignBrief` takes the brief and the clock and
 *   nothing else — no `TransactionClient`, no customer id, no tenant. A function that
 *   cannot reach the database cannot read a customer's `medicalHistory`, and the
 *   signature is the guarantee rather than a promise in a comment.
 * - **Never sends.** The return is a `CampaignProposal`, which is a draft a human being
 *   still has to read, approve and activate. The module offers no dispatch, no write to
 *   the ledger, and no path to `campaigns`'s sending functions — the proposal is the end
 *   of the assistant's part, and everything after it is a person's decision.
 */

import type {
  CampaignScheduleKind,
  CampaignType,
  Channel,
} from '@/core/constants'
import type { AudienceGroupKey } from '@/core/constants'

/** The manager's free-text brief, as the assistant's form holds it. */
export interface CampaignBrief {
  /** Persian free text — «مشتریانی که مدت زیادی است نیامده‌اند». */
  readonly text: string
  /** The channel the clinic prefers, when the brief names none. */
  readonly channel: Channel
}

/**
 * The assistant's proposal — three decisions a campaign is, none of them made yet.
 *
 * Every field is a suggestion the builder renders for a person to read and edit, and the
 * `confidence` is how strongly the assistant held the type, so a low score is a proposal
 * the page can mark as a guess rather than presenting as an answer.
 */
export interface CampaignProposal {
  /** The type the brief's phrasing matched, or `null` when none matched. */
  readonly type: CampaignType | null
  /** The group that type preselects, from the catalog's own mapping. */
  readonly audienceGroupKey: AudienceGroupKey | null
  /** Whole-sentence Persian text, seeded from the type's catalog entry. */
  readonly messageText: string
  /** The schedule the brief's phrasing implies. */
  readonly scheduleKind: CampaignScheduleKind
  /** The first run's instant, or `null` when the brief named no date. */
  readonly scheduledAt: Date | null
  /** `HH:mm` for a `DAILY_AT` proposal, or `null` for a one-time one. */
  readonly scheduledTime: string | null
  /** Whether the brief asked for a recurring send. */
  readonly isRecurring: boolean
  /** The channel, from the brief or the caller's default. */
  readonly channel: Channel
  /** 0 to 1 — how clearly the brief named the type the proposal carries. */
  readonly confidence: number
}

/** Every catalog key this module can raise. */
export type CampaignAssistantMessageKey = 'campaignAssistant.briefRequired'

/** The module's public surface, as the registry types an override against it. */
export interface CampaignAssistantModule {
  readonly interpretCampaignBrief: (args: {
    readonly brief: CampaignBrief
    readonly now: Date
  }) => Promise<CampaignProposal>
}
