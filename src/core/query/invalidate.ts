/**
 * Cache invalidation for `05-conventions.md` §16.3.
 *
 * > **Invalidation is declared by the mutation that changes the data**, not by a
 * > timer and not by a manual refetch in a component.
 *
 * §16.3's table has five rows, and each row is a rule about *which* keys a change
 * touches. Some of those rules are narrower than a module and some of them are
 * the interesting negative case, so they live here as functions rather than as an
 * `invalidateQueries` call at each of the twenty call sites that will eventually
 * need one. A mutation says what happened — `paymentRecorded(...)` — and this file
 * says what that means for the cache. The alternative is that the meaning is
 * re-decided, slightly differently, by whoever writes the next payment path.
 *
 * §16.3's own rules, and where each is respected below:
 *
 * - "**Invalidate by prefix, as narrowly as correctness allows.** Invalidating
 *   `['t', tenantId]` is correct and wasteful; it is the fallback, not the
 *   default." No function here returns the tenant root.
 * - "**Cross-module invalidation is expressed in keys, not by importing another
 *   module's hook.** A `payments` mutation invalidates a `debts` key through the
 *   shared key helper in `core`, which is legal because `core` is domain-free."
 *   That is exactly what `paymentRecorded` does, and it is why this file can be in
 *   `core` at all.
 * - "**No polling as a substitute for invalidation.**" Nothing here polls.
 *
 * ## The pure part and the applied part
 *
 * Each `…Changed` function is pure: it takes what changed and returns the keys, so
 * the decision is testable by assertion rather than by watching a fetch counter.
 * `invalidate()` is the only thing that touches a client. Splitting them is what
 * makes the negative half of these rules testable — that editing a campaign filter
 * invalidates *only* the preview key is a claim about a returned list, and a test
 * can state it in one line.
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query'

import type { CustomerId, TenantId, UserId } from '@/core/types'

import { queryKeys } from './keys'
import type { QueryFilters } from './keys'

/**
 * A reschedule or a cancellation.
 *
 * §16.3: "that doctor's affected days, and the appointment's own key". The days
 * are an argument rather than a range, because a move touches two — the day it
 * left and the day it arrived — and a helper that guessed a range from the
 * appointment's new date would leave the old day showing an appointment that is
 * no longer there. The caller is the one that knows both.
 */
export function appointmentChanged(
  tenantId: TenantId,
  change: {
    readonly doctorId: UserId
    readonly days: readonly string[]
    readonly appointmentId: string
  },
): readonly QueryKey[] {
  const days = change.days.map((localDate) =>
    queryKeys.appointments.day(tenantId, change.doctorId, localDate),
  )

  return [...days, queryKeys.appointments.detail(tenantId, change.appointmentId)]
}

/**
 * A recorded payment.
 *
 * §16.3: "the debt list, the customer's payment key, the affected buckets". The
 * bucket lists are keyed by their filters (`debts.list`) rather than individually,
 * so `debts.all` invalidates every bucket view of this tenant in one prefix —
 * which the section allows: invalidating broadly is "correct and wasteful", and
 * the wasteful case is the one to take when the alternative is a stale debt figure.
 * Immutable rule 8 makes that the right trade: a balance is computed from the
 * ledger, so the only way to show the wrong one is to show a cached one.
 */
export function paymentRecorded(tenantId: TenantId, customerId: CustomerId): readonly QueryKey[] {
  return [queryKeys.debts.all(tenantId), queryKeys.payments.forCustomer(tenantId, customerId)]
}

/** A recorded contact result. §16.3: "the cycle contact list, and that cycle". */
export function contactResultRecorded(tenantId: TenantId, cycleId: string): readonly QueryKey[] {
  // `cycles.all` is the contact list's prefix — the list is keyed by its filters
  // beneath it — so one prefix covers every filter combination the user has open.
  return [queryKeys.cycles.all(tenantId), queryKeys.cycles.detail(tenantId, cycleId)]
}

/**
 * An edited campaign filter.
 *
 * §16.3: "**only the preview count key — nothing else**". This is the one row of
 * the table stated as a prohibition, and it is the one a careless implementation
 * gets wrong by invalidating the campaign as well. Editing a filter has not
 * changed the campaign; re-fetching it would throw away the draft the user is
 * editing.
 */
export function campaignFilterEdited(
  tenantId: TenantId,
  filters: QueryFilters,
): readonly QueryKey[] {
  return [queryKeys.campaigns.preview(tenantId, filters)]
}

/**
 * A changed service price.
 *
 * §16.3: "the service key and the `priceAtBooking`-dependent views, **never a
 * historical payment**".
 *
 * The second half is the point of the row. `Appointment.priceAtBooking` is a
 * snapshot (`03-data-model.md` §2.2 — "a later price change must not alter what a
 * customer was quoted"), so a price change must reach the surfaces that display a
 * *current* price and must not reach the ledger. `payments` and `debts` keys are
 * therefore deliberately absent, and a test asserts their absence — this is the
 * kind of rule that survives only if something fails when it is broken.
 *
 * `appointments.all` is included because that is where `priceAtBooking` is read;
 * it is broader than the affected rows and narrower than the tenant.
 */
export function servicePriceChanged(tenantId: TenantId, serviceId: string): readonly QueryKey[] {
  return [
    queryKeys.services.all(tenantId),
    queryKeys.services.detail(tenantId, serviceId),
    queryKeys.appointments.all(tenantId),
  ]
}

/* ── Applying ─────────────────────────────────────────────────────────────── */

/**
 * Mark every key in the list stale and refetch the ones that are observed.
 *
 * `Promise.all` rather than a loop with `await`: the invalidations are independent,
 * and awaiting them in sequence makes a mutation's settle time the sum of its
 * refetches rather than the longest one. React Query deduplicates the actual
 * requests, so the only thing the sequencing would buy is latency.
 */
export async function invalidate(
  client: QueryClient,
  keys: readonly QueryKey[],
): Promise<void> {
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })))
}
