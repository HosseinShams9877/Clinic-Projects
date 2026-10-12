/**
 * The client and its two constructors (`client.ts`).
 *
 * The property that matters is stated in the file's own header: a module that
 * imported `PrismaClient` directly would get an unscoped client, and nothing in
 * the type of the object would say so. These tests are what makes the two
 * constructors behave differently at run time as well as in the name.
 *
 * Prisma 6 no longer uses a driver adapter, so the `adapterFor` tests are gone;
 * the URL is the client's own concern now, and the two constructors differ only
 * in whether the tenant extension is applied.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { PrismaClient } from '@prisma/client'

import { createPrismaClient, createUnscopedClient } from '../client'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from './database'

let database: TestDatabase
let scoped: PrismaClient
let unscoped: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  scoped = database.client
  unscoped = database.unscoped
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

describe('a client built by createPrismaClient', () => {
  it('has Layer 1: a tenant-scoped query outside a scope is refused', async () => {
    await unscoped.tenant.create({ data: { slug: 'a', name: 'A', isActive: true } })

    // The refusal is the point (`09-security.md` §4.3): a silent empty result would
    // look like "no data" and be debugged as a data problem. `Tenant` is the
    // registry and is deliberately *not* scoped — it is the one query that must
    // work — so the assertion is on `clinic`.
    await expect(scoped.clinic.findMany()).rejects.toThrowError(/outside a tenant scope/)
  })
})

describe('a client built by createUnscopedClient', () => {
  it('has no Layer 1, which is why the name is a warning', async () => {
    // The three documented uses are `getTenantContext()`, the seed and the
    // migrations, and the startup check — all reads that happen before a tenant
    // scope can exist. This is the behaviour that makes those possible.
    await expect(unscoped.tenant.findMany()).resolves.toHaveLength(1)
    await expect(unscoped.clinic.findMany()).resolves.toEqual([])
  })
})

describe('the two constructors of the same URL', () => {
  it('build one client each, and only the scoped one refuses', async () => {
    const url = database.url
    const first = createPrismaClient(url)
    const second = createUnscopedClient(url)

    await expect(first.clinic.findMany()).rejects.toThrowError(/outside a tenant scope/)
    await expect(second.clinic.findMany()).resolves.toEqual([])

    await first.$disconnect()
    await second.$disconnect()
  })
})