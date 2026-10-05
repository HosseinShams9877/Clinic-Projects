/**
 * Deactivation is the catalogue's only removal — Phase 3's DoD 3 and DoD 4, against a
 * real SQLite file.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." The three assertions that make a mock worthless are:
 *
 * - **DoD 3** — there is no delete. Not "delete refuses", not "delete is hidden": the
 *   function that would delete is not exported by the barrel, and the assertion says
 *   so as a property of the module's own surface. The surface a mock would have
 *   provided is the thing under test.
 * - **DoD 3's other half** — deactivation is what replaces it, and it is the whole
 *   write: `isActive` moves and nothing else does.
 * - **DoD 4** — the deactivated service is gone from the booking path
 *   (`loadBookableService` refuses it) and every appointment that already used it is
 *   untouched, because its columns are snapshots and never were a join.
 *
 * ## Why the barrel is asserted at the type level
 *
 * "The delete path does not exist" is a claim about the module's public surface, and
 * the surface is the barrel. `deleteService` not being a key of the module's exports
 * is the fact; a mock would have had to be told not to have it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AppointmentStatus, Role, ServiceCategory } from '@/core/constants'
import { EMPTY_PERMISSION_OVERRIDES } from '@/core/tenant'
import type { TenantContext } from '@/core/tenant'
import {
  asClinicId,
  asTenantId,
  asUserId,
  type TenantId,
  type UserId,
} from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import * as servicesModule from '../index'
import {
  activateService,
  assignServiceDoctors,
  bookableServices,
  createService,
  deactivateService,
  loadBookableService,
  serviceDoctors,
  updateService,
} from '../index'
import { DomainError, NotFoundError } from '@/core/types'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-a')
const OTHER_TENANT_ID: TenantId = asTenantId('tenant-b')
const CLINIC_ID = asClinicId('clinic-a')
const MANAGER_ID: UserId = asUserId('manager-a')
const DOCTOR_ID: UserId = asUserId('doctor-a')

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
    unscoped.serviceDoctor.deleteMany(),
    unscoped.appointment.deleteMany(),
    unscoped.service.deleteMany(),
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
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.tenantSettings.createMany({
    data: [{ tenantId: TENANT_ID, utcOffsetMinutes: 210 }],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: MANAGER_ID,
        tenantId: TENANT_ID,
        mobile: '09120000001',
        firstName: 'مدیر',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: DOCTOR_ID,
        tenantId: TENANT_ID,
        mobile: '09120000002',
        firstName: 'پزشک',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })
  await unscoped.membership.createMany({
    data: [
      {
        id: 'membership-doctor',
        tenantId: TENANT_ID,
        userId: DOCTOR_ID,
        role: Role.Doctor,
        isActive: true,
      },
    ],
  })
})

/** A manager's context in tenant A, which the catalogue's writes require. */
function managerContext(): TenantContext {
  return {
    userId: MANAGER_ID,
    tenantId: TENANT_ID,
    clinicId: null,
    role: Role.Manager,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }
}

/** One active service in the tenant, as the catalogue's own row. */
async function seedService(): Promise<string> {
  await createService({
    tx: unscoped as never,
    ctx: managerContext(),
    name: 'خدمت الف',
    category: ServiceCategory.Skin,
    price: 1000000n,
    depositAmount: 200000n,
    durationMinutes: 30,
  })
  const row = await unscoped.service.findFirstOrThrow({
    where: { tenantId: TENANT_ID, name: 'خدمت الف' },
    select: { id: true },
  })
  return row.id
}

/* ── DoD 3: the delete path does not exist ────────────────────────────────── */

describe('the catalogue having no delete', () => {
  it('does not export a delete of any name', () => {
    // The claim is about the module's own surface: no function whose name mentions a
    // delete is reachable through the barrel, which is the rule's read half.
    const names = Object.keys(servicesModule).filter((name) =>
      /delete|remove|destroy|purge/i.test(name),
    )
    expect(names).toEqual([])

    // And the specific names a surface might have reached for are absent.
    expect(servicesModule).not.toHaveProperty('deleteService')
    expect(servicesModule).not.toHaveProperty('removeService')
  })

  it('deactivates a service and writes nothing but the flag', async () => {
    const id = await seedService()
    await assignServiceDoctors({
      tx: unscoped as never,
      ctx: managerContext(),
      serviceId: id,
      doctorIds: [DOCTOR_ID],
    })

    const deactivated = await deactivateService({
      tx: unscoped as never,
      ctx: managerContext(),
      serviceId: id,
    })
    expect(deactivated.isActive).toBe(false)

    const row = await unscoped.service.findUniqueOrThrow({ where: { id } })
    expect(row.isActive).toBe(false)

    // Everything the clinic entered is where it was, because the row is what stays.
    expect(row.name).toBe('خدمت الف')
    expect(row.category).toBe(ServiceCategory.Skin)
    expect(row.price).toBe(1000000n)
    expect(row.depositAmount).toBe(200000n)
    expect(row.durationMinutes).toBe(30)

    // The doctors the service was bookable by are untouched too: the deactivation
    // closes the picker and does not reorganise the clinic.
    const doctors = await serviceDoctors({ tx: unscoped as never, ctx: managerContext(), serviceId: id })
    expect(doctors.map((row) => row.doctorId)).toEqual([DOCTOR_ID])
  })

  it('reactivates a service and returns it to the picker', async () => {
    const id = await seedService()
    await deactivateService({ tx: unscoped as never, ctx: managerContext(), serviceId: id })

    const reactivated = await activateService({
      tx: unscoped as never,
      ctx: managerContext(),
      serviceId: id,
    })
    expect(reactivated.isActive).toBe(true)
  })

  it('leaves another tenant\'s service alone', async () => {
    const id = await seedService()

    await expect(
      deactivateService({
        tx: unscoped as never,
        ctx: { ...managerContext(), tenantId: OTHER_TENANT_ID },
        serviceId: id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError)

    const row = await unscoped.service.findUniqueOrThrow({ where: { id } })
    expect(row.isActive).toBe(true)
  })
})

/* ── DoD 4: deactivation closes the booking path and keeps the history ────── */

describe('a deactivated service on the booking path', () => {
  it('is refused by the booking gate and absent from the picker', async () => {
    const id = await seedService()
    await deactivateService({ tx: unscoped as never, ctx: managerContext(), serviceId: id })

    await expect(
      loadBookableService({ tx: unscoped as never, ctx: managerContext(), serviceId: id }),
    ).rejects.toMatchObject({ messageKey: 'service.notBookable' })

    const bookable = await bookableServices({ tx: unscoped as never, ctx: managerContext() })
    expect(bookable.map((row) => row.id)).not.toContain(id)
  })

  it('leaves every past appointment and its price intact', async () => {
    const id = await seedService()
    const now = new Date('2026-10-04T10:00:00Z')

    // One appointment that used the service while it was active.
    await unscoped.appointment.create({
      data: {
        id: 'appointment-a',
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        serviceId: id,
        scheduledAt: now,
        localDate: '2026-10-04',
        localTime: '10:00',
        durationMinutes: 30,
        status: AppointmentStatus.Booked,
        priceAtBooking: 1000000n,
        depositAmount: 200000n,
      },
    })

    await deactivateService({ tx: unscoped as never, ctx: managerContext(), serviceId: id })

    const appointment = await unscoped.appointment.findUniqueOrThrow({
      where: { id: 'appointment-a' },
    })
    // The history still points at the row it was made against, at the price it was made at.
    expect(appointment.serviceId).toBe(id)
    expect(appointment.priceAtBooking).toBe(1000000n)
    expect(appointment.depositAmount).toBe(200000n)
    expect(appointment.durationMinutes).toBe(30)

    // The catalogue row the history points at is still there to point at.
    const row = await unscoped.service.findUniqueOrThrow({ where: { id } })
    expect(row.name).toBe('خدمت الف')
  })

  it('takes a price change without rewriting the bookings already made', async () => {
    const id = await seedService()
    await unscoped.appointment.create({
      data: {
        id: 'appointment-a',
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        serviceId: id,
        scheduledAt: new Date('2026-10-04T10:00:00Z'),
        localDate: '2026-10-04',
        localTime: '10:00',
        durationMinutes: 30,
        status: AppointmentStatus.Booked,
        priceAtBooking: 1000000n,
        depositAmount: 0n,
      },
    })

    await updateService({
      tx: unscoped as never,
      ctx: managerContext(),
      serviceId: id,
      name: 'خدمت الف ویرایش شده',
      price: 1200000n,
    })

    const appointment = await unscoped.appointment.findUniqueOrThrow({
      where: { id: 'appointment-a' },
    })
    // The price the desk booked at is a snapshot and not a join, so the catalogue's new
    // price is the price of the next booking and not of this one.
    expect(appointment.priceAtBooking).toBe(1000000n)
    expect(appointment.durationMinutes).toBe(30)

    const row = await unscoped.service.findUniqueOrThrow({ where: { id } })
    expect(row.price).toBe(1200000n)
    expect(row.name).toBe('خدمت الف ویرایش شده')
  })
})

/* ── The refusal the module raises, named ─────────────────────────────────── */

describe('the gate\'s refusal', () => {
  it('raises a domain error and not a validation one', async () => {
    const id = await seedService()
    await deactivateService({ tx: unscoped as never, ctx: managerContext(), serviceId: id })

    await expect(
      loadBookableService({ tx: unscoped as never, ctx: managerContext(), serviceId: id }),
    ).rejects.toBeInstanceOf(DomainError)
  })
})
