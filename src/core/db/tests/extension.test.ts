/**
 * The Layer-1 extension, against a real database (`09-security.md` §5).
 *
 * The assertion that matters is not what the extension was called with but what
 * the query returned: a mock would confirm the predicate was added and would
 * never notice that it was intersected with the wrong value. Here, tenant A's
 * rows are written with the unscoped client and read back as tenant B, and the
 * empty result is the assertion.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'

import { runInTenantScope, tenantContextOf } from '../scope'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from './database'

const TENANT_A = tenantContextOf({ tenantId: 'tenant-a', role: 'manager' })
const TENANT_B = tenantContextOf({ tenantId: 'tenant-b', role: 'manager' })

let database: TestDatabase
let client: PrismaClient
let unscoped: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  client = database.client
  unscoped = database.unscoped
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

beforeEach(async () => {
  // Written without a scope, because the scope is what is under test. The two
  // tenants' rows are indistinguishable to the unscoped client — which is the
  // whole reason the extension exists. The database is one file for the whole
  // suite, so the rows are cleared first rather than assumed absent.
  await unscoped.clinic.deleteMany()
  await unscoped.tenant.deleteMany()
  await unscoped.tenant.createMany({
    data: [
      { id: 'tenant-a', slug: 'a', name: 'A', isActive: true },
      { id: 'tenant-b', slug: 'b', name: 'B', isActive: true },
    ],
  })
  await unscoped.clinic.createMany({
    data: [
      { id: 'clinic-a', tenantId: 'tenant-a', name: 'کلینیک آ' },
      { id: 'clinic-b', tenantId: 'tenant-b', name: 'کلینیک ب' },
    ],
  })
})

describe('a tenant-scoped query outside a scope', () => {
  it('fails loudly rather than returning nothing', async () => {
    await expect(client.clinic.findMany()).rejects.toThrowError(/outside a tenant scope/)
  })
})

describe('a read inside a scope', () => {
  it('returns only this tenant’s rows', async () => {
    const rows = await runInTenantScope(TENANT_A, client, (tx) => tx.clinic.findMany())
    expect(rows.map((row) => row.id)).toEqual(['clinic-a'])
  })

  it('makes a where that names another tenant an empty result, not a leak', async () => {
    const rows = await runInTenantScope(TENANT_A, client, (tx) =>
      tx.clinic.findMany({ where: { tenantId: 'tenant-b' } }),
    )
    expect(rows).toEqual([])
  })

  it('counts only this tenant’s rows', async () => {
    await expect(runInTenantScope(TENANT_A, client, (tx) => tx.clinic.count())).resolves.toBe(1)
  })

  it('aggregates only this tenant’s rows', async () => {
    const aggregate = await runInTenantScope(TENANT_B, client, (tx) =>
      tx.clinic.aggregate({ _count: { _all: true } }),
    )
    expect(aggregate._count._all).toBe(1)
  })

  it('groups only this tenant’s rows', async () => {
    const groups = await runInTenantScope(TENANT_A, client, (tx) =>
      tx.clinic.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    )
    expect(groups).toEqual([{ tenantId: 'tenant-a', _count: { _all: 1 } }])
  })

  it('finds one row by its own id and none by the other tenant’s', async () => {
    await expect(
      runInTenantScope(TENANT_B, client, (tx) => tx.clinic.findUnique({ where: { id: 'clinic-b' } })),
    ).resolves.toMatchObject({ id: 'clinic-b' })

    await expect(
      runInTenantScope(TENANT_B, client, (tx) => tx.clinic.findUnique({ where: { id: 'clinic-a' } })),
    ).resolves.toBeNull()
  })
})

describe('a write inside a scope', () => {
  it('sets the tenant id, ignoring the one the caller supplied', async () => {
    const created = await runInTenantScope(TENANT_A, client, (tx) =>
      tx.clinic.create({ data: { name: 'کلینیک جدید', tenantId: 'tenant-b' } }),
    )
    expect(created.tenantId).toBe('tenant-a')
  })

  it('sets the tenant id on every row of a createMany', async () => {
    await runInTenantScope(TENANT_B, client, (tx) =>
      // The client's type still requires `tenantId`, because Prisma cannot type an
      // extension injecting it — so the first row omits it through the input type
      // and the assertion on the stored rows is what proves the extension set it.
      tx.clinic.createMany({
        data: [
          { name: 'یک' },
          { name: 'دو', tenantId: 'tenant-a' },
        ] as Prisma.ClinicCreateManyInput[],
      }),
    )
    const rows = await unscoped.clinic.findMany({ where: { name: { in: ['یک', 'دو'] } } })
    expect(rows.map((row) => row.tenantId).sort()).toEqual(['tenant-b', 'tenant-b'])
  })

  it('cannot update another tenant’s row', async () => {
    // `update` is one of Prisma’s required operations, so the intersected `where`
    // surfaces as a `P2025` — a loud failure, not a silent no-op. The `updateMany`
    // variant below is the quiet one and reports a count of zero.
    await expect(
      runInTenantScope(TENANT_B, client, (tx) =>
        tx.clinic.update({ where: { id: 'clinic-a' }, data: { name: 'تغییر یافته' } }),
      ),
    ).rejects.toThrowError(/No record was found/)

    await expect(unscoped.clinic.findUnique({ where: { id: 'clinic-a' } })).resolves.toMatchObject({
      name: 'کلینیک آ',
    })
  })

  it('cannot delete another tenant’s row', async () => {
    await expect(
      runInTenantScope(TENANT_B, client, (tx) => tx.clinic.delete({ where: { id: 'clinic-a' } })),
    ).rejects.toThrowError(/No record was found/)
    await expect(unscoped.clinic.count()).resolves.toBe(2)
  })

  it('cannot reach another tenant’s rows with a filtered delete', async () => {
    await runInTenantScope(TENANT_B, client, (tx) => tx.clinic.deleteMany())
    await expect(unscoped.clinic.count()).resolves.toBe(1)
    await expect(unscoped.clinic.findUnique({ where: { id: 'clinic-a' } })).resolves.not.toBeNull()
  })

  it('upserts a row in this tenant, and creates with this tenant’s id', async () => {
    const updated = await runInTenantScope(TENANT_A, client, (tx) =>
      tx.clinic.upsert({
        where: { id: 'clinic-a' },
        create: { id: 'clinic-a', name: 'نام جدید' } as Prisma.ClinicCreateInput,
        update: { name: 'نام جدید' },
      }),
    )
    expect(updated.name).toBe('نام جدید')

    const created = await runInTenantScope(TENANT_A, client, (tx) =>
      tx.clinic.upsert({
        where: { id: 'clinic-c' },
        create: { id: 'clinic-c', name: 'کلینیک ج', tenantId: 'tenant-b' },
        update: { name: 'کلینیک ج' },
      }),
    )
    expect(created.tenantId).toBe('tenant-a')
  })
})

describe('a model that is not tenant-scoped', () => {
  it('is untouched by the extension', async () => {
    // `Tenant` is the registry: scoped by `id` under RLS, and the one query that
    // must not require a tenant id. A scope that applied to it would break the
    // tenant switcher and the login resolution.
    await expect(client.tenant.findMany()).resolves.toHaveLength(2)
  })
})
