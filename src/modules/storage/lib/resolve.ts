/**
 * The read path: which URL a stored file should render from, today.
 *
 * A `BeforeAfterImage.path` written last year may name a blob URL, and the blob
 * store may be unreachable today while the public folder's copy is not — or the
 * reverse. The row records what it recorded; this function decides what the
 * browser is told.
 *
 * The rule is a single comparison and no network call: a blob URL is rendered
 * from the blob URL, and a `/uploads/...` path is rendered from the public
 * folder. A reader that probed the blob store on every render would put a
 * network round-trip on the hot path of every gallery page for a fallback that
 * is already recorded in the row.
 *
 * ## What "already recorded in the row" means for the caller
 *
 * The row must carry the backend. `BeforeAfterImage.path` is a string, so the
 * distinction is in the string's shape, and `classifyStoredUrl` is what reads
 * it. A row written before this module existed names a bare path; it is treated
 * as public, which is where those rows' files were written.
 */

import type { StorageBackend } from '../types'

/** The URL a browser should load for a stored value. */
export function resolveStoredUrl(stored: string): string {
  return stored
}

/** Which backend a stored value names, from the value's shape alone. */
export function classifyStoredUrl(stored: string): StorageBackend {
  if (stored.startsWith('http://') || stored.startsWith('https://')) return 'vercel-blob'
  return 'public'
}

/**
 * The public fallback URL for a value that is currently a blob URL, when the
 * blob is unreachable and the file was written to both.
 *
 * Present because the two-backend strategy the module recommends for a
 * self-hosted installation writes both copies, and this is how a reader that
 * knows the blob failed reaches the copy that did not.
 */
export function publicFallbackOf(stored: string, key: string | null): string | null {
  if (key === null) return null
  if (classifyStoredUrl(stored) !== 'vercel-blob') return null
  return `/uploads/${key}`
}