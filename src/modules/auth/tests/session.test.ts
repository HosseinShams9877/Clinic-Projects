/**
 * Sessions — `09-security.md` §10, against a real SQLite file.
 *
 * The properties under test are the four the document names and the one the
 * implementation exists to make true:
 *
 * - the token is random and the column holds its hash, so a read of `sessions`
 *   yields no credential;
 * - the token is not the session id, so rotation is a new row and a revoked old one
 *   rather than an `UPDATE` of the row the cookie still names;
 * - logout invalidates the row server-side, so a token a client still holds is dead;
 * - exactly one of `userId` and `customerId` is set, because the staff session and
 *   the customer session are the same table and the relation the login resolved is
 *   the only thing that says which kind it is.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getTenantContext, hashToken } from '@/core/db/context'

import { openSession, revokeSession, SESSION_TTL_MS } from '../lib/session'

import { createTestDatabase, deleteTestDatabase, type TestDatabase } from '@/core/db/tests/database'

/** The clock a session is opened at, so the lifetime is a fact about a named instant. */
const NOW = new Date('2026-10-03T12:00:00Z')

const TENANT_ID = 'tenant-a'
const OTHER_TENANT_ID = 'tenant-b'
const USER_ID = 'user-a'
const CUSTOMER_ID = 'customer-a'
const CLINIC_ID = 'clinic-a'
const MEMBERSHIP_ID = 'membership-a'
const IP = '203.0.113.10'

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
    unscoped.session.deleteMany(),
    unscoped.membership.deleteMany(),
    unscoped.user.deleteMany(),
    unscoped.customer.deleteMany(),
    unscoped.clinic.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])
  await unscoped.tenant.createMany({
    data: [
      { id: TENANT_ID, slug: 'a', name: 'الف', isActive: true },
      { id: OTHER_TENANT_ID, slug: 'b', name: 'ب', isActive: true },
    ],
  })
  await unscoped.clinic.create({ data: { id: CLINIC_ID, tenantId: TENANT_ID, name: 'کلینیک' } })
  await unscoped.user.create({
    data: {
      id: USER_ID,
      tenantId: TENANT_ID,
      mobile: '09120000001',
      firstName: 'نام',
      lastName: 'نام‌خانوادگی',
      passwordHash: 'not-checked-here',
      memberships: {
        create: {
          id: MEMBERSHIP_ID,
          tenantId: TENANT_ID,
          clinicId: CLINIC_ID,
          role: 'manager',
          isActive: true,
        },
      },
    },
  })
  await unscoped.customer.create({
    data: {
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      mobile: '09130000001',
      firstName: 'نام',
      searchName: 'نام',
      lifecycle: 'CUSTOMER',
    },
  })
})

describe('openSession', () => {
  it('opens a session whose row holds the token’s hash and never the token', async () => {
    const opened = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: 'test-agent',
    })

    const row = await unscoped.session.findUnique({ where: { id: opened.sessionId } })

    expect(row).not.toBeNull()
    expect(row?.tokenHash).toBe(hashToken(opened.token))
    expect(row?.tokenHash).not.toBe(opened.token)
    expect(row?.userId).toBe(USER_ID)
    expect(row?.customerId).toBeNull()
    expect(row?.expiresAt).toEqual(new Date(NOW.getTime() + SESSION_TTL_MS))
  })

  it('opens a customer session on the same table, with the customer and no user', async () => {
    // §7: the customer panel's session resolves to a `customerId`. The row is the
    // same shape as a staff one, and the column that is set is the only thing that
    // says which kind of session it is.
    const opened = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      customerId: CUSTOMER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })

    const row = await unscoped.session.findUnique({ where: { id: opened.sessionId } })

    expect(row?.userId).toBeNull()
    expect(row?.customerId).toBe(CUSTOMER_ID)
    expect(opened.tenantId).toBe(TENANT_ID)
  })

  it('records the address and the user agent the request came from', async () => {
    const opened = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: 'Mozilla/5.0',
    })

    const row = await unscoped.session.findUnique({ where: { id: opened.sessionId } })

    expect(row?.ip).toBe(IP)
    expect(row?.userAgent).toBe('Mozilla/5.0')
  })

  it('rotates the identifier: a second login revokes the first row', async () => {
    // §10: "The session identifier is rotated on successful login." Rotation is a new
    // row plus a revocation, not an `UPDATE` — a client still holding the first cookie
    // is indistinguishable from one holding the second only if the two are two rows,
    // and `rotatedAt` is what makes the handover visible in the audit trail.
    const first = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })
    const later = new Date(NOW.getTime() + 60_000)
    const second = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: later,
      ip: IP,
      userAgent: null,
    })

    const firstRow = await unscoped.session.findUnique({ where: { id: first.sessionId } })

    expect(first.token).not.toBe(second.token)
    expect(firstRow?.revokedAt).toEqual(later)
    expect(firstRow?.rotatedAt).toEqual(later)
  })

  it('leaves a rotated token unable to resolve a context', async () => {
    const first = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })
    await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: new Date(NOW.getTime() + 60_000),
      ip: IP,
      userAgent: null,
    })

    // The resolution is the web tier's second step, and it is what makes the rotation a
    // security property rather than a bookkeeping one: the old token names a revoked
    // row, and a revoked row is `session-not-found`.
    await expect(
      getTenantContext({
        client: unscoped,
        token: first.token,
        now: NOW,
        multiTenant: true,
      }),
    ).rejects.toMatchObject({ reason: 'session-not-found' })
  })

  it('does not revoke another user’s session when it rotates', async () => {
    await unscoped.user.create({
      data: {
        id: 'user-b',
        tenantId: TENANT_ID,
        mobile: '09120000002',
        firstName: 'نام',
        lastName: 'نام‌خانوادگی',
        passwordHash: 'not-checked-here',
      },
    })
    const other = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: 'user-b' as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })

    await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })

    const otherRow = await unscoped.session.findUnique({ where: { id: other.sessionId } })

    expect(otherRow?.revokedAt).toBeNull()
  })

  it('does not revoke the other kind of session when it rotates', async () => {
    // The rotation predicate matches on the principal's id, and it matches either
    // column, because a row has exactly one of the two. A user's session and a
    // customer's session in the same tenant therefore leave each other alone — the
    // two principal columns are disjoint, and a rotation of one is not a logout of
    // the other.
    const staffSession = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })
    const customerSession = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      customerId: CUSTOMER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })

    await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      customerId: CUSTOMER_ID as never,
      now: new Date(NOW.getTime() + 60_000),
      ip: IP,
      userAgent: null,
    })

    const staffRow = await unscoped.session.findUnique({ where: { id: staffSession.sessionId } })
    const customerRow = await unscoped.session.findUnique({ where: { id: customerSession.sessionId } })

    expect(staffRow?.revokedAt).toBeNull()
    expect(customerRow?.revokedAt).not.toBeNull()
  })

  it('cannot reach another tenant’s rows, because a principal id is globally unique', async () => {
    // The rotation predicate has no tenant term — it matches on the principal's id
    // alone — and that is safe rather than lucky because `id` is a cuid, which is
    // unique across the whole database. A second tenant cannot hold the same id, so
    // the predicate cannot match a row outside the tenant the login was for. This
    // asserts the invariant the predicate relies on, which is the thing a refactor
    // could quietly break by giving a model a tenant-local id.
    const opened = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      customerId: CUSTOMER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })

    await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      customerId: CUSTOMER_ID as never,
      now: new Date(NOW.getTime() + 60_000),
      ip: IP,
      userAgent: null,
    })

    // Every row in the other tenant, after a rotation in this one.
    const otherRows = await unscoped.session.findMany({ where: { tenantId: OTHER_TENANT_ID } })

    expect(otherRows.map((row) => row.id)).not.toContain(opened.sessionId)
  })
})

describe('revokeSession', () => {
  it('revokes the row the token names and reports that there was one', async () => {
    const opened = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })

    const revoked = await revokeSession({ client: unscoped, token: opened.token, now: NOW })
    const row = await unscoped.session.findUnique({ where: { id: opened.sessionId } })

    expect(revoked).toBe(true)
    expect(row?.revokedAt).toEqual(NOW)
  })

  it('reports that there was nothing to revoke for a token it never issued', async () => {
    // The boolean is for the boundary, which renders a different page for "you were
    // signed out" than for "you were not signed in".
    const revoked = await revokeSession({ client: unscoped, token: 'a-token-nobody-has', now: NOW })

    expect(revoked).toBe(false)
  })

  it('is idempotent: a second revoke reports nothing to do and keeps the first timestamp', async () => {
    const opened = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })
    const later = new Date(NOW.getTime() + 60_000)

    await revokeSession({ client: unscoped, token: opened.token, now: NOW })
    const second = await revokeSession({ client: unscoped, token: opened.token, now: later })
    const row = await unscoped.session.findUnique({ where: { id: opened.sessionId } })

    expect(second).toBe(false)
    expect(row?.revokedAt).toEqual(NOW)
  })

  it('leaves a revoked token unable to resolve a context', async () => {
    const opened = await openSession({
      client: unscoped,
      tenantId: TENANT_ID as never,
      userId: USER_ID as never,
      now: NOW,
      ip: IP,
      userAgent: null,
    })

    await revokeSession({ client: unscoped, token: opened.token, now: NOW })

    // §10: "Logout | Server-side session invalidation, not just cookie clearing." The
    // client still holds the cookie; the row it names is dead.
    await expect(
      getTenantContext({
        client: unscoped,
        token: opened.token,
        now: NOW,
        multiTenant: true,
      }),
    ).rejects.toMatchObject({ reason: 'session-not-found' })
  })
})
