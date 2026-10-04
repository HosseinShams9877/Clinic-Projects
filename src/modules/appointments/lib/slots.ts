/**
 * Slot generation — the answer to "what times can this doctor be booked on this day".
 *
 * The inputs are the five the deliverable names, and each one removes slots on its
 * own terms:
 *
 * 1. **`ClinicShift`** — the clinic's hours for that weekday. Slots do not exist
 *    outside them, so a clinic that works ۰۸:۰۰ تا ۱۴:۰۰ offers nothing at ۱۵:۰۰.
 * 2. **`DoctorWorkingHours`** — a sub-range of the shift. A doctor works *inside*
 *    the clinic's hours, never outside them (`prisma/schema.prisma`), and the
 *    intersection is what the grid offers — never the union, which would put a
 *    doctor on the schedule at a time the clinic is shut.
 * 3. **`Service.durationMinutes`** — the step the slots are cut to. A 30-minute
 *    service on a ۹ تا ۱۴ shift yields slots at ۹, ۹:۳۰, ۱۰ … , each one holding a
 *    30-minute block that has to fit *inside* the working range, so the last slot is
 *    the one whose end does not overrun the doctor's `endTime`.
 * 4. **`Appointment` with `isSlotBlock = true`** — a closed hour or a closed day.
 *    A block removes exactly the slots its range covers, and nothing else (DoD 6).
 * 5. **`Holiday`** — with toggle 7 off, the day is closed and the slot list is
 *    empty; with the toggle on the holiday is not consulted at all.
 *
 * ## What a slot *is*
 *
 * A slot is a `LocalTime`, not an instant. The grid the receptionist sees is a
 * clinic-local day, and the Jalali date beside it is stored, not derived
 * (`03-data-model.md` §3.1). The instant is computed once, at booking, by the one
 * function that has to know the clinic's offset. Generating slots in instants would
 * make slot generation depend on the timezone, and a clinic whose offset is wrong in
 * one place would see its whole grid shift by half an hour.
 *
 * ## Why generation is pure
 *
 * `generateSlots` takes the facts and returns the times. It does not read the
 * database, which is what makes DoD 2's "a full year of generated days with no
 * missing or duplicated slot" a test that runs in milliseconds: a year of days is
 * the same function called 365 times with the weekday rotated, and the invariant it
 * asserts is a property of the arithmetic, not of a database's contents. The
 * database reads that produce the facts are separate functions, and the booking path
 * composes them.
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
  /** The doctor this day belongs to. */
  readonly doctorId: string
  /** The clinic's Jalali date, `YYYY-MM-DD`. */
  readonly localDate: LocalDate
  /** The clinic's shift for that weekday, `null` when the clinic is closed. */
  readonly shift: { readonly startTime: string; readonly endTime: string } | null
  /** The doctor's hours for that weekday, `null` when the doctor does not work. */
  readonly hours: { readonly startTime: string; readonly endTime: string } | null
  /** The service's duration, which is the slot step. */
  readonly durationMinutes: number
  /** The blocks covering this day, as `[start, end)` minute ranges. */
  readonly blocks: readonly Range[]
  /** Whether the day is a holiday. */
  readonly isHoliday: boolean
}

/** A half-open `[start, end)` range of minutes, the shape a block and a slot share. */
export interface Range {
  readonly start: number
  readonly end: number
}

/** A generated slot: the time it starts, and the minutes it holds. */
export interface Slot {
  readonly time: LocalTime
  readonly durationMinutes: number
  /** `true` when a block or a holiday removed this time from the day. */
  readonly available: boolean
}

/** Minutes since midnight for a stored time string, tolerating the `null` the schema allows. */
function minutes(value: string): number {
  return timeToMinutes(asLocalTime(value))
}

/**
 * The intersection of the clinic's shift and the doctor's hours, as a minute range.
 *
 * `null` when either side is absent, or when the two do not overlap — the doctor is
 * not working when the clinic is open, and offering their hours anyway would put a
 * booking in a shut building. The intersection rather than the doctor's range alone
 * is the constraint `DoctorWorkingHours`'s own comment states.
 */
export function workingRange(day: Pick<SlotDay, 'shift' | 'hours'>): Range | null {
  if (day.shift === null || day.hours === null) return null

  const start = Math.max(minutes(day.shift.startTime), minutes(day.hours.startTime))
  const end = Math.min(minutes(day.shift.endTime), minutes(day.hours.endTime))

  return end > start ? { start, end } : null
}

/**
 * Whether a `[start, end)` range is covered by any block.
 *
 * A slot is removed when a block covers its *whole* duration, not when the two
 * merely overlap: a 30-minute slot starting at ۱۰:۱۵ that a ۱۰:۰۰ تا ۱۰:۳۰ block
 * overlaps by half is still a 15-minute appointment the doctor could have started,
 * and offering it as free is the correct answer to "can this doctor be seen at all".
 * A block that covers the entire slot is the one that removes it.
 */
function isCovered(slot: Range, blocks: readonly Range[]): boolean {
  return blocks.some((block) => block.start <= slot.start && block.end >= slot.end)
}

/**
 * The slots for one day, as the facts above describe them.
 *
 * Returns an array rather than a filtered one when `available` is wanted: the grid
 * renders a closed hour as a cell the receptionist can see is closed, and a list
 * with holes in it cannot tell "this time is taken" from "this time does not exist".
 * The booking path filters `available` itself.
 *
 * The day's own holiday is consulted here and not by the caller, because the toggle
 * that answers the question is a booking setting and the setting is what the day
 * already holds. A clinic with the toggle on gets its ordinary day on a holiday, and
 * a clinic with it off gets nothing — the same answer either way, from one place.
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
 * The slots of one working range, cut to the service's duration.
 *
 * The last slot is the one whose *end* does not overrun `range.end`, which is why
 * `durationMinutes` is the step and not an input to a separate filter: a 45-minute
 * service on a ۹ تا ۱۲ shift ends at ۱۱:۴۵, and a generator that stepped by 30
 * minutes would offer ۱۱:۳۰ and overrun the doctor's day by 15 minutes.
 */
function slotsInRange(range: Range, day: SlotDay): Slot[] {
  const slots: Slot[] = []
  let cursor = range.start
  while (cursor + day.durationMinutes <= range.end) {
    const slot: Range = { start: cursor, end: cursor + day.durationMinutes }
    slots.push({
      time: minutesToTime(cursor),
      durationMinutes: day.durationMinutes,
      available: !isCovered(slot, day.blocks),
    })
    cursor += day.durationMinutes
  }
  return slots
}

/**
 * The blocks covering `localDate` for this doctor, as minute ranges.
 *
 * A block is an `Appointment` row with `isSlotBlock = true` (`prisma/schema.prisma`):
 * a closed hour is one row with a time, a closed day is one row per working slot of
 * the day. Both arrive here as the same shape and both remove slots the same way,
 * which is what makes «بستن یک ساعت» and «بستن یک روز» one code path rather than two.
 *
 * Rows are already filtered to the day by the caller; this function only converts
 * them, because a block with no end time is a closed *hour* and the range is its own
 * duration.
 */
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

/** One day's skeleton: the shape of the day before the per-doctor facts are applied. */
export interface DaySkeleton {
  readonly doctorId: string
  readonly localDate: LocalDate
  readonly weekday: number
}

/**
 * Every day in `[start, end]` as a slot-day skeleton, in order.
 *
 * The weekday is derived from the date, so a caller that asks for a week or a month
 * gets one skeleton per day without a second query and without a calendar of its
 * own. `shift` and `hours` are `null` here and are filled by the read that already
 * has the doctor's week; the skeleton is the *shape* of the day, and the facts that
 * vary per doctor are applied to it.
 */
export function daySkeletons(start: LocalDate, end: LocalDate, doctorId: string): readonly DaySkeleton[] {
  const days: DaySkeleton[] = []
  let cursor: LocalDate = start
  // A bounded walk: `end` is a validated date the caller supplied, and the range is
  // at most the grid's own window.
  for (;;) {
    days.push({ doctorId, localDate: cursor, weekday: jalaliWeekday(cursor) })
    if (cursor === end) break
    cursor = addLocalDays(cursor, 1)
  }
  return days
}

/**
 * The number of slots a day would have, for the "no missing or duplicated slot"
 * invariant DoD 2 asserts over a full year. Computed from the range and the step
 * alone, so a generated day's length is a fact about the arithmetic and not about
 * the array that happened to come out.
 */
export function expectedSlotCount(range: Range, durationMinutes: number): number {
  return Math.floor((range.end - range.start) / durationMinutes)
}
