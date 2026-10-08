/**
 * The public reads — the shop front, as a visitor sees it.
 *
 * The existing file holds Phase 8's three definitions of done; this one holds the
 * reads themselves, because they are the surface the eight public pages render from
 * and three of the four rules they carry are not the three the phase named:
 *
 * - **A deactivated service is absent from the catalogue**, the same way it is absent
 *   from the booking picker.
 * - **Consent filters the gallery in the read**, so a page cannot render an image the
 *   clinic never published or the person later withdrew.
 * - **The wizard's slots come from the real availability engine**, so a time the site
 *   shows is a time the booking accepts.
 * - **The reads never cross tenants**, which is the whole of a surface that holds no
 *   session and no permission to check.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { asClinicId, asTenantId, asUserId, type TenantId, type UserId } from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import {
  publicBeforeAfter,
  publicDoctors,
  publicService,
  publicServiceBeforeAfter,
  publicServices,
  publicSlotsForDay,
} from '@/modules/public-site'
import { asLocalDate, asLocalTime } from '@/core/localization'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-a')
const OTHER_TENANT_ID: TenantId = asTenantId('tenant-b')
const CLINIC_ID = asClinicId('clinic-a')
const DOCTOR_ID: UserId = asUserId('doctor-a')
const OTHER_DOCTOR_ID: UserId = asUserId('doctor-b')
const CUSTOMER_ID = 'customer-a'
const SERVICE_ID = 'service-a'
const PRICEY_ID = 'service-b'

/** A day the shift and the doctor's hours are seeded for. */
const DAY = asLocalDate('1405-01-04')
const DAY_WEEKDAY = 3

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
    unscoped.beforeAfterImage.deleteMany(),
    unscoped.serviceDoctor.deleteMany(),
    unscoped.appointment.deleteMany(),
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
      { id: TENANT_ID, slug: 'a', name: 'کلینیک الف', isActive: true },
      { id: OTHER_TENANT_ID, slug: 'b', name: 'کلینیک ب', isActive: true },
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
        lifecycle: 'CUSTOMER',
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
        price: 1_000_000n,
        depositAmount: 0n,
        durationMinutes: 30,
        isActive: true,
      },
      {
        id: PRICEY_ID,
        tenantId: TENANT_ID,
        name: 'خدمت گران',
        searchName: 'خدمت گران',
        category: 'عمومی',
        price: 3_000_000n,
        depositAmount: 0n,
        durationMinutes: 45,
        isActive: true,
      },
      {
        id: 'service-inactive',
        tenantId: TENANT_ID,
        name: 'خدمت غیرفعال',
        searchName: 'خدمت غیرفعال',
        category: 'عمومی',
        price: 500_000n,
        depositAmount: 0n,
        durationMinutes: 30,
        isActive: false,
      },
      {
        id: 'service-other',
        tenantId: OTHER_TENANT_ID,
        name: 'خدمت ب',
        searchName: 'خدمت ب',
        category: 'عمومی',
        price: 1_000_000n,
        depositAmount: 0n,
        durationMinutes: 30,
        isActive: true,
      },
    ],
  })
})

describe('publicServices', () => {
  it('lists the active services cheapest first', async () => {
    const services = await publicServices(unscoped, TENANT_ID)

    expect(services.map((service) => service.name)).toEqual(['خدمت الف', 'خدمت گران'])
    expect(services.map((service) => service.price)).toEqual([1_000_000n, 3_000_000n])
  })

  it('omits a deactivated service, and keeps the price and the duration it carried', async () => {
    const services = await publicServices(unscoped, TENANT_ID)
    expect(services.find((service) => service.name === 'خدمت غیرفعال')).toBeUndefined()

    // The catalogue's read is what removes it; the row the desk priced appointments
    // with is untouched.
    const row = await unscoped.service.findUniqueOrThrow({ where: { id: 'service-inactive' } })
    expect(row.price).toBe(500_000n)
  })

  it('stops at the tenant boundary', async () => {
    const services = await publicServices(unscoped, TENANT_ID)
    expect(services.map((service) => service.name)).not.toContain('خدمت ب')
  })
})

describe('publicService', () => {
  it('reads one service by id, with its care text', async () => {
    await unscoped.service.update({
      where: { id: SERVICE_ID },
      data: {
        siteDescription: 'توضیح سایت',
        beforeCare: 'مراقبت قبل',
        afterCare: 'مراقبت بعد',
        notSuitableFor: 'مناسب نیست',
      },
    })

    const service = await publicService(unscoped, TENANT_ID, SERVICE_ID)
    expect(service).toMatchObject({
      id: SERVICE_ID,
      name: 'خدمت الف',
      siteDescription: 'توضیح سایت',
      beforeCare: 'مراقبت قبل',
      afterCare: 'مراقبت بعد',
      notSuitableFor: 'مناسب نیست',
    })
  })

  it('is null for a service the tenant does not have', async () => {
    expect(await publicService(unscoped, TENANT_ID, 'service-other')).toBeNull()
    expect(await publicService(unscoped, TENANT_ID, 'no-such-service')).toBeNull()
  })

  it('is null for a deactivated service, so its page renders a 404', async () => {
    expect(await publicService(unscoped, TENANT_ID, 'service-inactive')).toBeNull()
  })

  it('is null for the other tenant\'s service', async () => {
    expect(await publicService(unscoped, OTHER_TENANT_ID, SERVICE_ID)).toBeNull()
  })
})

describe('publicDoctors', () => {
  it('lists the doctors with the services each performs', async () => {
    await unscoped.serviceDoctor.createMany({
      data: [
        { tenantId: TENANT_ID, serviceId: SERVICE_ID, doctorId: DOCTOR_ID },
        { tenantId: TENANT_ID, serviceId: PRICEY_ID, doctorId: DOCTOR_ID },
      ],
    })

    const doctors = await publicDoctors(unscoped, TENANT_ID)
    expect(doctors).toHaveLength(1)
    expect(doctors[0]?.name).toBe('پزشک الف')
    expect(doctors[0]?.specialties).toEqual(['خدمت الف', 'خدمت گران'])
  })

  it('names no service the catalogue has deactivated', async () => {
    await unscoped.serviceDoctor.createMany({
      data: [
        { tenantId: TENANT_ID, serviceId: SERVICE_ID, doctorId: DOCTOR_ID },
        { tenantId: TENANT_ID, serviceId: 'service-inactive', doctorId: DOCTOR_ID },
      ],
    })

    const doctors = await publicDoctors(unscoped, TENANT_ID)
    // The catalogue read omits the deactivated service; the doctor card naming it
    // would sell a service the visitor cannot book.
    expect(doctors[0]?.specialties).toEqual(['خدمت الف'])
  })

  it('lists no doctor who has no assigned service', async () => {
    expect(await publicDoctors(unscoped, TENANT_ID)).toHaveLength(0)
  })

  it('keeps the other tenant\'s doctors out', async () => {
    await unscoped.serviceDoctor.createMany({
      data: [
        { tenantId: TENANT_ID, serviceId: SERVICE_ID, doctorId: DOCTOR_ID },
        { tenantId: OTHER_TENANT_ID, serviceId: 'service-other', doctorId: OTHER_DOCTOR_ID },
      ],
    })

    const doctors = await publicDoctors(unscoped, TENANT_ID)
    expect(doctors.map((doctor) => doctor.id)).toEqual([DOCTOR_ID])
  })
})

describe('publicBeforeAfter', () => {
  it('publishes only what the clinic flagged, and stops at a withdrawal', async () => {
    await unscoped.beforeAfterImage.createMany({
      data: [
        {
          tenantId: TENANT_ID,
          customerId: CUSTOMER_ID,
          path: '/images/1.jpg',
          caption: 'اول',
          consentText: 'رضایت کتبی',
          isVisible: true,
        },
        {
          tenantId: TENANT_ID,
          customerId: CUSTOMER_ID,
          path: '/images/2.jpg',
          caption: 'دوم',
          consentText: 'رضایت کتبی',
          isVisible: false,
        },
        {
          tenantId: TENANT_ID,
          customerId: CUSTOMER_ID,
          path: '/images/3.jpg',
          caption: 'سوم',
          consentText: 'رضایت کتبی',
          isVisible: true,
          revokedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
    })

    const published = await publicBeforeAfter(unscoped, TENANT_ID)
    expect(published.map((image) => image.path)).toEqual(['/images/1.jpg'])
  })

  it('is the same read the service page uses, so the two agree', async () => {
    await unscoped.beforeAfterImage.create({
      data: {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        path: '/images/1.jpg',
        consentText: 'رضایت کتبی',
        isVisible: true,
      },
    })

    expect(await publicServiceBeforeAfter(unscoped, TENANT_ID)).toEqual(
      await publicBeforeAfter(unscoped, TENANT_ID),
    )
  })

  it('never returns the other tenant\'s images', async () => {
    await unscoped.beforeAfterImage.create({
      data: {
        tenantId: OTHER_TENANT_ID,
        customerId: CUSTOMER_ID,
        path: '/images/other.jpg',
        consentText: 'رضایت کتبی',
        isVisible: true,
      },
    })

    expect(await publicBeforeAfter(unscoped, TENANT_ID)).toHaveLength(0)
  })
})

describe('publicSlotsForDay', () => {
  it("offers the shift's slots at the service's own duration", async () => {
    const slots = await publicSlotsForDay({
      tx: unscoped,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      localDate: DAY,
    })

    expect(slots.length).toBeGreaterThan(0)
    expect(slots.every((slot) => slot.durationMinutes === 30)).toBe(true)
    expect(slots.map((slot) => slot.time)).toContain('09:00')
  })

  it('offers nothing on a day the clinic is closed', async () => {
    const slots = await publicSlotsForDay({
      tx: unscoped,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      localDate: asLocalDate('1405-01-05'),
    })

    expect(slots).toHaveLength(0)
  })

  it('removes a slot the desk blocked', async () => {
    await unscoped.appointment.create({
      data: {
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        customerId: CUSTOMER_ID,
        serviceId: SERVICE_ID,
        localDate: DAY,
        localTime: asLocalTime('09:00'),
        scheduledAt: new Date('2026-03-22T05:30:00Z'),
        durationMinutes: 30,
        priceAtBooking: 1_000_000n,
        isSlotBlock: true,
        status: 'CANCELLED',
      },
    })

    const slots = await publicSlotsForDay({
      tx: unscoped,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      localDate: DAY,
    })

    expect(slots.map((slot) => slot.time)).not.toContain('09:00')
  })

  it('offers nothing for a service the tenant does not have', async () => {
    const slots = await publicSlotsForDay({
      tx: unscoped,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      serviceId: 'service-other',
      localDate: DAY,
    })

    expect(slots).toHaveLength(0)
  })

  it('offers nothing when the clinic is on holiday and the toggle is off', async () => {
    await unscoped.holiday.create({
      data: { tenantId: TENANT_ID, localDate: DAY, title: 'تعطیل رسمی' },
    })

    const slots = await publicSlotsForDay({
      tx: unscoped,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      localDate: DAY,
    })

    expect(slots).toHaveLength(0)
  })
})
