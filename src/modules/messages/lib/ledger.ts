/**
 * The delivery ledger — `03-data-model.md` §2.6's `MessageSend`, and the one place a
 * send, a suppression or a failure is recorded.
 *
 * §7.6 makes the row rather than the send the unit of record, and the two writers
 * below are the shape of that decision: `recordSend` writes the row **before** the
 * gateway is called, so a send that never returned still has a row, and the two
 * updaters are what a provider's answer turns that row into. A message that was
 * suppressed never reaches the gateway at all — its row is the whole record of the
 * attempt, with the reason the clinic and the customer can both act on.
 *
 * ## What the ledger is asked
 *
 * The dispatcher's three questions are all ledger reads, and all three are why the
 * row exists:
 *
 * - **Did this message already go out?** — one row per `(customer, kind)` is the
 *   dispatch's idempotency, and the reason a repeated job does not double-send.
 * - **Did any message reach this customer recently?** — the 90-day duplicate window,
 *   which is per customer and not per kind, because «یک پیام در ۹۰ روز» is a promise
 *   made to the person and not to the message type.
 * - **How many have gone out today?** — the daily cap, `06-constants.md` §14.
 *
 * ## Why the window reads count the statuses they count
 *
 * A suppressed row is *not* a delivered message, and counting it would make one
 * customer's missing consent another customer's closed daily cap. The window reads
 * count the statuses that reached a customer — `SENT`, `DELIVERED` and `QUEUED`, the
 * last because a message held for the send window is a message the clinic has
 * committed to and not one the window may forget.
 */

import type { AutomaticMessageKind, Channel } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

import type { MessageSendRow } from '../types'

/** The statuses that mean a customer was reached, for the window and cap reads. */
const DELIVERED_STATUSES = ['SENT', 'DELIVERED', 'QUEUED'] as const

/** The columns the history read carries, and nothing more. */
const SEND_SELECT = {
  id: true,
  customerId: true,
  channel: true,
  automaticKind: true,
  templateId: true,
  renderedText: true,
  status: true,
  suppressedReason: true,
  sentAt: true,
  createdAt: true,
} as const

/**
 * Writes a ledger row for an automatic message, before the gateway is called.
 *
 * The row's status is the decision the dispatcher already made — `QUEUED` for a send
 * the window is holding, `SUPPRESSED` for one the rules refused — and the reason is
 * stored beside the suppression because a held-back send with no reason is a row the
 * clinic cannot explain to the customer. `sentAt` is `null` in both, because neither
 * reached a provider; the timestamp that answers "when did we decide" is `createdAt`,
 * and the one that answers "when did it arrive" is `markDelivered`'s to set.
 *
 * `createdAt` is written from the clock the caller passes and not the column's default,
 * because the daily cap bounds the day with that same clock. A row stamped by the
 * database's own `now()` while the rules ran on an injected time is a row the cap's
 * next read does not see.
 */
export async function recordSend(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
  readonly channel: Channel
  readonly kind: AutomaticMessageKind
  readonly templateId: string | null
  readonly renderedText: string
  readonly status: 'QUEUED' | 'SUPPRESSED'
  readonly suppressedReason: string | null
  readonly now: Date
}): Promise<MessageSendRow> {
  const row = await args.tx.messageSend.create({
    data: {
      tenantId: args.tenantId,
      customerId: args.customerId,
      channel: args.channel,
      automaticKind: args.kind,
      templateId: args.templateId,
      renderedText: args.renderedText,
      status: args.status,
      suppressedReason: args.suppressedReason,
      // Nothing reached a provider: a queued row is held for the window, and a
      // suppressed one was refused by the rules. `sentAt` is set by `markDelivered`,
      // which is the only writer that knows what the provider answered.
      sentAt: null,
      createdAt: args.now,
    },
    select: SEND_SELECT,
  })

  return asRow(row)
}

/** Marks a queued row as delivered, with the provider's own id. */
export async function markDelivered(
  tx: TransactionClient,
  sendId: string,
  result: { readonly providerMessageId: string | null; readonly error: string | null },
  now: Date,
): Promise<void> {
  await tx.messageSend.update({
    where: { id: sendId },
    data: {
      status: result.error === null ? 'SENT' : 'FAILED',
      providerMessageId: result.providerMessageId,
      error: result.error,
      sentAt: result.error === null ? now : null,
    },
  })
}

/**
 * Whether this automatic message was already recorded for the customer.
 *
 * The dispatch's idempotency read, across every status: a suppressed row is still a
 * decision that was made, and a repeated run that re-evaluated it would write a
 * second row for the same refusal.
 */
export async function sendAlreadyRecorded(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
  kind: AutomaticMessageKind,
): Promise<boolean> {
  const row = await tx.messageSend.findFirst({
    where: { tenantId, customerId, automaticKind: kind },
    select: { id: true },
  })
  return row !== null
}

/**
 * Writes a ledger row for a campaign message, before the gateway is called.
 *
 * The campaign's half of `recordSend`: `campaignId` names the send and
 * `automaticKind` is `null`, because a campaign send is not one of the seven moments
 * and the column that records which one it was holds none of them. The status and the
 * clock are the same two facts, for the same two reasons (`recordSend`'s header).
 */
export async function recordCampaignRow(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
  readonly channel: Channel
  readonly campaignId: string
  readonly renderedText: string
  readonly status: 'QUEUED' | 'SUPPRESSED' | 'FAILED'
  readonly suppressedReason: string | null
  readonly now: Date
}): Promise<MessageSendRow> {
  const row = await args.tx.messageSend.create({
    data: {
      tenantId: args.tenantId,
      customerId: args.customerId,
      campaignId: args.campaignId,
      automaticKind: null,
      templateId: null,
      channel: args.channel,
      renderedText: args.renderedText,
      status: args.status,
      suppressedReason: args.suppressedReason,
      sentAt: null,
      createdAt: args.now,
    },
    select: SEND_SELECT,
  })

  return asRow(row)
}

/**
 * Whether this campaign already recorded a send for this customer.
 *
 * The campaign dispatch's idempotency read, keyed on `(customer, campaign)` rather than
 * `(customer, kind)`: a recurring campaign sends again next period, and the kind does
 * not change between periods, so the campaign's own id is the key that distinguishes
 * one period's send from the next one's absence.
 */
export async function campaignSendRecorded(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
  campaignId: string,
): Promise<boolean> {
  const row = await tx.messageSend.findFirst({
    where: { tenantId, customerId, campaignId },
    select: { id: true },
  })
  return row !== null
}

/**
 * The customer's most recent delivered message, or `null` — the 90-day window's read.
 *
 * Reads the statuses that reached the customer, so a suppression does not close the
 * window for a person who never received anything. Ordered by the ledger's own index
 * (`send_tenant_customer_sent_idx`), which exists for this query and the profile's.
 */
export async function lastDeliveredSend(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
): Promise<{ readonly sentAt: Date } | null> {
  const row = await tx.messageSend.findFirst({
    where: { tenantId, customerId, status: { in: [...DELIVERED_STATUSES] } },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  })
  if (row === null || row.sentAt === null) return null
  return { sentAt: row.sentAt }
}

/**
 * The customer's most recent delivered *campaign* message, or `null`.
 *
 * The attribution read: a booking whose source is a campaign belongs to the campaign that
 * was last in front of the customer, and this names it. Reads the same delivered statuses
 * `lastDeliveredSend` does, so a send that never left the clinic does not earn a campaign
 * a booking it did not produce.
 */
export async function lastCampaignSendFor(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
): Promise<{ readonly campaignId: string; readonly sentAt: Date } | null> {
  const row = await tx.messageSend.findFirst({
    where: {
      tenantId,
      customerId,
      campaignId: { not: null },
      status: { in: [...DELIVERED_STATUSES] },
    },
    orderBy: { sentAt: 'desc' },
    select: { campaignId: true, sentAt: true },
  })
  if (row === null || row.campaignId === null || row.sentAt === null) return null
  return { campaignId: row.campaignId, sentAt: row.sentAt }
}

/** How many delivered messages the customer has received since the local day began. */
export async function sendsToday(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
  startOfDay: Date,
  now: Date,
): Promise<number> {
  return tx.messageSend.count({
    where: {
      tenantId,
      customerId,
      status: { in: [...DELIVERED_STATUSES] },
      createdAt: { gte: startOfDay, lte: now },
    },
  })
}

/**
 * The customer's message history, newest first — the profile's message table, and
 * DoD 6's answer to "every send is visible on the customer record".
 */
export async function customerMessageHistory(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly customerId: string
}): Promise<readonly MessageSendRow[]> {
  const rows = await args.tx.messageSend.findMany({
    where: { tenantId: args.tenantId, customerId: args.customerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: SEND_SELECT,
  })
  return rows.map(asRow)
}

/** The ledger's row as the module's own shape. */
function asRow(row: {
  readonly id: string
  readonly customerId: string
  readonly channel: string
  readonly automaticKind: string | null
  readonly templateId: string | null
  readonly renderedText: string
  readonly status: string
  readonly suppressedReason: string | null
  readonly sentAt: Date | null
  readonly createdAt: Date
}): MessageSendRow {
  return Object.freeze({
    id: row.id,
    customerId: row.customerId,
    channel: row.channel,
    automaticKind: (row.automaticKind as AutomaticMessageKind | null) ?? null,
    templateId: row.templateId,
    renderedText: row.renderedText,
    status: row.status,
    suppressedReason: row.suppressedReason,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  })
}
