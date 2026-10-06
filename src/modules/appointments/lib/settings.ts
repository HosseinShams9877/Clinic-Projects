/**
 * The tenant's booking settings — which mode the clinic uses, and the toggles that
 * gate two of the booking surfaces.
 *
 * `03-data-model.md` §6 puts these in the tenant's settings row ("In the tenant's
 * settings row, in the database"), and nothing else reads them, so this file is the
 * one place a booking decision asks "what does this clinic do". Two consequences
 * follow from that, and both are enforced here:
 *
 * - **Every default is named, and every one is the document's.** `FIXED_SLOT` is the
 *   mode a clinic that never opened settings gets (`06-constants.md` §4.4), and the
 *   two toggles are `TOGGLE_DEFAULTS` — the same defaults `roles-permissions` owns,
 *   reached through that module's barrel rather than restated here. A second copy of
 *   a toggle default is a copy that will disagree with the matrix's copy.
 * - **A setting that is not a valid member of its set is the default, not an
 *   error.** The column is a plain `String` on both engines (`03-data-model.md` §5),
 *   so a value written by a release this one does not know is a real possibility,
 *   and the fail-safe answer for a booking question is the clinic's documented
 *   behaviour, not a refusal to answer.
 *
 * ## Why the toggles are read here and not in the permission primitive
 *
 * `04-roles-permissions.md` §4 is explicit that a toggle "says how much authority
 * they have *inside* the page", and not whether they may be on it — so `can()` does
 * not read them and they do not travel on `TenantContext`. The booking path reads
 * them the same way it reads the mode, from the settings row, and decides a *shape*
 * rather than an access: whether the doctor gets the quick-book shortcut, and
 * whether a holiday is a bookable day.
 */

import {
  BookingMode,
  isMember,
} from '@/core/constants'
import { DEFAULT_CLINIC_UTC_OFFSET_MINUTES } from '@/core/constants'
import { TOGGLE_DEFAULTS, Toggle, type Toggle as ToggleKey } from '@/modules/roles-permissions'

import type { TransactionClient } from '@/core/db/scope'

/**
 * The booking settings, resolved for one tenant.
 *
 * Frozen, because the booking path holds this for the duration of one request and a
 * caller that mutated it would be changing the clinic's configuration mid-booking.
 */
export interface BookingSettings {
  /** `06-constants.md` §4.4 — which of the three ways a booking is made. */
  readonly mode: BookingMode
  /** Toggle 1 — whether a doctor may book a slot for themselves. */
  readonly doctorSelfBooking: boolean
  /**
   * Toggle 7 — whether a holiday is bookable. Off by default, which is the
   * specification's own recommendation and the reason the holiday check is a check
   * at all: with the toggle on, holidays are ordinary days.
   */
  readonly bookingOnHolidays: boolean
  /**
   * Toggle 6 — whether online booking may be made without the service's deposit.
   * Off by default, so a clinic that wants the deposit collected up front keeps its
   * requirement, and the public booking that cannot collect one is refused rather
   * than silently booking a deposit the clinic never received.
   */
  readonly onlineBookingNoDeposit: boolean
  /** `TenantSettings.utcOffsetMinutes`, for the instant a booking stores. */
  readonly utcOffsetMinutes: number
}

/** The settings a tenant that has never configured anything gets. */
export const DEFAULT_BOOKING_SETTINGS: BookingSettings = Object.freeze({
  mode: BookingMode.FixedSlot,
  doctorSelfBooking: TOGGLE_DEFAULTS[Toggle.DoctorSelfBooking],
  bookingOnHolidays: TOGGLE_DEFAULTS[Toggle.BookingOnHolidays],
  onlineBookingNoDeposit: TOGGLE_DEFAULTS[Toggle.OnlineBookingNoDeposit],
  utcOffsetMinutes: DEFAULT_CLINIC_UTC_OFFSET_MINUTES,
})

/** The column the mode is stored in, named once so a rename touches one string. */
const SETTINGS_SELECT = {
  bookingMode: true,
  toggles: true,
  utcOffsetMinutes: true,
} as const

/**
 * The tenant's booking settings, or the documented defaults when the row is absent
 * or carries a value this release does not recognise.
 *
 * Takes the transaction the caller already opened: a booking reads the settings and
 * writes the appointment inside one transaction, and reading them through a second
 * client would be a read outside the scope the booking writes under.
 */
export async function readBookingSettings(
  tx: TransactionClient,
  tenantId: string,
): Promise<BookingSettings> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: SETTINGS_SELECT,
  })

  if (row === null) return DEFAULT_BOOKING_SETTINGS

  return Object.freeze({
    ...DEFAULT_BOOKING_SETTINGS,
    mode: modeOrDefault(row.bookingMode),
    doctorSelfBooking: toggleOrDefault(row.toggles, Toggle.DoctorSelfBooking),
    bookingOnHolidays: toggleOrDefault(row.toggles, Toggle.BookingOnHolidays),
    onlineBookingNoDeposit: toggleOrDefault(row.toggles, Toggle.OnlineBookingNoDeposit),
    utcOffsetMinutes: row.utcOffsetMinutes,
  })
}

/**
 * The stored mode when it is one of the three, else the default.
 *
 * `isMember` is the same narrowing every other closed set in the product uses, and
 * the fall-through is the point: a mode string this release does not know answers
 * the question with the clinic's documented default rather than with an exception
 * in the middle of a booking.
 */
function modeOrDefault(stored: string | null): BookingMode {
  if (stored !== null && isMember(BookingMode, stored)) return stored
  return BookingMode.FixedSlot
}

/**
 * One toggle out of the stored blob, or its documented default.
 *
 * The blob is JSON in a `String` column (`03-data-model.md` §5) — `unknown` until it
 * is narrowed, and narrowed here rather than by the caller for the same reason the
 * mode is: a malformed column is a possibility the code has to have an answer for,
 * and the answer is the default the specification shipped.
 */
function toggleOrDefault(stored: string | null, key: ToggleKey): boolean {
  if (stored === null) return TOGGLE_DEFAULTS[key]
  try {
    const parsed: unknown = JSON.parse(stored) as unknown
    if (parsed === null || typeof parsed !== 'object') return TOGGLE_DEFAULTS[key]
    const value: unknown = (parsed as Record<string, unknown>)[key]
    return typeof value === 'boolean' ? value : TOGGLE_DEFAULTS[key]
  } catch {
    return TOGGLE_DEFAULTS[key]
  }
}

/**
 * Whether the clinic books this holiday at all.
 *
 * The toggle is the whole answer; the holiday row is only the fact that the day is
 * one. Kept here so the two callers that ask — slot generation and the booking
 * guard — cannot disagree about which one applies.
 */
export function clinicBooksHoliday(settings: BookingSettings, isHoliday: boolean): boolean {
  if (!isHoliday) return true
  return settings.bookingOnHolidays
}
