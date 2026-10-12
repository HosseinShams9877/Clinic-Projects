/**
 * Slot generation — DoD 2 and DoD 6, as properties of the arithmetic.
 */

import { describe, expect, it } from 'vitest'

import { addLocalDays, asLocalDate, type LocalDate } from '@/core/localization'

import { DEFAULT_BOOKING_SETTINGS } from '../lib/settings'
import {
  blockRanges,
  daySkeletons,
  expectedSlotCount,
  generateSlots,
  workingRange,
  type Range,
  type SlotDay,
} from '../lib/slots'

/** A clinic that works ۰۹ تا ۱۴, and a doctor who works the whole of it. */
const FULL_DAY = {
  shift: { startTime: '09:00', endTime: '14:00' },
  hours: { startTime: '09:00', endTime: '14:00' },
} as const

/** A 30-minute service, which is the step the slots are cut to. */
const THIRTY_MINUTES = 30

/** A Wednesday in ۱۴۰۵, as the anchor the week and year walks start from. */
const ANCHOR = asLocalDate('1405-01-01')

/** The settings that book holidays, so the holiday case is the one being tested. */
const BOOKING_HOLIDAYS = { ...DEFAULT_BOOKING_SETTINGS, bookingOnHolidays: true }

/** One slot-day for the fixture, with the blocks and the holiday a case varies. */
function slotDay(patch: Partial<SlotDay> = {}): SlotDay {
  return {
    doctorId: 'doctor-a',
    localDate: ANCHOR,
    durationMinutes: THIRTY_MINUTES,
    slotMinutes: null,
    blocks: [],
    isHoliday: false,
    ...FULL_DAY,
    ...patch,
  }
}

describe('workingRange', () => {
  it('is the intersection of the shift and the doctor hours', () => {
    expect(workingRange(FULL_DAY)).toEqual({ start: 540, end: 840 })
  })

  it('is null when the clinic is closed on the weekday', () => {
    expect(workingRange({ shift: null, hours: FULL_DAY.hours })).toBe(null)
  })

  it('is null when the doctor does not work the weekday', () => {
    expect(workingRange({ shift: FULL_DAY.shift, hours: null })).toBe(null)
  })

  it('is null when the doctor hours sit entirely outside the shift', () => {
    expect(
      workingRange({
        shift: { startTime: '09:00', endTime: '12:00' },
        hours: { startTime: '13:00', endTime: '17:00' },
      }),
    ).toBe(null)
  })

  it('narrows to the overlap when the doctor works part of the shift', () => {
    expect(
      workingRange({
        shift: { startTime: '09:00', endTime: '14:00' },
        hours: { startTime: '10:00', endTime: '12:00' },
      }),
    ).toEqual({ start: 600, end: 720 })
  })
})

describe('generateSlots', () => {
  it('cuts the range to the service duration, ending at the range end', () => {
    const slots = generateSlots(slotDay(), DEFAULT_BOOKING_SETTINGS)

    expect(slots.map((slot) => slot.time)).toEqual([
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    ])
    expect(slots.every((slot) => slot.durationMinutes === THIRTY_MINUTES)).toBe(true)
  })

  it('offers nothing when the clinic is closed', () => {
    expect(generateSlots(slotDay({ shift: null }), DEFAULT_BOOKING_SETTINGS)).toEqual([])
  })

  it('offers nothing when the doctor does not work the day', () => {
    expect(generateSlots(slotDay({ hours: null }), DEFAULT_BOOKING_SETTINGS)).toEqual([])
  })

  it('offers nothing on a holiday the clinic does not book', () => {
    expect(generateSlots(slotDay({ isHoliday: true }), DEFAULT_BOOKING_SETTINGS)).toEqual([])
  })

  it('offers the ordinary day on a holiday the clinic books', () => {
    expect(generateSlots(slotDay({ isHoliday: true }), BOOKING_HOLIDAYS)).toHaveLength(10)
  })

  it('marks every slot available when the day holds no block', () => {
    const slots = generateSlots(slotDay(), DEFAULT_BOOKING_SETTINGS)
    expect(slots.every((slot) => slot.available)).toBe(true)
  })

  it('removes exactly the slots a whole-duration block covers', () => {
    const slots = generateSlots(
      slotDay({ blocks: blockRanges([{ localTime: '10:00', durationMinutes: 60 }]) }),
      DEFAULT_BOOKING_SETTINGS,
    )

    expect(slots.filter((slot) => slot.available).map((slot) => slot.time)).toEqual([
      '09:00', '09:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    ])
    expect(slots.filter((slot) => !slot.available).map((slot) => slot.time)).toEqual(['10:00', '10:30'])
  })

  it('keeps a slot a block only partly covers, because the part is still bookable', () => {
    const slots = generateSlots(
      slotDay({ blocks: blockRanges([{ localTime: '10:00', durationMinutes: 45 }]) }),
      DEFAULT_BOOKING_SETTINGS,
    )
    const atTenThirty = slots.find((slot) => slot.time === '10:30')

    expect(atTenThirty?.available).toBe(true)
    expect(slots.filter((slot) => !slot.available).map((slot) => slot.time)).toEqual(['10:00'])
  })

  it('removes the whole day when a block covers the whole working range', () => {
    const slots = generateSlots(
      slotDay({ blocks: blockRanges([{ localTime: '09:00', durationMinutes: 300 }]) }),
      DEFAULT_BOOKING_SETTINGS,
    )
    expect(slots.every((slot) => !slot.available)).toBe(true)
  })

  it('ends the last slot at the range end when the duration does not divide it evenly', () => {
    const slots = generateSlots(
      slotDay({
        shift: { startTime: '09:00', endTime: '12:00' },
        hours: { startTime: '09:00', endTime: '12:00' },
        durationMinutes: 45,
      }),
      DEFAULT_BOOKING_SETTINGS,
    )

    expect(slots.map((slot) => slot.time)).toEqual(['09:00', '09:45', '10:30', '11:15'])
  })

  it('offers one slot when the range holds exactly one service', () => {
    const slots = generateSlots(
      slotDay({
        shift: { startTime: '09:00', endTime: '09:30' },
        hours: { startTime: '09:00', endTime: '09:30' },
      }),
      DEFAULT_BOOKING_SETTINGS,
    )
    expect(slots.map((slot) => slot.time)).toEqual(['09:00'])
  })

  it('produces no missing and no duplicated slot across a full year', () => {
    const range: Range = { start: 540, end: 840 }
    let cursor: LocalDate = ANCHOR
    let days = 0

    for (let index = 0; index < 365; index += 1) {
      const slots = generateSlots(
        slotDay({ localDate: cursor, blocks: [], isHoliday: false }),
        DEFAULT_BOOKING_SETTINGS,
      )
      const times = slots.map((slot) => slot.time)

      expect(new Set(times).size).toBe(times.length)
      expect(times).toHaveLength(expectedSlotCount(range, THIRTY_MINUTES))
      expect(times[0]).toBe('09:00')
      expect(times[times.length - 1]).toBe('13:30')

      days += 1
      cursor = addLocalDays(cursor, 1)
    }

    expect(days).toBe(365)
  })
})

describe('blockRanges', () => {
  it('converts a closed hour to a half-open minute range', () => {
    expect(blockRanges([{ localTime: '10:00', durationMinutes: 60 }])).toEqual([
      { start: 600, end: 660 },
    ])
  })

  it('converts each row of a closed day to its own range', () => {
    const ranges = blockRanges([
      { localTime: '09:00', durationMinutes: 30 },
      { localTime: '09:30', durationMinutes: 30 },
    ])

    expect(ranges).toEqual([
      { start: 540, end: 570 },
      { start: 570, end: 600 },
    ])
  })
})

describe('daySkeletons', () => {
  it('walks every day in the range in order, deriving the weekday', () => {
    const days = daySkeletons(ANCHOR, addLocalDays(ANCHOR, 6), 'doctor-a')

    expect(days).toHaveLength(7)
    expect(days.map((day) => day.localDate)).toEqual([
      '1405-01-01', '1405-01-02', '1405-01-03', '1405-01-04', '1405-01-05', '1405-01-06', '1405-01-07',
    ])
    expect(days.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(days.every((day) => day.doctorId === 'doctor-a')).toBe(true)
  })

  it('answers one day when the range is a single day', () => {
    expect(daySkeletons(ANCHOR, ANCHOR, 'doctor-a')).toEqual([
      { doctorId: 'doctor-a', localDate: ANCHOR, weekday: 0 },
    ])
  })
})

describe('expectedSlotCount', () => {
  it('is the range divided by the step, rounded down', () => {
    expect(expectedSlotCount({ start: 540, end: 840 }, 30)).toBe(10)
    expect(expectedSlotCount({ start: 540, end: 720 }, 45)).toBe(4)
    expect(expectedSlotCount({ start: 540, end: 570 }, 30)).toBe(1)
  })

  it('is zero when the range holds no whole slot', () => {
    expect(expectedSlotCount({ start: 540, end: 559 }, 30)).toBe(0)
  })
})