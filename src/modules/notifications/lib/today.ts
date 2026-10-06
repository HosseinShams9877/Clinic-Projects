/**
 * «یادآوری‌های امروز» — the desk's reminder feed, and the one place a message the
 * clinic sent is visible next to the work it was about.
 *
 * The desk's list is a *day's* list, not a log: the rows are the sends the tenant
 * produced between the start of the clinic's local day and `now`, so a receptionist
 * opening the desk sees the messages that already went out and the ones the rules
 * held back. The held ones are the point — a suppression the desk cannot see is a
 * customer the desk assumes was notified, which is how a follow-up call turns into
 * an apology (`03` §7.6's argument for the ledger row over the silent skip).
 *
 * ## Why the feed reads the ledger and not the triggers
 *
 * The triggers answer "what is due"; the ledger answers "what did we do about it".
 * The desk's question is the second one, and it includes the messages a manager sent
 * by hand and the ones a campaign produced — both write rows, and a feed that only
 * showed the automatic seven would show a clinic seven messages and hide the rest.
 */

import type { AutomaticMessageKind } from '@/core/constants'
import { asLocalTime, fromUtcInstant, toUtcInstant } from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'
import { readDebtSettings } from '@/modules/debts'

import type { ReminderRow } from '../types'

/** A day's feed is a bounded set; the desk scrolls it, not the whole history. */
const FEED_LIMIT = 200

/** The columns one row of the feed carries, and nothing more. */
const SEND_SELECT = {
  id: true,
  customerId: true,
  channel: true,
  automaticKind: true,
  renderedText: true,
  status: true,
  suppressedReason: true,
  sentAt: true,
  createdAt: true,
  customer: { select: { firstName: true, lastName: true, mobile: true } },
} as const

/**
 * The day's sends and suppressions, newest first.
 *
 * The day boundary is the tenant's own calendar — the feed starts at the local
 * midnight of the clinic's clock, so a message sent at ۲۳:۵۰ and one read at ۰۸:۰۰
 * the next morning are on two different lists, which is what a receptionist means by
 * "today". The boundary is an instant computed once, so the whole feed is one range
 * scan over the ledger's index.
 */
export async function todaysReminders(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly ReminderRow[]> {
  const { utcOffsetMinutes } = await readDebtSettings(tx, tenantId)
  const startOfDay = toUtcInstant(
    fromUtcInstant(now, utcOffsetMinutes).localDate,
    asLocalTime('00:00'),
    utcOffsetMinutes,
  )
  const rows = await tx.messageSend.findMany({
    where: {
      tenantId,
      createdAt: { gte: startOfDay, lte: now },
    },
    orderBy: { createdAt: 'desc' },
    take: FEED_LIMIT,
    select: SEND_SELECT,
  })

  return rows.map((row) => ({
    id: row.id,
    customerId: row.customerId,
    customerName:
      row.customer.lastName === null || row.customer.lastName === ''
        ? row.customer.firstName
        : `${row.customer.firstName} ${row.customer.lastName}`,
    mobile: row.customer.mobile,
    kind: (row.automaticKind as AutomaticMessageKind | null) ?? null,
    channel: row.channel,
    renderedText: row.renderedText,
    status: row.status,
    suppressedReason: row.suppressedReason,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  }))
}
