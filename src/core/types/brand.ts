/**
 * Branded identifiers.
 *
 * `05-conventions.md` §2 requires branded types "where mixing is a real risk:
 * `TenantId`, `ClinicId`, `CustomerId`, `UserId`. Passing a `ClinicId` where a
 * `TenantId` is expected must be a compile error — this is the cheapest possible
 * defence against the isolation bug in `09-security.md`."
 *
 * That is the whole point of this file. Every tenant-scoped query takes a
 * `TenantId`; every ownership predicate takes a `UserId`; a payment takes a
 * `CustomerId`. They are all strings at runtime, and the compiler refuses to let
 * one be used as another.
 */

declare const brand: unique symbol

/** A `T` that is only assignable from another value branded `B`. */
export type Brand<T, B extends string> = T & { readonly [brand]: B }

/* ── Identifiers ──────────────────────────────────────────────────────────── */

export type TenantId = Brand<string, 'TenantId'>
export type ClinicId = Brand<string, 'ClinicId'>
export type UserId = Brand<string, 'UserId'>
export type CustomerId = Brand<string, 'CustomerId'>

/* ── Money ────────────────────────────────────────────────────────────────── */

/**
 * An amount in **Rial**, as a `bigint`.
 *
 * `05-conventions.md` §8: "Stored as `BigInt` Rial; never a float, never a JS
 * `Number`… A `number` appearing anywhere near an amount is a finding."
 *
 * Branding the type is what makes that checkable rather than merely stated: the
 * money helpers accept a `Rial` and return a `Rial`, so an unbranded `bigint`
 * that has not been through `rial()` does not type-check at a call site.
 */
export type Rial = Brand<bigint, 'Rial'>

/* ── Constructors ─────────────────────────────────────────────────────────────
 *
 * A brand is a compile-time claim that a value came from a trusted place. These
 * constructors are that place, so they are the code that has to be right.
 *
 * They validate shape, not existence: `asTenantId('x')` asserts that `x` is a
 * well-formed identifier, not that a tenant with that id exists. Existence is
 * the database's answer and is never assumed from a parse.
 * ------------------------------------------------------------------------- */

function brandString<B extends string>(value: string, kind: B): Brand<string, B> {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new TypeError(`A ${kind} must not be empty`)
  }
  if (trimmed.length > MAX_IDENTIFIER_LENGTH) {
    throw new TypeError(
      `A ${kind} must be at most ${MAX_IDENTIFIER_LENGTH} characters, received ${trimmed.length}`,
    )
  }
  return trimmed as Brand<string, B>
}

/**
 * The longest identifier the product generates.
 *
 * `cuid2` produces 24 characters and Prisma's `cuid()` 25; the column is a
 * `String` on both engines. The limit is a guard against a caller passing a
 * whole JSON body where an id was expected — a mistake that would otherwise
 * reach a query and be diagnosed from a database error.
 */
export const MAX_IDENTIFIER_LENGTH = 64

export const asTenantId = (value: string): TenantId => brandString(value, 'TenantId')
export const asClinicId = (value: string): ClinicId => brandString(value, 'ClinicId')
export const asUserId = (value: string): UserId => brandString(value, 'UserId')
export const asCustomerId = (value: string): CustomerId => brandString(value, 'CustomerId')

/** Builds a `Rial` amount from a bigint. The only way to obtain one. */
export const asRial = (value: bigint): Rial => value as Rial
