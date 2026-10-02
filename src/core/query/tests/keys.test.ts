/**
 * `src/core/query/keys.ts` — the key builder of `05-conventions.md` §16.2.
 *
 * The two things worth testing here are not "does it return an array".
 *
 * 1. **Tenant separation.** §16.2's warning is specific: a key without `tenantId`
 *    "serves tenant A's cached rows to tenant B from memory, with no query
 *    executed and no RLS predicate evaluated". That is a leak the database layer
 *    of `09-security.md` §4 cannot catch, so the assertion that every helper
 *    produces a different key for two tenants is the only thing standing between
 *    a typo and a cross-tenant read. It is asserted for **every** helper, by
 *    iterating a table rather than by listing the two or three that seemed
 *    risky — the one that gets forgotten is the one that matters.
 * 2. **Filter canonicalisation.** §16.2 rule 4: an object literal rebuilt every
 *    render "changes identity and defeats the cache". The tests below pin the
 *    property that makes it safe — same filters, same string — and the three
 *    decisions the implementation documents: sorted keys, ordered lists, absent
 *    values omitted.
 */

import { describe, expect, it } from 'vitest'

import { asCustomerId, asTenantId, asUserId } from '@/core/types'

import { canonicalFilters, queryKeys, tenantScope } from '../keys'
import type { QueryKey } from '@tanstack/react-query'

const A = asTenantId('tenant-a')
const B = asTenantId('tenant-b')
const DOCTOR = asUserId('user-doctor')
const CUSTOMER = asCustomerId('customer-one')
const DAY = '1405/07/09'

/** Every helper that takes a tenant, as a function of that tenant. */
const KEYS_BY_TENANT: Readonly<Record<string, (tenantId: typeof A) => QueryKey>> = {
  'appointments.all': (t) => queryKeys.appointments.all(t),
  'appointments.day': (t) => queryKeys.appointments.day(t, DOCTOR, DAY),
  'appointments.detail': (t) => queryKeys.appointments.detail(t, 'appointment-one'),
  'cycles.all': (t) => queryKeys.cycles.all(t),
  'cycles.contactList': (t) => queryKeys.cycles.contactList(t, { bucket: 'due' }),
  'cycles.detail': (t) => queryKeys.cycles.detail(t, 'cycle-one'),
  'debts.all': (t) => queryKeys.debts.all(t),
  'debts.list': (t) => queryKeys.debts.list(t, { bucket: 'over-90' }),
  'payments.all': (t) => queryKeys.payments.all(t),
  'payments.forCustomer': (t) => queryKeys.payments.forCustomer(t, CUSTOMER),
  'campaigns.all': (t) => queryKeys.campaigns.all(t),
  'campaigns.preview': (t) => queryKeys.campaigns.preview(t, { audienceGroupId: 'group-one' }),
  'campaigns.detail': (t) => queryKeys.campaigns.detail(t, 'campaign-one'),
  'notifications.all': (t) => queryKeys.notifications.all(t),
  'notifications.feed': (t) => queryKeys.notifications.feed(t, { unreadOnly: true }),
  'services.all': (t) => queryKeys.services.all(t),
  'services.detail': (t) => queryKeys.services.detail(t, 'service-one'),
}

const NAMES = Object.keys(KEYS_BY_TENANT)

describe('the tenant scope', () => {
  it('is the marker and the tenant id, and nothing else', () => {
    expect(tenantScope(A)).toEqual(['t', A])
    expect(tenantScope(A)).toHaveLength(2)
  })
})

describe('every key', () => {
  it.each(NAMES)('%s begins with the marker and the tenant id', (name) => {
    const built = KEYS_BY_TENANT[name]?.(A)

    expect(built?.[0]).toBe('t')
    expect(built?.[1]).toBe(A)
  })

  it.each(NAMES)('%s differs for two tenants', (name) => {
    // The whole point of the module. Two tenants must never share an entry.
    expect(KEYS_BY_TENANT[name]?.(A)).not.toEqual(KEYS_BY_TENANT[name]?.(B))
  })

  it.each(NAMES)('%s carries no undefined segment', (name) => {
    // A helper that forgot an argument would put `undefined` in a key, and two
    // different surfaces could then hash to the same entry.
    expect(KEYS_BY_TENANT[name]?.(A)?.includes(undefined)).toBe(false)
  })

  it('no two helpers share a key for the same tenant', () => {
    const built = NAMES.map((name) => JSON.stringify(KEYS_BY_TENANT[name]?.(A)))
    expect(new Set(built).size).toBe(built.length)
  })

  it('is hierarchical, so a narrower key starts with its group prefix', () => {
    // §16.2 rule 3, and the property §16.3's "invalidate by prefix" depends on.
    expect(queryKeys.appointments.day(A, DOCTOR, DAY).slice(0, 3)).toEqual(
      queryKeys.appointments.all(A),
    )
    expect(queryKeys.cycles.contactList(A, {}).slice(0, 3)).toEqual(queryKeys.cycles.all(A))
    expect(queryKeys.campaigns.preview(A, {}).slice(0, 3)).toEqual(queryKeys.campaigns.all(A))
    expect(queryKeys.services.detail(A, 'service-one').slice(0, 3)).toEqual(
      queryKeys.services.all(A),
    )
  })

  it('names its module with the closed list of 02-architecture.md §7', () => {
    // Not a literal: a key cannot name a module the twenty do not contain.
    expect(queryKeys.appointments.all(A)[2]).toBe('appointments')
    expect(queryKeys.notifications.all(A)[2]).toBe('notifications')
  })
})

describe('canonicalFilters', () => {
  it('is the empty string for no filters', () => {
    expect(canonicalFilters({})).toBe('')
  })

  it('produces the same string whatever order the keys were written in', () => {
    // §16.2 rule 4: an object rebuilt per render must not defeat the cache.
    expect(canonicalFilters({ bucket: 'due', doctorId: 'd1' })).toBe(
      canonicalFilters({ doctorId: 'd1', bucket: 'due' }),
    )
    expect(canonicalFilters({ bucket: 'due', doctorId: 'd1' })).toBe('bucket=due&doctorId=d1')
  })

  it('omits a filter that is null or undefined', () => {
    // "No filter" and "filter absent" are the same query, so they must be the
    // same key — otherwise an early render caches a second copy of the same rows.
    expect(canonicalFilters({ bucket: undefined, doctorId: 'd1' })).toBe('doctorId=d1')
    expect(canonicalFilters({ bucket: null })).toBe('')
  })

  it('keeps the order of a list, because the caller owns it', () => {
    // Sorting here would make two genuinely different queries share one entry: a
    // cached wrong answer rather than a slow one.
    expect(canonicalFilters({ ids: ['b', 'a'] })).toBe('ids=[b,a]')
    expect(canonicalFilters({ ids: ['b', 'a'] })).not.toBe(canonicalFilters({ ids: ['a', 'b'] }))
  })

  it('renders every primitive', () => {
    expect(canonicalFilters({ s: 'x', n: 12, b: false })).toBe('b=false&n=12&s=x')
  })

  it('refuses an object where a filter value was expected', () => {
    // Reached by a caller who arrived through `any`. TypeScript rejects it at a
    // call site; this is the run-time half.
    const filters = { row: { id: 'x' } } as unknown as Parameters<typeof canonicalFilters>[0]

    expect(() => canonicalFilters(filters)).toThrow(TypeError)
  })

  it('refuses a list holding something that is not a primitive', () => {
    const filters = { ids: [{ id: 'x' }] } as unknown as Parameters<typeof canonicalFilters>[0]

    expect(() => canonicalFilters(filters)).toThrow(TypeError)
  })

  it('separates the filters it is given from the key it produces', () => {
    // Two filter sets that would collide under naive concatenation must not.
    expect(canonicalFilters({ a: '1&b=2' })).not.toBe(canonicalFilters({ a: '1', b: '2' }))
  })
})
