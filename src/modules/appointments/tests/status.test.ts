/**
 * The 8-state lifecycle's transition relation — DoD 1, asserted and not eyeballed.
 *
 * `10-testing-strategy.md` §3.1 names the state machine as one of the three things a
 * wrong answer is silent on, which is why the relation is exercised as a table rather
 * than as a handful of transitions a reader has to trust. The two questions the table
 * answers are the two the module's own header states:
 *
 * - every one of the 8 states is *reachable*, so no state is a label nothing can put
 *   a row into;
 * - every transition the table does not name is refused, so the relation is the closed
 *   set the guard treats it as.
 *
 * The suite is pure — no database — because the relation is a fact about the table and
 * not about a row, and the file under test holds no other behaviour.
 */

import { describe, expect, it } from 'vitest'

import { AppointmentStatus } from '@/core/constants'

import {
  APPOINTMENT_TRANSITIONS,
  canTransition,
  CARTABLE_STATUSES,
  isSweepTransition,
  isTerminal,
  SWEEP_TRANSITIONS,
  TERMINAL_STATUSES,
} from '../lib/status'

/** Every status the constants hold, so a state the table forgot is a failure here. */
const ALL_STATUSES = Object.values(AppointmentStatus) as AppointmentStatus[]

describe('APPOINTMENT_TRANSITIONS', () => {
  it('covers every status the constants hold, so none is unreachable by construction', () => {
    expect(new Set(Object.keys(APPOINTMENT_TRANSITIONS))).toEqual(new Set(ALL_STATUSES))
  })

  it('reaches every one of the 8 states from at least one source', () => {
    // DoD 1's first half. `BOOKED` is the state a create writes, so it is reached by
    // the booking path rather than by a transition; the other seven each need a row
    // in the table that names them as a target.
    const reachable = new Set<AppointmentStatus>()
    for (const targets of Object.values(APPOINTMENT_TRANSITIONS)) {
      for (const next of targets) reachable.add(next)
    }
    reachable.add(AppointmentStatus.Booked)

    expect(reachable).toEqual(new Set(ALL_STATUSES))
    expect(ALL_STATUSES).toHaveLength(8)
  })

  it('names only terminal states as sources with no targets', () => {
    // The four closed states are the four with an empty row; a fifth empty row would be
    // a state the model closes and the document does not name.
    const closed = Object.entries(APPOINTMENT_TRANSITIONS)
      .filter(([, targets]) => targets.length === 0)
      .map(([from]) => from as AppointmentStatus)

    expect(closed.sort()).toEqual([...TERMINAL_STATUSES].sort())
  })
})

describe('canTransition', () => {
  it('permits the transitions the document states', () => {
    expect(canTransition(AppointmentStatus.Booked, AppointmentStatus.AwaitingArrival)).toBe(true)
    expect(canTransition(AppointmentStatus.AwaitingArrival, AppointmentStatus.Arrived)).toBe(true)
    expect(canTransition(AppointmentStatus.Arrived, AppointmentStatus.Completed)).toBe(true)
    expect(canTransition(AppointmentStatus.ResultNotRecorded, AppointmentStatus.Completed)).toBe(true)
  })

  it('refuses every transition the table does not name', () => {
    // DoD 1's second half, as a full sweep: every (from, to) pair the table holds is
    // one pair, and every other pair is a refusal. The terminal states are the ones
    // where the refusal is the whole row.
    const permitted = new Set<string>()
    for (const [from, targets] of Object.entries(APPOINTMENT_TRANSITIONS)) {
      for (const next of targets) permitted.add(`${from}->${next}`)
    }

    for (const from of ALL_STATUSES) {
      for (const next of ALL_STATUSES) {
        const pair = `${from}->${next}`
        expect(canTransition(from, next)).toBe(permitted.has(pair))
      }
    }
  })

  it('does not let a booking skip the awaiting step', () => {
    // `BOOKED` never goes straight to a state the desk records on the day, which is
    // what keeps a result being entered for a day that has not happened.
    expect(canTransition(AppointmentStatus.Booked, AppointmentStatus.Arrived)).toBe(false)
    expect(canTransition(AppointmentStatus.Booked, AppointmentStatus.Completed)).toBe(false)
    expect(canTransition(AppointmentStatus.Booked, AppointmentStatus.NoShow)).toBe(false)
  })

  it('refuses a transition out of a terminal state, including RESCHEDULED', () => {
    for (const terminal of TERMINAL_STATUSES) {
      for (const next of ALL_STATUSES) {
        expect(canTransition(terminal, next)).toBe(false)
      }
    }
  })
})

describe('isTerminal', () => {
  it('answers true for the four closed states and false for the four live ones', () => {
    for (const terminal of TERMINAL_STATUSES) expect(isTerminal(terminal)).toBe(true)
    for (const live of ALL_STATUSES.filter((status) => !TERMINAL_STATUSES.includes(status))) {
      expect(isTerminal(live)).toBe(false)
    }
  })
})

describe('isSweepTransition', () => {
  it('admits exactly the two transitions no person performs', () => {
    expect(SWEEP_TRANSITIONS).toHaveLength(2)
    expect(isSweepTransition(AppointmentStatus.AwaitingArrival)).toBe(true)
    expect(isSweepTransition(AppointmentStatus.ResultNotRecorded)).toBe(true)

    for (const status of ALL_STATUSES) {
      if (!SWEEP_TRANSITIONS.includes(status)) expect(isSweepTransition(status)).toBe(false)
    }
  })
})

describe('CARTABLE_STATUSES', () => {
  it('holds the three states the reception cartable works', () => {
    // `03-data-model.md` §2.2: the cartable is the alarm plus the arrivals the desk is
    // expected to mark. `RESULT_NOT_RECORDED` is on the list and on no grid query.
    expect(CARTABLE_STATUSES).toContain(AppointmentStatus.ResultNotRecorded)
    expect(CARTABLE_STATUSES).toContain(AppointmentStatus.AwaitingArrival)
    expect(CARTABLE_STATUSES).toContain(AppointmentStatus.Arrived)
    expect(CARTABLE_STATUSES).not.toContain(AppointmentStatus.Booked)
  })
})
