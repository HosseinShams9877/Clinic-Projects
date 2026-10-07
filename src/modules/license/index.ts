/**
 * The `license` module's complete public surface.
 *
 * `02-architecture.md` §7 names this the second conditional module: active only when
 * `MULTI_TENANT=false`, which is the on-premise install. The functions take the
 * unscoped client because an unlicensed instance has no tenant scope to open — the
 * license check is the thing that decides whether one exists.
 */

export type { LicenseRow, LicenseValidation } from './types'
export { LicenseStatus } from './types'

export {
  LICENSE_BLOCK_SENTENCES,
  LICENSE_FIELDS,
  LICENSE_STATUS_LABELS,
  MESSAGES,
} from './catalog'
export type { LicenseMessageKey } from './catalog'

export {
  currentLicense,
  currentLicenseStatus,
  issueLicenseKey,
  recordLicenseKey,
  validateLicense,
} from './lib/keys'
