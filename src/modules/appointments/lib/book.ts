/**
 * Creating, blocking, rescheduling and cancelling an appointment.
 *
 * Every write path here goes through the same three guards, in the same order, and
 * the order is load-bearing:
 *
 * 1. **`requirePermission(ctx, Permission.ManageAppointments)`** — DoD 3's
 *    "attempted by a role without `manage_appointments` is refused on the server".
 * 2. **The domain rules** — the day is bookable, the slot is inside the doctor's
 *    hours, the service belongs to the clinic. These are `DomainError`, not
 *    `ValidationError`: the caller's input was fine and it is the world that refuses.
 * 3. **The unique index** — `appt_slot_unique` on `(tenantId, doctorId, slotKey)`.
 *
 * ## The doctor's own shift ranges win when they exist
 *
 * `DoctorWorkingHours` is the default week; `DoctorShiftRange` is the override. When
 * the doctor has rows in the override table for a weekday, the day's bookable
 * windows are the union of *those* ranges (not the default row), and the slot must
 * fit inside one of them. A weekday with no override rows behaves exactly as before
 * the override existed.
 */

import {
  AppointmentSource,
  AppointmentStatus,
  isMember,
} from '@/core/constants'
import type { PermissionOverrides, TenantContext } from '@/core/tenant'
import type { ClinicId, TenantId, UserId } from '@/core/types'
import type { TransactionClient } from '@/core/db/scope'
import {
  asLocalTime,
  jalaliWeekday,
  timeToMinutes,
  toUtcInstant,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'
import type { Prisma } from '@/generated/prisma/client'
import {
  DomainError,
  NotFoundError,
  type AppErrorOptions,
} from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { AppointmentsMessageKey } from '../catalog'
import { blockRanges, type Range } from './slots'
import { readBookingSettings, type BookingSettings } from './settings'
import { assertTransition, isTerminal } from './status'

/** The Prisma error a unique-index violation raises. */
const UNIQUE_VIOLATION = 'P2002'

/** The appointment columns a created row is read back with. */
const APPOINTMENT_SELECT = {
  id: true,
  status: true,
  localDate: true,
  localTime: true,
} as const

/** The arguments every booking path shares, whoever the caller is. */
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
  readonly source: string
  readonly cycleId?: string
}

/** A created appointment, as the caller needs it for the row it links. */
export interface CreatedAppointment {
  readonly id: string
  readonly status: string
  readonly localDate: string
  readonly localTime: string
}

/**
 * The context the public site books under.
 */
export interface PublicBookingContext {
  readonly tenantId: TenantId
  readonly clinicId: ClinicId | null
  readonly role: 'public'
  readonly userId: UserId
  readonly overrides: PermissionOverrides
}

/** `BookArgs`, with the context the public site supplies in place of a membership's. */
export type PublicBookArgs = Omit<BookArgs, 'ctx'> & { readonly ctx: PublicBookingContext }

/** Either booking path's arguments, for the guards they share. */
type AnyBookArgs = BookArgs | PublicBookArgs

/**
 * Books an appointment.
 */
export async function bookAppointment(args: BookArgs): Promise<CreatedAppointment> {
  requirePermission(args.ctx, 'manage_appointments')

  const settings = await readBookingSettings(args.tx, args.ctx.tenantId)
  await assertSlotBookable(args, settings)

  return createBookingRow(args, settings)
}

/**
 * The public site's booking.
 */
export async function bookPublicAppointment(args: PublicBookArgs): Promise<CreatedAppointment> {
  const settings = await readBookingSettings(args.tx, args.ctx.tenantId)

  const deposit = await serviceDeposit(args)
  if (deposit > 0n && !settings.onlineBookingNoDeposit) {
    throw appointmentError(
      `Service ${args.serviceId} carries a deposit of ${deposit} and the ` +
        `${'ONLINE_BOOKING_NO_DEPOSIT'} toggle is off, so the public site cannot book it.`,
      'appointment.depositRequired',
      { serviceId: args.serviceId, depositAmount: String(deposit) },
    )
  }

  await assertSlotBookable(args, settings)
  return createBookingRow(args, settings)
}

/**
 * The service's own deposit, read on the write path.
 */
async function serviceDeposit(args: AnyBookArgs): Promise<bigint> {
  const service = await args.tx.service.findFirst({
    where: { id: args.serviceId, tenantId: args.ctx.tenantId },
    select: { depositAmount: true },
  })
  return service?.depositAmount ?? 0n
}

/**
 * The doctor's quick-book shortcut (DoD 9).
 */
export async function bookOwnAppointment(args: BookArgs): Promise<CreatedAppointment> {
  requirePermission(args.ctx, 'manage_appointments')

  const settings = await readBookingSettings(args.tx, args.ctx.tenantId)
  if (!settings.doctorSelfBooking) {
    throw appointmentError(
      `Doctor ${args.ctx.userId} cannot use the quick-book shortcut: the tenant's ` +
        `${'DOCTOR_SELF_BOOKING'} toggle is off.`,
      'appointment.quickBookDisabled',
      { doctorId: args.doctorId },
    )
  }

  await assertSlotBookable(args, settings)
  return createBookingRow(args, settings)
}

/**
 * The domain rules a booking's slot has to satisfy, before any write is attempted.
 */
async function assertSlotBookable(args: AnyBookArgs, settings: BookingSettings): Promise<void> {
  const day = await loadSlotDay(args, settings)
  if (!day.bookable) {
    throw appointmentError(
      `The day ${args.localDate} for doctor ${args.doctorId} is not bookable.`,
      'appointment.closed',
      { localDate: args.localDate, doctorId: args.doctorId },
    )
  }
  if (!day.slotAvailable) {
    throw appointmentError(
      `The slot ${args.localDate} ${args.localTime} for doctor ${args.doctorId} is already held.`,
      'appointment.slotTaken',
      { localDate: args.localDate, localTime: args.localTime, doctorId: args.doctorId },
    )
  }
}

/**
 * One day's bookable facts: whether the doctor works the day at all, and whether the
 * requested time is free on it.
 *
 * The doctor's own `DoctorShiftRange` rows win when they exist for the weekday: the
 * slot must fit inside one of them, and the `DoctorWorkingHours` row is not read at
 * all. When they do not exist, the default row is the day and the intersection with
 * the clinic's shift is the window (the pre-override behaviour, exactly).
 */
async function loadSlotDay(
  args: AnyBookArgs,
  settings: BookingSettings,
): Promise<{ readonly bookable: boolean; readonly slotAvailable: boolean }> {
  const weekday = jalaliWeekday(args.localDate)
  const [shifts, workingHours, shiftRanges, blocks, holiday] = await Promise.all([
    args.tx.clinicShift.findMany({
      where: { tenantId: args.ctx.tenantId, clinicId: args.clinicId, weekday },
      select: { startTime: true, endTime: true },
    }),
    args.tx.doctorWorkingHours.findMany({
      where: { tenantId: args.ctx.tenantId, doctorId: args.doctorId, weekday },
      select: { startTime: true, endTime: true },
    }),
    args.tx.doctorShiftRange.findMany({
      where: { tenantId: args.ctx.tenantId, doctorId: args.doctorId, weekday },
      select: { startTime: true, endTime: true, slotMinutes: true },
    }),
    args.tx.appointment.findMany({
      where: {
        tenantId: args.ctx.tenantId,
        doctorId: args.doctorId,
        localDate: args.localDate,
        isSlotBlock: true,
      },
      select: { localTime: true, durationMinutes: true },
    }),
    args.tx.holiday.findFirst({
      where: { tenantId: args.ctx.tenantId, localDate: args.localDate },
      select: { id: true },
    }),
  ])

  const shift = shifts[0] ?? null
  if (shift === null) {
    return { bookable: false, slotAvailable: false }
  }

  const slotStart = minutesOf(args.localTime)
  const slotEnd = slotStart + args.durationMinutes

  if (shiftRanges.length > 0) {
    // The override wins: the slot must fit inside one of the doctor's ranges (each
    // intersected with the clinic's shift, because a doctor never works outside it).
    const insideAnyRange = shiftRanges.some((range) => {
      const rangeStart = Math.max(minutesOf(shift.startTime), minutesOf(range.startTime))
      const rangeEnd = Math.min(minutesOf(shift.endTime), minutesOf(range.endTime))
      return slotStart >= rangeStart && slotEnd <= rangeEnd
    })
    if (!insideAnyRange) {
      return { bookable: false, slotAvailable: false }
    }
  } else {
    // The default week: one row per weekday, intersected with the clinic's shift.
    const hours = workingHours[0] ?? null
    if (hours === null) {
      return { bookable: false, slotAvailable: false }
    }
    const start = Math.max(minutesOf(shift.startTime), minutesOf(hours.startTime))
    const end = Math.min(minutesOf(shift.endTime), minutesOf(hours.endTime))
    if (slotStart < start || slotEnd > end) {
      return { bookable: false, slotAvailable: false }
    }
  }

  if (holiday !== null && !settings.bookingOnHolidays) {
    return { bookable: false, slotAvailable: false }
  }

  const ranges: readonly Range[] = blockRanges(blocks)
  const covered = ranges.some(
    (range) => range.start <= slotStart && range.end >= slotEnd,
  )
  return { bookable: true, slotAvailable: !covered }
}

/**
 * Writes the booking row, converting a unique-index violation into the catalog's
 * sentence for the race the index settled.
 */
async function createBookingRow(
  args: AnyBookArgs,
  settings: BookingSettings,
): Promise<CreatedAppointment> {
  const scheduledAt = toUtcInstant(args.localDate, args.localTime, settings.utcOffsetMinutes)
  const slotKey = scheduledAt.toISOString()

  try {
    return await args.tx.appointment.create({
      data: {
        tenantId: args.ctx.tenantId,
        clinicId: args.clinicId,
        customerId: args.customerId,
        serviceId: args.serviceId,
        doctorId: args.doctorId,
        cycleId: args.cycleId ?? null,
        scheduledAt,
        localDate: args.localDate,
        localTime: args.localTime,
        durationMinutes: args.durationMinutes,
        status: AppointmentStatus.Booked,
        source: sourceOrDefault(args.source),
        isSlotBlock: false,
        slotKey,
        priceAtBooking: args.priceAtBooking,
        depositAmount: args.depositAmount,
        depositStatus: args.depositAmount > 0n ? 'PENDING' : null,
      },
      select: APPOINTMENT_SELECT,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw appointmentError(
        `The slot ${slotKey} for doctor ${args.doctorId} was taken by a concurrent booking.`,
        'appointment.slotTaken',
        { doctorId: args.doctorId, slotKey },
      )
    }
    throw error
  }
}

/**
 * «بستن یک ساعت» — closes one time range on one day for one doctor.
 */
export async function blockHours(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly clinicId: string
  readonly doctorId: string
  readonly localDate: LocalDate
  readonly localTime: LocalTime
  readonly durationMinutes: number
  readonly reason?: string
}): Promise<CreatedAppointment> {
  requirePermission(args.ctx, 'manage_appointments')

  const start = minutesOf(args.localTime)
  const range: Range = { start, end: start + args.durationMinutes }

  const conflict = await args.tx.appointment.findFirst({
    where: {
      tenantId: args.ctx.tenantId,
      doctorId: args.doctorId,
      localDate: args.localDate,
      isSlotBlock: false,
      status: { notIn: [AppointmentStatus.Cancelled, AppointmentStatus.Rescheduled] },
    },
    select: { id: true, localTime: true, durationMinutes: true },
  })
  if (conflict !== null) {
    const conflictStart = minutesOf(conflict.localTime)
    const overlaps = conflictStart < range.end && conflictStart + conflict.durationMinutes > range.start
    if (overlaps) {
      throw appointmentError(
        `The block on ${args.localDate} ${args.localTime} covers appointment ${conflict.id}.`,
        'appointment.blockOverlapsBooking',
        { appointmentId: conflict.id },
      )
    }
  }

  const settings = await readBookingSettings(args.tx, args.ctx.tenantId)
  const scheduledAt = toUtcInstant(args.localDate, args.localTime, settings.utcOffsetMinutes)

  return args.tx.appointment.create({
    data: {
      tenantId: args.ctx.tenantId,
      clinicId: args.clinicId,
      doctorId: args.doctorId,
      customerId: null,
      serviceId: null,
      scheduledAt,
      localDate: args.localDate,
      localTime: args.localTime,
      durationMinutes: args.durationMinutes,
      status: AppointmentStatus.Booked,
      source: null,
      isSlotBlock: true,
      slotKey: null,
      priceAtBooking: 0n,
      depositAmount: 0n,
      cancelReason: args.reason ?? null,
    },
    select: APPOINTMENT_SELECT,
  })
}

/**
 * «جابه‌جایی نوبت» — closes the row and opens a new one that points back at it.
 */
export async function rescheduleAppointment(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly newLocalDate: LocalDate
  readonly newLocalTime: LocalTime
}): Promise<CreatedAppointment> {
  requirePermission(args.ctx, 'manage_appointments')

  const current = await loadOwnAppointment(args.tx, args.ctx, args.appointmentId)
  assertTransition(asStatus(current.status), AppointmentStatus.Rescheduled)

  if (current.customerId === null || current.serviceId === null) {
    throw appointmentError(
      `Appointment ${current.id} holds no ${current.customerId === null ? 'customer' : 'service'}, so it cannot be rescheduled.`,
      'appointment.illegalTransition',
      { appointmentId: current.id },
    )
  }

  const created = await bookAppointment({
    tx: args.tx,
    ctx: args.ctx,
    clinicId: current.clinicId,
    doctorId: current.doctorId,
    customerId: current.customerId,
    serviceId: current.serviceId,
    localDate: args.newLocalDate,
    localTime: args.newLocalTime,
    durationMinutes: current.durationMinutes,
    priceAtBooking: current.priceAtBooking,
    depositAmount: current.depositAmount,
    source: current.source ?? AppointmentSource.Reception,
    cycleId: current.cycleId ?? undefined,
  })

  await args.tx.appointment.update({
    where: { id: current.id },
    data: {
      status: AppointmentStatus.Rescheduled,
      rescheduledToId: created.id,
      slotKey: null,
    },
  })

  return created
}

/**
 * «لغو نوبت» — closes the row with a reason, and applies the deposit policy.
 */
export async function cancelAppointment(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly reason?: string
  readonly now: Date
}): Promise<void> {
  requirePermission(args.ctx, 'manage_appointments')

  const current = await loadOwnAppointment(args.tx, args.ctx, args.appointmentId)
  assertTransition(asStatus(current.status), AppointmentStatus.Cancelled)

  await args.tx.appointment.update({
    where: { id: current.id },
    data: {
      status: AppointmentStatus.Cancelled,
      cancelledAt: args.now,
      cancelReason: args.reason ?? null,
      slotKey: null,
    },
  })
}

/**
 * «ویرایش نوبت» — corrects a booking in place, keeping its own row.
 */
export async function updateAppointment(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly doctorId?: string
  readonly serviceId?: string
  readonly newLocalDate?: LocalDate
  readonly newLocalTime?: LocalTime
  readonly durationMinutes?: number
}): Promise<CreatedAppointment> {
  requirePermission(args.ctx, 'manage_appointments')

  const current = await loadOwnAppointment(args.tx, args.ctx, args.appointmentId)

  if (current.customerId === null || current.serviceId === null) {
    throw appointmentError(
      `Appointment ${current.id} is a slot block, not a booking, so it cannot be edited.`,
      'appointment.illegalTransition',
      { appointmentId: current.id },
    )
  }
  if (isTerminal(asStatus(current.status))) {
    throw appointmentError(
      `Appointment ${current.id} is ${current.status} and holds no slot to edit.`,
      'appointment.illegalTransition',
      { appointmentId: current.id },
    )
  }

  const doctorId = args.doctorId ?? current.doctorId
  const serviceId = args.serviceId ?? current.serviceId
  const localDate = args.newLocalDate ?? (current.localDate as LocalDate)
  const localTime = args.newLocalTime ?? asLocalTime(current.localTime)

  const service = await args.tx.service.findFirst({
    where: { id: serviceId, tenantId: args.ctx.tenantId },
    select: { durationMinutes: true, price: true },
  })
  if (service === null) {
    throw appointmentError(
      `Service ${serviceId} was not found in this tenant.`,
      'appointment.notFound',
      { appointmentId: current.id },
    )
  }
  const durationMinutes = args.durationMinutes ?? (args.serviceId !== undefined ? service.durationMinutes : current.durationMinutes)

  const settings = await readBookingSettings(args.tx, args.ctx.tenantId)
  await assertSlotBookable(
    {
      tx: args.tx,
      ctx: args.ctx,
      clinicId: current.clinicId,
      doctorId,
      customerId: current.customerId,
      serviceId,
      localDate,
      localTime,
      durationMinutes,
      priceAtBooking: service.price,
      depositAmount: current.depositAmount,
      source: current.source ?? AppointmentSource.Reception,
    },
    settings,
  )

  const scheduledAt = toUtcInstant(localDate, localTime, settings.utcOffsetMinutes)
  const slotKey = scheduledAt.toISOString()

  try {
    return await args.tx.appointment.update({
      where: { id: current.id },
      data: {
        doctorId,
        serviceId,
        scheduledAt,
        localDate,
        localTime,
        durationMinutes,
        priceAtBooking: service.price,
        slotKey,
      },
      select: APPOINTMENT_SELECT,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw appointmentError(
        `The slot ${slotKey} for doctor ${doctorId} was taken by a concurrent booking.`,
        'appointment.slotTaken',
        { doctorId, slotKey },
      )
    }
    throw error
  }
}

/**
 * Loads one appointment as the caller's own tenant sees it.
 */
async function loadOwnAppointment(
  tx: TransactionClient,
  ctx: TenantContext,
  appointmentId: string,
): Promise<LoadedAppointment> {
  const row = await tx.appointment.findFirst({
    where: { id: appointmentId, tenantId: ctx.tenantId },
    select: {
      id: true,
      clinicId: true,
      doctorId: true,
      customerId: true,
      serviceId: true,
      cycleId: true,
      status: true,
      localDate: true,
      localTime: true,
      durationMinutes: true,
      priceAtBooking: true,
      depositAmount: true,
      depositStatus: true,
      source: true,
    },
  })
  if (row === null) {
    throw new NotFoundError(`Appointment ${appointmentId} was not found in this tenant.`, {
      messageKey: 'appointment.notFound' satisfies AppointmentsMessageKey,
      detail: { appointmentId },
    })
  }
  return row
}

/** The columns a reschedule and a cancellation need from the row they close. */
interface LoadedAppointment {
  readonly id: string
  readonly clinicId: string
  readonly doctorId: string
  readonly customerId: string | null
  readonly serviceId: string | null
  readonly cycleId: string | null
  readonly status: string
  readonly localDate: string
  readonly localTime: string
  readonly durationMinutes: number
  readonly priceAtBooking: bigint
  readonly depositAmount: bigint
  readonly depositStatus: string | null
  readonly source: string | null
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/** Minutes since midnight of a stored `HH:mm` time. */
function minutesOf(value: string): number {
  return timeToMinutes(asLocalTime(value))
}

/**
 * The status column's value as the state machine's own union.
 */
function asStatus(value: string): AppointmentStatus {
  return value as AppointmentStatus
}

/** The source, or the reception desk when the row does not carry a recognisable one. */
function sourceOrDefault(source: string): AppointmentSource {
  return isMember(AppointmentSource, source) ? source : AppointmentSource.Reception
}

/** Whether a Prisma error is the unique-index violation the race produces. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code: unknown }).code === UNIQUE_VIOLATION
  )
}

/**
 * A `DomainError` carrying a catalog key.
 */
function appointmentError(
  message: string,
  key: AppointmentsMessageKey,
  params: AppErrorOptions['messageParams'],
): never {
  throw new DomainError(message, { messageKey: key, messageParams: params })
}

/** Named for the barrel; the values the pages render come from `queries.ts`. */
export type { Prisma }