/**
 * `src/core/query/invalidate.ts` — §16.3's five rows.
 *
 * Most of these assertions are about what a change must **not** touch, because
 * that is where §16.3 is specific and where a plausible implementation goes wrong:
 *
 * - editing a campaign filter invalidates "**only the preview count key — nothing
 *   else**", so returning the campaign as well would throw away the draft the user
 *   is editing;
 * - a changed service price invalidates the service and the `priceAtBooking`
 *   views, "**never a historical payment**" — `Appointment.priceAtBooking` is a
 *   snapshot, so reaching the ledger from a price change would be a correctness
 *   bug that no other test in the suite would catch;
 * - nothing here returns the tenant root `['t', tenantId]`, which §16.3 calls
 *   "correct and wasteful … the fallback, not the default".
 */

import { describe, expect, it, vi } from 'vitest'

import { asCustomerId, asTenantId, asUserId } from '@/core/types'

import { createQueryClient } from '../client'
import {
  appointmentChanged,
  campaignFilterEdited,
  contactResultRecorded,
  invalidate,
  paymentRecorded,
  servicePriceChanged,
} from '../invalidate'
import { queryKeys } from '../keys'
import type { QueryKey } from '@tanstack/react-query'

const TENANT = asTenantId('tenant-a')
const OTHER = asTenantId('tenant-b')
const DOCTOR = asUserId('user-doctor')
const CUSTOMER = asCustomerId('customer-one')

/** A key, as a comparable string. */
const asText = (keys: readonly QueryKey[]): string[] => keys.map((key) => JSON.stringify(key))

describe('appointmentChanged', () => {
  it('covers both days a reschedule touches, and the appointment', () => {
    // The day it left and the day it arrived. Guessing a range from the new date
    // would leave the old day showing an appointment that is no longer there.
    const keys = appointmentChanged(TENANT, {
      doctorId: DOCTOR,
      days: ['1405/07/09', '1405/07/10'],
      appointmentId: 'appointment-one',
    })

    expect(asText(keys)).toEqual([
      JSON.stringify(queryKeys.appointments.day(TENANT, DOCTOR, '1405/07/09')),
      JSON.stringify(queryKeys.appointments.day(TENANT, DOCTOR, '1405/07/10')),
      JSON.stringify(queryKeys.appointments.detail(TENANT, 'appointment-one')),
    ])
  })

  it('covers one day when nothing moved', () => {
    const keys = appointmentChanged(TENANT, {
      doctorId: DOCTOR,
      days: ['1405/07/09'],
      appointmentId: 'appointment-one',
    })

    expect(keys).toHaveLength(2)
  })

  it('stays inside the tenant', () => {
    const keys = appointmentChanged(OTHER, {
      doctorId: DOCTOR,
      days: ['1405/07/09'],
      appointmentId: 'appointment-one',
    })

    for (const key of keys) {
      expect(key[1]).toBe(OTHER)
    }
  })
})

describe('paymentRecorded', () => {
  it('covers the debt list and the customer', () => {
    const keys = paymentRecorded(TENANT, CUSTOMER)

    expect(asText(keys)).toEqual([
      JSON.stringify(queryKeys.debts.all(TENANT)),
      JSON.stringify(queryKeys.payments.forCustomer(TENANT, CUSTOMER)),
    ])
  })

  it('invalidates every bucket view rather than one', () => {
    // Immutable rule 8: a balance is computed from the ledger, so the only way to
    // show the wrong one is to show a cached one. `debts.all` is the prefix that
    // covers every filter combination the user has open.
    const keys = paymentRecorded(TENANT, CUSTOMER)
    const debts = keys.find((key) => key[2] === 'debts')

    expect(debts).toEqual(queryKeys.debts.all(TENANT))
  })
})

describe('contactResultRecorded', () => {
  it('covers the contact list and the cycle', () => {
    expect(asText(contactResultRecorded(TENANT, 'cycle-one'))).toEqual([
      JSON.stringify(queryKeys.cycles.all(TENANT)),
      JSON.stringify(queryKeys.cycles.detail(TENANT, 'cycle-one')),
    ])
  })
})

describe('campaignFilterEdited', () => {
  it('covers the preview count and nothing else', () => {
    // §16.3: "only the preview count key — nothing else". Re-fetching the
    // campaign would discard the draft the user is editing.
    const keys = campaignFilterEdited(TENANT, { audienceGroupId: 'group-one' })

    expect(keys).toHaveLength(1)
    expect(keys[0]).toEqual(queryKeys.campaigns.preview(TENANT, { audienceGroupId: 'group-one' }))
    expect(asText(keys)).not.toContain(JSON.stringify(queryKeys.campaigns.all(TENANT)))
  })

  it('follows the filter, so the old preview is not refetched', () => {
    const before = campaignFilterEdited(TENANT, { audienceGroupId: 'group-one' })
    const after = campaignFilterEdited(TENANT, { audienceGroupId: 'group-two' })

    expect(asText(before)).not.toEqual(asText(after))
  })
})

describe('servicePriceChanged', () => {
  it('covers the service and the views that show a current price', () => {
    const keys = servicePriceChanged(TENANT, 'service-one')

    expect(asText(keys)).toEqual([
      JSON.stringify(queryKeys.services.all(TENANT)),
      JSON.stringify(queryKeys.services.detail(TENANT, 'service-one')),
      JSON.stringify(queryKeys.appointments.all(TENANT)),
    ])
  })

  it('never reaches a historical payment', () => {
    // §16.3's last row. `priceAtBooking` is a snapshot, so a price change must not
    // invalidate the ledger — the appointment keeps the price the customer was
    // quoted. This is the assertion that keeps the rule alive.
    const modules = servicePriceChanged(TENANT, 'service-one').map((key) => key[2])

    expect(modules).not.toContain('payments')
    expect(modules).not.toContain('debts')
  })
})

describe('every invalidation', () => {
  it('stays below the tenant root', () => {
    // §16.3: invalidating ['t', tenantId] is "the fallback, not the default".
    const all = [
      ...appointmentChanged(TENANT, { doctorId: DOCTOR, days: ['1405/07/09'], appointmentId: 'a' }),
      ...paymentRecorded(TENANT, CUSTOMER),
      ...contactResultRecorded(TENANT, 'cycle-one'),
      ...campaignFilterEdited(TENANT, {}),
      ...servicePriceChanged(TENANT, 'service-one'),
    ]

    for (const key of all) {
      expect(key.length).toBeGreaterThan(2)
    }
  })

  it('never names another tenant', () => {
    const all = [
      ...paymentRecorded(TENANT, CUSTOMER),
      ...contactResultRecorded(TENANT, 'cycle-one'),
      ...campaignFilterEdited(TENANT, {}),
      ...servicePriceChanged(TENANT, 'service-one'),
    ]

    for (const key of all) {
      expect(key[1]).toBe(TENANT)
    }
  })
})

describe('invalidate', () => {
  it('marks each key stale', async () => {
    const client = createQueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
    const keys = paymentRecorded(TENANT, CUSTOMER)

    await invalidate(client, keys)

    expect(spy).toHaveBeenCalledTimes(keys.length)
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([...keys])
  })

  it('resolves with no keys', async () => {
    await expect(invalidate(createQueryClient(), [])).resolves.toBeUndefined()
  })
})
