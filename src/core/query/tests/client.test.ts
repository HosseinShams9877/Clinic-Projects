/**
 * `src/core/query/client.ts` — the client's defaults.
 *
 * Two of these assertions are the file's reason for existing and would be easy to
 * lose in a refactor without noticing:
 *
 * 1. **A mutation never retries.** Every write goes through a Server Action
 *    (`05-conventions.md` §16.1) and recording a payment is not idempotent. A
 *    silent re-send is a second row in the ledger, and immutable rule 7 makes the
 *    mistake uncorrectable by deletion. `retry: false` on mutations is therefore
 *    asserted directly rather than left to the default.
 * 2. **A refusal is never retried.** §16.5: "`retry` is bounded … and never
 *    applied to a 4xx, which will not succeed on retry." The four `AppError` codes
 *    that represent a settled answer are asserted one at a time, and the record in
 *    `client.ts` is typed `Record<ErrorCode, boolean>` so a sixth code cannot be
 *    added without deciding.
 */

import { describe, expect, it } from 'vitest'

import {
  AuthError,
  DomainError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from '@/core/types'

import {
  QUERY_GC_TIME_MS,
  QUERY_MAX_ATTEMPTS,
  QUERY_STALE_TIME_MS,
  createQueryClient,
  shouldRetry,
} from '../client'

/* An `AppError` of each kind, built the way the codebase builds them. */
const VALIDATION = new ValidationError('bad input', { messageKey: 'error.validation' })
const AUTH = new AuthError('no session', { messageKey: 'error.authRequired' })
const PERMISSION = new PermissionError('denied', { messageKey: 'error.permissionDenied' })
const NOT_FOUND = new NotFoundError('absent', { messageKey: 'error.notFound' })
const DOMAIN = new DomainError('rule violated', { messageKey: 'error.domain' })

describe('shouldRetry', () => {
  it('gives up at the documented attempt count', () => {
    expect(shouldRetry(0, new Error('transport'))).toBe(true)
    expect(shouldRetry(QUERY_MAX_ATTEMPTS - 1, new Error('transport'))).toBe(true)
    expect(shouldRetry(QUERY_MAX_ATTEMPTS, new Error('transport'))).toBe(false)
    expect(shouldRetry(99, new Error('transport'))).toBe(false)
  })

  it.each([
    ['VALIDATION', VALIDATION],
    ['AUTH_REQUIRED', AUTH],
    ['PERMISSION_DENIED', PERMISSION],
    ['NOT_FOUND', NOT_FOUND],
  ])('never retries a %s', (_code, error) => {
    // A settled answer. Retrying it hammers a server that has already replied,
    // and a 404 is deliberate: 04-roles-permissions.md §3.4 returns one for a
    // doctor opening another doctor's patient, precisely so it is not a 403.
    expect(shouldRetry(0, error)).toBe(false)
  })

  it('retries a domain refusal, which may be transient', () => {
    expect(shouldRetry(0, DOMAIN)).toBe(true)
  })

  it('retries an error that is not an AppError at all', () => {
    // A transport failure or a bug. Treating every unknown error as permanent
    // turns a blip into a dead screen.
    expect(shouldRetry(0, new TypeError('fetch failed'))).toBe(true)
    expect(shouldRetry(0, 'a string was thrown')).toBe(true)
    expect(shouldRetry(0, undefined)).toBe(true)
  })
})

describe('createQueryClient', () => {
  it('applies the documented read defaults', () => {
    const queries = createQueryClient().getDefaultOptions().queries

    expect(queries?.staleTime).toBe(QUERY_STALE_TIME_MS)
    expect(queries?.gcTime).toBe(QUERY_GC_TIME_MS)
    expect(queries?.networkMode).toBe('online')
  })

  it('does not use a zero staleTime', () => {
    // §16.3: "A blanket staleTime: 0 refetches on every focus and removes most of
    // the benefit of having the cache."
    expect(QUERY_STALE_TIME_MS).toBeGreaterThan(0)
  })

  it('never retries a mutation', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false)
  })

  it('routes a query error to the handler it was given', () => {
    const seen: string[] = []
    const client = createQueryClient({ onError: (_error, source) => seen.push(source) })

    // The cache's own hook, which is what React Query calls when a query fails.
    // The second argument is a `Query`, which this test does not need.
    client.getQueryCache().config.onError?.(new Error('boom'), undefined as never)

    expect(seen).toEqual(['query'])
  })

  it('routes a mutation error to the handler it was given', () => {
    const seen: string[] = []
    const client = createQueryClient({ onError: (_error, source) => seen.push(source) })

    client
      .getMutationCache()
      .config.onError?.(
        new Error('boom'),
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
      )

    expect(seen).toEqual(['mutation'])
  })

  it('is usable with no handler at all', () => {
    // The app shell wires the logger later; until then an error must reach
    // nothing rather than throwing inside React Query's own notification path.
    const client = createQueryClient()

    expect(() =>
      client.getQueryCache().config.onError?.(new Error('boom'), undefined as never),
    ).not.toThrow()
  })

  it('builds a separate cache every time', () => {
    // The provider relies on this: a new client is how the previous tenant's rows
    // stop being reachable (see provider.tsx).
    expect(createQueryClient()).not.toBe(createQueryClient())
  })
})
