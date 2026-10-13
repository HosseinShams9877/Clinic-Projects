/**
 * The `appointments` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel for the reason §15.5
 * states — it has to be "explicit … so an override cannot accidentally satisfy it by
 * exporting something adjacent" — and the registry's index of module surfaces gains
 * an `appointments` entry in the same change as this file.
 */

import type {
  AppointmentSource,
  AppointmentStatus,
  BookingMode,
} from '@/core/constants'
import type { TenantContext, TransactionClient } from '@/core/db/scope'
import type { LocalDate, LocalTime } from '@/core/localization'

import type { AppointmentsMessageKey } from '../catalog'
import type { AppointmentRow, DoctorColumn, DoctorDayRange, DoctorDayWindow } from '../lib/queries'
import type { BookingSettings } from '../lib/settings'
import type { Range, Slot, SlotDay } from '../lib/slots'
import type { DoctorShiftRangeRow, DoctorShiftRangeInput } from '../lib/shift-ranges'

/**
 * The arguments a booking shares, whoever makes it — a doctor, a secretary and a
 * manager all write the same row (DoD 3).
 */
export interface BookArgs {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly clinicId: string
  readonly doctorId: string
  readonly customerId: string
  readonly serviceId: string
  readonly localDate: LocalDate
  readonly localTime: LocalTime
  readonly durationMinutes: number
  readonly priceAtBooking: bigint
  readonly depositAmount: bigint
  readonly source: AppointmentSource | string
  readonly cycleId?: string
}

/** A created appointment, as the caller needs it for the row it links. */
export interface CreatedAppointment {
  readonly id: string
  readonly status: string
  readonly localDate: string
  readonly localTime: string
}

/** The row a transition is run against, as the cycle builder needs it. */
export interface TransitionRow {
  readonly id: string
  readonly status: AppointmentStatus | string
  readonly customerId: string | null
  readonly serviceId: string | null
  readonly doctorId: string
  readonly clinicId: string
  readonly cycleId: string | null
  readonly resultRecordedAt: Date | null
}

/** Re-exported so an override's barrel names the shapes from one place. */
export type {
  AppointmentRow,
  AppointmentsMessageKey,
  BookingSettings,
  DoctorColumn,
  DoctorDayRange,
  DoctorDayWindow,
  DoctorShiftRangeInput,
  DoctorShiftRangeRow,
  Range,
  Slot,
  SlotDay,
}

/**
 * This module's public surface, as a contract an override must reproduce.
 */
export interface AppointmentsModule {
  /* ── The state machine */
  readonly canTransition: (current: AppointmentStatus, next: AppointmentStatus) => boolean
  readonly assertTransition: (current: AppointmentStatus, next: AppointmentStatus) => void
  readonly TERMINAL_STATUSES: readonly AppointmentStatus[]

  /* ── Slot generation */
  readonly generateSlots: (day: SlotDay, settings: BookingSettings) => readonly Slot[]
  readonly workingRange: (day: Pick<SlotDay, 'shift' | 'hours'>) => Range | null
  readonly blockRanges: (
    rows: ReadonlyArray<{ readonly localTime: string; readonly durationMinutes: number }>,
  ) => readonly Range[]

  /* ── Settings */
  readonly readBookingSettings: (tx: TransactionClient, tenantId: string) => Promise<BookingSettings>
  readonly DEFAULT_BOOKING_SETTINGS: BookingSettings

  /* ── Booking */
  readonly bookAppointment: (args: BookArgs) => Promise<CreatedAppointment>
  readonly bookOwnAppointment: (args: BookArgs) => Promise<CreatedAppointment>

  readonly blockHours: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly clinicId: string
    readonly doctorId: string
    readonly localDate: LocalDate
    readonly localTime: LocalTime
    readonly durationMinutes: number
    readonly reason?: string
  }) => Promise<CreatedAppointment>

  readonly rescheduleAppointment: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly newLocalDate: LocalDate
    readonly newLocalTime: LocalTime
  }) => Promise<CreatedAppointment>

  readonly cancelAppointment: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly reason?: string
    readonly now: Date
  }) => Promise<void>

  /* ── Manual transitions */
  readonly recordArrival: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly now: Date
  }) => Promise<TransitionRow>

  readonly recordResult: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly now: Date
  }) => Promise<TransitionRow>

  readonly recordNoShow: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly reason?: string
    readonly now: Date
  }) => Promise<TransitionRow>

  /* ── The automatic lifecycle */
  readonly runLifecycleSweep: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly now: Date
    readonly utcOffsetMinutes: number
  }) => Promise<{ readonly promoted: readonly string[]; readonly flagged: readonly string[] }>

  readonly APPOINTMENT_LIFECYCLE_JOB_KIND: string

  readonly lifecycleJobHandler: {
    readonly scope?: 'own-tenant' | 'each-tenant'
    run(args: {
      readonly tx: TransactionClient
      readonly job: { readonly tenantId: string; readonly kind: string; readonly attempts: number }
      readonly now: Date
    }): Promise<void>
  }

  readonly ensureLifecycleJob: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly now: Date
  }) => Promise<boolean>

  /* ── Shift ranges (the per-doctor slot-granularity override) */
  readonly readDoctorShiftRanges: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly doctorId: string
  }) => Promise<readonly DoctorShiftRangeRow[]>

  readonly setDoctorShiftRanges: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly doctorId: string
    readonly rows: readonly DoctorShiftRangeInput[]
  }) => Promise<void>

  readonly slotMinutesForDoctor: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly doctorId: string
    readonly weekday: number
  }) => Promise<number>

  /* ── Queries */
  readonly doctorDay: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly doctorId: string
    readonly localDate: LocalDate
  }) => Promise<readonly AppointmentRow[]>

  readonly clinicDay: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly clinicId: string | null
    readonly localDate: LocalDate
  }) => Promise<readonly AppointmentRow[]>

  readonly unrecordedCartable: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
  }) => Promise<readonly AppointmentRow[]>

  readonly doctorsOnDay: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly weekday: number
  }) => Promise<readonly DoctorColumn[]>

  /* ── The catalog */
  readonly MESSAGES: Readonly<Record<AppointmentsMessageKey, string>>
  readonly APPOINTMENT_STATUS_LABELS: Readonly<Record<AppointmentStatus, string>>
  readonly BOOKING_MODE_LABELS: Readonly<Record<BookingMode, string>>
}