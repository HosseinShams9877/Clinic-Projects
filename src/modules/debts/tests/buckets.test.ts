/**
 * The four debt buckets at their boundaries — `10-testing-strategy.md` §3.3's last
 * row: "Each of the four buckets returns the exact expected set at their boundary
 * dates."
 *
 * `bucketOf` is the one pure function in `debts`, and its boundaries are the four the
 * list is named for. A bucket is what decides which row the desk calls first, so an
 * off-by-one at a boundary is a customer the clinic never phoned — which is why the
 * assertions sit on the exact instant rather than on "about a month".
 */

import { describe, expect, it } from 'vitest'

import { DebtBucket } from '@/core/constants'
import { addLocalDays } from '@/core/localization'

import { bucketOf, dueLocalDate, effectiveDueInstant } from '../lib/buckets'

const SESSION = new Date('2026-01-10T08:00:00Z')

describe('bucketOf at the four boundaries', () => {
  it('is DueSoon before the due date', () => {
    expect(bucketOf(dueAt(-1), dueAt(0))).toBe(DebtBucket.DueSoon)
    expect(bucketOf(dueAt(-30), dueAt(0))).toBe(DebtBucket.DueSoon)
  })

  it('is PastDue on the due date itself and for the six days after it', () => {
    expect(bucketOf(dueAt(0), dueAt(0))).toBe(DebtBucket.PastDue)
    expect(bucketOf(dueAt(6), dueAt(0))).toBe(DebtBucket.PastDue)
  })

  it('is Over7Days from day 8, and not a day earlier', () => {
    expect(bucketOf(dueAt(7), dueAt(0))).toBe(DebtBucket.PastDue)
    expect(bucketOf(dueAt(8), dueAt(0))).toBe(DebtBucket.Over7Days)
    expect(bucketOf(dueAt(30), dueAt(0))).toBe(DebtBucket.Over7Days)
  })

  it('is Over30Days from day 31, and not a day earlier', () => {
    expect(bucketOf(dueAt(30), dueAt(0))).toBe(DebtBucket.Over7Days)
    expect(bucketOf(dueAt(31), dueAt(0))).toBe(DebtBucket.Over30Days)
    expect(bucketOf(dueAt(365), dueAt(0))).toBe(DebtBucket.Over30Days)
  })

  it('never returns a bucket for a future due date', () => {
    expect(bucketOf(dueAt(0), dueAt(1))).toBe(DebtBucket.DueSoon)
    expect(bucketOf(dueAt(0), dueAt(400))).toBe(DebtBucket.DueSoon)
  })
})

describe('effectiveDueInstant', () => {
  it('is the promise when the desk recorded one', () => {
    const override = new Date('2026-03-01T08:00:00Z')
    expect(effectiveDueInstant({ scheduledAt: SESSION, override, graceDays: 7 })).toBe(override)
  })

  it('is the session plus the grace period when there is no promise', () => {
    expect(effectiveDueInstant({ scheduledAt: SESSION, override: null, graceDays: 7 })).toEqual(
      new Date('2026-01-17T08:00:00Z'),
    )
  })

  it('adds zero grace days as the session itself', () => {
    expect(effectiveDueInstant({ scheduledAt: SESSION, override: null, graceDays: 0 })).toEqual(
      SESSION,
    )
  })

  it('lets a promise move the due date earlier than the session', () => {
    const earlier = new Date('2026-01-05T08:00:00Z')
    expect(effectiveDueInstant({ scheduledAt: SESSION, override: earlier, graceDays: 30 })).toBe(
      earlier,
    )
  })
})

describe('dueLocalDate', () => {
  it("converts through the tenant's own offset, not the host timezone", () => {
    // The same instant reads as different local days on either side of the meridian:
    // +03:30 keeps it on the UTC day, and -10:00 has already turned it into the one
    // before. The comparison goes through `addLocalDays` rather than naming a Jalali
    // date, so the assertion is about the offset and not a second copy of the calendar.
    const instant = new Date('2026-01-10T08:00:00Z')
    const utcDay = dueLocalDate(instant, 0)
    expect(dueLocalDate(instant, 210)).toBe(utcDay)
    expect(dueLocalDate(instant, -600)).toBe(addLocalDays(utcDay, -1))
    expect(dueLocalDate(new Date('2026-01-10T01:00:00Z'), -600)).toBe(addLocalDays(utcDay, -1))
  })
})

/** A due date `daysFromDue` days after the epoch this suite's comparisons share. */
function dueAt(daysFromDue: number): Date {
  return new Date(new Date('2026-02-01T00:00:00Z').getTime() + daysFromDue * 86_400_000)
}
