/**
 * Reading a membership's stored permission overrides.
 *
 * `03-data-model.md` §5 makes every JSON-shaped column a `String` holding JSON,
 * parsed through a Zod schema on read, because JSONB is not portable between
 * SQLite and PostgreSQL. The membership's `overrides` column is one of those, and
 * this is where it is parsed.
 *
 * ## The two ways a stored override set can be wrong, and why they are treated
 * ## differently
 *
 * **An unknown permission slug.** A permission can be renamed or removed between
 * releases, and a stored row keeps the slug it was written with. That is expected
 * drift, not corruption, so the slug is *dropped* — and returned to the caller,
 * because a slug that no longer resolves is something an operator should be able
 * to see. Dropping is safe in both directions: a dropped `granted` entry
 * withholds access, and a dropped `revoked` entry can only refer to a permission
 * that no longer exists, so there is nothing left for it to withhold.
 *
 * **A malformed row.** The column does not hold the expected shape at all —
 * `granted` is a string, or the JSON is unparseable. This is a defect in whatever
 * wrote the row, and the response is to **throw** rather than to fall back to an
 * empty set. The fallback is not fail-closed: an empty set discards `revoked`
 * along with `granted`, so a malformed row would silently *grant* every
 * permission the role default carries that someone had deliberately removed. A
 * loud failure that stops the request is the only reading of a malformed
 * authorisation row that cannot widen access, and `09-security.md` §4.3 states
 * the same preference for the tenant context: "A silent empty result would look
 * like 'no data' and be debugged as a data problem; a loud failure is diagnosed in
 * seconds."
 */

import { z } from 'zod'

import { Permission, isMember } from '@/core/constants'
import { DomainError } from '@/core/types'

import type { PermissionOverrides } from '../types'

/**
 * The shape of the stored column: two arrays of strings, and nothing else.
 *
 * Deliberately `z.string()` and not a union of the sixteen slugs. Validating the
 * *member* here would make one renamed slug reject the entire row, which collapses
 * the two failure modes above into the harsher one — the exact mistake this file
 * exists to avoid.
 */
const storedOverridesSchema = z.object({
  granted: z.array(z.string()),
  revoked: z.array(z.string()),
})

/**
 * The overrides of a membership with none.
 *
 * Frozen and shared, because the overwhelmingly common case is a membership with
 * no overrides at all — `04-roles-permissions.md` §2.2's own first example is
 * «مریم صالحی — ۱۲ از ۱۶ — none» — and a fresh object per request would be
 * garbage for no gain. Frozen so that the sharing is safe.
 */
export const EMPTY_PERMISSION_OVERRIDES: PermissionOverrides = Object.freeze({
  granted: Object.freeze([]) as readonly Permission[],
  revoked: Object.freeze([]) as readonly Permission[],
})

/** A parsed override set, and the slugs in the row that are no longer permissions. */
export interface ParsedPermissionOverrides {
  readonly overrides: PermissionOverrides

  /**
   * Slugs that were stored and are not permissions any more.
   *
   * Returned rather than logged here, because this layer has no logger and no
   * tenant to log against — `05-conventions.md` §11 wants a structured line with a
   * `tenantId`, which the caller has and this function does not.
   */
  readonly unknown: readonly string[]
}

/** Keeps the recognised slugs, in stored order, and collects the rest. */
function partition(stored: readonly string[]): {
  readonly recognised: Permission[]
  readonly unknown: string[]
} {
  const recognised: Permission[] = []
  const unknown: string[] = []
  for (const slug of stored) {
    if (isMember(Permission, slug)) {
      recognised.push(slug)
    } else {
      unknown.push(slug)
    }
  }
  return { recognised, unknown }
}

/** The error both malformed-row branches raise. */
function malformed(cause?: unknown): DomainError {
  return new DomainError('A membership’s overrides column is not readable', {
    messageKey: 'error.malformedPermissionOverrides',
    ...(cause === undefined ? {} : { cause }),
  })
}

/**
 * A stored override column as a `PermissionOverrides`.
 *
 * `null` and `undefined` are the ordinary "no overrides" cases — the column is
 * nullable and a membership that has never been edited has never been written —
 * and they resolve to the shared empty set rather than to a parse error. The same
 * is true of an empty string, which is what a `String` column defaults to when a
 * row is created without one.
 *
 * @throws DomainError when the row is present and not the expected shape. It is a
 * `DomainError` and not a `ValidationError` because the caller cannot correct it:
 * the row is written by the product, and a valid caller is holding a broken one.
 */
export function parsePermissionOverrides(raw: unknown): ParsedPermissionOverrides {
  if (raw === null || raw === undefined || raw === '') {
    return { overrides: EMPTY_PERMISSION_OVERRIDES, unknown: [] }
  }

  // The column holds a JSON string on both engines. An already-parsed object is
  // accepted too, so that a caller which has read the column itself does not have
  // to re-serialise it to use this function.
  let candidate: unknown = raw
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw)
    } catch (cause) {
      throw malformed(cause)
    }
  }

  const parsed = storedOverridesSchema.safeParse(candidate)
  if (!parsed.success) {
    throw malformed()
  }

  const granted = partition(parsed.data.granted)
  const revoked = partition(parsed.data.revoked)

  return {
    overrides: { granted: granted.recognised, revoked: revoked.recognised },
    unknown: [...granted.unknown, ...revoked.unknown],
  }
}
