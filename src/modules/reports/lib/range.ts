/**
 * The range a report covers, as the two shapes the columns store.
 *
 * `Appointment.localDate` is the Jalali string, so a day-range filter on it is a
 * string comparison; `TreatmentCycle.startedAt` is the instant, which needs the
 * tenant's offset. Both are kept here so the seven reports agree about which days
 * "the range" names — a report that converted differently would be a report about
 * a different month.
 */

import { DEFAULT_CLINIC_UTC_OFFSET_MINUTES } from '@/core/constants'
import {
  addLocalDays,
  asLocalTime,
  toUtcInstant,
  type LocalDate,
} from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'

import type { InstantRange, ReportRange } from '../types'

/** The columns the offset is read from, named once so a rename touches one select. */
const OFFSET_SELECT = {
  utcOffsetMinutes: true,
} as const

/** The tenant's own calendar, or the documented UTC+3:30 when the row is absent. */
export async function readReportOffset(
  tx: TransactionClient,
  tenantId: string,
): Promise<number> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: OFFSET_SELECT,
  })
  return row === null ? DEFAULT_CLINIC_UTC_OFFSET_MINUTES : row.utcOffsetMinutes
}

/** The range as the instant columns need it: `[start of `from`, start of the day after `to`)`. */
export function toInstantRange(range: ReportRange, utcOffsetMinutes: number): InstantRange {
  const midnight = asLocalTime('00:00')
  return Object.freeze({
    start: toUtcInstant(range.from, midnight, utcOffsetMinutes),
    endExclusive: toUtcInstant(addLocalDays(range.to, 1), midnight, utcOffsetMinutes),
  })
}

/**
 * The Jalali-string half of the same range, for the columns that store the day.
 *
 * Returned as a `where` fragment rather than a pair so a report does not spell the
 * comparison twice — and so the inclusive-both-ends convention is one fact here.
 */
export function localDateWhere(range: ReportRange): { readonly gte: LocalDate; readonly lte: LocalDate } {
  return Object.freeze({ gte: range.from, lte: range.to })
}

/**
 * The first day of the Jalali month `day` is in.
 *
 * The month a report covers is the month the Jalali calendar names, not the month the
 * Gregorian column implies, so the first day is built from the string's own year and
 * month rather than converted and converted back.
 */
export function monthStartOf(day: LocalDate): LocalDate {
  return `${day.slice(0, 8)}01` as LocalDate
}
