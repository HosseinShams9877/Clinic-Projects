/**
 * The Persian sentence a login's failure is shown as.
 *
 * `05-conventions.md` §7 keeps English in the error and Persian in the catalog, and
 * the boundary is where the two meet. A Server Action is the boundary for these
 * forms, so it is where the key the module raised becomes the sentence the person
 * reads — and where a failure the catalog has no sentence for becomes the one
 * honest apology the catalog does have, rather than an English exception on a
 * Persian page.
 *
 * ## Why the lookup is ordered
 *
 * `auth`'s catalog owns `auth.*` keys and `core`'s owns the `error.*` keys, and the
 * two are separate records because they are separate modules' vocabulary
 * (`07-localization.md` §7.2 namespaces per module). A key is looked up in `auth`
 * first because that is the only module these actions call, and then in core, whose
 * `error.unhandledCase` is the sentence for everything the login did not anticipate.
 *
 * ## Why nothing else is translated here
 *
 * The sentences a *form* raises before it calls the module — "enter the mobile
 * number" — are the page's own, from `src/app/catalog.ts`, because they are
 * app-tier validation and no module raises them. Those are not errors and never
 * reach this function.
 */

import { getEnv } from '@/core/config/env'
import { isAppError } from '@/core/types'
import { VALIDATION_MESSAGES } from '@/core/localization'

import { MESSAGES as AUTH_MESSAGES } from '@/modules/auth'

/**
 * The Persian sentence for a failure the login raised, or the catalog's one apology
 * for a failure no catalog names.
 *
 * Returns `undefined` only for a non-`AppError` throw, which a caller treats as "the
 * platform failed, say the apology" — the same sentence, arrived by the other path.
 */
export function loginFailureMessage(error: unknown): string {
  if (!isAppError(error)) return VALIDATION_MESSAGES['error.unhandledCase']

  return AUTH_MESSAGES[error.messageKey as keyof typeof AUTH_MESSAGES] ?? VALIDATION_MESSAGES['error.unhandledCase']
}

/**
 * The attributes the cookie the login sets carries.
 *
 * `09-security.md` §10 names the set — `httpOnly`, `Secure`, `SameSite=Lax` — and
 * `auth`'s barrel deliberately does not set them, because a library function that
 * touched the response could not be called from a Server Action, a Route Handler and
 * a worker with the same signature. This is the one caller that has a response.
 *
 * `Secure` follows the environment: a development boot serves `http://localhost` and
 * a cookie marked `Secure` would be dropped by the browser and the login would
 * silently never sign anyone in. `getEnv()` is the authority on which boot this is.
 *
 * `maxAge` is the session's absolute lifetime, so the cookie expires when the row
 * does; the row is still the authority, because a cookie the client kept past its
 * `maxAge` is a cookie the server revokes on the next request.
 */
export function sessionCookieAttributes(maxAgeSeconds: number): {
  readonly httpOnly: boolean
  readonly secure: boolean
  readonly sameSite: 'lax'
  readonly path: '/'
  readonly maxAge: number
} {
  return {
    httpOnly: true,
    secure: getEnv().isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

/**
 * Whether a failed code submission means the challenge is spent, and the only fix is
 * a new one.
 *
 * `auth` has two such keys and they are both final for the row: `auth.otp.expired` —
 * the code's time is up or it was already used — and `auth.otp.tooManyAttempts`,
 * which freezes the challenge so the rate limit is visible rather than resettable. A
 * wrong code is neither, and retrying it is the right thing to offer.
 */
export function challengeIsSpent(error: unknown): boolean {
  if (!isAppError(error)) return false
  return error.messageKey === 'auth.otp.expired' || error.messageKey === 'auth.otp.tooManyAttempts'
}
