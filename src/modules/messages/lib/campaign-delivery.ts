/**
 * The campaign delivery — a campaign send, as the ledger and the gateway see it.
 *
 * `03-data-model.md` §2.6 puts `MessageSend.campaignId` beside `automaticKind`, and
 * this file is the write half of that: a campaign's send is a ledger row the same way
 * an automatic message's is, and it is written by the same rules — row first, gateway
 * second, so a send that never returned still has a row. The module that owns the
 * ledger owns this write, which is why `campaigns` asks for it rather than writing the
 * row itself; a second module that wrote the ledger would be a second place the
 * duplicate window was enforced, and the two would disagree about who was reached.
 *
 * ## What a campaign send shares with an automatic one
 *
 * The window and the queue. A campaign that dispatches at ۳ بامداد is held exactly as
 * an automatic message is — `QUEUED`, and flushed by the automatic dispatch's own tick
 * when the hours open. That flush reads `status = QUEUED` with no kind filter, which is
 * the whole of the sharing: one queue, one window, and a campaign row on the same
 * ledger as the seven moments.
 *
 * ## What it does not share
 *
 * The idempotency read. An automatic message is keyed on `(customer, kind)`; a campaign
 * is keyed on `(customer, campaign)`, because a campaign that recurs sends again next
 * period and the kind does not change, while a campaign that re-sends within its own
 * period is a campaign that billed the clinic twice for one run. The two keys are the
 * two promises the product makes: «یک پیام در ۹۰ روز» to the person, and "once per
 * period" to the clinic.
 */

import type { Channel } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

import type { MessageSendRow } from '../types'
import { currentGateway } from './gateway'
import { markDelivered, recordCampaignRow, campaignSendRecorded } from './ledger'
import { isWithinSendWindow } from './window'
import { readSendSettings } from './settings'

/** Why a campaign send was held back — the four the ledger records for a campaign. */
export type CampaignSuppressedReason =
  | 'NO_CONSENT'
  | 'DUPLICATE_WINDOW'
  | 'DAILY_CAP'
  | 'SEND_WINDOW'

/**
 * Sends one campaign message — records the row, delivers it if the window is open, and
 * marks what the provider answered.
 *
 * The row is written before the gateway is called for the same reason an automatic
 * send's is: a send that timed out still has a row, and the row is what the next tick
 * reads to know the message was attempted.
 *
 * @returns the ledger row, in the status the window and the provider left it in.
 */
export async function sendCampaignMessage(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
  readonly campaignId: string
  readonly channel: Channel
  readonly renderedText: string
  readonly now: Date
}): Promise<MessageSendRow> {
  const settings = await readSendSettings(args.tx, args.tenantId)

  if (!isWithinSendWindow(args.now, settings)) {
    return recordCampaignRow({
      tx: args.tx,
      tenantId: args.tenantId,
      customerId: args.customerId,
      campaignId: args.campaignId,
      channel: args.channel,
      renderedText: args.renderedText,
      status: 'QUEUED',
      suppressedReason: null,
      now: args.now,
    })
  }

  const customer = await args.tx.customer.findUnique({
    where: { id: args.customerId },
    select: { mobile: true },
  })
  if (customer === null) {
    return recordCampaignRow({
      tx: args.tx,
      tenantId: args.tenantId,
      customerId: args.customerId,
      campaignId: args.campaignId,
      channel: args.channel,
      renderedText: args.renderedText,
      status: 'FAILED',
      suppressedReason: null,
      now: args.now,
    })
  }

  const row = await recordCampaignRow({
    tx: args.tx,
    tenantId: args.tenantId,
    customerId: args.customerId,
    campaignId: args.campaignId,
    channel: args.channel,
    renderedText: args.renderedText,
    status: 'QUEUED',
    suppressedReason: null,
    now: args.now,
  })

  const result = await currentGateway().send({
    tenantId: args.tenantId,
    customerId: args.customerId,
    mobile: customer.mobile,
    channel: args.channel,
    renderedText: args.renderedText,
  })
  await markDelivered(args.tx, row.id, result, args.now)

  return { ...row, status: result.error === null ? 'SENT' : 'FAILED' }
}

/**
 * Records a campaign send the rules refused, with the reason the ledger keeps.
 *
 * `03` §7.6: the row rather than the send is the unit of record, so a message the
 * customer never consented to exists in the ledger as `SUPPRESSED` — the decision is
 * auditable, and the customer record shows the clinic tried and names why it did not
 * arrive.
 */
export async function recordCampaignSuppression(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
  readonly campaignId: string
  readonly channel: Channel
  readonly renderedText: string
  readonly reason: CampaignSuppressedReason
  readonly now: Date
}): Promise<MessageSendRow> {
  return recordCampaignRow({
    tx: args.tx,
    tenantId: args.tenantId,
    customerId: args.customerId,
    campaignId: args.campaignId,
    channel: args.channel,
    renderedText: args.renderedText,
    status: 'SUPPRESSED',
    suppressedReason: args.reason,
    now: args.now,
  })
}

/**
 * Whether this campaign already recorded a send for this customer — the dispatch's
 * idempotency read, across every status.
 *
 * A suppressed row is still a decision that was made, and a repeated run that
 * re-evaluated it would write a second row for the same refusal. A recurring campaign
 * sends again next period, and next period this read is answered by the next period's
 * row — the key is `(customer, campaign)`, not `(customer, campaign, period)`, which is
 * what makes "does not re-send within its period" a ledger fact and not a clock guess.
 */
export async function campaignSendRecordedFor(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
  readonly campaignId: string
}): Promise<boolean> {
  return campaignSendRecorded(
    args.tx,
    args.tenantId,
    args.customerId,
    args.campaignId,
  )
}
