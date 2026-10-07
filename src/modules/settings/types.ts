/**
 * The shapes of the settings surface's six tabs.
 *
 * Each tab is one read and one write against the tenant's own row and the tables
 * that hang off it, and the six are kept separate because they are six different
 * responsibilities — the identity a customer sees, the way bookings are made, the
 * clinic's hours, the cycle engine's defaults, everything the messaging layer says,
 * and the eight authorities of `04-roles-permissions.md` §4.
 */

import type {
  AutomaticMessageKind,
  BookingMode,
  Channel,
  DepositRefundPolicy,
} from '@/core/constants'
import type { LocalDate, LocalTime } from '@/core/localization'
import type { Toggle } from '@/modules/roles-permissions'

/** The six tabs of `admin/settings.html`, keyed as the page's `?tab=` names them. */
export const SettingsTab = {
  Identity: 'identity',
  Booking: 'booking',
  WorkingHours: 'working-hours',
  Cycle: 'cycle',
  Messages: 'messages',
  Options: 'options',
} as const
export type SettingsTab = (typeof SettingsTab)[keyof typeof SettingsTab]

/** The six, in the order the page renders them. */
export const SETTINGS_TABS = [
  SettingsTab.Identity,
  SettingsTab.Booking,
  SettingsTab.WorkingHours,
  SettingsTab.Cycle,
  SettingsTab.Messages,
  SettingsTab.Options,
] as const satisfies readonly SettingsTab[]

/** «اطلاعات کلینیک» — the name and the address a customer and the site show. */
export interface IdentitySettings {
  readonly tenantName: string
  /** The primary clinic's own name, which is what a branch's patients see. */
  readonly clinicName: string
  readonly phone: string | null
  readonly address: string | null
}

/**
 * The appointment lifecycle timings the «نوبتدهی» tab owns.
 *
 * Stored as the `appointmentSettings` blob, so a value the column does not hold is
 * the documented default rather than an error — the same contract every other
 * settings blob in the product keeps.
 */
export interface AppointmentTimings {
  /** The length of the slot the grid offers, in minutes. */
  readonly slotDurationMinutes: number
  /** How long before a session the automatic reminder is queued, in hours. */
  readonly reminderLeadHours: number
  /** How long a booked slot is held before it is released, in minutes. */
  readonly bookingHoldMinutes: number
}

/** «نوبتدهی» — the booking mode, the lifecycle timings and the two payment policy values. */
export interface BookingSettings {
  readonly mode: BookingMode
  readonly timings: AppointmentTimings
  /** «سقف تخفیف منشی» — NULL is no ceiling, which is no discount. */
  readonly secretaryDiscountCap: bigint | null
  /** §4.4's policy — NULL is no refund until the manager sets one. */
  readonly depositRefundPolicy: DepositRefundPolicy | null
}

/** One of the clinic's weekly shifts, as the «ساعات کاری» tab renders it. */
export interface ShiftRow {
  readonly id: string
  /** ۰–۶, Saturday first (`06-constants.md`). */
  readonly weekday: number
  readonly startTime: LocalTime
  readonly endTime: LocalTime
}

/** One clinic holiday, as the same tab renders it. */
export interface HolidayRow {
  readonly id: string
  readonly localDate: LocalDate
  readonly title: string
  readonly isOfficial: boolean
}

/** «ساعات کاری» — the clinic's weekly shifts and its holidays. */
export interface WorkingHoursSettings {
  readonly shifts: readonly ShiftRow[]
  readonly holidays: readonly HolidayRow[]
}

/**
 * «چرخه درمان» — the two settings `04-roles-permissions.md` §5 keeps with the cycle
 * engine, read here so the settings screen that edits them is one tab and not two
 * surfaces. The shape is the cycle module's own, so the two cannot drift.
 */
export interface CycleTabSettings {
  readonly noShowAddsToContactList: boolean
  readonly rescheduleShiftsDueDates: boolean
}

/** One editable automatic message, as «پیامها» renders it. */
export interface MessageTemplateEdit {
  readonly id: string | null
  readonly kind: AutomaticMessageKind
  readonly channel: Channel
  readonly text: string
}

/** «پیامها» — every automatic message's text and channel, and the send policy. */
export interface MessagesTabSettings {
  readonly templates: readonly MessageTemplateEdit[]
  readonly sendWindowStart: LocalTime
  readonly sendWindowEnd: LocalTime
  readonly dailyMessageCap: number
  readonly duplicateWindowDays: number
}

/** One override the tenant has declared, as «اختیارات» renders it. */
export interface DeclaredOverrideRow {
  readonly module: string
  readonly implementation: string
  readonly version: string | null
}

/** «اختیارات» — the eight toggles, and the overrides this tenant has declared. */
export interface OptionsSettings {
  readonly toggles: Readonly<Record<Toggle, boolean>>
  readonly overrides: readonly DeclaredOverrideRow[]
}

/** All six tabs in one read, for the page that renders whichever tab it was asked for. */
export interface TenantSettingsSurface {
  readonly identity: IdentitySettings
  readonly booking: BookingSettings
  readonly workingHours: WorkingHoursSettings
  readonly cycle: CycleTabSettings
  readonly messages: MessagesTabSettings
  readonly options: OptionsSettings
}
