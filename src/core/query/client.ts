/**
 * The React Query client of `05-conventions.md` §16.
 *
 * The client is created once per browser session, and its defaults are the part
 * of §16 that a per-query option cannot express: what happens when a request
 * fails, how long a cached row is trusted, and — the one that matters most —
 * that a cache never outlives a change of tenancy.
 *
 * ## The three defaults that are decisions rather than settings
 *
 * **A read retries, a write does not.** `retry: false` on mutations is not a
 * tuning choice. Every write in this application goes through a Server Action
 * (§16.1) and several of them are not idempotent: recording a payment, recording
 * a contact result, dispatching a campaign. A transport that silently re-sends
 * one produces a double charge or a duplicate message, and it does so exactly
 * when the network is flaky — the moment a retry is most likely and least
 * visible. A read that is sent twice is a wasted request; a write that is sent
 * twice is a defect in the ledger, which immutable rule 7 makes uncorrectable by
 * deletion.
 *
 * **A read retries, but never a refusal.** §16.5: "`retry` is bounded — a small
 * number of attempts with backoff — and never applied to a 4xx, which will not
 * succeed on retry." Our 4xx-shaped failures are `AppError`s: a `ValidationError`
 * is a bug in the form, an `AuthError` needs a new session, a `PermissionError`
 * needs a different user, and a `NotFoundError` is a 404 — §3.4 of
 * `04-roles-permissions.md` deliberately returns one for a doctor opening another
 * doctor's patient. Retrying any of those four hammers a server that has already
 * answered.
 *
 * **`staleTime` is not zero.** §16.3: "A blanket `staleTime: 0` refetches on
 * every focus and removes most of the benefit of having the cache." The default
 * below is a floor, not a policy: a surface the user is working in sets its own,
 * shorter one, and §16.3 requires that to be deliberate per query.
 *
 * ## Tenant awareness
 *
 * The brief for this layer says "tenant-aware defaults", and there is exactly one
 * way in which a *client* is tenant-aware: **its cache must not survive a change
 * of tenant.** The keys of §16.2 already prevent one tenant's entry from being
 * served as another's, so the leak this closes is a narrower and nastier one — a
 * visiting doctor with two memberships (`02-architecture.md` §2) switching
 * tenancy and leaving tenant A's patient rows sitting in memory, readable by
 * anything that walks the cache. `QueryTenantProvider` in `./provider` discards
 * the client on that transition; nothing in this file needs to know about it.
 */

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { isAppError } from '@/core/types'
import type { ErrorCode } from '@/core/types'

/* ── The numbers ──────────────────────────────────────────────────────────── */

/**
 * How long a cached read is trusted before a new observer triggers a refetch.
 *
 * Thirty seconds, and chosen to be *short*. It is the floor for surfaces that do
 * not set their own — a settings list, a service catalogue — where the cost of a
 * stale row is a user seeing a value that changed a moment ago. §16.3 makes the
 * default the least specific case, and the day grid the receptionist is working
 * in overrides it downward.
 */
export const QUERY_STALE_TIME_MS = 30_000

/**
 * How long an unobserved entry survives before it is collected.
 *
 * Five minutes, React Query's own default and long enough that stepping away
 * from a list and back does not refetch it, which is the behaviour §16.1
 * describes when it says the cache exists for the surfaces a user "filters,
 * sorts, steps through, or works down".
 */
export const QUERY_GC_TIME_MS = 5 * 60_000

/**
 * The most attempts a read makes after its first.
 *
 * Three attempts in total, with React Query's exponential backoff (1s, 2s, 4s,
 * capped at 30s). §16.5 asks for "a small number of attempts" and this is one:
 * enough to ride out a restart or a dropped connection, few enough that a server
 * which is genuinely down stops being asked.
 */
export const QUERY_MAX_ATTEMPTS = 3

/**
 * The failure codes a retry cannot fix.
 *
 * A `Record<ErrorCode, boolean>` rather than a `Set` so that adding a sixth
 * `ErrorCode` to `@/core/types` is a compile error here rather than a new code
 * that silently inherits retry behaviour nobody chose.
 */
const RETRYABLE_BY_CODE: Readonly<Record<ErrorCode, boolean>> = {
  VALIDATION: false,
  AUTH_REQUIRED: false,
  PERMISSION_DENIED: false,
  NOT_FOUND: false,
  DOMAIN: true,
}

/**
 * Whether a failed read should be attempted again.
 *
 * Exported because it is the only part of this file with a branch worth testing
 * directly, and because a query with a bespoke `retry` should compose this one
 * rather than reimplement it.
 *
 * An error that is not an `AppError` is retried: it is a transport failure or a
 * bug, and the alternative — treating every unknown error as permanent — turns a
 * blip into a dead screen. `DOMAIN` is retryable because it is the one code that
 * covers transient state (a lock, a conflict, a row another request is writing);
 * a `DomainError` that is genuinely terminal will fail the same way three times
 * and the user will see the message the mutation carries.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= QUERY_MAX_ATTEMPTS) return false
  if (isAppError(error)) return RETRYABLE_BY_CODE[error.code]
  return true
}

/* ── The client ───────────────────────────────────────────────────────────── */

/** A handler for an error that reached the cache. Wired to the logger by the app shell. */
export type CacheErrorHandler = (error: unknown, source: 'query' | 'mutation') => void

export interface CreateQueryClientOptions {
  /**
   * Called for every error that reaches the cache, before anything is rendered.
   *
   * §16.5: "Internal detail never reaches the UI. A query error's status, URL and
   * payload go to the logger with the correlation id." The logger itself is a
   * later piece of `core`; this is the seam it plugs into, so that the wiring
   * exists before the first surface that needs it rather than being retrofitted
   * onto twenty query definitions.
   */
  readonly onError?: CacheErrorHandler
}

/**
 * The application's `QueryClient`.
 *
 * A factory rather than a module-level singleton, because the singleton is what
 * makes a cache outlive a tenancy change. `QueryTenantProvider` calls this once
 * per tenant and drops the previous client; a module-level one would be shared by
 * every tenant the browser has ever seen in that tab.
 */
export function createQueryClient(options: CreateQueryClientOptions = {}): QueryClient {
  const { onError } = options

  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => onError?.(error, 'query'),
    }),
    mutationCache: new MutationCache({
      onError: (error) => onError?.(error, 'mutation'),
    }),
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_GC_TIME_MS,
        retry: shouldRetry,
        // A receptionist alt-tabbing back to the day grid should not be looking
        // at this morning's rows. §16.3 forbids polling *as a substitute for
        // invalidation*; refetching a list the user has returned to is not that.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // `online` rather than the default `online`: stated explicitly so that a
        // query paused offline resumes on reconnect rather than surfacing as a
        // failure the user cannot act on.
        networkMode: 'online',
      },
      mutations: {
        // See the header. Not a tuning value.
        retry: false,
        networkMode: 'online',
      },
    },
  })
}
