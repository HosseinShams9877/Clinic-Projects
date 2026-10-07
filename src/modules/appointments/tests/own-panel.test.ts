/**
 * The customer panel's three DoD properties — Phase 9, against a real SQLite file.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." The three assertions the specification asks for are the three a mock
 * would answer with whatever it was arranged to believe:
 *
 * 1. **A customer sees only their own data on all four pages.** The scope is the
 *    `where` clause, so customer B's rows are absent from the reads rather than
 *    present-then-refused (`09-security.md` §6.3) — and the one write a customer
 *    holds, naming B's appointment by id, is a `NotFoundError` and not a permission
 *    error, which is the answer that does not confirm the row exists.
 * 2. **No customer route accepts a `customerId`.** A type-level assertion, because the
 *    property is a property of the surface's *shape*: the four pages take no
 *    parameters at all, and the two islands and the Server Actions take ids of the
 *    row being acted on and nothing else. A `customerId` prop added anywhere in the
 *    chain is a prop a caller could pass another person's id to, and this suite stops
 *    compiling the day one appears.
 * 3. **A cancellation inside the policy window succeeds and applies the deposit
 *    policy, and one outside it is refused.** The refusal names the window, which is
 *    what makes it a policy and not a silent no-op, and the entitlement is the
 *    `payments` module's reading of the deposit the clinic received.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'

import {
  AppointmentStatus,
  CustomerLifecycle,
  CycleStatus,
  DepositRefundPolicy,
  PaymentKind,
} from '@/core/constants'
import {
  asLocalDate,
  asLocalTime,
  toUtcInstant,
  type LocalDate,
  type LocalTime,
} from '@/core/localization'
import { asTenantId, asUserId, type TenantId } from '@/core/types'

import { cancelOwnAppointment, customerAppointments } from '../index'
import { ownCareInstructions, readOwnProfile } from '@/modules/customers'
import { customerCycles } from '@/modules/cycles'
import { readPaymentSettings, refundAmountFor } from '@/modules/payments'
import { DomainError, NotFoundError, PermissionError } from '@/core/types'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

/* ── The surface under test, imported for its shape ──────────────────────────── */

import AccountDashboardPage from '@/app/account/(panel)/page'
import AccountAppointmentsPage from '@/app/account/(panel)/appointments/page'
import AccountCarePage from '@/app/account/(panel)/care/page'
import AccountProfilePage from '@/app/account/(panel)/profile/page'
import { OwnAppointmentActions } from '@/app/_account/appointment-actions'
import { OwnConsentForm, OwnProfileForm } from '@/app/_account/profile-forms'
import {
  cancelOwnAppointmentAction,
  recordOwnConsentAction,
  rescheduleOwnAppointmentAction,
  updateOwnProfileAction,
} from '@/app/_account/actions'

const TENANT_ID: TenantId = asTenantId('tenant-a')
const CLINIC_ID = 'clinic-a'
const DOCTOR_ID = asUserId('doctor-a')
const SERVICE_ID = 'service-a'
const CUSTOMER_A_ID = 'customer-a'
const CUSTOMER_B_ID = 'customer-b'

/** The clock the whole suite sits at; every `scheduledAt` is a distance from this. */
const NOW = new Date('2026-10-07T08:00:00Z')
const UTC_OFFSET = 210

/**
 * A session far enough away to cancel, and one close enough to refuse.
 *
 * The near day is ۹:۳۰ on the suite's own day against `NOW` at ۸:۰۰ — ninety minutes
 * away, inside the ۲۴-hour window and still in the future; the far day is a month out.
 */
const NEAR_LOCAL_DATE = asLocalDate('1405-07-15')
const NEAR_LOCAL_TIME = asLocalTime('13:00')
const FAR_LOCAL_DATE = asLocalDate('1405-08-15')
const SLOT_TIME = asLocalTime('10:00')

let database: TestDatabase
let unscoped: TestDatabase['unscoped']

beforeAll(async () => {
  database = await createTestDatabase()
  unscoped = database.unscoped
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

beforeEach(async () => {
  await unscoped.$transaction([
    unscoped.payment.deleteMany(),
    unscoped.appointment.deleteMany(),
    unscoped.treatmentCycle.deleteMany(),
    unscoped.service.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'a', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.create({
    data: { id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک', isActive: true },
  })
  await unscoped.tenantSettings.create({
    data: {
      tenantId: TENANT_ID,
      utcOffsetMinutes: UTC_OFFSET,
      depositRefundPolicy: DepositRefundPolicy.Full,
    },
  })
  await unscoped.user.create({
    data: {
      id: DOCTOR_ID,
      tenantId: TENANT_ID,
      mobile: '09120000001',
      firstName: 'پزشک',
      lastName: 'الف',
      passwordHash: 'x',
      isActive: true,
    },
  })
  await unscoped.service.create({
    data: {
      id: SERVICE_ID,
      tenantId: TENANT_ID,
      name: 'خدمت الف',
      searchName: 'خدمت الف',
      category: 'پوستی',
      durationMinutes: 30,
      price: 1_000_000n,
      afterCare: 'مراقبت بعد از جلسه',
      isActive: true,
    },
  })
  await unscoped.customer.createMany({
    data: [
      {
        id: CUSTOMER_A_ID,
        tenantId: TENANT_ID,
        mobile: '09130000001',
        firstName: 'مراجع',
        lastName: 'الف',
        searchName: 'مراجع الف',
        lifecycle: CustomerLifecycle.Customer,
      },
      {
        id: CUSTOMER_B_ID,
        tenantId: TENANT_ID,
        mobile: '09130000002',
        firstName: 'مراجع',
        lastName: 'ب',
        searchName: 'مراجع ب',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })
  // Both customers have had the same service, so the only thing keeping B's care off
  // A's page — and B's cycle off A's dashboard — is the `customerId` in the `where`.
  await booking({ id: 'a-far', customerId: CUSTOMER_A_ID, localDate: FAR_LOCAL_DATE })
  await booking({ id: 'a-near', customerId: CUSTOMER_A_ID, localDate: NEAR_LOCAL_DATE, localTime: NEAR_LOCAL_TIME })
  await booking({ id: 'b-far', customerId: CUSTOMER_B_ID, localDate: FAR_LOCAL_DATE })
  // The same service again, as a course each customer is halfway through — the dashboard
  // reads a cycle for its progress bar, and B's is the one that must not reach A.
  await cycle({ id: 'cycle-a', customerId: CUSTOMER_A_ID, completedSessions: 2, currentSessionNumber: 3 })
  await cycle({ id: 'cycle-b', customerId: CUSTOMER_B_ID, completedSessions: 1, currentSessionNumber: 2 })
})

/** One booked session, at a distance the caller names. */
async function booking(args: {
  readonly id: string
  readonly customerId: string
  readonly localDate: LocalDate
  readonly localTime?: LocalTime
}): Promise<void> {
  const localTime = args.localTime ?? SLOT_TIME
  await unscoped.appointment.create({
    data: {
      id: args.id,
      tenantId: TENANT_ID,
      clinicId: CLINIC_ID,
      customerId: args.customerId,
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      scheduledAt: toUtcInstant(args.localDate, localTime, UTC_OFFSET),
      localDate: args.localDate,
      localTime,
      durationMinutes: 30,
      status: AppointmentStatus.Booked,
      isSlotBlock: false,
      slotKey: `${args.id}-slot`,
      priceAtBooking: 1_000_000n,
      depositAmount: 500_000n,
    },
  })
}

/** A course of the same service, partway through, which the dashboard's bar reads. */
async function cycle(args: {
  readonly id: string
  readonly customerId: string
  readonly completedSessions: number
  readonly currentSessionNumber: number
}): Promise<void> {
  await unscoped.treatmentCycle.create({
    data: {
      id: args.id,
      tenantId: TENANT_ID,
      customerId: args.customerId,
      serviceId: SERVICE_ID,
      doctorId: DOCTOR_ID,
      intervalDays: 14,
      totalSessions: 6,
      completedSessions: args.completedSessions,
      currentSessionNumber: args.currentSessionNumber,
      startedAt: NOW,
      status: CycleStatus.Active,
    },
  })
}

/** A deposit the clinic recorded on a session, which is what a refund hands back. */
async function deposit(appointmentId: string): Promise<void> {
  await unscoped.payment.create({
    data: {
      id: `deposit-${appointmentId}`,
      tenantId: TENANT_ID,
      appointmentId,
      customerId: CUSTOMER_A_ID,
      recordedByUserId: DOCTOR_ID,
      amount: 500_000n,
      method: 'CASH',
      kind: PaymentKind.Deposit,
      paidAt: NOW,
    },
  })
}

/** The scope a session resolved for customer A hands the module layer. */
function scopeFor(customerId: string) {
  return { tx: unscoped as never, tenantId: TENANT_ID, customerId }
}

/* ── DoD 1 — a customer sees only their own data on all four pages ───────────── */

describe('the customer panel', () => {
  it('shows a customer only their own rows on all four pages and 404s a horizontal reach', async () => {
    // `/account/appointments` — the two halves the page splits into, and B's session
    // is absent from both rather than present-then-refused.
    const appointments = await customerAppointments({ ...scopeFor(CUSTOMER_A_ID), now: NOW })
    expect(appointments.upcoming.map((row) => row.id)).toEqual(['a-near', 'a-far'])
    expect(appointments.past.map((row) => row.id)).toEqual([])

    // `/account` — the dashboard's cycle half, which the progress bar reads from.
    const cycles = await customerCycles(scopeFor(CUSTOMER_A_ID))
    expect(cycles.map((row) => row.customerId)).toEqual([CUSTOMER_A_ID])

    // `/account/care` — the same service, so the two customers' cards are identical
    // and the scope is the only thing separating them.
    const care = await ownCareInstructions(scopeFor(CUSTOMER_A_ID))
    expect(care.map((row) => row.id)).toEqual([SERVICE_ID])

    // `/account/profile` — A reads A's own record and not B's.
    const profile = await readOwnProfile(scopeFor(CUSTOMER_A_ID))
    expect(profile?.id).toBe(CUSTOMER_A_ID)

    // The one write a customer holds, naming B's appointment by id. `09-security.md`
    // §6.3: a 403 would confirm the row exists to a customer who has no reason to
    // know it; the answer is NotFound, and it is not a permission error, because the
    // customer panel has no permission primitive to raise in the first place.
    const error = await cancelOwnAppointment({
      ...scopeFor(CUSTOMER_A_ID),
      appointmentId: 'b-far',
      now: NOW,
    }).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(error).toBeInstanceOf(NotFoundError)
    expect(error).not.toBeInstanceOf(PermissionError)

    // And B's session is untouched, which is what scoping the read rather than guarding
    // after it guarantees: the row the caller could not see was never loaded.
    const row = await unscoped.appointment.findUniqueOrThrow({ where: { id: 'b-far' } })
    expect(row.status).toBe(AppointmentStatus.Booked)
  })

  /* ── DoD 2 — no customer route accepts a `customerId` ─────────────────────── */

  it('holds no parameter a caller could pass another customer\'s id to', () => {
    // The four routes take no parameters at all: each is a server component that
    // resolves the customer from the session, and a `params` or `searchParams` prop
    // would be the one place a `customerId` could ride in on.
    expectTypeOf<typeof AccountDashboardPage>().parameters.toEqualTypeOf<[]>()
    expectTypeOf<typeof AccountAppointmentsPage>().parameters.toEqualTypeOf<[]>()
    expectTypeOf<typeof AccountCarePage>().parameters.toEqualTypeOf<[]>()
    expectTypeOf<typeof AccountProfilePage>().parameters.toEqualTypeOf<[]>()

    // The islands take the row's own facts — the id of the thing acted on — and a
    // `customerId` among them would be a prop a parent could point at anyone.
    expectTypeOf<Parameters<typeof OwnAppointmentActions>[0]>()
      .not.toMatchTypeOf<{ customerId: string }>()
    expectTypeOf<Parameters<typeof OwnProfileForm>[0]>().not.toMatchTypeOf<{ customerId: string }>()
    expectTypeOf<Parameters<typeof OwnConsentForm>[0]>().not.toMatchTypeOf<{ customerId: string }>()

    // The four Server Actions resolve the customer from the session, so each argument
    // is the thing the person acted on and nothing wider. The cancellation's whole
    // argument is one appointment id — not `{ appointmentId, customerId }` — which is
    // the shape the panel's isolation rests on, made visible at compile time.
    expectTypeOf<typeof cancelOwnAppointmentAction>().parameters.toEqualTypeOf<[string]>()
    expectTypeOf<typeof rescheduleOwnAppointmentAction>()
      .parameters.not.toMatchTypeOf<[{ customerId: string }]>()
    expectTypeOf<typeof updateOwnProfileAction>()
      .parameters.not.toMatchTypeOf<[{ customerId: string }]>()
    expectTypeOf<typeof recordOwnConsentAction>()
      .parameters.not.toMatchTypeOf<[{ customerId: string }]>()
  })

  /* ── DoD 4 — the cancellation policy and the deposit policy it composes ───── */

  it('cancels inside the policy window with the deposit policy applied, and refuses outside it', async () => {
    await deposit('a-far')

    // Inside the window: the session is a month away, so the cancellation is the
    // customer's to make, and it is also a deposit the clinic owes back.
    const result = await cancelOwnAppointment({
      ...scopeFor(CUSTOMER_A_ID),
      appointmentId: 'a-far',
      now: NOW,
    })

    // The row closed, with the reason naming who closed it and the slot released.
    const cancelled = await unscoped.appointment.findUniqueOrThrow({ where: { id: 'a-far' } })
    expect(cancelled.status).toBe(AppointmentStatus.Cancelled)
    expect(cancelled.cancelReason).toBe('customer-panel')
    expect(cancelled.slotKey).toBeNull()

    // The entitlement is the `payments` module's reading of the deposit the
    // cancellation reports, under the tenant's policy — `Full` of ۵۰۰٬۰۰۰. The module
    // returns the deposit the clinic received and the Server Action composes the
    // policy, which is the same split the desk's own cancellation keeps; asserting the
    // two functions the action composes is asserting what the policy pays back.
    expect(result.depositReceived).toBe(500_000n)

    const settings = await readPaymentSettings(unscoped as never, TENANT_ID)
    expect(settings.depositRefundPolicy).toBe(DepositRefundPolicy.Full)
    expect(refundAmountFor(settings.depositRefundPolicy, result.depositReceived)).toBe(500_000n)

    // Outside the window: the near session is two hours away, so the refusal names the
    // window and the fix — call the clinic, because the desk can still do what the
    // customer cannot — and writes nothing.
    const refused = await cancelOwnAppointment({
      ...scopeFor(CUSTOMER_A_ID),
      appointmentId: 'a-near',
      now: NOW,
    }).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(refused).toBeInstanceOf(DomainError)
    expect(refused).toMatchObject({ messageKey: 'appointment.customerCancelWindowClosed' })

    const stillBooked = await unscoped.appointment.findUniqueOrThrow({ where: { id: 'a-near' } })
    expect(stillBooked.status).toBe(AppointmentStatus.Booked)
  })
})
