/**
 * The shapes the licensing surface returns.
 *
 * The module is active only when `MULTI_TENANT=false` (`02-architecture.md` §7):
 * an on-premise install is licensed by key, and a SaaS tenant is billed by
 * subscription. The two modules are the two halves of that boundary, and neither is
 * loaded in the other's mode.
 */

/** The four answers a license key validation gives. */
export const LicenseStatus = {
  /** The key is present, unexpired and within its seat count. */
  Valid: 'VALID',
  /** The key exists and its expiry has passed. */
  Expired: 'EXPIRED',
  /** The key is not one this instance was issued. */
  Invalid: 'INVALID',
  /** No key is configured at all, which is a configuration failure. */
  Missing: 'MISSING',
} as const
export type LicenseStatus = (typeof LicenseStatus)[keyof typeof LicenseStatus]

/** One issued key, as the licensing surface renders it. */
export interface LicenseRow {
  readonly id: string
  /** The key as it is stored, masked everywhere it is not entered. */
  readonly key: string
  readonly issuedTo: string | null
  readonly issuedAt: Date
  readonly expiresAt: Date | null
  readonly maxUsers: number | null
  readonly activatedAt: Date | null
  readonly notes: string | null
}

/** The outcome of a validation, with the sentence the blocking screen renders. */
export interface LicenseValidation {
  readonly status: LicenseStatus
  readonly expiresAt: Date | null
  /** The number of seats still free, when the license caps them. */
  readonly seatsRemaining: number | null
}
