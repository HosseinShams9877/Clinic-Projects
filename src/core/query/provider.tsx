'use client'

/**
 * The React Query provider of `05-conventions.md` §16.
 *
 * It does two things, and the second is the one that is easy to get wrong:
 *
 * 1. It puts a `QueryClient` in the tree, created by `createQueryClient()`.
 * 2. It **discards the whole cache when the tenant changes.**
 *
 * The keys of §16.2 stop one tenant's entry from being *served* as another's.
 * They do not stop tenant A's patient rows from sitting in memory after the user
 * has switched to tenant B — and a visiting doctor with two memberships
 * (`02-architecture.md` §2) switching tenancy is ordinary rather than exotic. The
 * cached rows are reachable by anything that walks the cache: React Query's
 * devtools, a serialised error report, a later `getQueryData` with a key that was
 * mistyped. `invalidateQueries` would not help — invalidation marks entries stale,
 * it does not remove them.
 *
 * ## Why the client is replaced during render
 *
 * A `useEffect` that called `queryClient.clear()` when the tenant changed would
 * run *after* the render it is meant to protect, so one committed frame would
 * show tenant B the rows tenant A fetched. Replacing the client in a render-phase
 * branch instead means React re-renders before anything is committed, and the
 * stale client is never handed to a child. It is the documented React pattern for
 * "adjusting state when a prop changes", and here it is a tenancy boundary rather
 * than a nicety.
 *
 * Discarding the client rather than clearing it is deliberate too: `clear()`
 * removes the entries but keeps the `QueryClient` object, and an in-flight fetch
 * still resolves into it afterwards with the old tenant's data. A new client has
 * nothing for those responses to land in.
 *
 * ## `onError` is read once
 *
 * The handler is captured when the client is created, so changing it later does
 * not take effect. That is correct for the one caller: the logger is configured at
 * boot and does not change while a tab is open. Making it reactive would mean
 * rebuilding the cache whenever a callback identity changed, which is a far worse
 * failure than a logger that needs a reload.
 */

import { QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

import type { TenantId } from '@/core/types'

import { createQueryClient } from './client'
import type { CacheErrorHandler } from './client'

/* ── The tenant scope ─────────────────────────────────────────────────────── */

/**
 * The tenant every key in this subtree must be built with.
 *
 * A context rather than a prop drilled to each hook, because a hook that has to
 * be *told* the tenant is a hook that can be told the wrong one. The value comes
 * from `getTenantContext()` on the server (`02-architecture.md` §11: "Tenant
 * context is resolved, never received"), travels down through the app shell, and
 * is never read from a URL or from client state — so §16.2 rule 2 holds at the
 * only place it can be broken.
 */
const QueryTenantContext = createContext<TenantId | null>(null)

/**
 * The tenant this subtree is scoped to.
 *
 * Throws rather than returning `null` when there is no provider. A hook that fell
 * back to an empty tenant would build a key whose second element is a placeholder,
 * and two of those would share a cache entry across tenants — the exact leak the
 * key builder exists to prevent, arriving through the one door the key builder
 * cannot see.
 */
export function useQueryTenantId(): TenantId {
  const tenantId = useContext(QueryTenantContext)

  if (tenantId === null) {
    throw new Error(
      'useQueryTenantId was called outside QueryTenantProvider. Every query key needs a tenant ' +
        'id from the server-resolved context (05-conventions.md §16.2).',
    )
  }

  return tenantId
}

/* ── The provider ─────────────────────────────────────────────────────────── */

export interface QueryTenantProviderProps {
  /** The tenant resolved on the server for this request. Never a prop from the client. */
  readonly tenantId: TenantId

  /** The logger seam of `client.ts`. Wired by the app shell once `core/logger` exists. */
  readonly onError?: CacheErrorHandler

  readonly children: ReactNode
}

interface Scope {
  readonly tenantId: TenantId
  readonly client: ReturnType<typeof createQueryClient>
}

export function QueryTenantProvider({ tenantId, onError, children }: QueryTenantProviderProps) {
  const [scope, setScope] = useState<Scope>(() => ({
    tenantId,
    client: createQueryClient(onError === undefined ? {} : { onError }),
  }))

  // The render-phase reset described in the header. Not an effect: an effect runs
  // after the frame that would show the previous tenant's cache.
  if (scope.tenantId !== tenantId) {
    setScope({
      tenantId,
      client: createQueryClient(onError === undefined ? {} : { onError }),
    })
  }

  return (
    <QueryTenantContext.Provider value={scope.tenantId}>
      <QueryClientProvider client={scope.client}>{children}</QueryClientProvider>
    </QueryTenantContext.Provider>
  )
}
