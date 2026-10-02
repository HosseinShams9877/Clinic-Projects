/**
 * Optimistic updates with rollback, for `05-conventions.md` §16.4.
 *
 * An optimistic update is the most dangerous convenience in this client: it shows
 * a user a state the database has not agreed to. §16.4 therefore permits one only
 * when **all five** of its conditions hold, and this helper is those five
 * conditions in code, so that a call site cannot implement four of them and forget
 * the fifth.
 *
 * | §16.4 condition | Where it is met |
 * |---|---|
 * | 1. "a single, local, reversible write" | not enforceable here — it is a property of the write, and `optimisticUpdate` documents the refusal below |
 * | 2. "the server is the authority and the response replaces the optimistic value" | `onSettled` writes the server's answer over the guess |
 * | 3. "a rollback is implemented, not assumed" | `onError` restores the exact snapshot taken in `onMutate` |
 * | 4. "the user is told" | half here (`onError` is the hook the caller extends), half at the call site — see below |
 * | 5. "concurrency is handled" | `cancelQueries` before the optimistic write |
 *
 * ## Condition 4 is deliberately only half-satisfied
 *
 * §16.4: "A silent rollback leaves the screen showing one thing and the database
 * holding another. The failure surfaces as a Persian message (`07-localization.md`
 * §8), naming what did not happen." A message is a *catalog key* plus parameters,
 * and the catalog belongs to the module that owns the surface — `core` has no
 * catalog and may not have one. So this helper restores the data and hands the
 * error back to the caller's own `onError`, which is where the module's message is
 * built. The condition is enforced by the fact that a caller who supplies only
 * this helper's handlers and no message is missing something a reviewer will ask
 * for, and by the test in `tests/optimistic.test.ts` that asserts the error is
 * still the caller's to handle.
 *
 * ## What this helper refuses
 *
 * A write that is not a single local change. §16.4.1: "Moving an appointment in
 * the day grid qualifies. A campaign dispatch does not." Nothing in the signature
 * can tell those apart, so the refusal is a documented precondition: **do not call
 * this for a bulk action, a dispatch, or anything with an external side effect.**
 * A rollback restores a cache entry; it cannot unsend a message, and §4 of
 * `09-security.md` is why an unapproved send must not exist in the first place.
 *
 * ## The snapshot is `undefined` more often than an implementer expects
 *
 * If the cache holds nothing for the key — the user opened the surface and the
 * query has not resolved yet — there is no value to apply `apply()` to and no
 * value to restore. This helper does not invent a first value: it skips the
 * optimistic write and lets `onError` invalidate. Fabricating a list from a guess
 * would put invented rows on the screen, which is worse than a slow one.
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query'

/** What `onMutate` leaves for `onError` and `onSettled` to roll back with. */
export interface OptimisticResult<TData> {
  /** The cache's value before the optimistic write, or `undefined` if it held none. */
  readonly previous: TData | undefined
  /** The key the write went to. Derived once, so a rollback cannot target another. */
  readonly queryKey: QueryKey
}

export interface OptimisticUpdateConfig<TData, TVariables> {
  /**
   * The key the change lands on, derived from the mutation's variables.
   *
   * A function rather than a key, because the key usually contains the variables —
   * the day an appointment moved to, the customer a payment belongs to — and
   * freezing it at hook-construction time would send every update to the same
   * entry.
   */
  readonly key: (variables: TVariables) => QueryKey

  /**
   * The cache value as it will look if the server accepts the change.
   *
   * Pure: it receives the previous value and the variables and returns the new
   * value. It must not mutate `previous` — React Query compares by structure, and
   * an in-place edit would make the rollback restore the already-changed object,
   * so the screen would keep showing the guess after a failure and §16.4.3's
   * rollback would be silently absent.
   */
  readonly apply: (previous: TData, variables: TVariables) => TData
}

/** The three handlers to spread into `useMutation`. */
export interface OptimisticHandlers<TData, TVariables> {
  readonly onMutate: (
    variables: TVariables,
    context: { readonly client: QueryClient },
  ) => Promise<OptimisticResult<TData>>

  readonly onError: (
    error: Error,
    variables: TVariables,
    result: OptimisticResult<TData> | undefined,
    context: { readonly client: QueryClient },
  ) => Promise<void>

  readonly onSettled: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables,
    result: OptimisticResult<TData> | undefined,
    context: { readonly client: QueryClient },
  ) => Promise<void>
}

export function optimisticUpdate<TData, TVariables>(
  config: OptimisticUpdateConfig<TData, TVariables>,
): OptimisticHandlers<TData, TVariables> {
  return {
    /**
     * §16.4.5, then the write.
     *
     * `cancelQueries` comes first and is awaited. An in-flight refetch that
     * resolves after the optimistic write overwrites it with the server's *old*
     * value — the user's change appears to undo itself, and the next read is the
     * authoritative one only if nobody is racing it. Cancelling is what makes the
     * optimistic value the newest thing in the cache until the mutation settles.
     */
    async onMutate(variables, context) {
      const queryKey = config.key(variables)

      await context.client.cancelQueries({ queryKey })

      const previous = context.client.getQueryData<TData>(queryKey)

      if (previous !== undefined) {
        context.client.setQueryData(queryKey, config.apply(previous, variables))
      }

      return { previous, queryKey }
    },

    /**
     * §16.4.3: restore the exact snapshot, then invalidate.
     *
     * Restoration alone is not enough — another actor may have changed the rows
     * while the mutation was in flight, and the snapshot is a memory of a state
     * that is now old. The invalidation that follows makes the next read
     * authoritative rather than trusting the rollback to still be true.
     *
     * The error is deliberately not swallowed and no message is produced here;
     * see the header on condition 4. Returning normally lets the caller's own
     * `onError` — which `useMutation` runs as well — surface the Persian message.
     */
    async onError(_error, _variables, result, context) {
      if (result === undefined) return

      if (result.previous !== undefined) {
        context.client.setQueryData(result.queryKey, result.previous)
      }

      await context.client.invalidateQueries({ queryKey: result.queryKey })
    },

    /**
     * §16.4.2: on success, the server's answer replaces the guess.
     *
     * Not the optimistic value left in place. The server may have recorded a
     * different time, a different id, or a different price — a `priceAtBooking`
     * snapshot, a recomputed balance — and leaving the guess in the cache would
     * show the user the number they typed rather than the number that was stored.
     *
     * Nothing is invalidated on success: the response *is* the authoritative
     * value, and an invalidation would immediately refetch what was just received.
     */
    async onSettled(data, error, variables, result, context) {
      if (error !== null || data === undefined) return

      context.client.setQueryData<TData>(
        result === undefined ? config.key(variables) : result.queryKey,
        data,
      )
    },
  }
}
