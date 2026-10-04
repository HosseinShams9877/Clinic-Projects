/**
 * The `appointments` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel for the reason §15.5
 * states — it has to be "explicit … so an override cannot accidentally satisfy it by
 * exporting something adjacent" — and the registry's index of module surfaces gains
 * an `appointments` entry in the same change as this file.
 *
 * ## What the contract covers
 *
 * The module's **values**, because those are what the registry loads and a caller
 * calls. The types this module exports (`AppointmentRow`, `BookingSettings`,
 * `Slot`, `BookArgs`, `AppointmentsMessageKey`) travel with `types/` and are
 * re-exported by an override's own barrel; they are not members of a value interface.
 *
 * ## What the contract deliberately omits
 *
 * The Prisma client. Every function takes a `TransactionClient` because the caller
 * already opened the tenant scope (`02-architecture.md` §11), and the interface says
 * so — but the *model* names are not in the contract, so an override that stores its
 * rows differently still conforms as long as it answers the same questions.
 */

import type {
  AppointmentSource,
  AppointmentStatus,
  BookingMode,
} from '@/core/constants'
import type { TenantContext, TransactionClient } from '@/core/db/scope'
import type { LocalDate, LocalTime } from '@/core/localization'

import type { AppointmentsMessageKey } from '../catalog'
import type { AppointmentRow, DoctorColumn } from '../lib/queries'
import type { BookingSettings } from '../lib/settings'
import type { Range, Slot, SlotDay } from '../lib/slots'

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
  Range,
  Slot,
  SlotDay,
}

/**
 * This module's public surface, as a contract an override must reproduce.
 *
 * Keeping this in step with the barrel is a review obligation the type checker only
 * half covers: an interface **wider** than the barrel fails to compile against the
 * fixture, an interface narrower than the barrel does not. See the note in
 * `roles-permissions/types/index.ts` for the same asymmetry.
 */
export interface AppointmentsModule {
  /* ── The state machine */
  /** Whether the transition is one the lifecycle permits. */
  readonly canTransition: (current: AppointmentStatus, next: AppointmentStatus) => boolean

  /**
   * The same question, as a guard.
   * @throws DomainError — the record is in a state the caller cannot move from.
   */
  readonly assertTransition: (current: AppointmentStatus, next: AppointmentStatus) => void

  /** The states no transition leaves. */
  readonly TERMINAL_STATUSES: readonly AppointmentStatus[]

  /* ── Slot generation */
  /** The slots of one day, as the facts describe them. */
  readonly generateSlots: (day: SlotDay, settings: BookingSettings) => readonly Slot[]

  /** The intersection of the clinic's shift and the doctor's hours, as a minute range. */
  readonly workingRange: (day: Pick<SlotDay, 'shift' | 'hours'>) => Range | null

  /** Block rows as `[start, end)` minute ranges. */
  readonly blockRanges: (
    rows: ReadonlyArray<{ readonly localTime: string; readonly durationMinutes: number }>,
  ) => readonly Range[]

  /* ── Settings */
  /** The tenant's booking settings, or the documented defaults. */
  readonly readBookingSettings: (tx: TransactionClient, tenantId: string) => Promise<BookingSettings>

  /** The shipped defaults, frozen. */
  readonly DEFAULT_BOOKING_SETTINGS: BookingSettings

  /* ── Booking */
  /**
   * Books an appointment.
   * @throws PermissionError — no `manage_appointments`.
   * @throws DomainError, as `appointment.slotTaken` — the race the index settled.
   */
  readonly bookAppointment: (args: BookArgs) => Promise<CreatedAppointment>

  /**
   * The doctor's quick-book shortcut.
   * @throws DomainError, as `appointment.quickBookDisabled` — toggle 1 is off (DoD 9).
   */
  readonly bookOwnAppointment: (args: BookArgs) => Promise<CreatedAppointment>

  /** «بستن یک ساعت» — a slot block. */
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

  /** «جابه‌جایی نوبت» — closes the row and opens a linked one. */
  readonly rescheduleAppointment: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly newLocalDate: LocalDate
    readonly newLocalTime: LocalTime
  }) => Promise<CreatedAppointment>

  /** «لغو نوبت» — closes the row with a reason. */
  readonly cancelAppointment: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly reason?: string
    readonly now: Date
  }) => Promise<void>

  /* ── Manual transitions */
  /** «حاضر شد». */
  readonly recordArrival: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly now: Date
  }) => Promise<TransitionRow>

  /** «انجام شد» — the transition that creates the cycle. */
  readonly recordResult: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly now: Date
  }) => Promise<TransitionRow>

  /** «عدم حضور». */
  readonly recordNoShow: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly appointmentId: string
    readonly reason?: string
    readonly now: Date
  }) => Promise<TransitionRow>

  /* ── The automatic lifecycle */
  /** The sweep's two passes, in the state machine's order (DoD 7). */
  readonly runLifecycleSweep: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly now: Date
    readonly utcOffsetMinutes: number
  }) => Promise<{ readonly promoted: readonly string[]; readonly flagged: readonly string[] }>

  /** The job kind the worker registry is keyed on, and the queue stores. */
  readonly APPOINTMENT_LIFECYCLE_JOB_KIND: string

  /** The worker's handler for the lifecycle job (`02-architecture.md` §12). */
  readonly lifecycleJobHandler: {
    readonly scope?: 'own-tenant' | 'each-tenant'
    run(args: {
      readonly tx: TransactionClient
      readonly job: { readonly tenantId: string; readonly kind: string; readonly attempts: number }
      readonly now: Date
    }): Promise<void>
  }

  /** Seeds a tenant's recurring lifecycle row. Idempotent on the kind. */
  readonly ensureLifecycleJob: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly now: Date
  }) => Promise<boolean>

  /* ── Queries */
  /** «برنامه من» — one doctor's own day. */
  readonly doctorDay: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly doctorId: string
    readonly localDate: LocalDate
  }) => Promise<readonly AppointmentRow[]>

  /** The clinic-wide day grid. */
  readonly clinicDay: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly clinicId: string | null
    readonly localDate: LocalDate
  }) => Promise<readonly AppointmentRow[]>

  /** The «نتیجه ثبت نشده» cartable — reception only. */
  readonly unrecordedCartable: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
  }) => Promise<readonly AppointmentRow[]>

  /** The doctors with hours on a weekday, as the grid's column headers. */
  readonly doctorsOnDay: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly weekday: number
  }) => Promise<readonly DoctorColumn[]>

  /* ── The catalog */
  /** The Persian sentence for each key this module raises. */
  readonly MESSAGES: Readonly<Record<AppointmentsMessageKey, string>>

  /** The eight status labels, keyed by the stored value. */
  readonly APPOINTMENT_STATUS_LABELS: Readonly<Record<AppointmentStatus, string>>

  /** The three booking modes, keyed by the stored value. */
  readonly BOOKING_MODE_LABELS: Readonly<Record<BookingMode, string>>
}
