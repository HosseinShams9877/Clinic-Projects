/**
 * The attribution — which appointments a campaign produced.
 *
 * A campaign's results table names a count of appointments, and the count has to be the
 * truth and not a guess, because it is the number a manager reads to decide whether the
 * campaign was worth sending. Two things make it honest:
 *
 * 1. **The count is recomputed, never incremented.** `recountCampaignAppointments`
 *    counts the appointments whose `campaignId` is the campaign and sets the column,
 *    which makes the column a function of the table and not a tally a race could
 *    double-count. The dispatch calls it after every run; a booking that lands later is
 *    picked up by the next one.
 * 2. **The link is written by the booking, not by the campaign.** A campaign cannot
 *    claim an appointment the customer booked for another reason, so the only
 *    attribution is the one the booking itself made — `attributeAppointmentToCampaign`
 *    is called from `book.ts`, on the appointment the campaign's recipient booked, and
 *    only for a booking that names the campaign as its source.
 *
 * ## Why the attribution is the most recent send and not any send
 *
 * A customer who received three campaigns and then booked is a customer whose booking
 * belongs to the campaign that was last in front of them. Reading the most recent
 * delivered send for the customer names one campaign, and the ordering is the ledger's
 * own `sentAt` — which is the clock the sends themselves were written on.
 */

import type { TransactionClient } from '@/core/db/scope'
import { AppointmentSource } from '@/core/constants'
import { lastCampaignSendFor } from '@/modules/messages'

/**
 * Links a booking to the campaign that most recently reached its customer.
 *
 * Called from `book.ts` when the booking's source is a campaign, which is the one path a
 * booking names its origin. Silent when the customer has no delivered send — a booking
 * by a customer the campaign never reached is not the campaign's result, and the column
 * stays `null`.
 */
export async function attributeAppointmentToCampaign(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly appointmentId: string
  readonly customerId: string
  readonly source: AppointmentSource
}): Promise<void> {
  if (args.source !== AppointmentSource.Campaign) return

  const last = await lastCampaignSendFor(args.tx, args.tenantId, args.customerId)
  if (last === null) return

  await args.tx.appointment.update({
    where: { id: args.appointmentId },
    data: { campaignId: last.campaignId },
  })
}

/**
 * The campaign's appointments, as the results table renders the count.
 *
 * A booking is the result the campaign existed to produce, so a `BOOKED` appointment
 * counts as soon as it is made. Cancelled appointments and no-shows do not: the one is a
 * booking the customer revoked and the other a booking the customer never honoured, and
 * counting either would name the campaign a result it did not get.
 */
export async function countCampaignAppointments(
  tx: TransactionClient,
  tenantId: string,
  campaignId: string,
): Promise<number> {
  return tx.appointment.count({
    where: {
      tenantId,
      campaignId,
      status: { notIn: EXCLUDED_STATUSES as never },
    },
  })
}

/**
 * Recomputes and stores one campaign's appointment count.
 *
 * The recomputation is the point: the column is a function of the appointments table and
 * not a counter a concurrent run could move twice.
 */
export async function recountCampaignAppointments(
  tx: TransactionClient,
  tenantId: string,
  campaignId: string,
): Promise<number> {
  const count = await countCampaignAppointments(tx, tenantId, campaignId)
  await tx.campaign.update({
    where: { id: campaignId },
    data: { resultingAppointmentCount: count },
  })
  return count
}

/** The statuses that are not a result: the booking was revoked or never honoured. */
const EXCLUDED_STATUSES = ['CANCELLED', 'NO_SHOW'] as const
