// @vitest-environment jsdom
/**
 * `src/core/query/provider.tsx` — the client, and the tenancy boundary.
 *
 * The provider has one behaviour that matters and one that is merely plumbing.
 * The plumbing is that a child can reach the client and the tenant. The
 * behaviour is the third test below: **switching tenant discards the cache.**
 *
 * The keys of §16.2 stop tenant A's entry from being *served* as tenant B's. They
 * do not stop tenant A's rows from sitting in memory after the user has switched,
 * which is why the provider replaces the client rather than clearing it — and why
 * the test asserts the new client holds *nothing*, not merely that it is a
 * different object.
 *
 * `05-conventions.md` §16.2: "[A] single tenant's user switching tenancy — a
 * visiting doctor with two memberships (`02-architecture.md` §2) — is ordinary."
 * Ordinary is the point: this path runs in production, not only in a test.
 */

import { useQueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/core/types'

import { QueryTenantProvider, useQueryTenantId } from '../provider'
import type { QueryKey } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const A = asTenantId('tenant-a')
const B = asTenantId('tenant-b')

/** A key that belongs to no module — this test is about the cache, not a surface. */
const PROBE_KEY: QueryKey = ['probe']

/** The tenant the wrapper is rendering for. Mutated between renders, on purpose. */
let current: typeof A = A

function wrapper({ children }: { readonly children: ReactNode }) {
  return <QueryTenantProvider tenantId={current}>{children}</QueryTenantProvider>
}

/** The client and the tenant, as a child of the provider sees them. */
function useScope() {
  return { client: useQueryClient(), tenantId: useQueryTenantId() }
}

describe('QueryTenantProvider', () => {
  it('gives a child the client and the server-resolved tenant', () => {
    current = A
    const { result } = renderHook(() => useScope(), { wrapper })

    expect(result.current.tenantId).toBe(A)
    expect(result.current.client).toBeDefined()
  })

  it('keeps the same client across a re-render', () => {
    // A client per render would throw the cache away on every keystroke.
    current = A
    const { result, rerender } = renderHook(() => useScope(), { wrapper })
    const first = result.current.client

    result.current.client.setQueryData(PROBE_KEY, 'tenant-a-data')
    rerender()

    expect(result.current.client).toBe(first)
    expect(result.current.client.getQueryData(PROBE_KEY)).toBe('tenant-a-data')
  })

  it('discards the cache when the tenant changes', () => {
    current = A
    const { result, rerender } = renderHook(() => useScope(), { wrapper })
    const first = result.current.client

    first.setQueryData(PROBE_KEY, 'tenant-a-data')
    expect(first.getQueryData(PROBE_KEY)).toBe('tenant-a-data')

    current = B
    rerender()

    expect(result.current.tenantId).toBe(B)
    expect(result.current.client).not.toBe(first)
    // Not cleared but *absent*: the new client is a different object, so a
    // response still in flight for tenant A has nothing to land in.
    expect(result.current.client.getQueryData(PROBE_KEY)).toBeUndefined()
  })

  it('does not hand the previous tenant back when the tenant returns', () => {
    current = A
    const { result, rerender } = renderHook(() => useScope(), { wrapper })

    result.current.client.setQueryData(PROBE_KEY, 'tenant-a-data')

    current = B
    rerender()
    current = A
    rerender()

    expect(result.current.client.getQueryData(PROBE_KEY)).toBeUndefined()
  })

  it('passes its error handler the client it built', () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useQueryClient(), {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <QueryTenantProvider tenantId={A} onError={onError}>
          {children}
        </QueryTenantProvider>
      ),
    })

    result.current.getQueryCache().config.onError?.(new Error('boom'), undefined as never)

    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'query')
  })
})

describe('useQueryTenantId', () => {
  it('refuses to guess a tenant when there is no provider', () => {
    // A fallback here would build keys whose second element is a placeholder, and
    // two of those share one cache entry across tenants — the exact leak the key
    // builder exists to prevent, through the one door it cannot see.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => renderHook(() => useQueryTenantId())).toThrow(/QueryTenantProvider/)

    quiet.mockRestore()
  })
})
