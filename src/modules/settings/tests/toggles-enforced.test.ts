/**
 * The eight toggles are enforced on the server — Phase 10's third test.
 *
 * `04-roles-permissions.md` §4 is explicit that a toggle is not a permission: the
 * matrix says who may be on a page, a toggle says how much authority they have inside
 * it. That makes the toggle a property of the tenant's own row, read at the moment a
 * write path asks — and the one test that earns its place is the one that flips each
 * of the eight and asserts the gate answers differently.
 *
 * The suite is parametrised over `TOGGLE_DEFAULTS`, so a ninth toggle the constants
 * close is a ninth case that fails until the settings surface knows it, and an eighth
 * that disappears is a case the constants no longer compile. The on and the off are
 * both written through `writeToggles`, which is the one writer, so the blob the gate
 * reads is the blob the screen wrote.
 *
 * The five toggles whose own modules read them (`appointments`, `debts`, `cycles`)
 * keep their readers; what is asserted here is the gate every one of the eight is
 * answerable to, and that `readToggles` hands back all eight rather than the few a
 * form sent.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { DomainError, asTenantId, type TenantId } from '@/core/types'
import { TOGGLE_DEFAULTS, type Toggle } from '@/modules/roles-permissions'
import type { PrismaClient } from '@/generated/prisma/client'

import { readToggles, requireToggle, toggleEnabled, writeToggles } from '../index'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'

const TENANT_ID: TenantId = asTenantId('tenant-toggles')

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
    unscoped.tenantSettings.deleteMany(),
    unscoped.tenant.deleteMany(),
  ])

  await unscoped.tenant.createMany({
    data: [{ id: TENANT_ID, slug: 'toggles', name: 'کلینیک اختیارات', isActive: true }],
  })
})

describe.each(Object.keys(TOGGLE_DEFAULTS) as readonly Toggle[])(
  'the %s toggle',
  (toggle: Toggle) => {
    it('is allowed when it is on', async () => {
      await writeToggles(unscoped, TENANT_ID, { [toggle]: true })

      await expect(toggleEnabled(unscoped, TENANT_ID, toggle)).resolves.toBe(true)
      await expect(
        requireToggle({ tx: unscoped, tenantId: TENANT_ID, toggle }),
      ).resolves.toBeUndefined()
    })

    it('is refused when it is off', async () => {
      await writeToggles(unscoped, TENANT_ID, { [toggle]: false })

      await expect(toggleEnabled(unscoped, TENANT_ID, toggle)).resolves.toBe(false)
      await expect(
        requireToggle({ tx: unscoped, tenantId: TENANT_ID, toggle }),
      ).rejects.toThrowError(DomainError)
    })

    it('answers from the row, not the write that set it', async () => {
      await writeToggles(unscoped, TENANT_ID, { [toggle]: true })

      // A second tenant with the toggle off proves the gate reads its own tenant's
      // row: the first tenant's `on` is not a value the second one inherits.
      await unscoped.tenant.createMany({
        data: [{ id: OTHER_TENANT_ID, slug: 'other', name: 'دیگر', isActive: true }],
      })
      await writeToggles(unscoped, OTHER_TENANT_ID, { [toggle]: false })

      await expect(toggleEnabled(unscoped, OTHER_TENANT_ID, toggle)).resolves.toBe(false)
      await expect(
        requireToggle({ tx: unscoped, tenantId: OTHER_TENANT_ID, toggle }),
      ).rejects.toThrowError(DomainError)
    })
  },
)

it('reads all eight back, at the values the row holds', async () => {
  const sent: Readonly<Partial<Record<Toggle, boolean>>> = {
    DOCTOR_SELF_BOOKING: false,
    SECRETARY_DISCOUNT: false,
  }
  await writeToggles(unscoped, TENANT_ID, sent)

  const read = await readToggles(unscoped, TENANT_ID)

  expect(Object.keys(read)).toStrictEqual(Object.keys(TOGGLE_DEFAULTS))
  expect(read.DOCTOR_SELF_BOOKING).toBe(false)
  expect(read.SECRETARY_DISCOUNT).toBe(false)

  // The six the write did not name keep the documented default, which is the property
  // that keeps a form editing one toggle from unsetting the other seven.
  expect(read.DOCTOR_CLOSE_OWN_HOURS).toBe(TOGGLE_DEFAULTS.DOCTOR_CLOSE_OWN_HOURS)
  expect(read.SECRETARY_MOVE_DUE_DATE).toBe(TOGGLE_DEFAULTS.SECRETARY_MOVE_DUE_DATE)
  expect(read.SECRETARY_EDIT_PRICE).toBe(TOGGLE_DEFAULTS.SECRETARY_EDIT_PRICE)
  expect(read.ONLINE_BOOKING_NO_DEPOSIT).toBe(TOGGLE_DEFAULTS.ONLINE_BOOKING_NO_DEPOSIT)
  expect(read.BOOKING_ON_HOLIDAYS).toBe(TOGGLE_DEFAULTS.BOOKING_ON_HOLIDAYS)
  expect(read.AUTO_LEAD_FROM_SITE_FORM).toBe(TOGGLE_DEFAULTS.AUTO_LEAD_FROM_SITE_FORM)
})

it('answers with the documented default when the tenant has no row yet', async () => {
  const read = await readToggles(unscoped, TENANT_ID)

  expect(read).toStrictEqual(TOGGLE_DEFAULTS)

  // A clinic that never opened the tab still gets the gate's answer, and the answer
  // is the shipped one — the on/off a tenant starts with is a decision the product
  // made, not one the absence of a row silently reversed.
  await expect(
    toggleEnabled(unscoped, TENANT_ID, 'DOCTOR_SELF_BOOKING'),
  ).resolves.toBe(TOGGLE_DEFAULTS.DOCTOR_SELF_BOOKING)
})

/** A second tenant, for the case that a toggle is not shared across tenants. */
const OTHER_TENANT_ID: TenantId = asTenantId('tenant-toggles-other')
