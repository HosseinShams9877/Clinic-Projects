/**
 * The three error classes of `05-conventions.md` §7, plus the one the security
 * model needs.
 *
 * - `ValidationError` — user-correctable input.
 * - `AuthError` — permission or session.
 * - `DomainError` — a violated business rule.
 * - `NotFoundError` — a record outside the caller's scope. It exists as its own
 *   class because `09-security.md` §6.3 requires that case to return **404, not
 *   403**: a 403 confirms the record exists, which is itself a disclosure.
 *
 * "Domain rules throw; they do not return `null`. A silent `null` becomes a
 * wrong number on a screen."
 *
 * Every message here is **English**. These are internal exceptions that are
 * translated at the boundary; a Persian string in this file would be a second
 * place Persian copy lives, and `07-localization.md` §7.2 puts it in the
 * catalog. The catalog key is carried on the error so the boundary can render
 * the right Persian sentence without guessing from the message text.
 */

export type ErrorCode =
  | 'VALIDATION'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'DOMAIN'

export interface AppErrorOptions {
  /** Catalog key for the Persian sentence the user sees. */
  readonly messageKey: string
  /** Values interpolated into the catalog sentence. Never PII. */
  readonly messageParams?: Readonly<Record<string, string>>
  /** Machine-readable detail for the logger. Never rendered (`§7`). */
  readonly detail?: Readonly<Record<string, unknown>>
  readonly cause?: unknown
}

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode
  readonly messageKey: string
  readonly messageParams: Readonly<Record<string, string>>
  readonly detail: Readonly<Record<string, unknown>>

  protected constructor(message: string, options: AppErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = new.target.name
    this.messageKey = options.messageKey
    this.messageParams = options.messageParams ?? {}
    this.detail = options.detail ?? {}
  }
}

/** Input the user can correct. Rendered as a field or form error. */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION' as const
  constructor(message: string, options: AppErrorOptions) {
    super(message, options)
  }
}

/** No session, or a session that may not perform this action. */
export class AuthError extends AppError {
  readonly code = 'AUTH_REQUIRED' as const
  constructor(message: string, options: AppErrorOptions) {
    super(message, options)
  }
}

/**
 * The caller is authenticated but is not permitted.
 *
 * Distinct from `NotFoundError` on purpose: this is raised when the caller has
 * no business knowing whether the record exists **and no record was looked up**.
 * Once a lookup has happened and the row is outside the caller's scope, the
 * answer is `NotFoundError` (`09-security.md` §6.3).
 */
export class PermissionError extends AppError {
  readonly code = 'PERMISSION_DENIED' as const
  constructor(message: string, options: AppErrorOptions) {
    super(message, options)
  }
}

/** The record does not exist **within the caller's scope**. Always a 404. */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND' as const
  constructor(message: string, options: AppErrorOptions) {
    super(message, options)
  }
}

/**
 * A business rule was violated — immutable rules and the invariants of
 * `03-data-model.md` §7. This is a 4xx for the caller, but it is a *bug* if the
 * caller could not have known; the distinction is made at the boundary.
 */
export class DomainError extends AppError {
  readonly code = 'DOMAIN' as const
  constructor(message: string, options: AppErrorOptions) {
    super(message, options)
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * The `exhaustive()` helper of `05-conventions.md` §2 — used in a `switch` over
 * a union so that adding a member without handling it fails to compile.
 */
export function exhaustive(value: never, context: string): never {
  throw new DomainError(`Unhandled case in ${context}: ${String(value)}`, {
    messageKey: 'error.unhandledCase',
  })
}
