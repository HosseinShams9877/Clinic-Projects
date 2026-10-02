/**
 * The query layer of `docs/knowledge/05-conventions.md` §16.
 *
 * `02-architecture.md` §10 rule 2: "Every module exports a **barrel** `index.ts`
 * that is its complete public surface. If something is not in the barrel, it is
 * private." `core` is not one of the twenty modules, and the same rule applies
 * inside it — a consumer imports `@/core/query`, never `@/core/query/keys`.
 *
 * The barrel is also the seam the eslint boundary rules watch. `query/keys.ts` is
 * the only file in the application that may build a key array, and it is reachable
 * only through here, so "no hook writes a key array by hand" is a claim about one
 * module's public surface rather than about twenty modules' discipline.
 */

export type { FilterPrimitive, FilterValue, QueryFilters } from './keys'
export { TENANT_MARKER, canonicalFilters, queryKeys, tenantScope } from './keys'

export type { CacheErrorHandler, CreateQueryClientOptions } from './client'
export {
  QUERY_GC_TIME_MS,
  QUERY_MAX_ATTEMPTS,
  QUERY_STALE_TIME_MS,
  createQueryClient,
  shouldRetry,
} from './client'

export type { QueryTenantProviderProps } from './provider'
export { QueryTenantProvider, useQueryTenantId } from './provider'

export {
  appointmentChanged,
  campaignFilterEdited,
  contactResultRecorded,
  invalidate,
  paymentRecorded,
  servicePriceChanged,
} from './invalidate'

export type { OptimisticHandlers, OptimisticResult, OptimisticUpdateConfig } from './optimistic'
export { optimisticUpdate } from './optimistic'
