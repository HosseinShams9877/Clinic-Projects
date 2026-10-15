/**
 * The storage module's public types.
 *
 * The module stores a file in two places — Vercel Blob and the public folder —
 * and records which one succeeded. The record is per-file, because the fallback
 * is per-file: a file uploaded while the blob store was unreachable lives only
 * in `public`, and a later reader must know that without retrying the blob.
 *
 * Every path carries the tenant and the clinic, because the public folder is
 * shared by every tenant the installation serves and a path without them would
 * be a file one clinic could overwrite for another.
 */

import type { ClinicId, TenantId, UserId } from '@/core/types'

/** Where a stored file physically lives. */
export type StorageBackend = 'vercel-blob' | 'public'

/**
 * What kind of file is being stored — the segment of the path that follows the
 * tenant and clinic. A closed list, because an open one would let a caller
 * decide the path, and a caller-decided path is a caller-decided directory.
 */
export type StorageKind =
  | 'before-after'
  | 'service'
  | 'staff'
  | 'customer'
  | 'clinic'
  | 'campaign'

/** A file that has been stored, and where. */
export interface StoredFile {
  /** The path the row records: a blob URL, or `/uploads/...` on the public folder. */
  readonly url: string
  /** Which backend answered, so a later read knows where to look first. */
  readonly backend: StorageBackend
  /** The path within the bucket, or within `public/` — stable across backends. */
  readonly key: string
  /** The bytes' size, for the caller's own limit checks. */
  readonly size: number
  /** The content type as stored. */
  readonly contentType: string
}

/** The scope a file belongs to. Never read from a request — `02-architecture.md` §11. */
export interface StorageScope {
  readonly tenantId: TenantId
  readonly clinicId: ClinicId | null
  /** The staff user who uploaded, for the audit log's `actorUserId`. */
  readonly userId: UserId
}

/** The bytes and their identity, as the upload path receives them. */
export interface UploadInput {
  readonly scope: StorageScope
  readonly kind: StorageKind
  /** The owning entity's id — a customer, a service, a user. */
  readonly ownerId: string
  /** The original filename, used for the extension only. */
  readonly filename: string
  readonly contentType: string
  readonly bytes: Uint8Array
}

/** What the module refuses before it writes anything. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** The image types the module accepts. SVG is deliberately absent. */
export const ALLOWED_IMAGE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]