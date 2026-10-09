/**
 * The customer login's two Server Actions — `09-security.md` §10's second login.
 *
 * The page asks for these and nothing else, and each one calls the `auth` barrel and
 * never the lib files (`02-architecture.md` §10 rule 1: a module is reachable
 * through its barrel and nothing else). Two actions rather than one because the two
 * steps are two round trips with two different failures, and a caller that asked for
 * both in one call would be a caller holding a code.
 *
 * ## Why the actions answer with a result and not a redirect
 *
 * A `redirect()` inside a Server Action is a thrown `NEXT_REDIRECT`, and inside the
 * `try` below it would be caught by the same handler that catches a failed login.
 * Returning a result keeps the two paths separate — the form navigates on `ok`, and
 * the form's error slot is set on not-`ok` — and it keeps the failure as a sentence
 * on the page rather than a navigation away from it.
 *
 * ## Why the tenant is resolved here and not in the module
 *
 * `issueOtp` takes a `tenantId` because a challenge row belongs to a tenant, and the
 * tenant is a fact about the host the page is served on. `resolveTenantId()` reads
 * it; the module never would, because a module that read the host could not be
 * called from the worker or a test. When the host names no tenant the action answers
 * with the one sentence that says so, and no code is issued.
 *
 * ## What the first action returns, and what it does not
 *
 * The challenge's id and its expiry, and — **in development only** — the code
 * itself, so the form can display it. In production `devCode` is `null` and the
 * code never reaches the browser; `deliver-code.ts` is where that branch lives and
 * why.
 */

'use server'

import { cookies } from 'next/headers'

import { unscopedPrisma } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import {
  issueOtp,
  loginWithOtp,
  openSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type OpenedSession,
} from '@/modules/auth'

import { NO_TENANT_FOR_THIS_ADDRESS } from '@/app/catalog'
import { deliverCode } from '@/app/_login/deliver-code'
import {
  challengeIsSpent,
  loginFailureMessage,
  sessionCookieAttributes,
} from '@/app/_login/login-support'
import { clientIp, userAgent } from '@/app/_login/request'
import { resolveTenantId } from '@/app/_shell/tenant'

/**
 * The first step's answer: the challenge's id and its expiry, or a sentence.
 *
 * `devCode` is the code itself in development and `null` in production — see
 * `deliver-code.ts` for why the two are not the same.
 */
export type OtpRequestResult =
  | {
      readonly ok: true
      readonly challengeId: string
      readonly expiresAtEpochMs: number
      /** The code, in development only. `null` in production. */
      readonly devCode: string | null
    }
  | { readonly ok: false; readonly message: string }

/** The second step's answer: a session, or a sentence and whether the code is spent. */
export type OtpVerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly needsNewCode: boolean }

/**
 * Issues a one-time code for a mobile, in the tenant the host names.
 *
 * The challenge row is written whether or not the mobile has an account, so the
 * response — and the rate limit — look the same either way, and the action's answer
 * carries nothing the enumeration rule forbids: the id and the expiry, and never a
 * hint about whether the mobile is known.
 */
export async function requestOtpAction(args: { readonly mobile: string }): Promise<OtpRequestResult> {
  const now = realClock()
  const tenantId = await resolveTenantId()
  if (tenantId === null) {
    // No tenant to issue for. The sentence names the address and nothing about a
    // mobile, because the failure is not about the mobile.
    return { ok: false, message: NO_TENANT_FOR_THIS_ADDRESS }
  }

  try {
    const { challenge, code } = await issueOtp({
      client: unscopedPrisma(),
      tenantId,
      mobile: args.mobile,
      now,
      ip: await clientIp(),
    })
    // The delivery is the boundary's job. In development it returns the code so the
    // form can display it; in production it returns null and the code stays on the
    // server — see `deliver-code.ts`.
    const devCode = deliverCode({ mobile: args.mobile, code })
    return {
      ok: true,
      challengeId: challenge.id,
      expiresAtEpochMs: challenge.expiresAt.getTime(),
      devCode,
    }
  } catch (error) {
    return { ok: false, message: loginFailureMessage(error) }
  }
}

/**
 * Signs a customer in with the code, and opens the session.
 *
 * `loginWithOtp` resolves the customer the challenge row names — never an input —
 * and `openSession` writes the row the cookie will name. The two are in the same
 * `try` because a session for a login the module refused is a session for no one, and
 * the cookie is set only after both succeeded.
 */
export async function verifyOtpAction(args: {
  readonly challengeId: string
  readonly code: string
}): Promise<OtpVerifyResult> {
  const now = realClock()

  let opened: OpenedSession
  try {
    const customer = await loginWithOtp({
      client: unscopedPrisma(),
      challengeId: args.challengeId,
      code: args.code,
      now,
    })
    opened = await openSession({
      client: unscopedPrisma(),
      tenantId: customer.tenantId,
      customerId: customer.customerId,
      now,
      ip: await clientIp(),
      userAgent: await userAgent(),
    })
  } catch (error) {
    return {
      ok: false,
      message: loginFailureMessage(error),
      needsNewCode: challengeIsSpent(error),
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, opened.token, sessionCookieAttributes(SESSION_TTL_MS / 1000))
  return { ok: true }
}