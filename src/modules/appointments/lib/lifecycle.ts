/**
 * The automatic half of the lifecycle — the sweep that runs the two transitions no
 * person performs (`03-data-model.md` §2.2):
 *
 * - `BOOKED → AWAITING_ARRIVAL`, when the appointment's day arrives.
 * - `AWAITING_ARRIVAL | ARRIVED → RESULT_NOT_RECORDED`, two hours past the slot with
 *   no status recorded.
 *
 * `RESULT_NOT_RECORDED` is the specification's own description of the most important
 * state in the model:
 *
 * > without it an appointment whose outcome was never recorded stays "today" forever,
 * > drops out of sight, is never followed up, never generates a next cycle, and never
 * > appears in the drop-off report. It is a self-raising alarm.
 *
 * So the sweep is not a tidying job. It is the mechanism that raises the alarm, and
 * the alarm surfaces **only** in the reception cartable (`03-data-model.md` §2.2) —
 * which is why `lib/queries.ts` offers that cartable and the doctor and manager views
 * do not.
 *
 * ## Who runs this, and what it may not do
 *
 * The worker, which does not go through `requirePermission` (`09-security.md` §8)
 * because there is no user and no role to check. What it has instead is the state
 * machine: the sweep asks `isSweepTransition`, and a state that not on the automatic
 * list is a state the sweep cannot reach. That is what keeps the worker from
 * completing an appointment a person never recorded — the one thing a job must not be
 * able to do.
 *
 * ## Why the sweep reads the stored Jalali day
 *
 * Both transitions are facts about the clinic-local day, and that day is a stored
 * column (`03-data-model.md` §3.1), not a value derived from the instant. The
 * promotion compares `localDate` against today's Jalali date, and the overdue check
 * compares the slot's stored local date and time against the clock. Comparing
 * instants instead would make both depend on the tenant's offset being right, and an
 * offset misconfiguration would move a whole day's appointments a timezone away
 * without any row being wrong.
 *
 * ## Why the sweep is also called from the request path
 *
 * Both transitions are facts about the clock, and the clock is injected. The worker
 * job calls the sweep on its tick, and the cartable's query calls it on the way to
 * rendering, so a receptionist who opens the desk sees the day already promoted
 * whether or not the worker's tick has landed. That is not a second implementation;
 * it is the same function, and it is idempotent — a row already in the target state
 * is not returned by either query.
 */

import { AppointmentStatus } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'
import {
  asLocalTime,
  isSameLocalDate,
  todayLocalDate,
  toUtcInstant,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'

import { isSweepTransition } from './status'

/** Two hours, in minutes — the specification's own threshold. */
const RESULT_OVERDUE_MINUTES = 120

/**
 * The two states the overdue pass is about.
 *
 * A plain array and not `as const` because Prisma's `in:` filter takes a mutable
 * `string[]`; the values are the constants' own, so the set stays tied to
 * `AppointmentStatus`.
 */
const OVERDUE_SOURCE_STATUSES: string[] = [
  AppointmentStatus.AwaitingArrival,
  AppointmentStatus.Arrived,
]

/**
 * `BOOKED → AWAITING_ARRIVAL` for every appointment whose day has arrived.
 *
 * @returns the ids the sweep moved, for the job's own accounting.
 */
export async function promoteToAwaitingArrival(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly string[]> {
  const today = todayLocalDate(now)
  const rows = await tx.appointment.findMany({
    where: {
      tenantId,
      isSlotBlock: false,
      status: AppointmentStatus.Booked,
      localDate: { lte: today },
    },
    select: { id: true },
  })

  return applyTransition(tx, rows, AppointmentStatus.AwaitingArrival)
}

/**
 * `AWAITING_ARRIVAL | ARRIVED → RESULT_NOT_RECORDED` for every appointment past its
 * slot by two hours with no result.
 *
 * `resultRecordedAt` is the column that clears the alarm: `recordResult` stamps it,
 * and the query's `null` predicate is what keeps a completed appointment out of the
 * sweep forever. `ARRIVED` alone is not a result — arrival without an outcome is
 * precisely the condition the alarm exists to flag, which is why it is one of the two
 * sources.
 *
 * @returns the ids the sweep moved, which are the cartable's new rows.
 */
export async function flagUnrecordedResults(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
  utcOffsetMinutes: number,
): Promise<readonly string[]> {
  const today = todayLocalDate(now)
  const rows = await tx.appointment.findMany({
    where: {
      tenantId,
      isSlotBlock: false,
      status: { in: OVERDUE_SOURCE_STATUSES },
      resultRecordedAt: null,
    },
    select: { id: true, localDate: true, localTime: true },
  })

  const overdue = rows.filter((row) =>
    isSlotOverdue(row.localDate, row.localTime, today, now, utcOffsetMinutes),
  )
  return applyTransition(tx, overdue, AppointmentStatus.ResultNotRecorded)
}

/**
 * Whether a slot is past the two-hour threshold.
 *
 * A slot on a later day is not overdue however the clock is set, and a slot on an
 * earlier day always is. Only the same-day case needs the instant, and it needs it to
 * one end of the comparison only — the slot's own instant, built from the stored
 * local date and time with the tenant's offset.
 */
function isSlotOverdue(
  localDate: string,
  localTime: string,
  today: LocalDate,
  now: Date,
  utcOffsetMinutes: number,
): boolean {
  const day = localDate as LocalDate
  if (day > today) return false
  if (!isSameLocalDate(day, today)) return true

  const slot = toUtcInstant(day, timeOf(localTime), utcOffsetMinutes)
  return now.getTime() - slot.getTime() >= RESULT_OVERDUE_MINUTES * 60_000
}

/** The stored `HH:mm` as a branded `LocalTime`. The column is a plain `String`. */
function timeOf(value: string): LocalTime {
  return asLocalTime(value)
}

/**
 * Applies one transition to the rows the query selected, one statement each.
 *
 * The guard is the query's own status predicate: each pass reads exactly the states
 * the transition is legal from, and a row that moved between the read and the write is
 * a row the next sweep picks up. One statement per row rather than a bulk
 * `updateMany` because the sweep reads a small set — one tenant's outstanding rows —
 * and per-row writes keep the accounting below exact.
 */
async function applyTransition(
  tx: TransactionClient,
  rows: ReadonlyArray<{ readonly id: string }>,
  next: AppointmentStatus,
): Promise<readonly string[]> {
  if (!isSweepTransition(next)) {
    // The state machine's own answer to "may the sweep do this". Unreachable for the
    // two transitions above, and present so a third sweep transition added later has
    // to be registered in `SWEEP_TRANSITIONS` before it can run at all.
    return []
  }

  const moved: string[] = []
  for (const row of rows) {
    await tx.appointment.update({ where: { id: row.id }, data: { status: next } })
    moved.push(row.id)
  }
  return moved
}

/**
 * Runs the sweep's two passes in order.
 *
 * The order is the state machine's: promotion first, so a `BOOKED` row behind today
 * becomes `AWAITING_ARRIVAL` before the overdue pass considers it. `flagUnrecorded`
 * reads only the two arrival states, so a promoted row is one the second pass can
 * then flag — which is how a row the day has passed reaches the alarm by the alarm's
 * own rule rather than by skipping the arrival step.
 *
 * @returns the ids each pass moved, for the worker's health accounting.
 */
export async function runLifecycleSweep(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
  readonly utcOffsetMinutes: number
}): Promise<{ readonly promoted: readonly string[]; readonly flagged: readonly string[] }> {
  const promoted = await promoteToAwaitingArrival(args.tx, args.tenantId, args.now)
  const flagged = await flagUnrecordedResults(
    args.tx,
    args.tenantId,
    args.now,
    args.utcOffsetMinutes,
  )
  return { promoted, flagged }
}
