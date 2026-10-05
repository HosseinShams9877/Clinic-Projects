/**
 * The doctor's own-patient scope — Phase 3's DoD 8, against a real SQLite file.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." The assertion that makes a mock worthless is the one the DoD is:
 *
 * A doctor who names another doctor's patient gets a **404** and not a 403
 * (`09-security.md` §6.3: "returning 'forbidden' would confirm the record's
 * existence"). The rule is not a guard that answers after the row is found — it is
 * a `where` clause (`customerScope`), so the query never returns the row and the
 * module's answer is the same answer it gives a customer the tenant has never heard
 * of. A mocked client would have answered whatever the test arranged; a real one
 * answers what the `where` actually matched, which is the only assertion that can
 * distinguish a narrowing predicate from a guard that leaks first.
 *
 * ## Why the suite seeds its own customers
 *
 * The scope is the row's `primaryDoctorId`, and the assertion needs the two rows it
 * is about — doctor A's patient and doctor B's — visible in one place, which is the
 * same reason `dedupe.test.ts` seeds its own.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CustomerLifecycle, Role } from '@/core/constants'
import { EMPTY_PERMISSION_OVERRIDES } from '@/core/tenant'
import type { TenantContext } from '@/core/tenant'
import {
  asTenantId,
  asUserId,
  type TenantId,
  type UserId,
} from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import { customerProfile, ownPatients } from '../index'
import { NotFoundError, PermissionError } from '@/core/types'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-a')
const DOCTOR_A_ID: UserId = asUserId('doctor-a')
const DOCTOR_B_ID: UserId = asUserId('doctor-b')
const MANAGER_ID: UserId = asUserId('manager-a')
const PATIENT_A_ID = 'customer-a'
const PATIENT_B_ID = 'customer-b'

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
    unscoped.customer.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'a', name: 'الف', isActive: true }],
  })
  await unscoped.clinic.createMany({
    data: [{ id: 'clinic-a', tenantId: TENANT_ID, name: 'کلینیک الف', isActive: true }],
  })
  await unscoped.tenantSettings.createMany({
    data: [{ tenantId: TENANT_ID, utcOffsetMinutes: 210 }],
  })
  await unscoped.user.createMany({
    data: [
      {
        id: DOCTOR_A_ID,
        tenantId: TENANT_ID,
        mobile: '09120000001',
        firstName: 'پزشک',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
      {
        id: DOCTOR_B_ID,
        tenantId: TENANT_ID,
        mobile: '09120000002',
        firstName: 'پزشک',
        lastName: 'ب',
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
  await unscoped.membership.createMany({
    data: [
      {
        id: 'membership-doctor-a',
        tenantId: TENANT_ID,
        userId: DOCTOR_A_ID,
        role: Role.Doctor,
        isActive: true,
      },
      {
        id: 'membership-doctor-b',
        tenantId: TENANT_ID,
        userId: DOCTOR_B_ID,
        role: Role.Doctor,
        isActive: true,
      },
      {
        id: 'membership-manager',
        tenantId: TENANT_ID,
        userId: MANAGER_ID,
        role: Role.Manager,
        isActive: true,
      },
    ],
  })
  await unscoped.customer.createMany({
    data: [
      {
        id: PATIENT_A_ID,
        tenantId: TENANT_ID,
        mobile: '09130000001',
        firstName: 'مراجع',
        lastName: 'الف',
        searchName: 'مراجع الف',
        primaryDoctorId: DOCTOR_A_ID,
        lifecycle: CustomerLifecycle.Customer,
      },
      {
        id: PATIENT_B_ID,
        tenantId: TENANT_ID,
        mobile: '09130000002',
        firstName: 'مراجع',
        lastName: 'ب',
        searchName: 'مراجع ب',
        primaryDoctorId: DOCTOR_B_ID,
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })
})

/** One doctor's context, holding the own-patient read and nothing wider. */
function doctorContext(userId: UserId): TenantContext {
  return {
    userId,
    tenantId: TENANT_ID,
    clinicId: null,
    role: Role.Doctor,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }
}

/** The manager's context, which sees the whole file. */
function managerContext(): TenantContext {
  return {
    userId: MANAGER_ID,
    tenantId: TENANT_ID,
    clinicId: null,
    role: Role.Manager,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }
}

/* ── DoD 8: another doctor's patient is a 404 ─────────────────────────────── */

describe('a doctor naming another doctor\'s patient', () => {
  it('is told the record is not there and not that it is forbidden', async () => {
    const error = await customerProfile({
      tx: unscoped as never,
      ctx: doctorContext(DOCTOR_B_ID),
      customerId: PATIENT_A_ID,
    }).then(
      () => undefined,
      (error: unknown) => error,
    )

    // The DoD's two halves: the answer is NotFound, and it is not Permission.
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error).not.toBeInstanceOf(PermissionError)

    // And the row the doctor asked for is still there, held by the doctor who saw it —
    // the scope narrowed the read and did not narrow the clinic.
    const row = await unscoped.customer.findUniqueOrThrow({ where: { id: PATIENT_A_ID } })
    expect(row.primaryDoctorId).toBe(DOCTOR_A_ID)
  })

  it('reads their own patient and no one else\'s', async () => {
    const own = await customerProfile({
      tx: unscoped as never,
      ctx: doctorContext(DOCTOR_A_ID),
      customerId: PATIENT_A_ID,
    })
    expect(own.id).toBe(PATIENT_A_ID)

    // The list the doctor's own page renders is the same scope, so the two reads
    // cannot disagree about whose patient a person is.
    const patients = await ownPatients({ tx: unscoped as never, ctx: doctorContext(DOCTOR_A_ID) })
    expect(patients.map((row) => row.id)).toEqual([PATIENT_A_ID])

    const others = await ownPatients({ tx: unscoped as never, ctx: doctorContext(DOCTOR_B_ID) })
    expect(others.map((row) => row.id)).toEqual([PATIENT_B_ID])
  })

  it('is answered for the whole file when the caller can see all customers', async () => {
    // The 404 rule is a scope and not a lock: a manager reads either patient, because
    // the same `where` widened is what a clinic-wide read looks like.
    const either = await customerProfile({
      tx: unscoped as never,
      ctx: managerContext(),
      customerId: PATIENT_B_ID,
    })
    expect(either.id).toBe(PATIENT_B_ID)
  })
})
