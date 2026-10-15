/**
 * The one place a storage key is built, and the one place it is parsed.
 *
 * ## The shape
 *
 * ```
 * {tenantSlug}/{clinicSegment}/{kind}/{ownerId}/{filename}
 * ```
 *
 * `tenantSlug` rather than `tenantId` because a path a human reads in a blob
 * browser should name the clinic, and `slug` is the tenant's stable external
 * name (`Tenant.slug`). `clinicSegment` is the clinic's id, or the literal
 * `_tenant` for a membership with no clinic — the `null` of
 * `TenantContext.clinicId` is *unscoped across the tenant's branches*, not
 * "no clinic", and a path must not read as the latter.
 *
 * ## Why the key is parsed back
 *
 * `keyOf` is the only builder; `parseKey` is the only reader. A `delete` and a
 * `resolve` both go through `parseKey`, so a key the module did not build is a
 * key it will not act on — the alternative is a delete that a caller can aim.
 */

import type { StorageKind } from '../types'

/** The literal segment a `null` clinic becomes. Not a valid cuid, so it cannot collide. */
export const TENANT_WIDE_CLINIC_SEGMENT = '_tenant'

const KINDS: readonly StorageKind[] = [
  'before-after',
  'service',
  'staff',
  'customer',
  'clinic',
  'campaign',
]

export interface StorageKeyParts {
  readonly tenantSlug: string
  readonly clinicSegment: string
  readonly kind: StorageKind
  readonly ownerId: string
  readonly filename: string
}

/** The characters a path segment may contain. Anything else is replaced. */
const UNSAFE = /[^a-zA-Z0-9._-]+/g

function safeSegment(value: string): string {
  return value.replace(UNSAFE, '-').replace(/^-+|-+$/g, '') || 'unnamed'
}

/**
 * A filename that is stable, unique within its owner, and safe as a path
 * segment. The extension is preserved because the content type and the file
 * extension must agree for a browser to render the file inline rather than
 * download it.
 *
 * The clock is a parameter and not a default: `05-conventions.md` §8 forbids
 * reading the ambient clock inside a function, because a test that pins a date
 * cannot pin one the function reads for itself. The caller passes `realClock()`
 * in production and a fixed `Date` in a test.
 */
export function filenameFor(original: string, at: Date): string {
  const dot = original.lastIndexOf('.')
  const extension = dot === -1 ? '' : safeSegment(original.slice(dot + 1).toLowerCase())
  const stamp = at.getTime().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return extension === '' ? `${stamp}-${random}` : `${stamp}-${random}.${extension}`
}

/** Builds the key from its parts. The only builder. */
export function keyOf(parts: StorageKeyParts): string {
  return [
    safeSegment(parts.tenantSlug),
    parts.clinicSegment === TENANT_WIDE_CLINIC_SEGMENT
      ? TENANT_WIDE_CLINIC_SEGMENT
      : safeSegment(parts.clinicSegment),
    parts.kind,
    safeSegment(parts.ownerId),
    safeSegment(parts.filename),
  ].join('/')
}

/**
 * Parses a key the module built, or returns `null`.
 *
 * `null` rather than a throw, because the two callers — a delete and a resolve —
 * both treat "this key is not ours" as "there is nothing to do", and an
 * exception would make an expected case look like a failure.
 */
export function parseKey(key: string): StorageKeyParts | null {
  const segments = key.split('/')
  if (segments.length !== 5) return null
  const tenantSlug = segments[0] ?? ''
  const clinicSegment = segments[1] ?? ''
  const kind = segments[2] ?? ''
  const ownerId = segments[3] ?? ''
  const filename = segments[4] ?? ''
  if (!KINDS.includes(kind as StorageKind)) return null
  if (tenantSlug === '' || clinicSegment === '' || ownerId === '' || filename === '') return null
  return {
    tenantSlug,
    clinicSegment,
    kind: kind as StorageKind,
    ownerId,
    filename,
  }
}

/** The public-folder URL a key resolves to. */
export function publicUrlOf(key: string): string {
  return `/uploads/${key}`
}

/** The absolute path within the repository a key resolves to. */
export function publicPathOf(key: string): string {
  return `${process.cwd()}/public/uploads/${key}`
}