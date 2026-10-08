/**
 * Provisioning and suspension — the operator's half of the tenancy boundary, against
 * a real SQLite file.
 *
 * The assertions this suite exists for are the two the operator's powers can get
 * badly wrong:
 *
 * - **§2.3's tenant invariant** — a tenant cannot be left without an active manager.
 *   The last manager membership is refused, not taken away, which is the one guard
 *   that keeps a suspended clinic recoverable by its own staff rather than by the
 *   operator.
 * - **Suspension is a flag and not a delete.** A closed tenant's patients, clinics and
 *   audit rows stay where reactivation finds them, because closing a clinic is not a
 *   permission to lose its history.
 *
 * The writes are unscoped by necessity, so each `where` naming the tenant it means is
 * the scope's replacement here, and the suite asserts a write aimed at tenant A
 * leaves tenant B's rows alone.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { Role } from '@/core/constants'
import type { PrismaClient } from '@/generated/prisma/client'

import {
  addClinic,
  deactivateTenantMembership,
  provisionTenant,
  reactivateTenant,
  reactivateTenantMembership,
  suspendTenant,
} from '@/modules/tenant-management'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const PROVISION = {
  slug: ' sara-beauty ',
  name: 'کلینیک زیبایی سارا',
  clinicName: 'شعبه مرکزی',
  managerMobile: '09130000001',
  managerFirstName: 'سارا',
  managerLastName: 'احمدی',
  temporaryPassword: 'a-long-enough-temporary-password',
} as const

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
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])
})

describe('provisionTenant', () => {
  it('creates the tenant, its settings row, its primary clinic and one manager', async () => {
    const row = await provisionTenant(unscoped, PROVISION)

    expect(row.slug).toBe('sara-beauty')
    expect(row.name).toBe('کلینیک زیبایی سارا')
    expect(row.clinicCount).toBe(1)
    expect(row.memberCount).toBe(1)

    // The invariant the platform rests on: the tenant has exactly one active manager.
    const memberships = await unscoped.membership.findMany({
      where: { tenantId: row.id },
      select: { role: true, isActive: true },
    })
    expect(memberships).toEqual([{ role: Role.Manager, isActive: true }])

    const settings = await unscoped.tenantSettings.findUnique({ where: { tenantId: row.id } })
    expect(settings).not.toBeNull()
    expect(await unscoped.clinic.count({ where: { tenantId: row.id } })).toBe(1)
  })

  it('hashes the temporary password, so it is never stored as it was typed', async () => {
    const row = await provisionTenant(unscoped, PROVISION)

    const user = await unscoped.user.findFirst({
      where: { tenantId: row.id },
      select: { passwordHash: true },
    })
    expect(user?.passwordHash).not.toBe(PROVISION.temporaryPassword)
    expect(user?.passwordHash.length).toBeGreaterThan(0)
  })

  it('names the clinic after the tenant when no clinic name is given', async () => {
    const { clinicName, ...withoutClinic } = PROVISION
    void clinicName

    const row = await provisionTenant(unscoped, withoutClinic)
    const clinics = await unscoped.clinic.findMany({ where: { tenantId: row.id } })
    expect(clinics.map((clinic) => clinic.name)).toEqual(['کلینیک زیبایی سارا'])
  })

  it('normalizes a slug to the characters an address can carry', async () => {
    // Each character an address cannot hold becomes a separator, which is the
    // normalizer's documented behaviour and the shape the host name is built from.
    const row = await provisionTenant(unscoped, { ...PROVISION, slug: 'Sara, Beauty!' })
    expect(row.slug).toBe('sara--beauty-')
  })

  it('refuses a slug another tenant already serves', async () => {
    await provisionTenant(unscoped, PROVISION)

    await expect(provisionTenant(unscoped, PROVISION)).rejects.toThrow()
    expect(await unscoped.tenant.count()).toBe(1)
  })

  it('refuses a slug that is only whitespace', async () => {
    await expect(provisionTenant(unscoped, { ...PROVISION, slug: '   ' })).rejects.toThrow()
    expect(await unscoped.tenant.count()).toBe(0)
  })
})

describe('suspendTenant and reactivateTenant', () => {
  it('flips the flag and nothing else, in both directions', async () => {
    const row = await provisionTenant(unscoped, PROVISION)

    await suspendTenant(unscoped, row.id)
    const suspended = await unscoped.tenant.findUniqueOrThrow({
      where: { id: row.id },
      select: { isActive: true, _count: { select: { clinics: true, memberships: true } } },
    })
    expect(suspended.isActive).toBe(false)
    // A closed clinic keeps its patients and its staff.
    expect(suspended._count.clinics).toBe(1)
    expect(suspended._count.memberships).toBe(1)

    await reactivateTenant(unscoped, row.id)
    const reopened = await unscoped.tenant.findUniqueOrThrow({
      where: { id: row.id },
      select: { isActive: true },
    })
    expect(reopened.isActive).toBe(true)
  })

  it('touches only the tenant the operator named', async () => {
    const a = await provisionTenant(unscoped, PROVISION)
    const b = await provisionTenant(unscoped, {
      ...PROVISION,
      slug: 'other',
      managerMobile: '09130000002',
    })

    await suspendTenant(unscoped, a.id)
    const other = await unscoped.tenant.findUniqueOrThrow({
      where: { id: b.id },
      select: { isActive: true },
    })
    expect(other.isActive).toBe(true)
  })
})

describe('deactivateTenantMembership', () => {
  it('deactivates a membership that is not the last manager', async () => {
    const row = await provisionTenant(unscoped, PROVISION)
    const manager = await unscoped.user.findFirstOrThrow({ where: { tenantId: row.id } })

    const secretary = await unscoped.user.create({
      data: {
        tenantId: row.id,
        mobile: '09130000010',
        firstName: 'منشی',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
        memberships: {
          create: [{ tenantId: row.id, role: Role.Secretary, isActive: true }],
        },
      },
      include: { memberships: true },
    })

    await deactivateTenantMembership(unscoped, row.id, secretary.memberships[0]!.id)
    const memberships = await unscoped.membership.findMany({
      where: { tenantId: row.id },
      select: { userId: true, isActive: true },
      orderBy: { userId: 'asc' },
    })
    expect(memberships.map((membership) => [membership.userId, membership.isActive])).toContainEqual(
      [secretary.id, false],
    )
    expect(memberships.map((membership) => [membership.userId, membership.isActive])).toContainEqual(
      [manager.id, true],
    )
  })

  it('refuses the tenant\'s last active manager', async () => {
    const row = await provisionTenant(unscoped, PROVISION)
    const membership = await unscoped.membership.findFirstOrThrow({
      where: { tenantId: row.id },
    })

    await expect(
      deactivateTenantMembership(unscoped, row.id, membership.id),
    ).rejects.toThrow()

    // The guard's point: the tenant still has its manager.
    const after = await unscoped.membership.findFirstOrThrow({ where: { tenantId: row.id } })
    expect(after.isActive).toBe(true)
  })

  it('lets a second manager go, because the tenant is not left without one', async () => {
    const row = await provisionTenant(unscoped, PROVISION)

    const second = await unscoped.user.create({
      data: {
        tenantId: row.id,
        mobile: '09130000011',
        firstName: 'دوم',
        lastName: 'مدیر',
        passwordHash: 'x',
        isActive: true,
        memberships: {
          create: [{ tenantId: row.id, role: Role.Manager, isActive: true }],
        },
      },
      include: { memberships: true },
    })

    await deactivateTenantMembership(unscoped, row.id, second.memberships[0]!.id)
    const active = await unscoped.membership.count({
      where: { tenantId: row.id, role: Role.Manager, isActive: true },
    })
    expect(active).toBe(1)
  })

  it('ignores a membership the tenant does not hold', async () => {
    const a = await provisionTenant(unscoped, PROVISION)
    const b = await provisionTenant(unscoped, {
      ...PROVISION,
      slug: 'other',
      managerMobile: '09130000002',
    })

    const bMembership = await unscoped.membership.findFirstOrThrow({
      where: { tenantId: b.id },
    })

    // A write aimed at tenant A on B's membership is a no-op, not a cross-tenant
    // deactivation.
    await expect(
      deactivateTenantMembership(unscoped, a.id, bMembership.id),
    ).resolves.toBeUndefined()

    const after = await unscoped.membership.findFirstOrThrow({ where: { tenantId: b.id } })
    expect(after.isActive).toBe(true)
  })

  it('reactivates a membership the operator previously deactivated', async () => {
    const row = await provisionTenant(unscoped, PROVISION)
    const secretary = await unscoped.user.create({
      data: {
        tenantId: row.id,
        mobile: '09130000010',
        firstName: 'منشی',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
        memberships: {
          create: [{ tenantId: row.id, role: Role.Secretary, isActive: true }],
        },
      },
      include: { memberships: true },
    })
    const id = secretary.memberships[0]!.id

    await deactivateTenantMembership(unscoped, row.id, id)
    await reactivateTenantMembership(unscoped, row.id, id)

    const after = await unscoped.membership.findUniqueOrThrow({ where: { id } })
    expect(after.isActive).toBe(true)
  })
})

describe('addClinic', () => {
  it('adds a branch to the tenant the operator named', async () => {
    const row = await provisionTenant(unscoped, PROVISION)

    await addClinic(unscoped, row.id, ' شعبه جنوب ')
    const clinics = await unscoped.clinic.findMany({ where: { tenantId: row.id } })
    expect(new Set(clinics.map((clinic) => clinic.name))).toEqual(
      new Set(['شعبه مرکزی', 'شعبه جنوب']),
    )
  })

  it('refuses an empty name', async () => {
    const row = await provisionTenant(unscoped, PROVISION)
    await expect(addClinic(unscoped, row.id, '   ')).rejects.toThrow()
    expect(await unscoped.clinic.count({ where: { tenantId: row.id } })).toBe(1)
  })

  it('adds the clinic to no other tenant', async () => {
    const a = await provisionTenant(unscoped, PROVISION)
    const b = await provisionTenant(unscoped, {
      ...PROVISION,
      slug: 'other',
      managerMobile: '09130000002',
    })

    await addClinic(unscoped, a.id, 'شعبه جنوب')
    expect(await unscoped.clinic.count({ where: { tenantId: b.id } })).toBe(1)
  })
})
