/**
 * Creating, blocking, rescheduling and cancelling an appointment.
 *
 * Every write path here goes through the same three guards, in the same order, and
 * the order is load-bearing:
 *
 * 1. **`requirePermission(ctx, Permission.ManageAppointments)`** — DoD 3's
 *    "attempted by a role without `manage_appointments` is refused on the server".
 *    It is first because it is the cheapest refusal and the one the document is most
 *    explicit about («سطح دسترسی باید در سمت سرور بررسی شود، نه با پنهان کردن
 *    دکمه»). A permission failure must not read a row, because the row's existence
 *    is not the caller's to learn.
 * 2. **The domain rules** — the day is bookable, the slot is inside the doctor's
 *    hours, the service belongs to the clinic. These are `DomainError`, not
 *    `ValidationError`: the caller's input was fine and it is the world that refuses.
 * 3. **The unique index** — `appt_slot_unique` on `(tenantId, doctorId, slotKey)`.
 *    This is DoD 4's guard, and it is a *database* guard on purpose. Two concurrent
 *    requests both pass every check above — that is what "concurrent" means — and
 *    only the index can make one of them lose. An application-level "does a booking
 *    exist" read settles the race in favour of whichever request ran second, which
 *    is the double booking the guard exists to prevent.
 *
 * The two requests that race therefore both reach the write and one of them meets
 * `P2002`, which this module converts to the catalog's «این ساعت قبلاً رزرو شده
 * است» rather than rethrowing — because the sentence the user reads names the fix
 * (pick another time) and a raw Prisma code does not.
 *
 * ## `slotKey`, and why a cancelled row releases its slot
 *
 * `slotKey` holds the slot's UTC instant for a real booking and is `NULL` for a slot
 * block. NULL is not compared by a unique index on either engine, so an unlimited
 * number of blocks may share a slot and exactly one booking may hold it
 * (`prisma.schema`'s escape-hatch note). A cancellation and a reschedule both clear
 * `slotKey`, for the same reason: the row is closed, and a closed row still holding
 * the slot would make the time permanently unbookable — the slot would be taken by
 * an appointment nobody is coming to.
 *
 * ## Reschedule: the row is closed, not moved
 *
 * `RESCHEDULED` is terminal in the state machine, so a reschedule *creates* a new
 * `BOOKED` row and points the old one at it through `rescheduledToId`. The
 * alternative — updating the row's time — would destroy the fact that the customer
 * was ever booked for the first time, and that fact is what a no-show analysis counts.
 */

import {
  AppointmentSource,
  AppointmentStatus,
  isMember,
} from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
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
import { attributeAppointmentToCampaign } from '@/modules/campaigns'

import type { AppointmentsMessageKey } from '../catalog'
import { blockRanges, type Range } from './slots'
import { readBookingSettings, type BookingSettings } from './settings'
import { assertTransition } from './status'

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
  /** The clinic-local Jalali day the slot is on. */
  readonly localDate: LocalDate
  /** The clinic-local time the slot starts. */
  readonly localTime: LocalTime
  /** The service's duration, snapshotted onto the row. */
  readonly durationMinutes: number
  /** The price at booking, snapshotted (`03-data-model.md` §2.2). */
  readonly priceAtBooking: bigint
  /** The deposit the booking captured, `0n` when none. */
  readonly depositAmount: bigint
  /** How this booking reached the clinic. */
  readonly source: string
  /** The cycle this session belongs to, when it is one. */
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
 * Books an appointment.
 *
 * The same record shape for a doctor, a secretary and a manager (DoD 3) — the role
 * only decides whether the call is permitted, and once past `requirePermission`
 * every caller writes the same row. The role is therefore not a parameter of the
 * record, and a test that books the same slot three times with three contexts gets
 * three rows that differ only in their ids.
 *
 * @throws PermissionError — the caller holds no `manage_appointments`.
 * @throws DomainError, as `appointment.slotTaken` — the slot was booked between the
 *   grid and the write (DoD 4).
 * @throws DomainError, as `appointment.closed` — the doctor does not work this day,
 *   or the day is a holiday the clinic does not book.
 */
export async function bookAppointment(args: BookArgs): Promise<CreatedAppointment> {
  requirePermission(args.ctx, 'manage_appointments')

  const settings = await readBookingSettings(args.tx, args.ctx.tenantId)
  await assertSlotBookable(args, settings)

  return createBookingRow(args, settings)
}

/**
 * The doctor's quick-book shortcut (DoD 9).
 *
 * A doctor who books for themselves holds `manage_appointments` — the permission
 * check passes — but the *shortcut* is a separate toggle (toggle 1), and the
 * specification wants the shortcut refused server-side when the toggle is off rather
 * than merely hidden. The check therefore runs after the permission check and reads
 * the settings row the permission check cannot see, and the sentence it raises names
 * the manager, because the doctor cannot resolve this themselves.
 *
 * @throws DomainError, as `appointment.quickBookDisabled`.
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
 *
 * Checked *and* then left to the index: under two concurrent requests both pass
 * here, and the index is what makes one lose. Reordering these two would not close
 * the race; removing the index would.
 */
async function assertSlotBookable(args: BookArgs, settings: BookingSettings): Promise<void> {
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
 * The read is inside the caller's transaction, so the facts it returns are the facts
 * the booking commits against — which is also why the index is still needed: the
 * read is not a lock, and the interval between it and the write is the race.
 */
async function loadSlotDay(
  args: BookArgs,
  settings: BookingSettings,
): Promise<{ readonly bookable: boolean; readonly slotAvailable: boolean }> {
  const weekday = jalaliWeekday(args.localDate)
  const [shifts, workingHours, blocks, holiday] = await Promise.all([
    args.tx.clinicShift.findMany({
      where: { tenantId: args.ctx.tenantId, clinicId: args.clinicId, weekday },
      select: { startTime: true, endTime: true },
    }),
    args.tx.doctorWorkingHours.findMany({
      where: { tenantId: args.ctx.tenantId, doctorId: args.doctorId, weekday },
      select: { startTime: true, endTime: true },
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
  const hours = workingHours[0] ?? null
  if (shift === null || hours === null) {
    return { bookable: false, slotAvailable: false }
  }

  // The intersection, not the union: a doctor works inside the clinic's hours and
  // never outside them (`DoctorWorkingHours` in `prisma/schema.prisma`).
  const start = Math.max(minutesOf(shift.startTime), minutesOf(hours.startTime))
  const end = Math.min(minutesOf(shift.endTime), minutesOf(hours.endTime))
  const slotStart = minutesOf(args.localTime)
  if (slotStart < start || slotStart + args.durationMinutes > end) {
    return { bookable: false, slotAvailable: false }
  }

  if (holiday !== null && !settings.bookingOnHolidays) {
    return { bookable: false, slotAvailable: false }
  }

  const ranges: readonly Range[] = blockRanges(blocks)
  const covered = ranges.some(
    (range) => range.start <= slotStart && range.end >= slotStart + args.durationMinutes,
  )
  return { bookable: true, slotAvailable: !covered }
}

/**
 * Writes the booking row, converting a unique-index violation into the catalog's
 * sentence for the race the index settled.
 *
 * A booking whose source is a campaign is attributed to the campaign that last reached
 * its customer, which is the one fact the results table names a campaign by (`campaigns`'s
 * own attribution read, called here because the booking is the one path that knows the
 * appointment's origin).
 */
async function createBookingRow(
  args: BookArgs,
  settings: BookingSettings,
): Promise<CreatedAppointment> {
  const scheduledAt = toUtcInstant(args.localDate, args.localTime, settings.utcOffsetMinutes)
  const slotKey = scheduledAt.toISOString()

  try {
    const created = await args.tx.appointment.create({
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

    await attributeAppointmentToCampaign({
      tx: args.tx,
      tenantId: args.ctx.tenantId,
      appointmentId: created.id,
      customerId: args.customerId,
      source: sourceOrDefault(args.source),
    })

    return created
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
 *
 * A block is an appointment-shaped row (`prisma/schema.prisma`): no customer, no
 * service, `isSlotBlock = true` and a `NULL` `slotKey`, which is what keeps it from
 * colliding with the booking it exists to prevent. A block holds no lifecycle and is
 * never swept, so it carries a status no transition will ever be asked to permit;
 * `BOOKED` is what makes it occupy the slot in the grid like a booking does.
 *
 * `بستن یک روز` is this function called once per working slot of the day — the same
 * row shape, the same removal, and that is why the two are one code path in
 * `slots.ts` and one here.
 *
 * @throws DomainError, as `appointment.blockOverlapsBooking` — the range covers a
 *   booking the clinic already has. Closing it would not cancel the customer; it
 *   would leave an appointment on the grid whose slot no longer exists.
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
 *
 * The old row moves to `RESCHEDULED`, which is terminal, and the new row is a fresh
 * `BOOKED` on the target slot. The two are linked by `rescheduledToId`, which is
 * what makes «جابه‌جا شد» a fact that can be counted rather than inferred from two
 * rows' dates. The target slot goes through the same guard a first booking uses, so
 * a reschedule into a taken slot receives the same sentence.
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

  // A reschedule copies the booking's facts onto the new row, and a row with no
  // customer or no service is not a booking to copy — it is a slot block, which is
  // not rescheduled but deleted. The sentence names neither, because the caller's
  // action is the thing that was impossible.
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
      // The closed row releases its slot; see the file header.
      slotKey: null,
    },
  })

  return created
}

/**
 * «لغو نوبت» — closes the row with a reason, and applies the deposit policy.
 *
 * `TenantSettings.depositRefundPolicy` is the policy's authority. This function does
 * not interpret it — the `debts` module that actually moves the money is a later
 * phase, and interpreting a policy here would put half of the payment logic in the
 * scheduling module. What it does is record the state the policy reads from: the row
 * is cancelled at a known instant with a known reason, and its deposit columns are
 * exactly what they were, so a later refund is decided against the row and not
 * against the release's current default.
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
      // The closed row releases its slot; see the file header.
      slotKey: null,
    },
  })
}

/**
 * Loads one appointment as the caller's own tenant sees it.
 *
 * @throws NotFoundError — the row is outside the caller's tenant, which is the
 *   404-not-403 rule (`09-security.md` §6.3): confirming that another tenant holds an
 *   appointment with this id is a disclosure the refusal must not make.
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
  /** A plain `String` column (`03-data-model.md` §5); narrowed at the transition guard. */
  readonly status: string
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
 *
 * The column is a plain `String` on both engines (`03-data-model.md` §5), so the
 * database cannot narrow it. The value came from `AppointmentStatus` when it was
 * written and this module is the only writer, but a row written by a release this
 * one does not know is still a possibility — and `assertTransition` answers it with
 * the illegal-transition refusal rather than with an undefined row of the transition
 * table, because `APPOINTMENT_TRANSITIONS` has no entry for a status it does not
 * know and the lookup yields `undefined`. That is the fail-closed answer.
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
 * A `DomainError` carrying a catalog key, built once so every refusal in this file
 * reads the same and the six sentences stay in the catalog where §14 puts them.
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
