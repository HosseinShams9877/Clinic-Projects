/**
 * `04-roles-permissions.md` §4 — the eight behavioral toggles.
 *
 * The toggles are constants, so most of what there is to get wrong is a value typed
 * wrong or an order changed. The two assertions that matter are therefore the two
 * the document actually states: the **numbered order** of the eight rows, and the
 * **default** of each. §4 writes the defaults as two lists «روشن: ۱، ۳، ۴، ۸» and
 * «خاموش: ۲، ۵، ۶، ۷», and those lists are reproduced here as positions rather than
 * as a copy of the record — so a default flipped in the source fails against §4's
 * numbering and not against itself.
 *
 * The toggle identifiers are this repository's (`lib/toggles.ts` records that §4
 * names no code for any row). Their order is not: it is §4's.
 */

import { describe, expect, it } from 'vitest'

import { Permission } from '@/core/constants'

import { TOGGLES, TOGGLE_DEFAULTS, Toggle, isToggle } from '../index'

/** §4's «روشن» rows, by their number in the table. */
const ON_BY_DEFAULT = [1, 3, 4, 8]

/** §4's «خاموش» rows. Together with the list above this is all eight. */
const OFF_BY_DEFAULT = [2, 5, 6, 7]

/** §4's table, row by row. */
const ROWS: [number, Toggle][] = [
  [1, Toggle.DoctorSelfBooking],
  [2, Toggle.DoctorCloseOwnHours],
  [3, Toggle.SecretaryDiscount],
  [4, Toggle.SecretaryMoveDueDate],
  [5, Toggle.SecretaryEditPrice],
  [6, Toggle.OnlineBookingNoDeposit],
  [7, Toggle.BookingOnHolidays],
  [8, Toggle.AutoLeadFromSiteForm],
]

describe('§4 the eight toggles', () => {
  it('holds exactly eight', () => {
    expect(TOGGLES).toHaveLength(8)
    expect(Object.keys(TOGGLE_DEFAULTS)).toHaveLength(8)
  })

  it('is in §4’s numbered order', () => {
    // §4 numbers the table, `admin/settings.html` renders the rows in it, and the
    // settings screen's tab order follows. A set would lose the sequence and a
    // reordering would be invisible in review.
    expect(TOGGLES).toEqual(ROWS.map(([, toggle]) => toggle))
  })

  it('has a distinct code for every row', () => {
    expect(new Set(TOGGLES).size).toBe(8)
  })

  it.each([...ROWS])('defaults row %i to §4’s mark', (number, toggle) => {
    const expected = ON_BY_DEFAULT.includes(number)
    const off = OFF_BY_DEFAULT.includes(number)

    // Every row is on exactly one of §4's two lists, so a row that drifts out of
    // both is caught here rather than defaulting quietly to false.
    expect(expected || off).toBe(true)
    expect(TOGGLE_DEFAULTS[toggle]).toBe(expected)
  })

  it('holds four on and four off', () => {
    const on = TOGGLES.filter((toggle) => TOGGLE_DEFAULTS[toggle])

    expect(on).toHaveLength(4)
    expect(ON_BY_DEFAULT).toHaveLength(4)
    expect(OFF_BY_DEFAULT).toHaveLength(4)
  })

  it('cannot be mutated through the record it is exported as', () => {
    // A default is a decision about the clinic's risk — §4 gives a reason for each
    // toggle that is off — so the value a screen reads must not be writable.
    expect(Object.isFrozen(TOGGLE_DEFAULTS)).toBe(true)
  })
})

describe('isToggle', () => {
  it.each([...TOGGLES])('accepts %s', (toggle) => {
    expect(isToggle(toggle)).toBe(true)
  })

  it.each([
    ['a permission slug', Permission.ManageUsers],
    ['an empty string', ''],
    ['a number', 1],
    ['null', null],
    ['undefined', undefined],
    ['an object', { toggle: Toggle.SecretaryDiscount }],
    ['a lower-cased code', 'secretary_discount'],
  ])('rejects %s', (_label, value) => {
    // The value arrives from a JSON column that the database does not validate
    // (`03-data-model.md` §5: "the database does not enforce it; tests do"), so this
    // is the boundary that narrows it. `secretary_discount` is here because case is
    // the mistake a hand-edited row is most likely to contain, and `isMember` is
    // exact rather than case-folding — the stored form is the constant.
    expect(isToggle(value)).toBe(false)
  })
})
