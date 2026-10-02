/**
 * `src/core/query/optimistic.ts` — §16.4's five conditions, on both paths.
 *
 * §16.4 is explicit that the interesting half is the failure: "**Optimistic
 * updates are tested on both paths** — success *and* failure/rollback
 * (`10-testing-strategy.md` §16.4). A test that only covers the happy path does
 * not cover the half of this feature that runs when something is wrong."
 *
 * So the end-to-end tests below run the three handlers in the order React Query
 * runs them, and assert the *cache contents* after each — the rollback restores
 * exactly the snapshot, the success replaces the guess with the server's answer,
 * and the case the implementation calls out (a cache that held nothing) invents
 * no rows.
 *
 * The client is real rather than a mock. These handlers exist to move data in and
 * out of a real `QueryClient`, and a mock would only assert that the mock was
 * called.
 */

import { describe, expect, it, vi } from 'vitest'

import { asTenantId, asUserId } from '@/core/types'

import { createQueryClient } from '../client'
import { queryKeys } from '../keys'
import { optimisticUpdate } from '../optimistic'

interface Row {
  readonly id: string
  readonly doctorId: string
}

const TENANT = asTenantId('tenant-a')
const DOCTOR_OLD = asUserId('user-old')
const DOCTOR_NEW = 'user-new'

const KEY = queryKeys.appointments.day(TENANT, DOCTOR_OLD, '1405/07/09')

const BEFORE: readonly Row[] = [
  { id: 'a1', doctorId: DOCTOR_OLD },
  { id: 'a2', doctorId: DOCTOR_OLD },
]

const VARIABLES = { id: 'a1', doctorId: DOCTOR_NEW }

function update() {
  return optimisticUpdate<readonly Row[], typeof VARIABLES>({
    key: () => KEY,
    apply: (previous, variables) =>
      previous.map((row) =>
        row.id === variables.id ? { ...row, doctorId: variables.doctorId } : row,
      ),
  })
}

/** A client with the day already cached, as it would be in the day grid. */
function seeded() {
  const client = createQueryClient()
  client.setQueryData(KEY, BEFORE)
  return client
}

describe('onMutate', () => {
  it('cancels the in-flight refetch before writing', async () => {
    // §16.4.5. Without the cancel, a refetch that resolves after the optimistic
    // write overwrites it with the server's old value and the user's change
    // appears to undo itself.
    const client = seeded()
    const cancel = vi.spyOn(client, 'cancelQueries')

    await update().onMutate(VARIABLES, { client })

    expect(cancel).toHaveBeenCalledWith({ queryKey: KEY })
  })

  it('writes the optimistic value', async () => {
    const client = seeded()

    await update().onMutate(VARIABLES, { client })

    expect(client.getQueryData(KEY)).toEqual([
      { id: 'a1', doctorId: DOCTOR_NEW },
      { id: 'a2', doctorId: DOCTOR_OLD },
    ])
  })

  it('snapshots the value it replaced', async () => {
    const client = seeded()

    const result = await update().onMutate(VARIABLES, { client })

    expect(result.previous).toEqual(BEFORE)
    expect(result.queryKey).toEqual(KEY)
  })

  it('leaves an empty cache alone rather than inventing rows', async () => {
    // A surface whose query has not resolved. Fabricating a list from a guess
    // would put invented rows on the screen, which is worse than a slow one.
    const client = createQueryClient()
    const apply = vi.fn()

    const handlers = optimisticUpdate<readonly Row[], typeof VARIABLES>({ key: () => KEY, apply })
    const result = await handlers.onMutate(VARIABLES, { client })

    expect(apply).not.toHaveBeenCalled()
    expect(result.previous).toBeUndefined()
    expect(client.getQueryData(KEY)).toBeUndefined()
  })
})

describe('onError', () => {
  it('restores the exact snapshot and then invalidates', async () => {
    const client = seeded()
    const handlers = update()
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)

    const result = await handlers.onMutate(VARIABLES, { client })

    expect(client.getQueryData(KEY)).not.toEqual(BEFORE)

    await handlers.onError(new Error('server refused'), VARIABLES, result, { client })

    expect(client.getQueryData(KEY)).toEqual(BEFORE)
    // Restoration alone is not enough: another actor may have changed the rows
    // while the mutation was in flight, so the next read is made authoritative.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY })
  })

  it('invalidates without writing when there was nothing to restore', async () => {
    const client = createQueryClient()
    const handlers = update()
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)

    const result = await handlers.onMutate(VARIABLES, { client })
    await handlers.onError(new Error('server refused'), VARIABLES, result, { client })

    expect(client.getQueryData(KEY)).toBeUndefined()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY })
  })

  it('does nothing when no result was passed', async () => {
    // React Query passes `undefined` when `onMutate` itself threw. There is no
    // snapshot to restore and the key is unknown, so there is nothing to do.
    const client = seeded()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await update().onError(new Error('boom'), VARIABLES, undefined, { client })

    expect(client.getQueryData(KEY)).toEqual(BEFORE)
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('onSettled', () => {
  it("replaces the guess with the server's answer", async () => {
    // §16.4.2. The server may have recorded a different time, id or price — a
    // priceAtBooking snapshot, a recomputed balance — so the response is what
    // stays, not the value the user typed.
    const client = seeded()
    const handlers = update()
    const result = await handlers.onMutate(VARIABLES, { client })

    const stored: readonly Row[] = [
      { id: 'a1', doctorId: DOCTOR_NEW },
      { id: 'a2', doctorId: DOCTOR_OLD },
    ]

    await handlers.onSettled(stored, null, VARIABLES, result, { client })

    expect(client.getQueryData(KEY)).toEqual(stored)
  })

  it('does not touch the cache when the mutation failed', async () => {
    // The rollback already ran in `onError`. Writing here would undo it.
    const client = seeded()
    const handlers = update()
    const result = await handlers.onMutate(VARIABLES, { client })

    await handlers.onError(new Error('boom'), VARIABLES, result, { client })
    await handlers.onSettled(undefined, new Error('boom'), VARIABLES, result, { client })

    expect(client.getQueryData(KEY)).toEqual(BEFORE)
  })

  it('falls back to the key builder when no result was passed', async () => {
    const client = seeded()
    const stored: readonly Row[] = [{ id: 'a9', doctorId: DOCTOR_NEW }]

    await update().onSettled(stored, null, VARIABLES, undefined, { client })

    expect(client.getQueryData(KEY)).toEqual(stored)
  })
})

describe('the two paths end to end', () => {
  it('success leaves the server value in the cache', async () => {
    const client = seeded()
    const handlers = update()

    const result = await handlers.onMutate(VARIABLES, { client })
    await handlers.onSettled(BEFORE, null, VARIABLES, result, { client })

    expect(client.getQueryData(KEY)).toEqual(BEFORE)
  })

  it('failure leaves the original value in the cache', async () => {
    const client = seeded()
    const handlers = update()
    const original = client.getQueryData(KEY)

    const result = await handlers.onMutate(VARIABLES, { client })
    await handlers.onError(new Error('server refused'), VARIABLES, result, { client })

    // `toEqual` rather than `toBe`: `setQueryData` writes a new reference on the
    // restore, so the object in the cache is equal to the one `original` captured
    // but not the same instance. What this asserts is the value — the rollback put
    // the exact rows back — and a reference check here would be asserting an
    // implementation detail of the cache that the contract does not promise.
    expect(client.getQueryData(KEY)).toEqual(original)
  })
})
