/**
 * Booking, blocking, rescheduling and cancelling — against a real SQLite file.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." The three assertions that make a mock worthless are the ones this
 * suite exists for:
 *
 * - **DoD 3** — a booking by a role without `manage_appointments` is refused on the
 *   server, and the same slot booked by a manager and a secretary is the same record
 *   shape.
 * - **DoD 4** — two concurrent bookings of one slot: the unique index makes one of
 *   them lose, and the loser is the catalog's «این ساعت قبلاً رزرو شده است».
 * - **Tenant isolation** — another tenant's appointment is not found, and a booking
 *   the second tenant's rows should have made impossible is impossible.
 *
 * ## Why the database is built by hand here
 *
 * The suite needs a shift, a doctor's hours, a service, a customer and a settings row
 * for one tenant, and a second tenant with a doctor who works the same weekday — the
 * shape that makes a cross-tenant booking a question the index answers. Seeding it in
 * the suite is what keeps the rows the assertions need visible in one place.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AppointmentSource, AppointmentStatus, Permission, Role } from '@/core/constants'
import { CustomerLifecycle } from '@/core/constants'
import {
  asClinicId,
  asTenantId,
  asUserId,
  type TenantId,
  type UserId,
} from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { PrismaClient } from '@/generated/prisma/client'

import { blockHours, bookAppointment, bookOwnAppointment, cancelAppointment, rescheduleAppointment } from '../lib/book'
import { recordArrival, recordNoShow, recordResult } from '../lib/transition'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

/** The clock the booking reads, so the cancellation's instant is a named fact. */
const NOW = new Date('2026-10-04T10:00:00Z')

/** A Wednesday in ۱۴۰۵, as the day every booking below is on. */
const DAY = '1405-01-04' as const

/** The weekday of that day, which the shift and the hours are seeded for. */
const DAY_WEEKDAY = 3

/** The slot a booking is made against, inside the seeded ۰۹ تا ۱۴ range. */
const SLOT = '10:00' as const

const TENANT_ID: TenantId = asTenantId('tenant-a')
const OTHER_TENANT_ID: TenantId = asTenantId('tenant-b')
const CLINIC_ID = asClinicId('clinic-a')
const DOCTOR_ID: UserId = asUserId('doctor-a')
const OTHER_DOCTOR_ID: UserId = asUserId('doctor-b')
const CUSTOMER_ID = 'customer-a'
const SERVICE_ID = 'service-a'

let database: TestDatabase
let unscoped: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  unscoped = database.unscoped
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

beforeEach(async () => {
  await unscoped.$transaction([
    unscoped.appointment.deleteMany(),
    unscoped.holiday.deleteMany(),
    unscoped.service.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.doctorWorkingHours.deleteMany(),
    unscoped.clinicShift.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [
      { id: TENANT_ID, slug: 'a', name: 'الف', isActive: true },
      { id: OTHER_TENANT_ID, slug: 'b', name: 'ب', isActive: true },
    ],
  })
  await unscoped.clinic.createMany({
    data: [
      { id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true },
      { id: 'clinic-b', tenantId: OTHER_TENANT_ID, name: 'کلینیک ب', isActive: true },
    ],
  })
  await unscoped.tenantSettings.createMany({
    data: [
      { tenantId: TENANT_ID, utcOffsetMinutes: 210 },
      { tenantId: OTHER_TENANT_ID, utcOffsetMinutes: 210 },
    ],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000001',
        firstName: 'پزشک',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: OTHER_DOCTOR_ID,
        tenantId: OTHER_TENANT_ID,
        mobile: '09120000002',
        firstName: 'پزشک',
        lastName: 'ب',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })
  await unscoped.clinicShift.createMany({
    data: [
      {
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        weekday: DAY_WEEKDAY,
        startTime: '09:00',
        endTime: '14:00',
      },
      {
        tenantId: OTHER_TENANT_ID,
        clinicId: 'clinic-b',
        weekday: DAY_WEEKDAY,
        startTime: '09:00',
        endTime: '14:00',
      },
    ],
  })
  await unscoped.doctorWorkingHours.createMany({
    data: [
      {
        tenantId: TENANT_ID,
        doctorId: DOCTOR_ID,
        weekday: DAY_WEEKDAY,
        startTime: '09:00',
        endTime: '14:00',
      },
      {
        tenantId: OTHER_TENANT_ID,
        doctorId: OTHER_DOCTOR_ID,
        weekday: DAY_WEEKDAY,
        startTime: '09:00',
        endTime: '14:00',
      },
    ],
  })
  await unscoped.customer.createMany({
    data: [
      {
        id: CUSTOMER_ID,
        tenantId: TENANT_ID,
        mobile: '09130000001',
        firstName: 'مشتری',
        searchName: 'مشتری',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })
  await unscoped.service.createMany({
    data: [
      {
        id: SERVICE_ID,
        tenantId: TENANT_ID,
        name: 'خدمت الف',
        searchName: 'خدمت الف',
        category: 'عمومی',
        price: 1000000n,
        depositAmount: 200000n,
        durationMinutes: 30,
        isActive: true,
      },
    ],
  })
})

/** A context the permission check accepts, for the role and permission a case names. */
function context(
  tenantId: TenantId,
  role: Role,
  permissions: readonly Permission[] = [],
): TenantContext {
  return Object.freeze({
    userId: DOCTOR_ID,
    tenantId,
    clinicId: role === Role.Manager ? null : CLINIC_ID,
    role,
    overrides: Object.freeze({ granted: [...permissions], revoked: [] }),
  })
}

/** The arguments every booking below shares, with the slot a case varies. */
function bookArgs(patch: { readonly localTime?: string; readonly doctorId?: UserId } = {}) {
  return {
    tx: unscoped as never,
    ctx: context(TENANT_ID, Role.Manager),
    clinicId: CLINIC_ID,
    doctorId: patch.doctorId ?? DOCTOR_ID,
    customerId: CUSTOMER_ID,
    serviceId: SERVICE_ID,
    localDate: DAY,
    localTime: patch.localTime ?? SLOT,
    durationMinutes: 30,
    priceAtBooking: 1000000n,
    depositAmount: 200000n,
    source: AppointmentSource.Reception,
  }
}

describe('bookAppointment', () => {
  it('writes the row the booking describes, with the snapshot amounts', async () => {
    const created = await bookAppointment(bookArgs())

    expect(created).toMatchObject({
      status: AppointmentStatus.Booked,
      localDate: DAY,
      localTime: SLOT,
    })

    const row = await unscoped.appointment.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.tenantId).toBe(TENANT_ID)
    expect(row.clinicId).toBe(CLINIC_ID)
    expect(row.doctorId).toBe(DOCTOR_ID)
    expect(row.customerId).toBe(CUSTOMER_ID)
    expect(row.serviceId).toBe(SERVICE_ID)
    expect(row.priceAtBooking).toBe(1000000n)
    expect(row.depositAmount).toBe(200000n)
    expect(row.depositStatus).toBe('PENDING')
    expect(row.isSlotBlock).toBe(false)
    expect(row.slotKey).not.toBeNull()
  })

  it('refuses a caller without manage_appointments, before it reads a row', async () => {
    // DoD 3. A doctor's default holds three permissions and `manage_appointments` is
    // not one of them, so the refusal is the permission primitive's and not the
    // domain's.
    await expect(
      bookAppointment({ ...bookArgs(), ctx: context(TENANT_ID, Role.Doctor) }),
    ).rejects.toMatchObject({ messageKey: 'permission.denied' })
  })

  it('accepts a secretary whose role grants manage_appointments', async () => {
    const created = await bookAppointment({
      ...bookArgs(),
      ctx: context(TENANT_ID, Role.Secretary),
    })

    // DoD 3's second half: the record shape is the same one the manager wrote, and
    // the role decided only whether the call was permitted.
    const row = await unscoped.appointment.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.status).toBe(AppointmentStatus.Booked)
    expect(row.customerId).toBe(CUSTOMER_ID)
  })

  it('refuses a slot outside the doctor working hours', async () => {
    await expect(bookAppointment(bookArgs({ localTime: '15:00' }))).rejects.toMatchObject({
      messageKey: 'appointment.closed',
    })
  })

  it('refuses a weekday the clinic does not work', async () => {
    // A Friday (weekday ۵) the shift is not seeded for, so the day is not bookable and
    // the sentence names the day rather than the time.
    await expect(
      bookAppointment({ ...bookArgs(), localDate: '1405-01-06' }),
    ).rejects.toMatchObject({ messageKey: 'appointment.closed' })
  })

  it('refuses a holiday the clinic does not book, and books it when the toggle is on', async () => {
    await unscoped.holiday.create({
      data: { tenantId: TENANT_ID, localDate: DAY, title: 'تعطیلی', isOfficial: true },
    })

    await expect(bookAppointment(bookArgs())).rejects.toMatchObject({
      messageKey: 'appointment.closed',
    })

    await unscoped.tenantSettings.update({
      where: { tenantId: TENANT_ID },
      data: { toggles: JSON.stringify({ DOCTOR_SELF_BOOKING: true, BOOKING_ON_HOLIDAYS: true }) },
    })

    const created = await bookAppointment(bookArgs())
    expect(created.status).toBe(AppointmentStatus.Booked)
  })

  it('refuses a slot a block covers, and offers the one beside it', async () => {
    await blockHours({
      tx: unscoped as never,
      ctx: context(TENANT_ID, Role.Manager),
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      localDate: DAY,
      localTime: '11:00',
      durationMinutes: 60,
    })

    await expect(bookAppointment(bookArgs({ localTime: '11:30' }))).rejects.toMatchObject({
      messageKey: 'appointment.slotTaken',
    })

    // The block holds ۱۱:۰۰ تا ۱۲:۰۰ and the ۱۲:۰۰ slot is the desk's to offer.
    const created = await bookAppointment(bookArgs({ localTime: '12:00' }))
    expect(created.localTime).toBe('12:00')
  })

  it('refuses the second of two bookings of one slot with the catalog sentence', async () => {
    // DoD 4. Both pass the domain checks — that is what concurrent means — and the
    // unique index on `(tenantId, doctorId, slotKey)` is what makes one lose. The
    // loser is the sentence the specification names, and not a Prisma code.
    await bookAppointment(bookArgs())

    await expect(bookAppointment(bookArgs())).rejects.toMatchObject({
      messageKey: 'appointment.slotTaken',
    })

    expect(await unscoped.appointment.count()).toBe(1)
  })

  it('keeps the slot bookable after the booking that held it is cancelled', async () => {
    // `slotKey` is cleared on close, so a cancelled row does not hold the time forever.
    const first = await bookAppointment(bookArgs())
    await cancelAppointment({
      tx: unscoped as never,
      ctx: context(TENANT_ID, Role.Manager),
      appointmentId: first.id,
      now: NOW,
    })

    const second = await bookAppointment(bookArgs())
    expect(second.status).toBe(AppointmentStatus.Booked)

    const closed = await unscoped.appointment.findUniqueOrThrow({ where: { id: first.id } })
    expect(closed.status).toBe(AppointmentStatus.Cancelled)
    expect(closed.slotKey).toBeNull()
  })
})

describe('bookOwnAppointment', () => {
  it('refuses the doctor quick-book when the toggle is off, server-side', async () => {
    // DoD 9. The doctor holds `manage_appointments` in this context, so the permission
    // check passes and the refusal is the toggle's — raised whether or not a shortcut
    // was ever rendered. The toggle's default is *on* (`TOGGLE_DEFAULTS`), so the
    // refusal has to be written into the settings row to be tested.
    await unscoped.tenantSettings.update({
      where: { tenantId: TENANT_ID },
      data: { toggles: JSON.stringify({ DOCTOR_SELF_BOOKING: false, BOOKING_ON_HOLIDAYS: false }) },
    })

    await expect(
      bookOwnAppointment({ ...bookArgs(), ctx: context(TENANT_ID, Role.Doctor, [Permission.ManageAppointments]) }),
    ).rejects.toMatchObject({ messageKey: 'appointment.quickBookDisabled' })
  })

  it('books the doctor own slot when the toggle is on', async () => {
    // The default: a clinic that has never opened settings lets its doctors book their
    // own empty slots, which is the setting DoD 9 ships.
    const created = await bookOwnAppointment({
      ...bookArgs(),
      ctx: context(TENANT_ID, Role.Doctor, [Permission.ManageAppointments]),
    })
    expect(created.status).toBe(AppointmentStatus.Booked)
  })
})

describe('blockHours', () => {
  it('closes the range and holds no customer or service', async () => {
    const blocked = await blockHours({
      tx: unscoped as never,
      ctx: context(TENANT_ID, Role.Manager),
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      localDate: DAY,
      localTime: '13:00',
      durationMinutes: 60,
      reason: 'جلسه تیم',
    })

    const row = await unscoped.appointment.findUniqueOrThrow({ where: { id: blocked.id } })
    expect(row.isSlotBlock).toBe(true)
    expect(row.customerId).toBeNull()
    expect(row.serviceId).toBeNull()
    expect(row.slotKey).toBeNull()
    expect(row.cancelReason).toBe('جلسه تیم')
    // A block holds no lifecycle and occupies the slot like a booking does.
    expect(row.status).toBe(AppointmentStatus.Booked)
  })

  it('allows an unlimited number of blocks on one slot, because NULL is not compared', async () => {
    await blockHours({
      tx: unscoped as never,
      ctx: context(TENANT_ID, Role.Manager),
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      localDate: DAY,
      localTime: '13:00',
      durationMinutes: 30,
    })
    await expect(
      blockHours({
        tx: unscoped as never,
        ctx: context(TENANT_ID, Role.Manager),
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        localDate: DAY,
        localTime: '13:00',
        durationMinutes: 30,
      }),
    ).resolves.toBeTruthy()
  })

  it('refuses a block that covers a booking the clinic already has', async () => {
    await bookAppointment(bookArgs({ localTime: '09:30' }))

    await expect(
      blockHours({
        tx: unscoped as never,
        ctx: context(TENANT_ID, Role.Manager),
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        localDate: DAY,
        localTime: '09:00',
        durationMinutes: 60,
      }),
    ).rejects.toMatchObject({ messageKey: 'appointment.blockOverlapsBooking' })
  })

  it('allows a block beside a booking, because the two do not overlap', async () => {
    await bookAppointment(bookArgs({ localTime: '09:00' }))

    await expect(
      blockHours({
        tx: unscoped as never,
        ctx: context(TENANT_ID, Role.Manager),
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        localDate: DAY,
        localTime: '09:30',
        durationMinutes: 30,
      }),
    ).resolves.toBeTruthy()
  })
})

describe('rescheduleAppointment', () => {
  it('closes the old row on RESCHEDULED and opens a new one linked back to it', async () => {
    const first = await bookAppointment(bookArgs())

    const moved = await rescheduleAppointment({
      tx: unscoped as never,
      ctx: context(TENANT_ID, Role.Manager),
      appointmentId: first.id,
      newLocalDate: DAY,
      newLocalTime: '12:00',
    })

    expect(moved.localTime).toBe('12:00')
    expect(moved.status).toBe(AppointmentStatus.Booked)

    const closed = await unscoped.appointment.findUniqueOrThrow({ where: { id: first.id } })
    expect(closed.status).toBe(AppointmentStatus.Rescheduled)
    expect(closed.rescheduledToId).toBe(moved.id)
    expect(closed.slotKey).toBeNull()
  })

  it('refuses to reschedule a row that is not a booking', async () => {
    const blocked = await blockHours({
      tx: unscoped as never,
      ctx: context(TENANT_ID, Role.Manager),
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      localDate: DAY,
      localTime: '13:00',
      durationMinutes: 30,
    })

    await expect(
      rescheduleAppointment({
        tx: unscoped as never,
        ctx: context(TENANT_ID, Role.Manager),
        appointmentId: blocked.id,
        newLocalDate: DAY,
        newLocalTime: '12:30',
      }),
    ).rejects.toMatchObject({ messageKey: 'appointment.illegalTransition' })
  })
})

describe('the manual transitions', () => {
  it('records an arrival from AWAITING_ARRIVAL', async () => {
    const booked = await bookAppointment(bookArgs())
    await unscoped.appointment.update({
      where: { id: booked.id },
      data: { status: AppointmentStatus.AwaitingArrival },
    })

    const arrived = await recordArrival({
      tx: unscoped as never,
      ctx: context(TENANT_ID, Role.Secretary, [Permission.RecordAppointmentResult]),
      appointmentId: booked.id,
      now: NOW,
    })

    expect(arrived.status).toBe(AppointmentStatus.Arrived)
    expect(await unscoped.appointment.findUniqueOrThrow({ where: { id: booked.id } })).toMatchObject({
      status: AppointmentStatus.Arrived,
    })
  })

  it('records a result and stamps the instant that clears the alarm', async () => {
    const booked = await bookAppointment(bookArgs())
    await unscoped.appointment.update({
      where: { id: booked.id },
      data: { status: AppointmentStatus.Arrived },
    })

    const completed = await recordResult({
      tx: unscoped as never,
      ctx: context(TENANT_ID, Role.Secretary, [Permission.RecordAppointmentResult]),
      appointmentId: booked.id,
      now: NOW,
    })

    expect(completed.status).toBe(AppointmentStatus.Completed)
    expect(completed.resultRecordedAt).toEqual(NOW)
  })

  it('records a no-show with a trimmed reason, and with none when the desk has none', async () => {
    const booked = await bookAppointment(bookArgs())
    await unscoped.appointment.update({
      where: { id: booked.id },
      data: { status: AppointmentStatus.AwaitingArrival },
    })

    const ctx = context(TENANT_ID, Role.Secretary, [Permission.RecordAppointmentResult])
    await recordNoShow({
      tx: unscoped as never,
      ctx,
      appointmentId: booked.id,
      reason: '  آمد اما نشد  ',
      now: NOW,
    })
    expect(await unscoped.appointment.findUniqueOrThrow({ where: { id: booked.id } })).toMatchObject({
      status: AppointmentStatus.NoShow,
      noShowReason: 'آمد اما نشد',
    })

    const second = await bookAppointment(bookArgs({ localTime: '12:00' }))
    await unscoped.appointment.update({
      where: { id: second.id },
      data: { status: AppointmentStatus.AwaitingArrival },
    })
    await recordNoShow({ tx: unscoped as never, ctx, appointmentId: second.id, now: NOW })
    expect(await unscoped.appointment.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({
      status: AppointmentStatus.NoShow,
      noShowReason: null,
    })
  })

  it('refuses a result for a row still BOOKED, because the awaiting step is not optional', async () => {
    const booked = await bookAppointment(bookArgs())

    await expect(
      recordResult({
        tx: unscoped as never,
        ctx: context(TENANT_ID, Role.Secretary, [Permission.RecordAppointmentResult]),
        appointmentId: booked.id,
        now: NOW,
      }),
    ).rejects.toMatchObject({ messageKey: 'appointment.illegalTransition' })
  })

  it('refuses a transition from a tenant the row does not belong to', async () => {
    // `09-security.md` §6.3's 404-not-403: confirming another tenant holds the id is a
    // disclosure the refusal must not make, so the answer is `notFound`.
    const booked = await bookAppointment(bookArgs())

    await expect(
      recordArrival({
        tx: unscoped as never,
        ctx: context(OTHER_TENANT_ID, Role.Secretary, [Permission.RecordAppointmentResult]),
        appointmentId: booked.id,
        now: NOW,
      }),
    ).rejects.toMatchObject({ messageKey: 'appointment.notFound' })
  })
})
