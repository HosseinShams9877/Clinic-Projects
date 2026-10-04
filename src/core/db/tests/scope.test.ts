/**
 * The scope and its transaction (`09-security.md` §4.2, §4.3).
 *
 * The scope is what the extension reads, and the transaction is what makes Layer 2
 * possible, and the claim under test is that they are one fact: a query inside a
 * scope sees the tenant, and no client in the tree can have one without the other.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'

import { ROLES } from '@/core/constants'

import {
  hasTenantScope,
  requireTenantContext,
  runInTenantScope,
  tenantContextOf,
  TenantScopeError,
} from '../scope'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from './database'

const TENANT_A = tenantContextOf({ tenantId: 'tenant-a', role: ROLES[0] })
const TENANT_B = tenantContextOf({ tenantId: 'tenant-b', role: ROLES[0] })

let database: TestDatabase
let client: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  client = database.client
  await database.unscoped.tenant.createMany({
    data: [
      { id: 'tenant-a', slug: 'a', name: 'A', isActive: true },
      { id: 'tenant-b', slug: 'b', name: 'B', isActive: true },
    ],
  })
  await database.unscoped.clinic.createMany({
    data: [
      { id: 'clinic-a', tenantId: 'tenant-a', name: 'کلینیک آ' },
      { id: 'clinic-b', tenantId: 'tenant-b', name: 'کلینیک ب' },
    ],
  })
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

describe('outside a scope', () => {
  it('has no scope, and says so loudly', () => {
    expect(hasTenantScope()).toBe(false)
    expect(() => requireTenantContext()).toThrowError(TenantScopeError)
    expect(() => requireTenantContext()).toThrowError(/outside a tenant scope/)
  })
})

describe('runInTenantScope', () => {
  it('returns what the block returned', async () => {
    await expect(runInTenantScope(TENANT_A, client, () => Promise.resolve('نتیجه'))).resolves.toBe(
      'نتیجه',
    )
  })

  it('gives the block a client whose queries see the tenant', async () => {
    const clinic = await runInTenantScope(TENANT_B, client, (tx) =>
      tx.clinic.findUnique({ where: { id: 'clinic-b' } }),
    )
    expect(clinic).toMatchObject({ id: 'clinic-b', tenantId: 'tenant-b' })
  })

  it('sets the scope for the duration of the block only', async () => {
    await runInTenantScope(TENANT_A, client, async () => {
      expect(hasTenantScope()).toBe(true)
      expect(requireTenantContext().tenantId).toBe('tenant-a')
    })
    expect(hasTenantScope()).toBe(false)
  })

  it('keeps the scope across an await inside the block', async () => {
    // The mechanism is `AsyncLocalStorage`, and the property that makes it usable
    // here is that the context follows the async chain, including a hop through a
    // promise the block awaited. A scope that did not survive an `await` would be
    // a scope a module function could not rely on, because every module function
    // awaits before its first query.
    await runInTenantScope(TENANT_A, client, async () => {
      await Promise.resolve()
      expect(hasTenantScope()).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 1))
      expect(requireTenantContext().tenantId).toBe('tenant-a')
    })
  })

  it('does not nest: a scope inside a scope does not open an inner transaction', async () => {
    // Prisma rejects a transaction inside a transaction rather than queuing one, so
    // a module function that opened its own scope inside an entry point's scope
    // would fail. The failure is the contract: an entry point owns the scope, and
    // `02-architecture.md` §11 puts the transaction there for that reason.
    await expect(
      runInTenantScope(TENANT_A, client, () =>
        runInTenantScope(TENANT_B, client, () => Promise.resolve('داخلی')),
      ),
    ).rejects.toThrowError()
  })

  it('rolls the block back when it raises', async () => {
    const reason = 'خطای عمدی'
    await expect(
      runInTenantScope(TENANT_A, client, async (tx) => {
        // `tenantId` is required by the create's type and supplied by the extension;
        // the cast is the gap between those two, and the rollback is the assertion.
        await tx.clinic.create({ data: { name: 'کلینیک موقت' } as Prisma.ClinicCreateInput })
        throw new Error(reason)
      }),
    ).rejects.toThrowError(reason)

    await expect(
      runInTenantScope(TENANT_A, client, (tx) => tx.clinic.findMany()),
    ).resolves.toHaveLength(1)
  })
})

describe('tenantContextOf', () => {
  it('fills the facts a job or a test has, and nothing more', () => {
    expect(tenantContextOf({ tenantId: 't' })).toEqual({
      tenantId: 't',
      clinicId: null,
      role: 'system',
      userId: 'system',
    })
  })

  it('keeps a membership’s facts', () => {
    const context = tenantContextOf({
      tenantId: 't',
      clinicId: 'c',
      role: 'doctor',
      userId: 'u',
    })
    expect(context).toEqual({ tenantId: 't', clinicId: 'c', role: 'doctor', userId: 'u' })
  })

  it('is frozen, because a context a request mutates is a context a request forged', () => {
    expect(Object.isFrozen(tenantContextOf({ tenantId: 't' }))).toBe(true)
  })
})
