/**
 * The `auth` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its
 * barrel and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — `@/modules/*​/*`
 * is a banned specifier — so a file that is not listed below does not exist as far as
 * the rest of the repository is concerned.
 *
 * ## What the boundary takes from here
 *
 * The four operations §10 names, plus the two facts a form needs to render: the code's
 * length and the name of the cookie. The cookie's *attributes* are not here — setting
 * `httpOnly`/`Secure`/`SameSite=Lax` is a boundary concern, and a library function
 * that touched the response object would be one that could not be called from a
 * Server Action, a Route Handler and a worker with the same signature.
 *
 * ## The contract, and who reads it
 *
 * `AuthModule` is exported here and defined in `./types` because
 * `05-conventions.md` §15.5 puts an override's contract in the default module's
 * `types/` and makes it a named, exported interface. It is exported through the
 * barrel for the same reason every other public name is: the registry, which is
 * another module, may not reach into this one's `types/` to name it.
 *
 * ## Why `hashPassword` is exported, and `verifyPassword` is not
 *
 * `lib/password.ts` names the two writers of a password hash — this module's seed and
 * the `staff` module's write path — and neither is a login. Both reach for the
 * function through this barrel, because a caller that hashed a password itself would
 * be a caller choosing its own storage rule, and the one place the Argon2id
 * parameters live is the one place the verification reads them back.
 *
 * `verifyPassword` stays private for the mirror-image reason: a caller that reached it
 * would be a caller deciding for itself what a correct proof is, and the module
 * exposes outcomes — a login that succeeded or an error that names a key — rather
 * than a comparison a caller could run outside the login. The asymmetry is the same
 * one `openSession` has below it: writing a session is the boundary's concern, and
 * verifying a token is the login's.
 *
 * ## What is deliberately not here
 *
 * `verifyPassword`, `hashCode` and `constantTimeEquals` are private. They are the
 * *how* of a proof, and a caller that reached them would be a caller deciding for
 * itself what a correct proof is. The module exposes outcomes — a login that
 * succeeded or an error that names a key — and nothing else. `hashPassword` is the
 * one exception, and the section above says why: a hash is written by the seed and by
 * `staff`, never verified by either.
 *
 * `NONEXISTENT_USER_PASSWORD` and `NONEXISTENT_CHALLENGE_HASH` are private for the
 * same reason and a stronger one: they exist to make two branches of a login take
 * the same time, and a caller that used one would be a caller timing something.
 */

export type {
  AuthenticatedCustomer,
  AuthenticatedStaff,
  AuthModule,
  OtpChallenge,
} from './types'

export type { AuthMessageKey, LoginLabels, LoginPlaceholders } from './catalog'
export { LOGIN_LABELS, LOGIN_PLACEHOLDERS, MESSAGES } from './catalog'

export { issueOtp, loginWithOtp, loginWithPassword } from './lib/login'

export { hashPassword } from './lib/password'

export {
  openSession,
  revokeSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type OpenedSession,
} from './lib/session'

export { CODE_LENGTH as oneTimeCodeLength, CODE_RADIX as oneTimeCodeRadix } from './lib/otp'
