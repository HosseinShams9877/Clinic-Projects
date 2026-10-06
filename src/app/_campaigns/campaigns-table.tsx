/**
 * The results table — the campaigns the clinic holds, and the state actions each row
 * permits.
 *
 * The row's own five states are the approval gate made visible: a draft is submitted, an
 * awaiting row is approved, an approved row is activated, an active row is paused and a
 * paused one resumed. Each is one button, and each is refused by the server for a state
 * the button does not belong in — the table renders the button the state permits and the
 * module refuses the rest, so the two halves of immutable rule 4 are the UI and the
 * assertion rather than the UI alone.
 *
 * ## Why the approver is not the creator
 *
 * `approveCampaign` refuses an approver who wrote the draft, and the sentence it raises
 * is the catalog's own. The table names that sentence beside the approve button when the
 * row's creator is the person reading it, because the gate is a second pair of eyes and a
 * manager who is the only approver needs to know the gate asks for a colleague.
 *
 * ## Why nothing here edits or deletes
 *
 * An approved campaign is a decision the clinic made about what to say to whom, and the
 * module's edit path sends a draft back to `DRAFT` rather than letting a decision change
 * under the approval it held. The builder is the draft's surface; the table is the row's.
 * There is no delete path in the module, so there is no button for one here.
 *
 * ## Why the labels arrive as strings
 *
 * The `campaigns` barrel is a server-only surface — it holds the dispatch, and the
 * dispatch's graph reaches modules a browser cannot load. A client component that
 * imported it for its label maps would pull that graph into the browser bundle, so the
 * page reads the module and hands each row its resolved labels, the same way the debts
 * surface hands its option lists down (`_debts/debts-forms.tsx`).
 */

'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/core/components/button'
import { Icon } from '@/core/components/icons'
import { CAMPAIGNS_PAGE } from '@/app/catalog'
import { cx } from '@/core/lib'
import {
  DEFAULT_CLINIC_UTC_OFFSET_MINUTES,
} from '@/core/constants'
import {
  type LocalDate,
  formatDate,
  fromUtcInstant,
  toPersianDigits,
} from '@/core/localization'

import {
  activateCampaignAction,
  approveCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  submitCampaignAction,
  type ActionResult,
} from './actions'

/** One row, as the page loaded it from the campaigns module's own reads. */
export interface CampaignRowView {
  readonly id: string
  readonly name: string
  /** The row's status, as the module's own closed set spells it. */
  readonly status: string
  /** The four labels the page resolved from the module's catalogs. */
  readonly typeLabel: string
  readonly audienceGroupName: string
  readonly statusLabel: string
  readonly statusHint: string
  readonly scheduleLabel: string
  /** The ledger's own counts, recomputed by `campaignResults`. */
  readonly sent: number
  readonly suppressed: number
  readonly appointments: number
  readonly createdAt: Date
  /** Whether the person reading the row is the one who wrote the draft. */
  readonly createdByCurrentUser: boolean
}

/** The table's props: the rows, newest first. */
export interface CampaignsTableProps {
  readonly campaigns: readonly CampaignRowView[]
}

/** «گزارش کمپین‌ها» — every campaign the clinic holds, newest first. */
export function CampaignsTable({ campaigns }: CampaignsTableProps) {
  if (campaigns.length === 0) {
    return <p className="text-sm text-ink-3">{CAMPAIGNS_PAGE.results.empty}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-ink">{CAMPAIGNS_PAGE.results.title}</h2>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-surface-2 text-ink-2">
            <tr>
              {TABLE_HEADERS.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-start font-semibold"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface">
            {campaigns.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The ten column headers, in the table's own order. */
const TABLE_HEADERS = [
  CAMPAIGNS_PAGE.results.columns.name,
  CAMPAIGNS_PAGE.results.columns.type,
  CAMPAIGNS_PAGE.results.columns.audience,
  CAMPAIGNS_PAGE.results.columns.status,
  CAMPAIGNS_PAGE.results.columns.schedule,
  CAMPAIGNS_PAGE.results.columns.sent,
  CAMPAIGNS_PAGE.results.columns.suppressed,
  CAMPAIGNS_PAGE.results.columns.appointments,
  CAMPAIGNS_PAGE.results.columns.createdAt,
  CAMPAIGNS_PAGE.results.columns.actions,
]

/** One campaign, its counts, and the one action its state permits. */
function CampaignRow({ campaign }: { readonly campaign: CampaignRowView }) {
  const [pending, startTransition] = useTransition()
  const [answer, setAnswer] = useState<FormAnswer | null>(null)

  function run(action: () => Promise<ActionResult>, success: string) {
    startTransition(async () => {
      const outcome = await action()
      setAnswer(
        outcome.ok ? { ok: true, message: success } : { ok: false, message: outcome.message },
      )
    })
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold text-ink">{campaign.name}</td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-2">{campaign.typeLabel}</td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-2">{campaign.audienceGroupName}</td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold text-ink">{campaign.statusLabel}</span>
          <span className="text-xs text-ink-3">{campaign.statusHint}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-2">{campaign.scheduleLabel}</td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-2">{countLine(campaign.sent)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-2">
        {toPersianDigits(campaign.suppressed)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-2">
        {toPersianDigits(campaign.appointments)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-2">
        {formatDate(asLocalDate(campaign.createdAt), 'short')}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <RowAction campaign={campaign} pending={pending} onRun={run} />
          </div>
          {campaign.status === 'AWAITING_APPROVAL' && campaign.createdByCurrentUser ? (
            <p className="text-xs text-warning">{CAMPAIGNS_PAGE.rowActions.cannotApproveOwn}</p>
          ) : null}
          {answer !== null ? (
            <p
              className={cx('flex items-center gap-1 text-xs', answer.ok ? 'text-ok' : 'text-danger')}
              role="alert"
              aria-live="polite"
            >
              <Icon name={answer.ok ? 'confirm' : 'error'} size="compact" />
              {answer.message}
            </p>
          ) : null}
        </div>
      </td>
    </tr>
  )
}

/** The one action the row's state permits, as one button. */
function RowAction({
  campaign,
  pending,
  onRun,
}: {
  readonly campaign: CampaignRowView
  readonly pending: boolean
  readonly onRun: (action: () => Promise<ActionResult>, success: string) => void
}) {
  switch (campaign.status) {
    case 'DRAFT':
      return (
        <Button
          size="small"
          variant="neutral"
          disabled={pending}
          onClick={() =>
            onRun(() => submitCampaignAction(campaign.id), CAMPAIGNS_PAGE.rowActions.submitted)
          }
        >
          {CAMPAIGNS_PAGE.rowActions.submit}
        </Button>
      )
    case 'AWAITING_APPROVAL':
      return (
        <Button
          size="small"
          variant="primary"
          disabled={pending}
          onClick={() =>
            onRun(() => approveCampaignAction(campaign.id), CAMPAIGNS_PAGE.rowActions.approved)
          }
        >
          {CAMPAIGNS_PAGE.rowActions.approve}
        </Button>
      )
    case 'APPROVED':
      return (
        <Button
          size="small"
          variant="primary"
          disabled={pending}
          onClick={() =>
            onRun(() => activateCampaignAction(campaign.id), CAMPAIGNS_PAGE.rowActions.activated)
          }
        >
          {CAMPAIGNS_PAGE.rowActions.activate}
        </Button>
      )
    case 'ACTIVE':
      return (
        <Button
          size="small"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            onRun(() => pauseCampaignAction(campaign.id), CAMPAIGNS_PAGE.rowActions.paused)
          }
        >
          {CAMPAIGNS_PAGE.rowActions.pause}
        </Button>
      )
    case 'PAUSED':
      return (
        <Button
          size="small"
          variant="neutral"
          disabled={pending}
          onClick={() =>
            onRun(() => resumeCampaignAction(campaign.id), CAMPAIGNS_PAGE.rowActions.resumed)
          }
        >
          {CAMPAIGNS_PAGE.rowActions.resume}
        </Button>
      )
    default:
      return null
  }
}

/** A form's own answer: its outcome and the sentence the outcome rendered. */
type FormAnswer = { readonly ok: boolean; readonly message: string }

/** A count's own line, as the table's sent column renders it. */
function countLine(count: number): string {
  if (count === 0) return CAMPAIGNS_PAGE.results.counts.none
  if (count === 1) return CAMPAIGNS_PAGE.results.counts.one
  return CAMPAIGNS_PAGE.results.counts.many(count)
}

/** One instant as the clinic's own Jalali date, which is the day the clinic worked. */
function asLocalDate(instant: Date): LocalDate {
  return fromUtcInstant(instant, DEFAULT_CLINIC_UTC_OFFSET_MINUTES).localDate
}
