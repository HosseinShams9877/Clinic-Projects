/**
 * The `campaigns` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel so an override cannot
 * accidentally satisfy it by exporting something adjacent.
 *
 * ## The one rule this module exists to keep
 *
 * `03-data-model.md` §2.6's invariant: `status` cannot reach `ACTIVE` without
 * `approvedByUserId` and `approvedAt`. Immutable rule 4 — "no bulk sending without
 * human approval" — is a schema-level constraint and not a UI convention, and this
 * module's status machine is where the constraint is enforced: `approveCampaign` is
 * the only writer of the two columns, `activateCampaign` refuses without them, and the
 * dispatch scans `status = ACTIVE` and re-asserts the pair before a single send. Three
 * gates, one rule, and a campaign that skips any one of them sends nothing.
 *
 * ## What the contract deliberately omits
 *
 * The Prisma client. Every function takes a `TransactionClient` because the caller
 * already opened the tenant scope.
 *
 * The audience. Which customers a campaign reaches is `audience-groups`' question, and
 * the dependency runs one way: this module reads a group's predicate and evaluates it
 * through that module's own evaluation. A second module that evaluated a predicate
 * would be a second answer to "who is in this group", and the count the manager
 * approved would not be the count the campaign sent to.
 */

import type {
  CampaignScheduleKind,
  CampaignStatus,
  CampaignType,
  Channel,
} from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

import type { CampaignsMessageKey } from '../catalog'

/** A campaign row, as the builder and the results table read it. */
export interface CampaignRow {
  readonly id: string
  readonly tenantId: string
  readonly audienceGroupId: string
  readonly messageTemplateId: string | null
  readonly createdByUserId: string
  readonly approvedByUserId: string | null
  readonly approvedAt: Date | null
  readonly name: string
  readonly type: CampaignType
  readonly channel: Channel
  readonly messageText: string
  readonly audienceLockedAt: Date | null
  readonly isRecurring: boolean
  readonly scheduleKind: CampaignScheduleKind
  /** The next run's instant, which the dispatch scan compares against the clock. */
  readonly scheduledAt: Date | null
  /** The clinic-local time a `DAILY_AT` campaign sends at. */
  readonly scheduledTime: string | null
  readonly dailyCap: number | null
  readonly status: CampaignStatus
  readonly sentCount: number
  readonly resultingAppointmentCount: number
  readonly createdAt: Date
}

/** The fields a campaign's results table renders, computed from the ledger. */
export interface CampaignResults {
  readonly campaignId: string
  /** Every ledger row the campaign wrote, sent or suppressed. */
  readonly total: number
  readonly sent: number
  readonly queued: number
  readonly suppressed: number
  readonly failed: number
  /** Appointments whose `campaignId` is this campaign — the attribution the table names. */
  readonly resultingAppointments: number
}

/** One campaign's dispatch, as the job's log line reports it. */
export interface DispatchOutcome {
  readonly campaignId: string
  readonly campaignName: string
  /** The audience the predicate evaluated to. */
  readonly evaluated: number
  readonly sent: number
  readonly queued: number
  readonly suppressed: number
  /** Why the campaign did not dispatch, when it did not. */
  readonly skipped: DispatchSkipReason | null
}

/** Why a due campaign sent to nobody, which the job reports and the page renders. */
export type DispatchSkipReason =
  | 'NOT_ACTIVE'
  | 'NOT_APPROVED'
  | 'GROUP_INACTIVE'
  | 'AUDIENCE_EMPTY'
  | 'ALREADY_SENT_THIS_PERIOD'

/** The module's public surface, as the registry types an override against it. */
export interface CampaignsModule {
  readonly createCampaign: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly createdByUserId: string
    readonly input: CampaignInput
  }) => Promise<CampaignRow>
  readonly dispatchDueCampaigns: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly now: Date
  }) => Promise<readonly DispatchOutcome[]>
}

/** The fields the builder sends, as the action holds them. */
export interface CampaignInput {
  readonly name: string
  readonly type: CampaignType
  readonly channel: Channel
  readonly audienceGroupId: string
  readonly messageText: string
  readonly scheduleKind: CampaignScheduleKind
  /** The first run's instant, built by the action from a `LocalDate` and `LocalTime`. */
  readonly scheduledAt: Date | null
  /** `HH:mm` for `DAILY_AT`, the day-of-month for `MONTHLY_DAY` carried on `scheduledAt`. */
  readonly scheduledTime: string | null
  readonly isRecurring: boolean
  readonly dailyCap: number | null
}

/** The catalog keys this module can raise, re-exported for the interface's own use. */
export type { CampaignsMessageKey }
