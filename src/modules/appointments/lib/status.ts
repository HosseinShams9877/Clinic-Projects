/**
 * The 8-state lifecycle of `03-data-model.md` §2.2 — which transition is legal, and
 * the one table that says so.
 *
 * The specification's table states *when* each state is entered and *by whom*; it
 * does not spell out the full transition relation, and reading it naively would
 * make everything legal that is not explicitly forbidden. This file is that
 * relation, and DoD 1 — "all 8 states are reachable and every illegal transition is
 * refused — asserted, not eyeballed" — is the reason it is the first file in the
 * module: every other file here asks `assertTransition()` before it writes a
 * status, so a transition this table does not name is a transition nobody can make.
 *
 * ## The relation, as the document states it
 *
 * | From | To | Who |
 * |---|---|---|
 * | — | `BOOKED` | the booking itself (§2.2: "appointment created") |
 * | `BOOKED` | `AWAITING_ARRIVAL` | the sweep, when the day arrives |
 * | `BOOKED` | `CANCELLED` | منشی or the customer |
 * | `BOOKED` | `RESCHEDULED` | either |
 * | `AWAITING_ARRIVAL` | `ARRIVED` | منشی |
 * | `AWAITING_ARRIVAL` | `NO_SHOW` | منشی |
 * | `AWAITING_ARRIVAL` | `CANCELLED` | منشی or the customer |
 * | `AWAITING_ARRIVAL` | `RESCHEDULED` | either |
 * | `AWAITING_ARRIVAL` | `RESULT_NOT_RECORDED` | the sweep, two hours past |
 * | `ARRIVED` | `COMPLETED` | پزشک یا منشی |
 * | `ARRIVED` | `NO_SHOW` | منشی — arrived, but the doctor did not |
 * | `ARRIVED` | `RESULT_NOT_RECORDED` | the sweep — arrival was recorded, the result was not |
 * | `RESULT_NOT_RECORDED` | `COMPLETED` | the late result, recorded from the cartable |
 * | `RESULT_NOT_RECORDED` | `NO_SHOW` | منشی, closing the alarm |
 * | `RESULT_NOT_RECORDED` | `CANCELLED` | منشی |
 *
 * ## What the table deliberately does not permit
 *
 * `COMPLETED`, `NO_SHOW`, `CANCELLED` and `RESCHEDULED` are **terminal**. Nothing
 * leaves them. `RESCHEDULED` in particular is not "the appointment moved" — it is
 * "this row is closed and a new row carries the booking", which is why the schema
 * has `rescheduledToId` and not a `newTime` column. A transition out of it would
 * resurrect a row the model has already replaced.
 *
 * `BOOKED` never goes straight to `ARRIVED`, `COMPLETED` or `NO_SHOW`. The
 * `AWAITING_ARRIVAL` step is the specification's, not a courtesy: it is the state
 * the day grid shows for "this person is expected", and skipping it means an
 * appointment that was booked five minutes ago can be marked done — which is also
 * the shape that would let a result be recorded for a day that has not happened.
 *
 * ## Why the sweep's own transitions are in this table
 *
 * The worker does not ask permission (`09-security.md` §8), so it has no
 * `requirePermission` gate. What it has instead is the same relation a person's
 * transition goes through: the sweep calls `assertTransition` with the automatic
 * flag, and a state that is not on the automatic list is a state the sweep cannot
 * reach. That is what keeps the worker from completing an appointment a person
 * never recorded.
 */

import { AppointmentStatus, type AppointmentStatus as Status } from '@/core/constants'
import { DomainError } from '@/core/types'

import { MESSAGES, type AppointmentsMessageKey } from '../catalog'

/**
 * Every transition the lifecycle permits.
 *
 * The keys are read from `AppointmentStatus` rather than listed, so a status added
 * to the constants without a row here is a status nothing can reach — and the
 * `APPOINTMENT_TRANSITIONS` record below is `Record<Status, readonly Status[]>`,
 * which makes a missing *from*-state a compile error.
 */
export const APPOINTMENT_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = Object.freeze({
  BOOKED: [
    AppointmentStatus.AwaitingArrival,
    AppointmentStatus.Cancelled,
    AppointmentStatus.Rescheduled,
  ],
  AWAITING_ARRIVAL: [
    AppointmentStatus.Arrived,
    AppointmentStatus.NoShow,
    AppointmentStatus.Cancelled,
    AppointmentStatus.Rescheduled,
    AppointmentStatus.ResultNotRecorded,
  ],
  ARRIVED: [
    AppointmentStatus.Completed,
    AppointmentStatus.NoShow,
    AppointmentStatus.ResultNotRecorded,
  ],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
  RESCHEDULED: [],
  RESULT_NOT_RECORDED: [
    AppointmentStatus.Completed,
    AppointmentStatus.NoShow,
    AppointmentStatus.Cancelled,
  ],
})

/**
 * The states no transition leaves (`03-data-model.md` §2.2 — a completed, cancelled,
 * no-show or rescheduled row is closed, and its facts do not move).
 */
export const TERMINAL_STATUSES: readonly Status[] = Object.freeze([
  AppointmentStatus.Completed,
  AppointmentStatus.NoShow,
  AppointmentStatus.Cancelled,
  AppointmentStatus.Rescheduled,
])

/**
 * The two states only the lifecycle sweep writes.
 *
 * `BOOKED` is also automatic in the sense that booking sets it, but it is the state
 * a *create* starts from rather than a transition's target, so the sweep's own
 * table is the two: `AWAITING_ARRIVAL` on the day, `RESULT_NOT_RECORDED` two hours
 * past. `06-constants.md` §4.3 groups `BOOKED` with the automatic four because of
 * who writes it, and `AUTOMATIC_APPOINTMENT_STATUSES` is that grouping; this array
 * is the narrower question "which transition may the sweep perform".
 */
export const SWEEP_TRANSITIONS: readonly Status[] = Object.freeze([
  AppointmentStatus.AwaitingArrival,
  AppointmentStatus.ResultNotRecorded,
])

/**
 * The states the reception cartable shows as actionable — the alarm half of §2.2's
 * "it is a self-raised alarm", plus the arrivals a receptionist is expected to
 * mark. A status not on this list is not work the desk owes anyone.
 */
export const CARTABLE_STATUSES: readonly Status[] = Object.freeze([
  AppointmentStatus.AwaitingArrival,
  AppointmentStatus.Arrived,
  AppointmentStatus.ResultNotRecorded,
])

/**
 * Whether the transition from `current` to `next` is legal.
 *
 * Falls through to `false` for a `current` the table has no row for. The column is a
 * plain `String` (`03-data-model.md` §5), so a status written by a release this one
 * does not know can reach this function, and the fail-closed answer is the refusal —
 * a status the release cannot name is a status it has no business moving.
 */
export function canTransition(current: Status, next: Status): boolean {
  return (APPOINTMENT_TRANSITIONS[current] ?? []).includes(next)
}

/** Whether `status` is one no transition leaves. */
export function isTerminal(status: Status): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/**
 * Whether the lifecycle sweep may perform the transition.
 *
 * A person's transitions and the sweep's share one relation; this is the half of it
 * that a machine is allowed to use. `09-security.md` §8 is why the distinction is
 * worth a function rather than a flag the caller passes: the sweep has no user, so
 * the constraint that keeps it in its lane has to live in the state machine itself.
 */
export function isSweepTransition(next: Status): boolean {
  return SWEEP_TRANSITIONS.includes(next)
}

/**
 * The transition guard every status write goes through.
 *
 * @throws DomainError — the row is in a state the caller cannot move from. A
 * `DomainError` and not a `ValidationError`: the input the user supplied was
 * perfectly good, and it is the *record* that refuses, which is also why the
 * sentence the catalog raises names the record's state and not the user's form.
 */
export function assertTransition(current: Status, next: Status): void {
  if (canTransition(current, next)) return

  throw new DomainError(
    `An appointment in ${current} cannot move to ${next}. The legal targets from ${current} are ` +
      `${APPOINTMENT_TRANSITIONS[current].join(', ') || 'none — the state is terminal'}.`,
    {
      messageKey: 'appointment.illegalTransition' satisfies AppointmentsMessageKey,
      messageParams: { current, next },
      detail: { current, next, legal: APPOINTMENT_TRANSITIONS[current] },
    },
  )
}
