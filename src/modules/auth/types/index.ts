/**
 * The shapes `auth` uses, and nothing else.
 *
 * `05-conventions.md` §15.5 puts an override's contract in the default module's
 * `types/` and makes it a named, exported interface, so the module's public
 * surface is described here and its implementation is reached through the barrel.
 *
 * ## What is deliberately not here
 *
 * A `Session` row. The row carries a `tokenHash`, an `ip` and a `userAgent`, and
 * none of that is the answer to "is this person signed in" — it is the storage of
 * the answer. The three types below are the row narrowed to the fields the
 * module's own rules read, the same way `roles-permissions`'s `MembershipSnapshot`
 * is a `Membership` narrowed to three.
 *
 * `tenantId` is on all three, and that is the point: the login resolves a tenant,
 * it does not receive one (`02-architecture.md` §11 — "Tenant context is resolved,
 * never received"). A login request that could name its own tenant would be a
 * tenant the caller could forge.
 *
 * `role`, `clinicId` and the permission set are not here. Those come from the
 * membership — `getTenantContext()`'s job — and a login that returned them would be
 * an authentication step making an authorisation decision (`04-roles-permissions.md`
 * §2 keeps the two apart for exactly the reason the request lifecycle lists them as
 * separate stages).
 */

import type { PrismaClient } from '@/generated/prisma/client'

import type { CustomerId, TenantId, UserId } from '@/core/types'

/**
 * A staff member the password check accepted.
 *
 * `userId` and `tenantId` are what `getTenantContext()` needs to load the
 * membership; the membership is what carries the role, so the role is not here.
 */
export interface AuthenticatedStaff {
  readonly userId: UserId
  readonly tenantId: TenantId
}

/**
 * A customer the one-time code check accepted.
 *
 * `customerId` is the whole point of `09-security.md` §7 — "The session resolves to
 * a `customerId`, and every query is scoped to that `customerId` in addition to the
 * tenant." It is here because the login produced it, and it is *only* here: §7
 * continues that a customer-supplied `customerId` "does not exist as an input
 * anywhere", which is why this type is the result of a login and never the shape of
 * a request.
 */
export interface AuthenticatedCustomer {
  readonly customerId: CustomerId
  readonly tenantId: TenantId
}

/**
 * An OTP challenge the issuance accepted, as the customer's form needs it.
 *
 * Nothing here is a secret. The code itself is hashed and stored; this is the
 * receipt the form holds so it can tell the customer how long the code is good for
 * and the login can be asked about the challenge it was issued.
 *
 * `mobile` is present because the login form's second step shows the number the
 * code was texted to, which is the one piece of disclosure §10 allows: it confirms
 * to the customer which number to check without revealing whether any other number
 * has an account.
 */
export interface OtpChallenge {
  /** The challenge row's id, which the login submits back with the code. */
  readonly id: string
  /** The tenant the page resolved from its subdomain. */
  readonly tenantId: TenantId
  /** The mobile the code was texted to. */
  readonly mobile: string
  /** When the code stops being usable, for a countdown and for the check itself. */
  readonly expiresAt: Date
}

/**
 * `auth`'s public contract, as an override's replacement must satisfy
 * (`05-conventions.md` §15.5).
 *
 * The four operations are §10's: staff password login, customer one-time-code
 * issuance and login, and the logout that invalidates a session server-side.
 * Issuance is separate from the customer login because a code is requested in one
 * request and submitted in another; making them one function would make the two
 * requests one call, and the two have different rate limits.
 *
 * Every function takes a client because the module's rules are about the data, not
 * about the process that reached it — the same signature serves a Server Action, a
 * Route Handler and a test, and the tenant scope is the caller's to open, since the
 * caller is the one that knows which scope it is. The client a caller passes is
 * unscoped, because a login happens before any tenant scope exists and the scoped
 * client would refuse the read.
 */
export interface AuthModule {
  /**
   * Issues a one-time code for a mobile number.
   *
   * The mobile may have no account, and the function does not say which it was:
   * §10's enumeration rule means an unknown mobile gets the same row, the same
   * rate-limit accounting and the same response.
   * @throws AuthError `auth.otp.rateLimited` when the mobile or the address has
   * asked too recently.
   */
  readonly issueOtp: (args: {
    readonly client: PrismaClient
    readonly tenantId: TenantId
    readonly mobile: string
    readonly now: Date
    readonly ip: string
  }) => Promise<{ readonly challenge: OtpChallenge; readonly code: string | null }>

  /**
   * Accepts a code and signs the customer in.
   * @throws AuthError `auth.otp.invalid` for a wrong code or an unknown challenge.
   * @throws AuthError `auth.otp.expired` for a spent or past-its-expiry code.
   * @throws AuthError `auth.otp.tooManyAttempts` for a frozen challenge.
   */
  readonly loginWithOtp: (args: {
    readonly client: PrismaClient
    readonly challengeId: string
    readonly code: string
    readonly now: Date
  }) => Promise<AuthenticatedCustomer>

  /**
   * Accepts a mobile and password and signs a staff member in.
   * @throws AuthError `auth.login.failed` for either a wrong mobile or a wrong
   * password — one sentence for both, per §10.
   * @throws AuthError `auth.account.inactive` for a deactivated account, which is a
   * different sentence because it names a state the user can act on differently.
   */
  readonly loginWithPassword: (args: {
    readonly client: PrismaClient
    readonly mobile: string
    readonly password: string
  }) => Promise<AuthenticatedStaff>

  /**
   * Invalidates a session server-side and returns whether there was one.
   *
   * §10's logout rule means the row is revoked rather than the cookie cleared, so a
   * token a client still holds is dead on the next request. The boolean is for the
   * boundary, which renders a different page for "you were signed out" than for
   * "you were not signed in".
   */
  readonly revokeSession: (args: {
    readonly client: PrismaClient
    readonly token: string
    readonly now: Date
  }) => Promise<boolean>
}
