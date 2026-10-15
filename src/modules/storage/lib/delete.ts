/**
 * The delete path, and the one place a stored file is removed.
 *
 * A delete is best-effort in both backends: a blob that has already expired and
 * a public file that was never written are both "already gone", and raising for
 * either would make a caller retry an operation that has already succeeded. The
 * function returns whether anything was removed, and a caller that needs the
 * fact can act on it; a caller that does not can ignore it.
 *
 * The key is parsed first. A key this module did not build — a URL from an
 * earlier release, a path a caller supplied — is refused rather than resolved,
 * because a delete that acts on an unparsed path is a delete a caller can aim
 * at any file the process can reach.
 */

import { del } from '@vercel/blob'

import { parseKey, publicPathOf } from './paths'
import type { StoredFile } from '../types'

/** Removes the file a `StoredFile` names, from the backend that answered. */
export async function removeFile(file: Pick<StoredFile, 'key' | 'backend'>): Promise<boolean> {
  const parts = parseKey(file.key)
  if (parts === null) return false

  if (file.backend === 'vercel-blob') {
    return removeFromBlob(file.key)
  }
  return removeFromPublic(file.key)
}

async function removeFromBlob(key: string): Promise<boolean> {
  if ((process.env.BLOB_READ_WRITE_TOKEN ?? '') === '') return false
  try {
    await del(key)
    return true
  } catch {
    return false
  }
}

async function removeFromPublic(key: string): Promise<boolean> {
  const { unlink } = await import('node:fs/promises')
  try {
    await unlink(publicPathOf(key))
    return true
  } catch {
    return false
  }
}