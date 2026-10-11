/**
 * The manager's results table — the clinic's own campaigns, and the state action each row
 * permits.
 *
 * The demo's nine columns are the manager's own read, and the column the shared
 * `_campaigns` table held (`createdAt`) is not among them: the manager asks what a
 * campaign is doing and not when it was filed, and the row's own schedule and counts are
 * the answer the demo gives. The «اجرا» column is the row's own schedule as a yes/no —
 * a `ONE_TIME` row is «یک‌بار» and anything else is «تکرارشونده» — because the three
 * schedule kinds are the engine's own vocabulary and the manager's question is only
 * whether it repeats.
 *
 * ## Why the audience column is the group's own count
 *
 * The demo's «مخاطب» cell is the number a campaign reached. The honest number the row
 * holds is the audience group's own last-refreshed size, which is the count the nightly
 * job recomputes from the same evaluation the dispatch runs — a re-evaluation per row
 * would be a second answer to "who is in this group" arriving after the manager read the
 * first. The column renders that count and nothing else.
 *
 * ## Why the row's two icon buttons are not here
 *
 * The demo's «گزارش» and «ویرایش». A campaign's own detail page is not a route the
 * product holds, so the eye would open nothing; and the module's edit path sends a row
 * back to `DRAFT` rather than changing a decision under the approval it held, which is
 * the builder's surface and not the row's. The one action the row's state permits is the
 * one the module's own machine allows, and it is a button that works.
 *
 * ## Why the labels arrive as strings
 *
 * The `campaigns` barrel is a server-only surface — it holds the dispatch, and the
 * dispatch's graph reaches modules a browser cannot load. A client component that
 * imported it for its label maps would pull that graph into the browser bundle, so the
 * page reads the module and hands each row its resolved labels. The badge tone is not a
 * label, so the row derives it from its own status further down.
 */

'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/core/components/button'
import { Icon } from '@/core/components/icons'
import { CAMPAIGNS_PAGE } from '@/app/catalog'
import { ADMIN_CAMPAIGNS } from '@/app/admin/catalog'
import { cx } from '@/core/lib'
import { toPersianDigits } from '@/core/localization'

import {
  activateCampaignAction,
  approveCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  submitCampaignAction,
  type ActionResult,
} from '@/app/_campaigns/actions'

/** The badge tones the status column reads, keyed as the module's own set spells them. */
type StatusTone = 'ok' | 'info' | 'warn' | 'brand' | 'neutral'

/** One row, as the page loaded it from the campaigns module's own reads. */
export interface CampaignRowView {
  readonly id: string
  /** The campaign's own name, as the «کمپین» column's bold line renders it. */
  readonly name: string
  /** The row's status, as the module's own closed set spells it. */
  readonly status: string
  /** The two badges the row's own schedule reads. */
  readonly recurring: boolean
  /** The four labels the page resolved from the module's catalogs. */
  readonly typeLabel: string
  readonly channelLabel: string
  readonly audienceGroupName: string
  readonly statusLabel: string
  readonly statusHint: string
  /** The audience group's own last-refreshed size. */
  readonly audienceCount: number
  /** The ledger's own counts, recomputed by `campaignResults`. */
  readonly sent: number
  readonly visits: number
  /** Whether the person reading the row is the one who wrote the draft. */
  readonly createdByCurrentUser: boolean
}

/** The table's props: the rows, newest first. */
export interface CampaignsTableProps {
  readonly campaigns: readonly CampaignRowView[]
}

/** The eight column headers, in the table's own order. */
const TABLE_HEADERS = [
  { label: ADMIN_CAMPAIGNS.columns.campaign, numeric: false },
  { label: ADMIN_CAMPAIGNS.columns.type, numeric: false },
  { label: ADMIN_CAMPAIGNS.columns.run, numeric: false },
  { label: ADMIN_CAMPAIGNS.columns.channel, numeric: false },
  { label: ADMIN_CAMPAIGNS.columns.audience, numeric: true },
  { label: ADMIN_CAMPAIGNS.columns.sent, numeric: true },
  { label: ADMIN_CAMPAIGNS.columns.visits, numeric: true },
  { label: ADMIN_CAMPAIGNS.columns.status, numeric: false },
  { label: ADMIN_CAMPAIGNS.columns.action, numeric: false },
] as const

/**
 * The badge tone each status renders, keyed as the module's own closed set spells it.
 *
 * The tone is the row's own and not the page's, because a tone is not a label: the
 * page resolves the two sentences the status reads from the module's server-only
 * catalog, and the tone is which of the five badge ramps the component draws them on.
 */
const TONE_BY_STATUS: Readonly<Record<string, StatusTone>> = {
  DRAFT: 'warn',
  AWAITING_APPROVAL: 'info',
  APPROVED: 'brand',
  ACTIVE: 'ok',
  PAUSED: 'neutral',
  FINISHED: 'info',
}

/** The badge tone each status renders, as the column's own class reads it. */
const STATUS_TONES: Readonly<Record<StatusTone, string>> = {
  ok: 'bg-ok-bg text-ok',
  info: 'bg-info-bg text-info',
  warn: 'bg-warn-bg text-warn',
  brand: 'bg-brand-50 text-brand-700',
  neutral: 'bg-neutral-bg text-ink-2',
}

/** «کمپین‌های من» — every campaign the clinic holds, newest first. */
export function CampaignsTable({ campaigns }: CampaignsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-line text-sm">
        <thead className="bg-surface-sunken text-ink-3">
          <tr>
            {TABLE_HEADERS.map((header) => (
              <th
                key={header.label}
                scope="col"
                className={cx(
                  'whitespace-nowrap px-4 py-3 text-xs font-semibold',
                  header.numeric ? 'text-end' : 'text-start',
                )}
              >
                {header.label}
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
  )
}

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
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold text-ink">{campaign.name}</span>
          <span className="text-xs text-ink-3">{campaign.audienceGroupName}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="rounded-xs bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink-2">
          {campaign.typeLabel}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span
          className={cx(
            'inline-flex rounded-pill px-3 py-[4px] text-xs font-semibold',
            campaign.recurring ? 'bg-brand-50 text-brand-700' : 'bg-neutral-bg text-ink-2',
          )}
        >
          {campaign.recurring ? ADMIN_CAMPAIGNS.runRecurring : ADMIN_CAMPAIGNS.runOnce}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-3">{campaign.channelLabel}</td>
      <td className="whitespace-nowrap px-4 py-3 text-end text-ink-2 tabular-nums">
        {toPersianDigits(campaign.audienceCount)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-end text-ink-2 tabular-nums">
        {toPersianDigits(campaign.sent)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-end font-bold text-ok tabular-nums">
        {toPersianDigits(campaign.visits)}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex flex-col">
          <span
            className={cx(
              'inline-flex w-fit rounded-pill px-3 py-[4px] text-xs font-semibold',
              STATUS_TONES[TONE_BY_STATUS[campaign.status] ?? 'neutral'],
            )}
          >
            {campaign.statusLabel}
          </span>
          <span className="text-xs text-ink-3">{campaign.statusHint}</span>
        </div>
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
              className={cx(
                'flex items-center gap-1 text-xs',
                answer.ok ? 'text-ok' : 'text-danger',
              )}
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
