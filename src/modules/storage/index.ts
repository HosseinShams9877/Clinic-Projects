/**
 * The storage module's barrel — its complete public surface
 * (`02-architecture.md` §10 rule 2).
 */

export type {
  StorageBackend,
  StorageKind,
  StorageScope,
  StoredFile,
  UploadInput,
} from './types'
export { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from './types'

export { storeFile } from './lib/upload'
export { removeFile } from './lib/delete'
export { classifyStoredUrl, publicFallbackOf, resolveStoredUrl } from './lib/resolve'
export { filenameFor, keyOf, parseKey, publicPathOf, publicUrlOf, TENANT_WIDE_CLINIC_SEGMENT } from './lib/paths'

export { MESSAGES, type StorageMessageKey } from './catalog'