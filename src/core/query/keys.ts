/**
 * The query key builder of `05-conventions.md` §16.2.
 *
 * > Every key is built by a helper in `src/core/query/keys.ts`. **No hook writes
 * > a key array by hand**, and no key omits the tenant.
 *
 * This is the whole reason the file lives in `core` rather than in each module.
 * A key without `tenantId` serves tenant A's cached rows to tenant B **from
 * memory, with no query executed and no RLS predicate evaluated** — §16.2: "This
 * is a cross-tenant leak that the database cannot catch, because the database is
 * never asked." The database layer of `09-security.md` §4 cannot help here, so
 * the only defence is that the second element of every key is a `TenantId` and
 * that there is no way to build one without it.
 *
 * ## The five rules, and where each one is enforced
 *
 * | §16.2 rule | Enforced by |
 * |---|---|
 * | 1. `tenantId` second, after a literal `'t'` | `key()` — the only constructor |
 * | 2. `tenantId` comes from the resolved context | the parameter's type is `TenantId`, a brand only the server can mint |
 * | 3. Keys are hierarchical | every helper spreads its parent's key as its prefix |
 * | 4. Filters are part of the key, canonically | `canonicalFilters()` |
 * | 5. No personal data in a key — surrogate identifiers only | the parameter types: every filter is a branded id, an enum member or a date |
 *
 * Rule 2 deserves the note. A branded `TenantId` is not proof of provenance; a
 * component could still be handed one. What the brand buys is that the *shape*
 * of the mistake changes: `keys.appointments.day(someString, …)` is a compile
 * error rather than a silent cross-tenant cache hit, and the only thing that
 * produces a `TenantId` is `getTenantContext()` on the server, which is why no
 * exported helper here accepts a plain `string`.
 *
 * ## Rule 5, and why it does not constrain this file

 * §16.2 rule 5 prohibits **personal data** in a key — a name, a mobile number,
 * free text — because a key is observable in devtools and in error reports. It
 * does not prohibit a surrogate identifier, and it cannot: §16.3's invalidation
 * table names "**the customer's payment key**", and `payments` cannot be scoped to
 * a customer by anything other than the customer's `cuid()`, which carries nothing
 * about the person it identifies. The two sentences used to read as though they
 * disagreed; `05-conventions.md` now states which of the two it meant, and this
 * file implements the reading.
 *
 * What remains a convention rather than a check is the shape of a filter value:
 * an id, an enum member or a date. A *label* is never a filter. A `string` is a
 * name and an id at runtime, so no runtime check can separate them
 * (`normalize.ts` can tell that a value *contains* Persian letters; it cannot
 * tell whether that makes it a label or a slug), and a surface that needs to
 * filter by a label filters server-side and keys by the resolved id.
 *
 * ## What is deliberately not here
 *
 * - **The hooks that use these keys.** `05-conventions.md` §16.1: React Query
 *   "fetches" and "writes go through Server Actions", so a surface's hook is a
 *   thin wrapper around a module's own read and write functions. Those functions
 *   belong to the module that owns the data, and a hook defined here would either
 *   import a module (forbidden — core stays below modules) or fetch nothing
 *   (a placeholder).
 * - **`staleTime` per surface.** §16.3 requires it "deliberately per query, not
 *   globally", so it is a property of each query's options, not of its key.
 */

import { Module } from '@/core/constants'
import type { CustomerId, TenantId, UserId } from '@/core/types'

/* ── The tenant scope ─────────────────────────────────────────────────────── */

/**
 * The literal that opens every key.
 *
 * A marker rather than the tenant id alone, because React Query matches by array
 * prefix and a key that began with a raw id would make `invalidateQueries({
 * queryKey: [tenantId] })` — a call with no `'t'` in it — silently mean
 * "everything for this tenant" instead of matching nothing.
 */
export const TENANT_MARKER = 't'

/** The two-element head every key in the application begins with. */
export function tenantScope(tenantId: TenantId): readonly [typeof TENANT_MARKER, TenantId] {
  return [TENANT_MARKER, tenantId]
}

/**
 * A key: the tenant scope, then the segments that narrow it.
 *
 * Not exported. Every key in the application is built by one of the helpers
 * below, which is what makes "no hook writes a key array by hand" checkable by
 * reading this file rather than by searching the codebase.
 */
function key(tenantId: TenantId, ...segments: readonly unknown[]): readonly unknown[] {
  return [TENANT_MARKER, tenantId, ...segments]
}

/* ── Canonical filters ────────────────────────────────────────────────────── */

/** A single filter value. A label is not one — see rule 5 above. */
export type FilterPrimitive = string | number | boolean

/** What a filter may hold: a primitive, an ordered list of primitives, or nothing. */
export type FilterValue = FilterPrimitive | null | undefined | readonly FilterPrimitive[]

/** A named set of filters. The order of the keys is irrelevant; the order of a list is not. */
export type QueryFilters = Readonly<Record<string, FilterValue>>

/**
 * The filter set as one stable string.
 *
 * §16.2 rule 4: "An object literal built inline at every render changes identity
 * and defeats the cache; the helper takes the filter object and serialises it
 * deterministically." Two calls with the same filters in a different key order
 * must produce the same string, or every render is a cache miss — which is the
 * bug the rule exists to prevent, and it is invisible because a cache miss looks
 * exactly like a slow query.
 *
 * Three decisions worth stating:
 *
 * - **Keys are sorted; list members are not.** A filter object is unordered, so
 *   sorting it loses nothing. A list is ordered by the caller, and if that order
 *   is meaningful to the query, sorting it here would make two genuinely
 *   different queries share one cache entry — a wrong answer, cached, rather than
 *   a slow one.
 * - **`null` and `undefined` are omitted, not rendered.** "No filter" and "filter
 *   absent" are the same query, and `{ bucket: undefined }` must not be a
 *   different key from `{}` — an early render before a filter is chosen would
 *   otherwise populate a second entry for the same rows.
 * - **Every part is percent-encoded.** The delimiters `&`, `=`, `[`, `]` and `,`
 *   are structural, so a *value* holding one would forge a second filter and two
 *   different filter sets would collide: `{ a: '1&b=2' }` and `{ a: '1', b: '2' }`
 *   are the same query under naive concatenation and are not the same query. That
 *   collision is not hypothetical — it is the one this function's first version
 *   had, and it is why the encoding is here rather than assumed unnecessary
 *   because "a filter is always an id". The delimiters stay literal, so a key is
 *   still readable in devtools.
 *
 * It throws on a value that is neither a primitive nor a list of primitives,
 * because a nested object here means a caller passed a row where a filter was
 * expected. TypeScript rejects that at a call site; the check catches the caller
 * who arrived through `any`.
 */
export function canonicalFilters(filters: QueryFilters): string {
  const parts: readonly string[] = Object.keys(filters)
    .sort()
    .flatMap((name) => {
      const value = filters[name]

      if (value === undefined || value === null) return []

      const label = encodeURIComponent(name)

      if (Array.isArray(value)) {
        for (const member of value) {
          if (typeof member === 'object') {
            throw new TypeError(`The filter "${name}" holds a list with a non-primitive member`)
          }
        }
        return [`${label}=[${value.map((member) => encodeURIComponent(String(member))).join(',')}]`]
      }

      if (typeof value === 'object') {
        throw new TypeError(`The filter "${name}" is an object, not a primitive or a list`)
      }

      return [`${label}=${encodeURIComponent(String(value))}`]
    })

  return parts.join('&')
}

/* ── The key table ────────────────────────────────────────────────────────── */

/**
 * Every key in the application, grouped by the module that owns the data
 * (`02-architecture.md` §7's closed twenty).
 *
 * Each group begins with `all`, which is the group's **prefix**: §16.3 asks for
 * invalidation "by prefix, as narrowly as correctness allows", and
 * `invalidateQueries({ queryKey: keys.appointments.all(tenantId) })` is that
 * prefix for exactly one module of one tenant. Every other helper in the group
 * spreads `all()` first, so a key cannot be narrower than its own group.
 *
 * The namespaces are the `Module` constants rather than string literals, so a
 * key can never name a module the closed list of §7 does not contain — a typo
 * would be a compile error instead of a cache entry nobody ever invalidates.
 *
 * Only the surfaces that §8.1 of `01-tech-stack.md` names as React Query
 * surfaces appear here (the appointment day grid, the cycle contact list, the
 * debt list, the campaign builder preview, the notification feed), plus the
 * payment and service keys §16.3's invalidation table refers to. A key helper
 * for a surface that does not exist yet would be a guess about its filters.
 */
export const queryKeys = {
  appointments: {
    all: (tenantId: TenantId) => key(tenantId, Module.Appointments),

    /**
     * One doctor's day. The surgery's most-read surface, and the one whose
     * `staleTime` §16.3 keeps shortest.
     */
    day: (tenantId: TenantId, doctorId: UserId, localDate: string) =>
      key(tenantId, Module.Appointments, 'day', doctorId, localDate),

    detail: (tenantId: TenantId, appointmentId: string) =>
      key(tenantId, Module.Appointments, 'detail', appointmentId),
  },

  cycles: {
    all: (tenantId: TenantId) => key(tenantId, Module.Cycles),

    /** The contact list the clinic works down (§16.1). */
    contactList: (tenantId: TenantId, filters: QueryFilters) =>
      key(tenantId, Module.Cycles, 'contact-list', canonicalFilters(filters)),

    detail: (tenantId: TenantId, cycleId: string) =>
      key(tenantId, Module.Cycles, 'detail', cycleId),
  },

  debts: {
    all: (tenantId: TenantId) => key(tenantId, Module.Debts),

    /** The debt list, filtered by bucket (§16.1). */
    list: (tenantId: TenantId, filters: QueryFilters) =>
      key(tenantId, Module.Debts, 'list', canonicalFilters(filters)),
  },

  payments: {
    all: (tenantId: TenantId) => key(tenantId, Module.Payments),

    /**
     * A customer's payments — §16.3's "the customer's payment key", invalidated
     * by a recorded payment along with the debt list. See the header on rule 5.
     */
    forCustomer: (tenantId: TenantId, customerId: CustomerId) =>
      key(tenantId, Module.Payments, 'customer', customerId),
  },

  campaigns: {
    all: (tenantId: TenantId) => key(tenantId, Module.Campaigns),

    /**
     * The builder's preview count. §16.3: editing a campaign filter invalidates
     * "only the preview count key — nothing else", which is why it is a key of
     * its own rather than a field on the campaign.
     */
    preview: (tenantId: TenantId, filters: QueryFilters) =>
      key(tenantId, Module.Campaigns, 'preview', canonicalFilters(filters)),

    detail: (tenantId: TenantId, campaignId: string) =>
      key(tenantId, Module.Campaigns, 'detail', campaignId),
  },

  notifications: {
    all: (tenantId: TenantId) => key(tenantId, Module.Notifications),

    /** The one polled surface (§16.3: it has no mutation to key off). */
    feed: (tenantId: TenantId, filters: QueryFilters) =>
      key(tenantId, Module.Notifications, 'feed', canonicalFilters(filters)),
  },

  services: {
    all: (tenantId: TenantId) => key(tenantId, Module.Services),

    detail: (tenantId: TenantId, serviceId: string) =>
      key(tenantId, Module.Services, 'detail', serviceId),
  },
} as const
