/**
 * The four specification scenarios, end to end — Phase 11's DoD 1.
 *
 * Each scenario is the definition of done for the phase that completed it, and each
 * was verified there against the module it owns. What this suite adds is the **chain**:
 * every scenario runs from a clean database, through the real module functions and in
 * the order the specification narrates, so the hand-off *between* the modules is what
 * is tested — the step that a per-module suite cannot reach, and the one that only
 * appears when everything runs together.
 *
 * **On the engine.** The specification asks for these on PostgreSQL with RLS live.
 * PostgreSQL is not available in this environment (see `reports/phase-11-report.md`),
 * so the chain runs against the same real SQLite file the rest of the suite uses and
 * the isolation assertions the chain makes are the extension's, not RLS's. The choice
 * is recorded rather than hidden: a chain green here is a chain green against one
 * engine, and the PostgreSQL run remains unobserved.
 *
 * The four:
 *
 * | # | Scenario | The chain this file drives |
 * |---|---|---|
 * | One | A new customer, Instagram to first session | lead → catalogue → wizard → booking → conversion |
 * | Two | A secretary's working day | the day's grid → arrivals → results → a no-show → the sweep |
 * | Three | A six-session course, with a drop-off and a return | sessions → cycle → stall → return |
 * | Four | A birthday campaign, from a Persian sentence to a booking | brief → proposal → campaign → dispatch → booking |
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AbandonmentReason,
  AcquisitionSource,
  AppointmentSource,
  AppointmentStatus,
  CampaignStatus,
  Channel,
  Role,
} from '@/core/constants'
import { EMPTY_PERMISSION_OVERRIDES, type TenantContext } from '@/core/tenant'
import {
  asClinicId,
  asTenantId,
  asUserId,
  type ClinicId,
  type TenantId,
  type UserId,
} from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import {
  bookPublicAppointment,
  clinicDay,
  flagUnrecordedResults,
  promoteToAwaitingArrival,
  recordArrival,
  recordNoShow,
  recordResult,
} from '@/modules/appointments'

import { createLead, createOrFindCustomer } from '@/modules/customers'
import { interpretCampaignBrief } from '@/modules/campaign-assistant'
import { activateCampaign, approveCampaign, createCampaign, dispatchDueCampaigns } from '@/modules/campaigns'
import { attributeAppointmentToCampaign, submitCampaignForApproval } from '@/modules/campaigns'
import { publicDoctors, publicServices, publicSlotsForDay } from '@/modules/public-site'
import { recordCompletedSession } from '@/modules/cycles'
import { abandonCycle, completeCycle } from '@/modules/cycles'
import { ensureBuiltInGroups, refreshAudienceGroupCounts } from '@/modules/audience-groups'

import { asLocalDate, asLocalTime } from '@/core/localization'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-a')
const CLINIC_ID: ClinicId = asClinicId('clinic-a')
const DOCTOR_ID: UserId = asUserId('doctor-a')
const SECRETARY_ID: UserId = asUserId('secretary-a')
const MANAGER_ID: UserId = asUserId('manager-a')
const SERVICE_ID = 'service-course'
const BIRTHDAY_CUSTOMER_ID = 'customer-birthday'

/** A day the clinic and the doctor are both open for. */
const DAY = asLocalDate('1405-01-04')
const DAY_WEEKDAY = 3
/** ۰۹:۰۰ local on that day — the suite's clock, +03:30 ahead of UTC. */
const DAY_INSTANT = new Date('2026-03-24T05:30:00Z')

/** The instant a slot on the seeded day starts at, for a booking's `scheduledAt`. */
function slotInstant(localTime: string): Date {
  const hours = Number(localTime.split(':')[0] ?? 0)
  return new Date(Date.UTC(2026, 2, 24, hours - 3, 30 - (hours < 3 ? 60 : 0)))
}

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
    unscoped.messageSend.deleteMany(),
    unscoped.campaign.deleteMany(),
    unscoped.audienceGroup.deleteMany(),
    unscoped.appointment.deleteMany(),
    unscoped.treatmentCycle.deleteMany(),
    unscoped.serviceDoctor.deleteMany(),
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

  await unscoped.tenant.create({
    data: { id: TENANT_ID, slug: 'a', name: 'کلینیک زیبایی الف', isActive: true },
  })
  await unscoped.clinic.createMany({
    data: [{ id: CLINIC_ID, tenantId: TENANT_ID, name: 'شعبه اصلی', isActive: true }],
  })
  await unscoped.tenantSettings.create({ data: { tenantId: TENANT_ID, utcOffsetMinutes: 210 } })
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
        id: SECRETARY_ID,
        tenantId: TENANT_ID,
        mobile: '09120000002',
        firstName: 'منشی',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: MANAGER_ID,
        tenantId: TENANT_ID,
        mobile: '09120000003',
        firstName: 'مدیر',
        lastName: 'الف',
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
  await unscoped.service.createMany({
    data: [
      {
        id: SERVICE_ID,
        tenantId: TENANT_ID,
        name: 'خدمت دوره‌ای',
        searchName: 'خدمت دوره‌ای',
        category: 'عمومی',
        price: 2_000_000n,
        depositAmount: 0n,
        durationMinutes: 30,
        isActive: true,
        /** The course scenario three is a six-session one. */
        defaultSessions: 6,
        defaultIntervalDays: 14,
      },
    ],
  })
  await unscoped.serviceDoctor.createMany({
    data: [{ tenantId: TENANT_ID, serviceId: SERVICE_ID, doctorId: DOCTOR_ID }],
  })
})

/** A secretary's context — the role the reception panel's scenarios act under. */
function secretaryContext(): TenantContext {
  return {
    userId: SECRETARY_ID,
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: Role.Secretary,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }
}

/** The public site's context: a role the permission primitive refuses, by design. */
function publicContext() {
  return {
    tenantId: TENANT_ID,
    clinicId: CLINIC_ID,
    role: 'public' as const,
    userId: asUserId('visitor'),
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }
}

/** Books a session of the course, at `slot` on the seeded day. */
async function bookSession(customerId: string, slot: string, source: string) {
  return bookPublicAppointment({
    tx: unscoped as never,
    ctx: publicContext(),
    clinicId: CLINIC_ID,
    doctorId: DOCTOR_ID,
    customerId,
    serviceId: SERVICE_ID,
    localDate: DAY,
    localTime: asLocalTime(slot),
    durationMinutes: 30,
    priceAtBooking: 2_000_000n,
    depositAmount: 0n,
    source,
  })
}

describe('scenario one — a new customer, Instagram to first session', () => {
  it('turns a lead into a customer on the booking the wizard made', async () => {
    // The chain's first step: a person reaches the clinic from Instagram and the desk
    // records them as a lead, before any session exists.
    const lead = await createLead({
      tx: unscoped as never,
      ctx: secretaryContext(),
      mobile: '09130000010',
      firstName: 'مراجع',
      lastName: 'جدید',
      acquisitionSource: AcquisitionSource.Instagram,
    })
    expect((await unscoped.customer.findUniqueOrThrow({ where: { id: lead.id } })).lifecycle).toBe('LEAD')
    expect(lead.acquisitionSource).toBe(AcquisitionSource.Instagram)

    // The chain's middle: the visitor sees the catalogue and the team the way the
    // public pages render them, and the wizard's slots come from the same engine the
    // booking writes through.
    const services = await publicServices(unscoped, TENANT_ID)
    expect(services.map((service) => service.id)).toContain(SERVICE_ID)

    const doctors = await publicDoctors(unscoped, TENANT_ID)
    expect(doctors.map((doctor) => doctor.id)).toContain(DOCTOR_ID)

    const slots = await publicSlotsForDay({
      tx: unscoped,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      localDate: DAY,
    })
    expect(slots.map((slot) => slot.time)).toContain('09:00')

    // The chain's last step: the booking path's dedupe is what converts the lead, and
    // the source it arrived with is the column the acquisition report counts on.
    const converted = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: publicContext(),
      mobile: '09130000010',
      firstName: 'مراجع',
      lastName: 'جدید',
    })
    expect(converted.id).toBe(lead.id)
    expect(converted.convertedFromLead).toBe(true)

    const after = await unscoped.customer.findUniqueOrThrow({ where: { id: lead.id } })
    expect(after.lifecycle).toBe('CUSTOMER')
    // The source the lead arrived with survives the conversion, which is the fact the
    // acquisition report counts on.
    expect(after.acquisitionSource).toBe(AcquisitionSource.Instagram)

    const booked = await bookSession(lead.id, '09:00', AppointmentSource.Website)
    expect(booked.status).toBe(AppointmentStatus.Booked)
  })

  it('recognises the same person on a second contact, and creates nothing', async () => {
    const first = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: publicContext(),
      mobile: '09130000010',
      firstName: 'مراجع',
      lastName: 'جدید',
    })
    await bookSession(first.id, '09:00', AppointmentSource.Website)

    const second = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: publicContext(),
      mobile: '09130000010',
      firstName: 'مراجع',
      lastName: 'جدید',
    })
    expect(second.id).toBe(first.id)
    expect(second.created).toBe(false)
    expect(await unscoped.customer.count({ where: { tenantId: TENANT_ID } })).toBe(1)
  })
})

describe('scenario two — a secretary\'s working day', () => {
  it('moves the day\'s three sessions through to their outcomes', async () => {
    const customer = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: publicContext(),
      mobile: '09130000020',
      firstName: 'مراجع',
      lastName: 'روز',
    })

    const slots = await publicSlotsForDay({
      tx: unscoped,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      doctorId: DOCTOR_ID,
      serviceId: SERVICE_ID,
      localDate: DAY,
    })
    expect(slots.length).toBeGreaterThanOrEqual(3)

    const booked = await Promise.all(
      slots.slice(0, 3).map((slot) =>
        bookPublicAppointment({
          tx: unscoped as never,
          ctx: publicContext(),
          clinicId: CLINIC_ID,
          doctorId: DOCTOR_ID,
          customerId: customer.id,
          serviceId: SERVICE_ID,
          localDate: DAY,
          localTime: asLocalTime(slot.time),
          durationMinutes: 30,
          priceAtBooking: 2_000_000n,
          depositAmount: 0n,
          source: AppointmentSource.Website,
        }),
      ),
    )
    await promoteToAwaitingArrival(unscoped as never, TENANT_ID, DAY_INSTANT)
    const ids = booked.map((row) => row.id)

    // The day the desk opens: three sessions, all waiting on the patient.
    const morning = await clinicDay({
      tx: unscoped as never,
      ctx: secretaryContext(),
      clinicId: CLINIC_ID,
      localDate: DAY,
    })
    expect(morning).toHaveLength(3)

    // The first patient arrives and is treated.
    await recordArrival({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: ids[0]!,
      now: DAY_INSTANT,
    })
    await recordResult({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: ids[0]!,
      now: DAY_INSTANT,
    })

    // The second never arrives.
    await recordNoShow({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: ids[1]!,
      now: DAY_INSTANT,
    })

    // The third arrives but the doctor has not written the result yet.
    await recordArrival({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: ids[2]!,
      now: DAY_INSTANT,
    })

    const statuses = await unscoped.appointment.findMany({
      where: { tenantId: TENANT_ID },
      select: { id: true, status: true },
      orderBy: { localTime: 'asc' },
    })
    expect(statuses.map((row) => row.status)).toEqual([
      AppointmentStatus.Completed,
      AppointmentStatus.NoShow,
      AppointmentStatus.Arrived,
    ])
  })

  it('flags the session the desk left without a result', async () => {
    const customer = await unscoped.customer.create({
      data: {
        tenantId: TENANT_ID,
        mobile: '09130000021',
        firstName: 'مراجع',
        searchName: 'مراجع',
        lifecycle: 'CUSTOMER',
      },
    })
    const booked = await bookSession(customer.id, '10:00', AppointmentSource.Website)
    await promoteToAwaitingArrival(unscoped as never, TENANT_ID, DAY_INSTANT)
    await recordArrival({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: booked.id,
      now: DAY_INSTANT,
    })

    // The sweep is what closes the loop at the end of a day: a session that arrived and
    // recorded nothing is flagged, so the desk does not lose it between today and
    // tomorrow.
    // ۱۵:۰۰ local, so the ۱۰:۰۰ slot is five hours past its start and the two-hour
    // threshold the sweep names has passed.
    const flagged = await flagUnrecordedResults(
      unscoped as never,
      TENANT_ID,
      new Date('2026-03-24T11:30:00Z'),
      210,
    )
    expect(flagged).toContain(booked.id)
  })

  it('promotes the next day\'s bookings to awaiting arrival', async () => {
    const customer = await unscoped.customer.create({
      data: {
        tenantId: TENANT_ID,
        mobile: '09130000022',
        firstName: 'مراجع',
        searchName: 'مراجع',
        lifecycle: 'CUSTOMER',
      },
    })
    const booked = await bookSession(customer.id, '11:00', AppointmentSource.Website)

    const promoted = await promoteToAwaitingArrival(unscoped as never, TENANT_ID, DAY_INSTANT)
    expect(promoted).toContain(booked.id)
  })
})

describe('scenario three — a six-session course, with a drop-off and a return', () => {
  it('opens the course on the first completion, and keeps its own spacing', async () => {
    const customer = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: publicContext(),
      mobile: '09130000030',
      firstName: 'مراجع',
      lastName: 'دوره',
    })

    const first = await bookSession(customer.id, '09:00', AppointmentSource.Website)
    await promoteToAwaitingArrival(unscoped as never, TENANT_ID, DAY_INSTANT)
    await recordArrival({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: first.id,
      now: DAY_INSTANT,
    })
    await recordResult({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: first.id,
      now: DAY_INSTANT,
    })

    // The cycle is created on the *completion*, and not on the booking — so a course
    // the patient cancelled still has no cycle, and the desk's course list holds only
    // courses that actually began.
    expect(await unscoped.treatmentCycle.count({ where: { tenantId: TENANT_ID } })).toBe(0)

    const cycle = await recordCompletedSession({
      tx: unscoped as never,
      ctx: secretaryContext(),
      facts: {
        appointmentId: first.id,
        customerId: customer.id,
        serviceId: SERVICE_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: slotInstant('09:00'),
      },
      now: DAY_INSTANT,
    })
    expect(cycle.totalSessions).toBe(6)
    expect(cycle.completedSessions).toBe(1)

    // A second completion does not open a second course: the service's six sessions are
    // one cycle, and the row the first session created is the row the rest extend.
    const second = await bookSession(customer.id, '10:00', AppointmentSource.Website)
    await promoteToAwaitingArrival(unscoped as never, TENANT_ID, DAY_INSTANT)
    await recordArrival({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: second.id,
      now: DAY_INSTANT,
    })
    await recordResult({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: second.id,
      now: DAY_INSTANT,
    })
    await recordCompletedSession({
      tx: unscoped as never,
      ctx: secretaryContext(),
      facts: {
        appointmentId: second.id,
        customerId: customer.id,
        serviceId: SERVICE_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: slotInstant('10:00'),
      },
      now: DAY_INSTANT,
    })
    expect(await unscoped.treatmentCycle.count({ where: { tenantId: TENANT_ID } })).toBe(1)
    expect((await unscoped.treatmentCycle.findFirstOrThrow({ where: { tenantId: TENANT_ID } })).completedSessions).toBe(2)
  })

  it('closes a course the patient walked away from, and reopens it on a return', async () => {
    const customer = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: publicContext(),
      mobile: '09130000031',
      firstName: 'مراجع',
      lastName: 'رها',
    })

    const first = await bookSession(customer.id, '09:00', AppointmentSource.Website)
    const cycle = await recordCompletedSession({
      tx: unscoped as never,
      ctx: secretaryContext(),
      facts: {
        appointmentId: first.id,
        customerId: customer.id,
        serviceId: SERVICE_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: DAY_INSTANT,
      },
      now: DAY_INSTANT,
    })

    // The drop-off: the patient stops coming, and the desk closes the course with a
    // reason rather than deleting it — the row is the fact the retention report reads.
    await abandonCycle({
      tx: unscoped as never,
      ctx: secretaryContext(),
      cycleId: cycle.id,
      reason: AbandonmentReason.Unknown,
      now: DAY_INSTANT,
    })
    expect((await unscoped.treatmentCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status).toBe('ABANDONED')

    // The return: the patient comes back, and completing a new session is a new course
    // — the abandoned one stays closed and counts its one session.
    const returned = await bookSession(customer.id, '12:00', AppointmentSource.Website)
    await promoteToAwaitingArrival(unscoped as never, TENANT_ID, DAY_INSTANT)
    await recordArrival({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: returned.id,
      now: DAY_INSTANT,
    })
    await recordResult({
      tx: unscoped as never,
      ctx: secretaryContext(),
      appointmentId: returned.id,
      now: DAY_INSTANT,
    })
    const reopened = await recordCompletedSession({
      tx: unscoped as never,
      ctx: secretaryContext(),
      facts: {
        appointmentId: returned.id,
        customerId: customer.id,
        serviceId: SERVICE_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: slotInstant('12:00'),
      },
      now: DAY_INSTANT,
    })
    expect(reopened.id).not.toBe(cycle.id)
    expect(reopened.completedSessions).toBe(1)
    expect(await unscoped.treatmentCycle.count({ where: { tenantId: TENANT_ID } })).toBe(2)
  })

  it('completes the course when its sessions are done', async () => {
    const customer = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: publicContext(),
      mobile: '09130000032',
      firstName: 'مراجع',
      lastName: 'تکمیل',
    })

    const first = await bookSession(customer.id, '09:00', AppointmentSource.Website)
    const cycle = await recordCompletedSession({
      tx: unscoped as never,
      ctx: secretaryContext(),
      facts: {
        appointmentId: first.id,
        customerId: customer.id,
        serviceId: SERVICE_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: DAY_INSTANT,
      },
      now: DAY_INSTANT,
    })

    await completeCycle({
      tx: unscoped as never,
      ctx: secretaryContext(),
      cycleId: cycle.id,
      now: DAY_INSTANT,
    })
    expect((await unscoped.treatmentCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status).toBe('COMPLETED')
  })
})

describe('scenario four — a birthday campaign, from a Persian sentence to a booking', () => {
  it('reads a Persian brief, builds the campaign and dispatches it', async () => {
    // The chain's first step: the manager writes a Persian sentence and the assistant
    // reads the campaign out of it — the type, the audience and the message.
    const proposal = await interpretCampaignBrief({
      brief: {
        text: 'به مشتریانی که این ماه تولدشان هست پیام تبریک بفرست',
        channel: Channel.Sms,
      },
      now: DAY_INSTANT,
    })
    expect(proposal.type).toBe('BIRTHDAY')
    expect(proposal.audienceGroupKey).toBe('BIRTHDAY')
    expect(proposal.messageText).not.toBe('')

    // The eight built-ins, which is the shape a tenant actually starts with — the
    // group the proposal preselects is one of them, seeded with its own predicate.
    const groups = await ensureBuiltInGroups({ tx: unscoped as never, tenantId: TENANT_ID })
    const birthday = groups.find((group) => group.key === 'BIRTHDAY')
    if (birthday === undefined) throw new Error('the built-in birthday group was not seeded')

    await unscoped.customer.create({
      data: {
        id: BIRTHDAY_CUSTOMER_ID,
        tenantId: TENANT_ID,
        mobile: '09130000040',
        firstName: 'تولد',
        searchName: 'تولد',
        lifecycle: 'CUSTOMER',
        birthMonth: 1,
      },
    })
    await refreshAudienceGroupCounts({ tx: unscoped as never, tenantId: TENANT_ID, now: DAY_INSTANT })

    // The chain's middle: the manager turns the proposal into a campaign, submits it
    // for approval and approves it — the gate a dispatch refuses to skip, which is why
    // a sentence a manager typed never reaches a patient on its own.
    const manager = { ...secretaryContext(), role: Role.Manager, userId: SECRETARY_ID }
    const approver = { ...secretaryContext(), role: Role.Manager, userId: MANAGER_ID }
    const campaign = await createCampaign({
      tx: unscoped as never,
      ctx: manager,
      input: {
        name: 'کمپین تولد',
        type: 'BIRTHDAY',
        audienceGroupId: birthday.id,
        messageText: proposal.messageText,
        channel: Channel.Sms,
        scheduleKind: 'ONE_TIME',
        scheduledAt: DAY_INSTANT,
        scheduledTime: null,
        isRecurring: false,
        dailyCap: null,
      },
      now: DAY_INSTANT,
    })
    expect(campaign.status).toBe(CampaignStatus.Draft)

    await submitCampaignForApproval({ tx: unscoped as never, ctx: manager, campaignId: campaign.id })
    await approveCampaign({ tx: unscoped as never, ctx: approver, campaignId: campaign.id, now: DAY_INSTANT })
    await activateCampaign({ tx: unscoped as never, ctx: approver, campaignId: campaign.id })

    // The chain's last step: the dispatch runs at the instant the campaign named, and
    // the message the birthday patient receives is the one the brief became.
    const outcomes = await dispatchDueCampaigns({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      now: DAY_INSTANT,
    })
    expect(outcomes).toHaveLength(1)
    expect(await unscoped.campaign.findUniqueOrThrow({ where: { id: campaign.id } }).then((row) => row.status)).toBe(
      CampaignStatus.Finished,
    )
  })

  it('attributes a booking the campaign brought, which is the number its report reads', async () => {
    const groups = await ensureBuiltInGroups({ tx: unscoped as never, tenantId: TENANT_ID })
    const birthday = groups.find((group) => group.key === 'BIRTHDAY')
    if (birthday === undefined) throw new Error('the built-in birthday group was not seeded')

    const campaign = await unscoped.campaign.create({
      data: {
        tenantId: TENANT_ID,
        audienceGroupId: birthday.id,
        createdByUserId: SECRETARY_ID,
        name: 'کمپین تولد',
        type: 'BIRTHDAY',
        channel: Channel.Sms,
        messageText: 'تولدتان مبارک',
        scheduleKind: 'ONE_TIME',
        status: CampaignStatus.Active,
        scheduledAt: DAY_INSTANT,
      },
    })
    const customer = await unscoped.customer.create({
      data: {
        tenantId: TENANT_ID,
        mobile: '09130000041',
        firstName: 'تولد',
        searchName: 'تولد',
        lifecycle: 'CUSTOMER',
      },
    })
    await unscoped.messageSend.create({
      data: {
        tenantId: TENANT_ID,
        customerId: customer.id,
        campaignId: campaign.id,
        channel: Channel.Sms,
        renderedText: 'تولدتان مبارک',
        status: 'SENT',
        sentAt: DAY_INSTANT,
      },
    })
    const booked = await bookSession(customer.id, '13:00', AppointmentSource.Campaign)

    // The booking is attributed to the campaign whose message the patient last received
    // — the chain's last link, and the number the campaign's report reads.
    await attributeAppointmentToCampaign({
      tx: unscoped as never,
      tenantId: TENANT_ID,
      appointmentId: booked.id,
      customerId: customer.id,
      source: AppointmentSource.Campaign,
    })
    const attributed = await unscoped.appointment.findUniqueOrThrow({ where: { id: booked.id } })
    expect(attributed.campaignId).toBe(campaign.id)
  })
})
