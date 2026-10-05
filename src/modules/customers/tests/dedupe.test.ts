/**
 * The mobile dedupe and the lead's conversion — Phase 3's DoD 1 and DoD 2, against a
 * real SQLite file.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." The three assertions that make a mock worthless are the ones this suite
 * exists for:
 *
 * - **DoD 1a** — the same mobile in the same tenant is the existing record, offered
 *   back and not duplicated. The unique index is what answers, and a mocked client
 *   would answer whatever the test arranged.
 * - **DoD 1b** — the same mobile in a *different* tenant is a new record with no
 *   leakage: neither tenant's read sees the other's row, and the dedupe is a
 *   tenant-local fact and not a global one.
 * - **DoD 2** — a lead converts on the booking that first names them, and the
 *   acquisition source they arrived with is the source the converted customer still
 *   holds.
 *
 * ## Why the suite seeds its own rows
 *
 * The dedupe is a query against a unique index, and the assertions need to point at
 * the two rows they are about — a tenant's existing customer and a second tenant's
 * same-number customer. Seeding them here keeps the rows the assertions need visible
 * in one place, which is the same reason `booking.test.ts` does it.
 *
 * ## Why the reads run through the unscoped client
 *
 * The module's own queries are scoped by the `where` they carry, which is what a
 * tenant scope would have set; the suite reads the rows back directly so the
 * assertion is about the row and not about the scope that found it. `booking.test.ts`
 * passes the same client for the same reason.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AcquisitionSource, CustomerLifecycle, LeadStatus, Role } from '@/core/constants'
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

import { createOrFindCustomer } from '../lib/dedupe'
import { createLead } from '../lib/leads'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-a')
const OTHER_TENANT_ID: TenantId = asTenantId('tenant-b')
const CLINIC_ID = asClinicId('clinic-a')
const MANAGER_ID: UserId = asUserId('manager-a')

/** The mobile the whole suite dedupes on, typed as the form sends it. */
const MOBILE = '09130000001'

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
        id: MANAGER_ID,
        tenantId: TENANT_ID,
        mobile: '09120000001',
        firstName: 'مدیر',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
    ],
  })
})

/** A manager's context in a tenant, which the dedupe's own reads run under. */
function managerContext(tenantId: TenantId = TENANT_ID): TenantContext {
  return {
    userId: MANAGER_ID,
    tenantId,
    clinicId: null,
    role: Role.Manager,
    overrides: EMPTY_PERMISSION_OVERRIDES,
  }
}

/* ── DoD 1: the dedupe is a tenant-local fact ─────────────────────────────── */

describe('the mobile dedupe', () => {
  it('offers the existing record for a mobile the tenant already holds', async () => {
    await seedCustomer(TENANT_ID, MOBILE, 'مشتری')

    const result = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: managerContext(),
      mobile: MOBILE,
      firstName: 'نام جدید',
    })

    expect(result.created).toBe(false)
    expect(result.mobile).toBe(MOBILE)
    expect(result.firstName).toBe('مشتری')

    // The dedupe's whole point: a second row was not written.
    const rows = await unscoped.customer.findMany({
      where: { tenantId: TENANT_ID, mobile: MOBILE },
    })
    expect(rows).toHaveLength(1)
  })

  it('creates a new record for the same mobile in a different tenant', async () => {
    await seedCustomer(TENANT_ID, MOBILE, 'مشتری الف')

    const result = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: managerContext(OTHER_TENANT_ID),
      mobile: MOBILE,
      firstName: 'مشتری ب',
    })

    expect(result.created).toBe(true)
    expect(result.firstName).toBe('مشتری ب')

    // Neither tenant's read sees the other's row, which is the isolation half of DoD 1.
    const [a, b] = await Promise.all([
      unscoped.customer.findMany({ where: { tenantId: TENANT_ID, mobile: MOBILE } }),
      unscoped.customer.findMany({ where: { tenantId: OTHER_TENANT_ID, mobile: MOBILE } }),
    ])
    expect(a).toHaveLength(1)
    expect(a[0]?.firstName).toBe('مشتری الف')
    expect(b).toHaveLength(1)
    expect(b[0]?.firstName).toBe('مشتری ب')
    expect(a[0]?.id).not.toBe(b[0]?.id)
  })
})

/* ── DoD 2: the conversion keeps the source ──────────────────────────────── */

describe('a lead converting on its first booking', () => {
  it('converts the lead and keeps the acquisition source', async () => {
    const lead = await createLead({
      tx: unscoped as never,
      ctx: managerContext(),
      mobile: MOBILE,
      firstName: 'لید',
      acquisitionSource: AcquisitionSource.Instagram,
    })

    expect(lead.leadStatus).toBe(LeadStatus.New)
    expect(lead.acquisitionSource).toBe(AcquisitionSource.Instagram)

    const result = await createOrFindCustomer({
      tx: unscoped as never,
      ctx: managerContext(),
      mobile: MOBILE,
      firstName: 'لید',
    })

    // The lead became a customer on this call and no second row was written.
    expect(result.created).toBe(false)
    expect(result.convertedFromLead).toBe(true)
    expect(result.id).toBe(lead.id)

    const row = await unscoped.customer.findUniqueOrThrow({
      where: { tenantId_mobile: { tenantId: TENANT_ID, mobile: MOBILE } },
    })
    expect(row.lifecycle).toBe(CustomerLifecycle.Customer)
    expect(row.leadStatus).toBe(LeadStatus.Converted)
    expect(row.acquisitionSource).toBe(AcquisitionSource.Instagram)

    const rows = await unscoped.customer.findMany({
      where: { tenantId: TENANT_ID, mobile: MOBILE },
    })
    expect(rows).toHaveLength(1)
  })
})

/* ── Shared seeding ──────────────────────────────────────────────────────── */

/** One customer row in a tenant, as the dedupe's existing record. */
async function seedCustomer(tenantId: TenantId, mobile: string, firstName: string): Promise<void> {
  await unscoped.customer.create({
    data: {
      tenantId,
      mobile,
      firstName,
      searchName: firstName,
      lifecycle: CustomerLifecycle.Customer,
    },
  })
}
