/**
 * The upload path: write to both backends when the platform allows it.
 *
 * ## The two environments, and why they differ
 *
 * On **Vercel**, the public folder is read-only — the platform's filesystem is
 * per-instance and ephemeral, so a write to `public/uploads/` would fail with an
 * error that names the fallback rather than the cause. The upload therefore
 * writes to the blob store only, and a blob failure is raised as itself.
 *
 * On a **self-hosted** installation — a virtual server the operator controls —
 * the public folder is a real, persistent disk. The upload writes the same
 * bytes to both backends: the blob store for the CDN-backed URL a page loads in
 * production, and the public folder as the copy that survives a blob outage.
 * Both writes happen, and the row records the blob URL because that is the URL
 * a page should load while the blob is reachable.
 *
 * ## Why both, and not one
 *
 * A single backend is a single point of failure the operator cannot see coming:
 * a blob account suspended on a Friday leaves every image broken until Monday.
 * The public folder is the copy that costs nothing extra on a server that
 * already has a disk, and the day the blob is unreachable is the day the copy
 * earns its cost. On Vercel the copy cannot exist, which is why the platform is
 * a different code path and not a different product.
 *
 * ## Why the row records the blob URL
 *
 * The public URL of a blob file is stable, cacheable, and served from a CDN the
 * operator does not run. The public-folder URL is served by the application's
 * own process and is therefore slower and coupled to the process's lifetime.
 * The reader prefers the blob and falls back to the public copy; the row stores
 * what the reader should prefer, and `key` is what the fallback is computed
 * from.
 *
 * ## What a partial failure means
 *
 * On a self-hosted installation, the two writes are attempted in order and the
 * outcome is one of three:
 *
 * - Both succeed. The row records the blob URL, and the public copy is the
 *   fallback. The common case.
 * - The blob write fails, the public write succeeds. The row records the public
 *   URL and `backend: 'public'`. The file is live; the blob is simply not where
 *   it lives.
 * - The blob write succeeds, the public write fails. The row records the blob
 *   URL, and the public copy is absent. The upload still succeeds, because the
 *   file the user asked to store has been stored; a missing fallback is a
 *   reduced redundancy, not a failed write.
 *
 * The only outcome that fails is the one where the bytes reached neither
 * backend. That is the outcome the caller is told about.
 */

import { put } from '@vercel/blob'

import { realClock } from '@/core/lib/clock'
import { ValidationError, DomainError } from '@/core/types'

import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  type StoredFile,
  type UploadInput,
} from '../types'
import {
  filenameFor,
  keyOf,
  publicPathOf,
  publicUrlOf,
  TENANT_WIDE_CLINIC_SEGMENT,
} from './paths'

/** Whether the running process is a Vercel function. */
function onVercel(): boolean {
  return process.env.VERCEL === '1' || process.env.VERCEL === 'true'
}

/** Whether the blob store is configured. */
function blobConfigured(): boolean {
  return (process.env.BLOB_READ_WRITE_TOKEN ?? '') !== ''
}

/**
 * Stores one file, returning where it landed.
 *
 * The order is fixed: validate, build the key, then — on Vercel — write the blob
 * only, or — self-hosted — attempt both writes. A validation failure is raised
 * before a key is built, so a rejected file leaves nothing behind.
 */
export async function storeFile(input: UploadInput): Promise<StoredFile> {
  if (input.bytes.byteLength === 0) {
    throw new ValidationError('The uploaded file is empty.', {
      messageKey: 'storage.emptyFile',
    })
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError('The uploaded file is too large.', {
      messageKey: 'storage.fileTooLarge',
    })
  }
  if (!ALLOWED_IMAGE_TYPES.includes(input.contentType)) {
    throw new ValidationError('The uploaded file type is not supported.', {
      messageKey: 'storage.unsupportedType',
    })
  }

  const filename = filenameFor(input.filename, realClock())
  const key = keyOf({
    tenantSlug: input.scope.tenantId,
    clinicSegment: input.scope.clinicId ?? TENANT_WIDE_CLINIC_SEGMENT,
    kind: input.kind,
    ownerId: input.ownerId,
    filename,
  })

  const contentType = input.contentType
  const size = input.bytes.byteLength
  const buffer = Buffer.from(input.bytes)

  // ── Vercel: the blob store is the only writable backend ──────────────────
  if (onVercel()) {
    if (!blobConfigured()) {
      throw new DomainError('The blob store is not configured.', {
        messageKey: 'storage.blobUnavailable',
      })
    }
    try {
      const result = await put(key, buffer, {
        access: 'public',
        contentType,
        addRandomSuffix: false,
      })
      return { url: result.url, backend: 'vercel-blob', key, size, contentType }
    } catch (error) {
      throw blobFailure(error, key)
    }
  }

  // ── Self-hosted: both backends, and the blob is preferred ────────────────
  const blob = await tryBlobWrite(key, buffer, contentType)
  const publicWritten = await tryPublicWrite(key, buffer)

  if (blob !== null) {
    return { url: blob.url, backend: 'vercel-blob', key, size, contentType }
  }

  if (publicWritten) {
    return { url: publicUrlOf(key), backend: 'public', key, size, contentType }
  }

  // Neither backend took the bytes. This is the only outcome that fails.
  throw new DomainError('Neither storage backend accepted the file.', {
    messageKey: 'storage.blobUnavailable',
  })
}

/**
 * The blob write, as a value rather than a throw.
 */
async function tryBlobWrite(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ readonly url: string } | null> {
  if (!blobConfigured()) return null
  try {
    const result = await put(key, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    })
    return { url: result.url }
  } catch {
    return null
  }
}

/**
 * The public-folder write, as a value rather than a throw.
 */
async function tryPublicWrite(key: string, buffer: Buffer): Promise<boolean> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  try {
    const absolute = publicPathOf(key)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, buffer)
    return true
  } catch {
    return false
  }
}

/**
 * The failure a blob write becomes when the fallback is unavailable.
 */
function blobFailure(error: unknown, key: string): DomainError {
  return new DomainError('The blob store rejected the write.', {
    messageKey: 'storage.blobUnavailable',
    detail: { key },
    cause: error,
  })
}