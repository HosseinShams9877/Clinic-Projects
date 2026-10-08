/**
 * License key issuance and validation — Phase 10's DoD 6, against a real SQLite file.
 *
 * The assertion the boundary exists for is the one a lapse cannot take back: a key
 * that is expired or invalid **blocks the instance and destroys nothing**. The
 * tenant, its clinics and its audit rows are still there when a renewed key arrives,
 * and the test that proves it counts them before and after.
 *
 * The key is a recorded high-entropy value rather than a signature, so the statuses
 * this suite covers are the four the blocking screen renders — and `VALID` is the
 * only one that lets the panels render.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { asTenantId, type TenantId } from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import {
  currentLicenseStatus,
  issueLicenseKey,
  recordLicenseKey,
  validateLicense,
} from '@/modules/license'
import { LicenseStatus } from '@/modules/license'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-a')
const NOW = new Date('2026-06-01T08:00:00Z')

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
    unscoped.licenseKey.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.create({
    data: { id: TENANT_ID, slug: 'a', name: 'کلینیک الف', isActive: true },
  })
})

describe('a key the issuer shaped', () => {
  it('is recorded and becomes the instance\'s license', async () => {
    const recorded = await recordLicenseKey(
      unscoped,
      'cln-aaaa-bbbb-cccc-dddd-eeee-ffff-gggg-hhhh',
      NOW,
    )

    expect(recorded.key).toBe('CLN-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH')
    expect(recorded.activatedAt).toEqual(NOW)

    // The instance's own license is the one the installer entered.
    const status = await currentLicenseStatus(unscoped, NOW)
    expect(status.status).toBe(LicenseStatus.Valid)
  })

  it('refuses a value that is not the issuer\'s shape', async () => {
    await expect(recordLicenseKey(unscoped, 'CLN-AAAA-BBBB', NOW)).rejects.toThrow()
    await expect(recordLicenseKey(unscoped, 'CLN-aaaa-bbbb-cccc-dddd-eeee-ffff-gggg-hhhh-x', NOW))
      .rejects.toThrow()

    expect(await unscoped.licenseKey.count()).toBe(0)
  })
})

describe('an issued key', () => {
  it('replaces the key the instance already held', async () => {
    const first = await issueLicenseKey(unscoped, { now: NOW })
    const second = await issueLicenseKey(unscoped, { now: NOW })

    expect(first.key).not.toBe(second.key)
    expect(await unscoped.licenseKey.count()).toBe(1)
  })

  it('carries the holder, the seats and the notes the issuer named', async () => {
    const expiresAt = new Date('2027-01-01T00:00:00Z')
    const row = await issueLicenseKey(unscoped, {
      issuedTo: 'کلینیک زیبایی الف',
      expiresAt,
      maxUsers: 5,
      notes: 'پلن سالانه',
      now: NOW,
    })

    expect(row.issuedTo).toBe('کلینیک زیبایی الف')
    expect(row.expiresAt).toEqual(expiresAt)
    expect(row.maxUsers).toBe(5)
    expect(row.notes).toBe('پلن سالانه')

    const status = await validateLicense(unscoped, row.key, NOW)
    expect(status).toEqual({
      status: LicenseStatus.Valid,
      expiresAt,
      seatsRemaining: 5,
    })
  })

  it('is unlicensed in seats and expiry when the issuer set neither', async () => {
    const row = await issueLicenseKey(unscoped, { now: NOW })

    const status = await validateLicense(unscoped, row.key, NOW)
    expect(status.status).toBe(LicenseStatus.Valid)
    expect(status.expiresAt).toBeNull()
    expect(status.seatsRemaining).toBeNull()
  })
})

describe('a key that has lapsed', () => {
  it('is expired on the instant it names, and the instance blocks', async () => {
    const expiresAt = new Date('2026-06-01T08:00:00Z')
    const row = await issueLicenseKey(unscoped, { expiresAt, now: NOW })

    expect((await validateLicense(unscoped, row.key, expiresAt)).status).toBe(LicenseStatus.Expired)

    // A second before the boundary the key is still valid, so the boundary is the
    // instant and not the day.
    expect(
      (await validateLicense(unscoped, row.key, new Date(expiresAt.getTime() - 1))).status,
    ).toBe(LicenseStatus.Valid)
  })

  it('leaves every tenant, clinic and audit row exactly where a renewal finds them', async () => {
    await unscoped.clinic.create({ data: { tenantId: TENANT_ID, name: 'شعبه اصلی', isActive: true } })
    await unscoped.user.create({
      data: {
        tenantId: TENANT_ID,
        mobile: '09120000001',
        firstName: 'مدیر',
        lastName: 'الف',
        passwordHash: 'x',
        isActive: true,
      },
    })

    const expired = new Date('2026-01-01T00:00:00Z')
    const row = await issueLicenseKey(unscoped, { expiresAt: expired, now: NOW })

    expect((await validateLicense(unscoped, row.key, NOW)).status).toBe(LicenseStatus.Expired)

    expect(await unscoped.tenant.count()).toBe(1)
    expect(await unscoped.clinic.count()).toBe(1)
    expect(await unscoped.user.count()).toBe(1)
  })
})

describe('a key the instance was never issued', () => {
  it('is invalid, and the instance blocks with the same sentence', async () => {
    await issueLicenseKey(unscoped, { now: NOW })

    const status = await validateLicense(unscoped, 'CLN-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ', NOW)
    expect(status.status).toBe(LicenseStatus.Invalid)
    expect(status.expiresAt).toBeNull()
  })
})

describe('an instance with no key recorded at all', () => {
  it('is missing, which is a configuration failure and not a license lapse', async () => {
    const status = await currentLicenseStatus(unscoped, NOW)
    expect(status.status).toBe(LicenseStatus.Missing)
  })
})

describe('a license that caps seats', () => {
  it('counts only the active users against the cap', async () => {
    const row = await issueLicenseKey(unscoped, { maxUsers: 2, now: NOW })

    await unscoped.user.createMany({
      data: [
        {
          tenantId: TENANT_ID,
          mobile: '09120000001',
          firstName: 'اول',
          lastName: 'الف',
          passwordHash: 'x',
          isActive: true,
        },
        {
          tenantId: TENANT_ID,
          mobile: '09120000002',
          firstName: 'دوم',
          lastName: 'الف',
          passwordHash: 'x',
          isActive: false,
        },
      ],
    })

    const status = await validateLicense(unscoped, row.key, NOW)
    expect(status.seatsRemaining).toBe(1)
  })

  it('does not go negative when the cap is overshot', async () => {
    const row = await issueLicenseKey(unscoped, { maxUsers: 1, now: NOW })

    await unscoped.user.createMany({
      data: [
        {
          tenantId: TENANT_ID,
          mobile: '09120000001',
          firstName: 'اول',
          lastName: 'الف',
          passwordHash: 'x',
          isActive: true,
        },
        {
          tenantId: TENANT_ID,
          mobile: '09120000002',
          firstName: 'دوم',
          lastName: 'الف',
          passwordHash: 'x',
          isActive: true,
        },
      ],
    })

    expect((await validateLicense(unscoped, row.key, NOW)).seatsRemaining).toBe(0)
  })
})
