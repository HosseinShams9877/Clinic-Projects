/**
 * The two logins of `09-security.md` §10, against a real SQLite file.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." A mocked client would assert what `loginWithPassword` was called
 * with; the assertions that matter here are about what a query *returns* and about
 * what a failure *does not disclose* — and the enumeration rule in particular is a
 * property of two branches' observable behaviour, which a mock cannot check because
 * the mock is the thing that would have to be told the answer.
 *
 * ## What each suite is for
 *
 * - the password suite is about one lookup across two tenants and one sentence for
 *   two different failures;
 * - the one-time-code suite is about the row being written whether or not the
 *   mobile is known, the two rate limits, and the five distinct outcomes a
 *   challenge can produce.
 *
 * The clock is injected as a constant rather than read, so an expiry and a
 * rate-limit window are facts about a date the test names.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CustomerLifecycle } from '@/core/constants'

import type { PrismaClient } from '@/generated/prisma/client'

import { hashPassword } from '../lib/password'
import { issueOtp, loginWithOtp, loginWithPassword } from '../lib/login'
import { CODE_TTL_MS, MAX_CODE_ATTEMPTS, RATE_LIMIT } from '../lib/otp'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

/** The clock the logins read, so a TTL is a fact about a named instant. */
const NOW = new Date('2026-10-03T12:00:00Z')

const TENANT_ID = 'tenant-a'
const OTHER_TENANT_ID = 'tenant-b'

/** The mobile the seed shares between both tenants — unique per tenant, not globally. */
const SHARED_MOBILE = '09120000001'

const STAFF_PASSWORD = 'a-password-a-test-made-up'
const OTHER_PASSWORD = 'a-different-password-a-test-made-up'

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
    unscoped.otpChallenge.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])
  await unscoped.tenant.createMany({
    data: [
      { id: TENANT_ID, slug: 'a', name: 'الف', isActive: true },
      { id: OTHER_TENANT_ID, slug: 'b', name: 'ب', isActive: true },
    ],
  })
  // The same staff mobile in both tenants, with different passwords, so a login
  // resolves by the row it finds rather than by the mobile alone.
  await unscoped.user.createMany({
    data: [
      {
        id: 'user-a',
        tenantId: TENANT_ID,
        mobile: SHARED_MOBILE,
        firstName: 'نام',
        lastName: 'نام‌خانوادگی',
        passwordHash: await hashPassword(STAFF_PASSWORD),
        isActive: true,
      },
      {
        id: 'user-b',
        tenantId: OTHER_TENANT_ID,
        mobile: SHARED_MOBILE,
        firstName: 'نام',
        lastName: 'نام‌خانوادگی',
        passwordHash: await hashPassword(OTHER_PASSWORD),
        isActive: true,
      },
      {
        id: 'user-inactive',
        tenantId: TENANT_ID,
        mobile: '09120000002',
        firstName: 'نام',
        lastName: 'نام‌خانوادگی',
        passwordHash: await hashPassword(STAFF_PASSWORD),
        isActive: false,
      },
    ],
  })
  await unscoped.customer.createMany({
    data: [
      {
        id: 'customer-a',
        tenantId: TENANT_ID,
        mobile: '09130000001',
        firstName: 'نام',
        searchName: 'نام',
        lifecycle: CustomerLifecycle.Customer,
      },
    ],
  })
})

/** The one challenge a login is being tested against, with its code read back. */
async function challengeWithCode(
  mobile: string,
  tenantId: string = TENANT_ID,
  ip = '203.0.113.1',
): Promise<{ readonly id: string; readonly code: string | null }> {
  const issued = await issueOtp({ client: unscoped, tenantId: tenantId as never, mobile, now: NOW, ip })
  return { id: issued.challenge.id, code: issued.code }
}

describe('loginWithPassword', () => {
  it('resolves the staff member the password accepts', async () => {
    const staff = await loginWithPassword({
      client: unscoped,
      mobile: SHARED_MOBILE,
      password: STAFF_PASSWORD,
    })

    expect(staff).toEqual({ userId: 'user-a', tenantId: TENANT_ID })
  })

  it('resolves the tenant the mobile belongs to, not the first one it finds', async () => {
    // The same mobile exists in both tenants with a different password, so a lookup
    // that stopped at the first row would authenticate user-a with user-b's password.
    const staff = await loginWithPassword({
      client: unscoped,
      mobile: SHARED_MOBILE,
      password: OTHER_PASSWORD,
    })

    expect(staff).toEqual({ userId: 'user-b', tenantId: OTHER_TENANT_ID })
  })

  it('fails with one sentence for a wrong password', async () => {
    await expect(
      loginWithPassword({ client: unscoped, mobile: SHARED_MOBILE, password: 'wrong' }),
    ).rejects.toMatchObject({ messageKey: 'auth.login.failed' })
  })

  it('fails with the same sentence for a mobile no tenant knows', async () => {
    // §10: "Login responses do not reveal whether a mobile number exists." The two
    // failures are the same key, and the second one is the one a mock could not have
    // answered without being told the mobile was unknown.
    await expect(
      loginWithPassword({ client: unscoped, mobile: '09129999999', password: 'wrong' }),
    ).rejects.toMatchObject({ messageKey: 'auth.login.failed' })
  })

  it('discloses the same thing for an unknown mobile as for a wrong password', async () => {
    // §10: "Login responses do not reveal whether a mobile number exists." The
    // constant-work branch in the implementation exists so the *timing* cannot leak
    // it either; what a test can assert deterministically is that the two failures a
    // caller can observe are the same failure — same key, same sentence, and a detail
    // that names neither the mobile nor the tenant, because the detail is what a log
    // line would carry and a log line is a place a leak has come from.
    const unknown = await loginWithPassword({
      client: unscoped,
      mobile: '09129999999',
      password: 'wrong',
    }).catch((error) => error)
    const wrong = await loginWithPassword({
      client: unscoped,
      mobile: SHARED_MOBILE,
      password: 'wrong',
    }).catch((error) => error)

    expect(unknown.messageKey).toBe(wrong.messageKey)
    expect(unknown.message).toBe(wrong.message)
    // The wrong-password branch has a row to name, so if it put a user id or a tenant
    // id in the detail the two would be distinguishable. Nothing either branch
    // discloses is a fact about the mobile.
    expect(unknown.detail).toEqual(wrong.detail)
    expect(Object.keys(unknown.detail)).toEqual([])
  })

  it('names a deactivated account with a different sentence, because the fix differs', async () => {
    await expect(
      loginWithPassword({ client: unscoped, mobile: '09120000002', password: STAFF_PASSWORD }),
    ).rejects.toMatchObject({ messageKey: 'auth.account.inactive' })
  })

  it('returns no role, no clinicId and no permission set', async () => {
    // `04-roles-permissions.md` §2: authentication does not make an authorisation
    // decision. Those come from the membership, which the login does not read.
    const staff = await loginWithPassword({
      client: unscoped,
      mobile: SHARED_MOBILE,
      password: STAFF_PASSWORD,
    })

    expect(Object.keys(staff)).toEqual(['userId', 'tenantId'])
  })
})

describe('issueOtp', () => {
  it('writes a challenge and hands the code back for a mobile the tenant knows', async () => {
    const issued = await issueOtp({
      client: unscoped,
      tenantId: TENANT_ID as never,
      mobile: '09130000001',
      now: NOW,
      ip: '203.0.113.1',
    })

    expect(issued.challenge).toMatchObject({
      tenantId: TENANT_ID,
      mobile: '09130000001',
    })
    expect(issued.code).not.toBeNull()
    expect(issued.challenge.expiresAt.getTime()).toBe(NOW.getTime() + CODE_TTL_MS)

    // The row is what the rate limit counts and what the login reads back.
    const row = await unscoped.otpChallenge.findUnique({ where: { id: issued.challenge.id } })
    expect(row).not.toBeNull()
    expect(row?.customerId).toBe('customer-a')
  })

  it('writes the same row for a mobile no tenant knows, and hands back no code', async () => {
    // §10's enumeration rule: an unknown mobile gets the challenge, the row and the
    // rate-limit accounting, so the response is indistinguishable and the limit still
    // counts the attempt.
    const issued = await issueOtp({
      client: unscoped,
      tenantId: TENANT_ID as never,
      mobile: '09139999999',
      now: NOW,
      ip: '203.0.113.2',
    })

    expect(issued.code).toBeNull()

    const row = await unscoped.otpChallenge.findUnique({ where: { id: issued.challenge.id } })
    expect(row).not.toBeNull()
    expect(row?.customerId).toBeNull()
  })

  it('stores a hash and never the code', async () => {
    const issued = await issueOtp({
      client: unscoped,
      tenantId: TENANT_ID as never,
      mobile: '09130000001',
      now: NOW,
      ip: '203.0.113.3',
    })

    const row = await unscoped.otpChallenge.findUnique({ where: { id: issued.challenge.id } })
    expect(row?.codeHash).not.toBe(issued.code)
    expect(row?.codeHash).toHaveLength(64)
  })

  it(`refuses a second code for the same mobile within the window`, async () => {
    const mobile = '09130000001'
    const ip = '203.0.113.4'

    await issueOtp({ client: unscoped, tenantId: TENANT_ID as never, mobile, now: NOW, ip })

    await expect(
      issueOtp({ client: unscoped, tenantId: TENANT_ID as never, mobile, now: NOW, ip }),
    ).rejects.toMatchObject({ messageKey: 'auth.otp.rateLimited' })
  })

  it(`refuses a code for a mobile at its per-IP limit, in a different tenant`, async () => {
    // The per-IP limit is per tenant, so an address that has asked its fill in one
    // tenant may still ask in another — the two limits are independent columns of the
    // same predicate, and the tenant is the one the page resolved.
    const ip = '203.0.113.5'
    for (let i = 0; i < RATE_LIMIT.perIpPerMinute; i += 1) {
      await issueOtp({
        client: unscoped,
        tenantId: TENANT_ID as never,
        mobile: `0913000001${i}`,
        now: NOW,
        ip,
      })
    }

    await expect(
      issueOtp({
        client: unscoped,
        tenantId: TENANT_ID as never,
        mobile: '0913000010',
        now: NOW,
        ip,
      }),
    ).rejects.toMatchObject({ messageKey: 'auth.otp.rateLimited' })

    // The same address in the other tenant is not at its limit there.
    await expect(
      issueOtp({
        client: unscoped,
        tenantId: OTHER_TENANT_ID as never,
        mobile: '0913000011',
        now: NOW,
        ip,
      }),
    ).resolves.toBeDefined()
  })

  it('issues again once the window has passed', async () => {
    const mobile = '09130000001'
    const ip = '203.0.113.6'
    const later = new Date(NOW.getTime() + 61_000)

    await issueOtp({ client: unscoped, tenantId: TENANT_ID as never, mobile, now: NOW, ip })

    await expect(
      issueOtp({ client: unscoped, tenantId: TENANT_ID as never, mobile, now: later, ip }),
    ).resolves.toBeDefined()
  })
})

describe('loginWithOtp', () => {
  it('signs the customer in with the code that was issued', async () => {
    const { id, code } = await challengeWithCode('09130000001')

    const customer = await loginWithOtp({ client: unscoped, challengeId: id, code: code!, now: NOW })

    expect(customer).toEqual({ customerId: 'customer-a', tenantId: TENANT_ID })
  })

  it('marks the code spent, so a second login with the same row fails', async () => {
    const { id, code } = await challengeWithCode('09130000001')

    await loginWithOtp({ client: unscoped, challengeId: id, code: code!, now: NOW })

    await expect(
      loginWithOtp({ client: unscoped, challengeId: id, code: code!, now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'auth.otp.expired' })

    // §10's single-use rule keeps the row for the audit trail rather than deleting it.
    const row = await unscoped.otpChallenge.findUnique({ where: { id } })
    expect(row?.consumedAt).not.toBeNull()
  })

  it('fails with the invalid sentence for a wrong code and counts the attempt', async () => {
    const { id } = await challengeWithCode('09130000001')

    await expect(
      loginWithOtp({ client: unscoped, challengeId: id, code: '000000', now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'auth.otp.invalid' })

    const row = await unscoped.otpChallenge.findUnique({ where: { id } })
    expect(row?.attempts).toBe(1)
  })

  it('fails with the same sentence for a challenge that was never issued', async () => {
    await expect(
      loginWithOtp({ client: unscoped, challengeId: 'no-such-challenge', code: '000000', now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'auth.otp.invalid' })
  })

  it('freezes a challenge that has been guessed too many times', async () => {
    const { id, code } = await challengeWithCode('09130000001')

    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
      await expect(
        loginWithOtp({ client: unscoped, challengeId: id, code: '000000', now: NOW }),
      ).rejects.toMatchObject({ messageKey: 'auth.otp.invalid' })
    }

    // The right code no longer helps: the counter froze the challenge, and the
    // sentence names the new fix — a new code, not another guess.
    await expect(
      loginWithOtp({ client: unscoped, challengeId: id, code: code!, now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'auth.otp.tooManyAttempts' })
  })

  it('reports an expired code with a sentence that names the fix', async () => {
    const { id, code } = await challengeWithCode('09130000001')
    const afterExpiry = new Date(NOW.getTime() + CODE_TTL_MS + 1)

    await expect(
      loginWithOtp({ client: unscoped, challengeId: id, code: code!, now: afterExpiry }),
    ).rejects.toMatchObject({ messageKey: 'auth.otp.expired' })
  })

  it('fails with the invalid sentence for a mobile with no account', async () => {
    // A challenge was issued for an unknown mobile. The row exists, the code is the
    // one that was issued, and the response is still the one a wrong code produces —
    // because from the customer's side the two failures are the same one.
    const { id, code } = await challengeWithCode('09139999999')

    expect(code).toBeNull()
    await expect(
      loginWithOtp({ client: unscoped, challengeId: id, code: 'whatever', now: NOW }),
    ).rejects.toMatchObject({ messageKey: 'auth.otp.invalid' })
  })

  it('returns no role and no clinicId, as the membership is not the customer’s to have', async () => {
    const { id, code } = await challengeWithCode('09130000001')

    const customer = await loginWithOtp({ client: unscoped, challengeId: id, code: code!, now: NOW })

    expect(Object.keys(customer)).toEqual(['customerId', 'tenantId'])
  })
})
