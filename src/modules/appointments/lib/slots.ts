/**
 * Slot generation — the answer to "what times can this doctor be booked on this day".
 * (Same header as before; the change is the slot length.)
 */

import {
  addLocalDays,
  asLocalTime,
  jalaliWeekday,
  minutesToTime,
  timeToMinutes,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'

import type { BookingSettings } from './settings'

/** The facts slot generation needs for one doctor on one day. */
export interface SlotDay {
  readonly doctorId: string
  readonly localDate: LocalDate
  readonly shift: { readonly startTime: string; readonly endTime: string } | null
  readonly hours: { readonly startTime: string; readonly endTime: string } | null
  /** The service's duration, which is the *booking*'s length. */
  readonly durationMinutes: number
  /**
   * The doctor's own slot step for this weekday, when they have one.
   *
   * `null` is the default: the slot step is the service's own duration, which is the
   * pre-override behaviour. A number is the doctor's own range step, which replaces
   * the service's duration as the *step* — a 30-minute step offers slots every 30
   * minutes, and a 60-minute service booked against a 30-minute step is a booking
   * the desk confirms as shorter.
   */
  readonly slotMinutes: number | null
  readonly blocks: readonly Range[]
  readonly isHoliday: boolean
}

/** A half-open `[start, end)` range of minutes. */
export interface Range {
  readonly start: number
  readonly end: number
}

/** A generated slot: the time it starts, and the minutes it holds. */
export interface Slot {
  readonly time: LocalTime
  readonly durationMinutes: number
  readonly available: boolean
}

/** Minutes since midnight for a stored time string. */
function minutes(value: string): number {
  return timeToMinutes(asLocalTime(value))
}

/** The intersection of the clinic's shift and the doctor's hours. */
export function workingRange(day: Pick<SlotDay, 'shift' | 'hours'>): Range | null {
  if (day.shift === null || day.hours === null) return null
  const start = Math.max(minutes(day.shift.startTime), minutes(day.hours.startTime))
  const end = Math.min(minutes(day.shift.endTime), minutes(day.hours.endTime))
  return end > start ? { start, end } : null
}

/** Whether a `[start, end)` range is covered by any block. */
function isCovered(slot: Range, blocks: readonly Range[]): boolean {
  return blocks.some((block) => block.start <= slot.start && block.end >= slot.end)
}

/**
 * The slots for one day.
 *
 * The step is the doctor's own `slotMinutes` when they have one, and the service's
 * duration otherwise — the same rule the pre-override product used. The step is what
 * changes; the *end* of each slot is `start + step`, and a service longer than the
 * step is a service the booking dialog confirms as shorter (the dialog's own
 * `SHORTEN_POPUP`), not a service that quietly overruns its own slot.
 */
export function generateSlots(day: SlotDay, settings: BookingSettings): readonly Slot[] {
  if (!day.isHoliday || settings.bookingOnHolidays) {
    const range = workingRange(day)
    if (range !== null) {
      return slotsInRange(range, day)
    }
  }
  return []
}

/**
 * The slots of one working range, cut to the doctor's step.
 *
 * The step is `day.slotMinutes ?? day.durationMinutes`. The last slot is the one
 * whose *step* does not overrun `range.end`, so a range that ends mid-step drops
 * the partial step rather than offering a slot that runs past the doctor's day.
 */
function slotsInRange(range: Range, day: SlotDay): Slot[] {
  const step = day.slotMinutes ?? day.durationMinutes
  const slots: Slot[] = []
  let cursor = range.start
  while (cursor + step <= range.end) {
    const slot: Range = { start: cursor, end: cursor + step }
    slots.push({
      time: minutesToTime(cursor),
      durationMinutes: step,
      available: !isCovered(slot, day.blocks),
    })
    cursor += step
  }
  return slots
}

/** The blocks covering `localDate` for this doctor, as minute ranges. */
export function blockRanges(
  rows: ReadonlyArray<{
    readonly localTime: string
    readonly durationMinutes: number
  }>,
): readonly Range[] {
  return rows.map((row) => ({
    start: minutes(row.localTime),
    end: minutes(row.localTime) + row.durationMinutes,
  }))
}

/** One day's skeleton. */
export interface DaySkeleton {
  readonly doctorId: string
  readonly localDate: LocalDate
  readonly weekday: number
}

/** Every day in `[start, end]` as a slot-day skeleton, in order. */
export function daySkeletons(start: LocalDate, end: LocalDate, doctorId: string): readonly DaySkeleton[] {
  const days: DaySkeleton[] = []
  let cursor: LocalDate = start
  for (;;) {
    days.push({ doctorId, localDate: cursor, weekday: jalaliWeekday(cursor) })
    if (cursor === end) break
    cursor = addLocalDays(cursor, 1)
  }
  return days
}

/** The number of slots a day would have, for the DoD 2 invariant. */
export function expectedSlotCount(range: Range, durationMinutes: number): number {
  return Math.floor((range.end - range.start) / durationMinutes)
}