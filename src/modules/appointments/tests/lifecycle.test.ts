/**
 * The lifecycle sweep — DoD 7, against a real SQLite file.
 *
 * The two transitions no person performs are facts about the clock, and the clock is
 * injected — so the suite names the instants rather than faking timers
 * (`05-conventions.md` §10), and the sweep is the same function the worker's job calls
 * and the reception page calls on the way to rendering.
 *
 * The three assertions that make the suite worth a database:
 *
 * - a booking whose Jalali day has arrived is promoted to `AWAITING_ARRIVAL`, and a
 *   booking on a later day is not;
 * - a booking two hours past its slot with no result becomes `RESULT_NOT_RECORDED`,
 *   which is the alarm, and it appears in the reception cartable and nowhere else;
 * - a row the sweep already moved is not returned by either pass, which is what makes
 *   running the sweep from the request path safe.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AppointmentStatus } from '@/core/constants'
import { CustomerLifecycle } from '@/core/constants'
import {
  asLocalDate,
  asLocalTime,
  toUtcInstant,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'
import { asClinicId, asTenantId, asUserId, type TenantId } from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import {
  flagUnrecordedResults,
  promoteToAwaitingArrival,
  runLifecycleSweep,
} from '../lib/lifecycle'
import { unrecordedCartable } from '../lib/queries'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

/**
 * The instant the sweep reads, chosen so the day has arrived and the morning's slots
 * are past the two-hour threshold.
 *
 * The instant has to land on {@link TODAY} as the library converts it, not merely be
 * labelled as it is below — the sweep derives "today" from the clock and compares it
 * against the stored Jalali day, so a constant that converts to any other day makes
 * every "later day" fixture compare as an earlier one. `1405-01-04` is
 * `2026-03-24` (`jalali.ts`'s conversion, not an assumption about it).
 */
const NOW = new Date('2026-03-24T14:00:00Z')

/** The tenant's offset — Iran Standard Time, UTC+3:30 (`07-localization.md`). */
const UTC_OFFSET = 210

/** The Jalali day of `NOW` under that offset, which is the day the sweep promotes. */
const TODAY = asLocalDate('1405-01-04')

/** A future day, which the promotion must not reach. */
const FUTURE_DAY = asLocalDate('1405-01-10')

/** The slot the fixtures sit on, in the morning so `NOW` is past it. */
const SLOT_TIME = asLocalTime('10:00')

const TENANT_ID: TenantId = asTenantId('tenant-a')
const OTHER_TENANT_ID: TenantId = asTenantId('tenant-b')
const CLINIC_ID = asClinicId('clinic-a')
const DOCTOR_ID = asUserId('doctor-a')
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
    unscoped.service.deleteMany(),
    unscoped.customer.deleteMany(),
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
    data: [
      { tenantId: TENANT_ID, utcOffsetMinutes: UTC_OFFSET },
      { tenantId: OTHER_TENANT_ID, utcOffsetMinutes: UTC_OFFSET },
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
        durationMinutes: 30,
        isActive: true,
      },
    ],
  })
})

/** One booking row, with the status and the slot a case varies. */
async function booking(patch: {
  readonly id: string
  readonly status?: string
  readonly localDate?: LocalDate
  readonly localTime?: LocalTime
  readonly tenantId?: TenantId
}): Promise<string> {
  const localDate = patch.localDate ?? TODAY
  const localTime = patch.localTime ?? SLOT_TIME
  await unscoped.appointment.create({
    data: {
      id: patch.id,
      tenantId: patch.tenantId ?? TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: CUSTOMER_ID,
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: toUtcInstant(localDate, localTime, UTC_OFFSET),
      localDate,
      localTime,
      durationMinutes: 30,
      status: patch.status ?? AppointmentStatus.Booked,
      isSlotBlock: false,
      slotKey: `${patch.id}-slot`,
      priceAtBooking: 1000000n,
    },
  })
  return patch.id
}

describe('promoteToAwaitingArrival', () => {
  it('promotes a booking whose day has arrived', async () => {
    const id = await booking({ id: 'arrived-day', status: AppointmentStatus.Booked })

    const moved = await promoteToAwaitingArrival(unscoped as never, TENANT_ID, NOW)

    expect(moved).toEqual([id])
    expect(await unscoped.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: AppointmentStatus.AwaitingArrival,
    })
  })

  it('leaves a booking on a later day alone', async () => {
    const id = await booking({
      id: 'future-day',
      status: AppointmentStatus.Booked,
      localDate: FUTURE_DAY,
    })

    const moved = await promoteToAwaitingArrival(unscoped as never, TENANT_ID, NOW)

    expect(moved).toEqual([])
    expect((await unscoped.appointment.findUniqueOrThrow({ where: { id } })).status).toBe(
      AppointmentStatus.Booked,
    )
  })

  it('does not touch a slot block, because a block holds no lifecycle', async () => {
    await unscoped.appointment.create({
      data: {
        id: 'block-row',
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date('2026-10-04T10:00:00Z'),
        localDate: TODAY,
        localTime: asLocalTime('10:00'),
        durationMinutes: 60,
        status: AppointmentStatus.Booked,
        isSlotBlock: true,
        priceAtBooking: 0n,
      },
    })

    const moved = await promoteToAwaitingArrival(unscoped as never, TENANT_ID, NOW)

    expect(moved).toEqual([])
  })

  it('is idempotent: a row already promoted is not returned', async () => {
    // The request path runs the sweep on the way to rendering, so a second run must be
    // a no-op rather than a second write.
    const id = await booking({ id: 'arrived-day', status: AppointmentStatus.Booked })

    await promoteToAwaitingArrival(unscoped as never, TENANT_ID, NOW)
    const moved = await promoteToAwaitingArrival(unscoped as never, TENANT_ID, NOW)

    expect(moved).toEqual([])
    expect(await unscoped.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: AppointmentStatus.AwaitingArrival,
    })
  })
})

describe('flagUnrecordedResults', () => {
  it('flags a booking two hours past its slot with no result', async () => {
    // `NOW` is ۱۴:۰۰ UTC; the slot is ۱۰:۰۰ local, which is ۰۶:۳۰ UTC at +۳:۳۰, so
    // the slot is seven and a half hours past — past the two-hour threshold.
    const id = await booking({ id: 'overdue', status: AppointmentStatus.AwaitingArrival })

    const flagged = await flagUnrecordedResults(unscoped as never, TENANT_ID, NOW, UTC_OFFSET)

    expect(flagged).toEqual([id])
    expect(await unscoped.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: AppointmentStatus.ResultNotRecorded,
    })
  })

  it('flags an arrival the result was never recorded for', async () => {
    // `ARRIVED` alone is not a result — arrival without an outcome is precisely the
    // condition the alarm exists to flag.
    const id = await booking({ id: 'arrived-no-result', status: AppointmentStatus.Arrived })

    const flagged = await flagUnrecordedResults(unscoped as never, TENANT_ID, NOW, UTC_OFFSET)

    expect(flagged).toEqual([id])
  })

  it('leaves a booking whose slot is still ahead alone', async () => {
    const id = await booking({
      id: 'later-slot',
      status: AppointmentStatus.AwaitingArrival,
      localTime: asLocalTime('16:00'),
    })

    const flagged = await flagUnrecordedResults(unscoped as never, TENANT_ID, NOW, UTC_OFFSET)

    expect(flagged).toEqual([])
    expect((await unscoped.appointment.findUniqueOrThrow({ where: { id } })).status).toBe(
      AppointmentStatus.AwaitingArrival,
    )
  })

  it('leaves a booking on a later day alone', async () => {
    const id = await booking({
      id: 'future-slot',
      status: AppointmentStatus.AwaitingArrival,
      localDate: FUTURE_DAY,
    })

    const flagged = await flagUnrecordedResults(unscoped as never, TENANT_ID, NOW, UTC_OFFSET)

    expect(flagged).toEqual([])
    expect((await unscoped.appointment.findUniqueOrThrow({ where: { id } })).status).toBe(
      AppointmentStatus.AwaitingArrival,
    )
  })

  it('leaves a booking whose result was recorded alone', async () => {
    // `resultRecordedAt` is the column that clears the alarm, and the sweep's `null`
    // predicate is what keeps a completed row out of it forever.
    const id = await booking({
      id: 'recorded',
      status: AppointmentStatus.Completed,
    })
    await unscoped.appointment.update({
      where: { id },
      data: { resultRecordedAt: new Date('2026-10-04T11:00:00Z') },
    })

    const flagged = await flagUnrecordedResults(unscoped as never, TENANT_ID, NOW, UTC_OFFSET)

    expect(flagged).toEqual([])
  })

  it('does not reach into another tenant', async () => {
    await booking({
      id: 'other-tenant-row',
      status: AppointmentStatus.AwaitingArrival,
      tenantId: OTHER_TENANT_ID,
    })

    const flagged = await flagUnrecordedResults(unscoped as never, TENANT_ID, NOW, UTC_OFFSET)

    expect(flagged).toEqual([])
  })
})

describe('runLifecycleSweep', () => {
  it('promotes before it flags, so a promoted row can be flagged in the same pass', async () => {
    // The order is the state machine's: a `BOOKED` row behind today becomes
    // `AWAITING_ARRIVAL` first, and the overdue pass then considers it. A booking at
    // ۰۹:۰۰ on a day that has arrived is both, and one sweep moves it twice.
    const id = await booking({
      id: 'both-passes',
      status: AppointmentStatus.Booked,
      localTime: asLocalTime('09:00'),
    })

    const outcome = await runLifecycleSweep({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      now: NOW,
      utcOffsetMinutes: UTC_OFFSET,
    })

    expect(outcome.promoted).toEqual([id])
    expect(outcome.flagged).toEqual([id])
    expect(await unscoped.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: AppointmentStatus.ResultNotRecorded,
    })
  })

  it('answers two empty lists when the tenant holds nothing outstanding', async () => {
    const outcome = await runLifecycleSweep({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      now: NOW,
      utcOffsetMinutes: UTC_OFFSET,
    })

    expect(outcome).toEqual({ promoted: [], flagged: [] })
  })
})

describe('the alarm surfaces only in the reception cartable', () => {
  it("holds the flagged row and the day's expectation and arrivals", async () => {
    const flagged = await booking({
      id: 'overdue',
      status: AppointmentStatus.ResultNotRecorded,
    })
    const expected = await booking({
      id: 'expected',
      status: AppointmentStatus.AwaitingArrival,
      localTime: asLocalTime('16:00'),
    })
    const arrived = await booking({
      id: 'arrived',
      status: AppointmentStatus.Arrived,
      localTime: asLocalTime('16:30'),
    })

    const rows = await unrecordedCartable({ tx: unscoped as never, tenantId: TENANT_ID })

    expect(rows.map((row) => row.id).sort()).toEqual([arrived, expected, flagged].sort())
  })

  it("does not hold a booking, a block, or another tenant's row", async () => {
    await booking({ id: 'plain-booking', status: AppointmentStatus.Booked })
    await unscoped.appointment.create({
      data: {
        id: 'block-row',
        tenantId: TENANT_ID,
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date('2026-10-04T10:00:00Z'),
        localDate: TODAY,
        localTime: asLocalTime('13:00'),
        durationMinutes: 60,
        status: AppointmentStatus.Booked,
        isSlotBlock: true,
        priceAtBooking: 0n,
      },
    })
    await booking({
      id: 'other-tenant',
      status: AppointmentStatus.ResultNotRecorded,
      tenantId: OTHER_TENANT_ID,
    })

    const rows = await unrecordedCartable({ tx: unscoped as never, tenantId: TENANT_ID })

    expect(rows).toHaveLength(0)
  })
})