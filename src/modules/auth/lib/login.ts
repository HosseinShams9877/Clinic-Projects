/**
 * The two logins of `09-security.md` §10.
 *
 * > Staff login | Mobile or username + password.
 * > Customer login | Mobile + one-time code. Codes are short-lived, single-use,
 * > and rate-limited per mobile and per IP.
 *
 * ## Why both logins are in one module and one file
 *
 * `02-architecture.md` §7 gives `auth` both, and the two share the row they write:
 * one `Session` table, one token, one cookie, one rotation rule. Keeping them apart
 * would mean two modules' worth of session plumbing that has to agree, and the
 * agreement is the security property. What differs — what is looked up and how the
 * proof is checked — is a function each.
 *
 * ## The tenant is resolved, never received
 *
 * `02-architecture.md` §11: "**Tenant context is resolved, never received.**" A
 * login request carries a mobile and a proof. The staff lookup resolves the tenant
 * from the row it finds. The customer lookup resolves it from the **subdomain the
 * page is served on**, which is `tenantIdOfSlug`'s job and is a fact about the
 * request's host rather than anything the caller typed — so the page resolves it
 * and passes it here, and a body that named a tenant would be a body nothing reads.
 *
 * Both functions take an unscoped client. A login happens before any tenant scope
 * exists; the scoped client would refuse the read, and correctly so. `client.ts`'s
 * header names three users of an unscoped client and this is the fourth — the count
 * there is updated to match.
 *
 * ## What a login returns, and what it does not
 *
 * Neither result carries a role, a permission set or a `clinicId`. Those come from
 * the membership (`getTenantContext()`) or the customer row
 * (`getTenantContextForCustomer()`), and a login that returned them would be an
 * authentication step making an authorisation decision — `04-roles-permissions.md`
 * §2 keeps the two apart, and §7 keeps the customer's `customerId` out of every
 * input for the same reason.
 *
 * ## Enumeration
 *
 * §10: "Login responses do not reveal whether a mobile number exists." Three
 * consequences are implemented here, and they are the whole reason the file is
 * longer than two queries:
 *
 * 1. The wrong-password and the unknown-mobile branches raise the same key.
 * 2. The unknown-mobile branch still hashes and verifies a password, so the two
 *    branches take the same time to be wrong about different things.
 * 3. The unknown-customer branch issues a challenge anyway — same row, same
 *    response, same rate-limit accounting — and the login for it fails with the
 *    same key a wrong code does.
 */

import type { PrismaClient } from '@/generated/prisma/client'

import { asTenantId, AuthError, type CustomerId, type TenantId, type UserId } from '@/core/types'

import type { AuthenticatedCustomer, AuthenticatedStaff, OtpChallenge } from '../types'
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  RATE_LIMIT,
  generateCode,
  hashCode,
} from './otp'
import { constantTimeEquals, hashPassword, verifyPassword } from './password'

/**
 * A password hashed for a mobile the tenant does not know.
 *
 * §10's enumeration rule means the unknown-mobile path cannot short-circuit: it has
 * to do the same work the wrong-password path does, or the response time becomes
 * the disclosure. So the branch verifies against this fixed string with the
 * library's full parameters, and the two paths take the same time to be wrong about
 * different things. A module constant rather than an inline literal, because it is
 * a security property and a property named once is a property that stays one value.
 * Not the empty string, because an empty password is what a form that submits
 * nothing sends, and the verify would be comparing nothing to nothing.
 */
const NONEXISTENT_USER_PASSWORD = 'a-password-no-user-was-ever-issued'

/** A challenge row that is not a real one, for the same enumeration reason. */
const NONEXISTENT_CHALLENGE_HASH = hashCode('a-code-no-challenge-was-issued')

/**
 * Signs a staff member in with a mobile and a password.
 *
 * @throws AuthError `auth.login.failed` for a wrong mobile or a wrong password —
 * one sentence for both, per §10.
 * @throws AuthError `auth.account.inactive` for a deactivated account, which is a
 * different sentence because it names a state the user can act on differently.
 */
export async function loginWithPassword(args: {
  readonly client: PrismaClient
  readonly mobile: string
  readonly password: string
}): Promise<AuthenticatedStaff> {
  const { client, mobile, password } = args

  // A mobile is unique per tenant, not globally (`User`'s `@@unique` is
  // `[tenantId, mobile]`), so the lookup reads every tenant that has the number.
  // Two clinics may share a staff number — the same fixture the seed builds, so the
  // isolation suite can rely on it — and a person staff in both is the ordinary
  // case the architecture supports. Which tenant this login is for is therefore
  // decided by which row the password verifies against, not by which row came back
  // first: a `findFirst` would answer the shared case with an arbitrary tenant, and
  // a password that is right for one clinic and wrong for another would fail or
  // succeed depending on the storage order.
  const users = await client.user.findMany({ where: { mobile } })

  let authenticated: { readonly id: string; readonly tenantId: string; readonly isActive: boolean } | null = null
  for (const candidate of users) {
    if (await verifyPassword(password, candidate.passwordHash)) {
      authenticated = candidate
      break
    }
  }

  if (users.length === 0) {
    // The constant-work branch: a login for a mobile no tenant knows still hashes and
    // verifies a password, so the failure takes the same time as a wrong one and the
    // response time is not the disclosure.
    await verifyPassword(password, await hashPassword(NONEXISTENT_USER_PASSWORD))
  }

  if (authenticated === null) {
    throw new AuthError('The mobile number or the password is not correct', {
      messageKey: 'auth.login.failed',
    })
  }

  if (!authenticated.isActive) {
    throw new AuthError(`The user ${authenticated.id} is not active`, {
      messageKey: 'auth.account.inactive',
      detail: { userId: authenticated.id, tenantId: authenticated.tenantId },
    })
  }

  return { userId: authenticated.id as UserId, tenantId: asTenantId(authenticated.tenantId) }
}

/**
 * Issues a one-time code for a mobile number.
 *
 * Always writes a challenge row and always returns one, whether or not the mobile
 * has an account — the row is the unit of rate limiting, and a design that looked
 * the customer up first would have to either disclose the miss or skip the row and
 * lose the limit. The code the caller texts is returned for a mobile the tenant
 * knows and `null` for one it does not: the module issues the code and the boundary
 * delivers it, and a caller that cannot deliver one does not get one to hold. The
 * row is written either way, so the rate limit counts an unknown mobile exactly as
 * it counts a known one, and the response the customer sees is the same shape
 * either way — nothing the caller holds about an unknown mobile is a secret, and
 * nothing it reveals is a fact.
 *
 * @throws AuthError `auth.otp.rateLimited` when the mobile or the address has asked
 * too recently — §10's per-mobile and per-IP limits.
 */
export async function issueOtp(args: {
  readonly client: PrismaClient
  /** The tenant the page resolved from its subdomain. */
  readonly tenantId: TenantId
  readonly mobile: string
  readonly now: Date
  /** The requesting address, for §10's per-IP limit. */
  readonly ip: string
}): Promise<{ readonly challenge: OtpChallenge; readonly code: string | null }> {
  const { client, tenantId, mobile, now, ip } = args
  const since = new Date(now.getTime() - 60_000)

  const [byMobile, byIp] = await Promise.all([
    client.otpChallenge.count({ where: { tenantId, mobile, createdAt: { gte: since } } }),
    client.otpChallenge.count({ where: { tenantId, ip, createdAt: { gte: since } } }),
  ])

  if (byMobile >= RATE_LIMIT.perMobilePerMinute || byIp >= RATE_LIMIT.perIpPerMinute) {
    throw new AuthError('The rate limit for issuing a code was exceeded', {
      messageKey: 'auth.otp.rateLimited',
      detail: { tenantId, byMobile, byIp },
    })
  }

  const customer = await client.customer.findUnique({
    where: { tenantId_mobile: { tenantId, mobile } },
    select: { id: true },
  })

  // The row is written either way. For an unknown mobile the code is a random one
  // whose hash is stored and whose text is never sent, so the row is
  // indistinguishable from a real challenge at rest and the rate limit counts it.
  //
  // `createdAt` is written from the injected clock rather than left to the column's
  // default, because the rate limit above counts rows in a window *of* that clock:
  // a default would be the ambient one, and the two clocks are only the same clock
  // in production. Writing it keeps the window and the rows it counts one fact
  // (`05-conventions.md` §8), which is also what makes the limit testable at a date
  // that is not today.
  const code = generateCode()
  const challenge = await client.otpChallenge.create({
    data: {
      tenantId,
      customerId: customer?.id ?? null,
      mobile,
      codeHash: hashCode(code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      createdAt: now,
      ip,
    },
  })

  return {
    challenge: {
      id: challenge.id,
      tenantId,
      mobile,
      expiresAt: challenge.expiresAt,
    },
    // `null` rather than `undefined` so the field's presence is not itself the signal:
    // the caller reads it once, and the two callers (text, do not text) are the two
    // values.
    code: customer === null ? null : code,
  }
}

/**
 * Signs a customer in with a one-time code.
 *
 * @throws AuthError `auth.otp.invalid` for a wrong code and for a challenge that
 * does not exist — one sentence, for the enumeration reason.
 * @throws AuthError `auth.otp.expired` for a challenge past its expiry or already
 * used, which names a different fix: request a new code.
 * @throws AuthError `auth.otp.tooManyAttempts` for an exhausted counter, which
 * freezes the challenge so the rate limit is visible rather than resettable.
 */
export async function loginWithOtp(args: {
  readonly client: PrismaClient
  readonly challengeId: string
  readonly code: string
  readonly now: Date
}): Promise<AuthenticatedCustomer> {
  const { client, challengeId, code, now } = args
  const challenge = await client.otpChallenge.findUnique({ where: { id: challengeId } })

  if (challenge === null) {
    // The constant-work branch: a login for a challenge that was never issued still
    // compares a hash, so the failure takes the same time as a wrong code.
    constantTimeEquals(hashCode(code), NONEXISTENT_CHALLENGE_HASH)
    throw new AuthError('The one-time code is not correct', { messageKey: 'auth.otp.invalid' })
  }

  if (challenge.attempts >= MAX_CODE_ATTEMPTS) {
    throw new AuthError(`Challenge ${challenge.id} has exhausted its attempts`, {
      messageKey: 'auth.otp.tooManyAttempts',
      detail: { challengeId: challenge.id, attempts: challenge.attempts },
    })
  }

  if (challenge.consumedAt !== null) {
    // §10's single-use rule. A replayed code raises the expired key — the sentence
    // names the right fix — and the row keeps its audit trail rather than being
    // deleted, so the replay is visible in the table.
    throw new AuthError(`Challenge ${challenge.id} has already been used`, {
      messageKey: 'auth.otp.expired',
      detail: { challengeId: challenge.id },
    })
  }

  if (challenge.expiresAt.getTime() <= now.getTime()) {
    throw new AuthError(`Challenge ${challenge.id} has expired`, {
      messageKey: 'auth.otp.expired',
      detail: { challengeId: challenge.id, expiresAt: challenge.expiresAt.toISOString() },
    })
  }

  if (!constantTimeEquals(hashCode(code), challenge.codeHash)) {
    // The counter is incremented on every wrong guess, so a challenge being
    // brute-forced freezes itself rather than being deleted and re-issued.
    await client.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    })
    throw new AuthError('The one-time code is not correct', { messageKey: 'auth.otp.invalid' })
  }

  // Marking the code spent is what makes it single-use at the database level: the
  // check above is `consumedAt === null`, so a second login with the same row
  // takes the already-used branch rather than re-entering the comparison.
  await client.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: now },
  })

  if (challenge.customerId === null) {
    // A challenge was issued for a mobile with no account. The response is the one
    // a wrong code produces, because from the customer's side the two are the same
    // failure and §10 requires them to look the same.
    throw new AuthError('The one-time code is not correct', { messageKey: 'auth.otp.invalid' })
  }

  return {
    customerId: challenge.customerId as CustomerId,
    tenantId: asTenantId(challenge.tenantId),
  }
}
