/**
 * Delivering the one-time code — the one thing Phase 1 does not have a provider for.
 *
 * `09-security.md` §10's customer login texts a code, and `auth`'s `issueOtp`
 * deliberately hands the code to the *caller* rather than sending it itself: "the
 * module issues the code and the boundary delivers it", because a module that knew
 * an SMS gateway would be a module that could not be called from a test. This file
 * is the boundary's delivery.
 *
 * ## Why the code is returned in development and never in production
 *
 * No SMS provider is configured. In **production** the code must not reach the
 * browser — a page that displayed it would make the code the first factor, and
 * anyone who typed any mobile would be handed a working credential for it. So a
 * production boot delivers nothing and the flow is an honest dead end until the
 * provider lands.
 *
 * In **development**, the code is returned to the caller so the login form can
 * display it. That is a demo convenience: the same code is also printed to the
 * server console, and the two together make the customer flow usable end to end
 * without an SMS gateway. The mobile is masked in the console line, because a
 * development log is still a log.
 *
 * ## What closes it
 *
 * An SMS provider: this function becomes the one call site, the return value
 * becomes `null` everywhere, and nothing else in the product changes.
 */

import { getEnv } from '@/core/config/env'

/**
 * Delivers the code, if there is one to deliver and a channel to deliver it on.
 *
 * `code` is `null` for a mobile the tenant does not know, and that is not a
 * delivery: no code exists for it, and nothing about the mobile may be revealed.
 *
 * @returns the code in development, for the form to display; `null` in production,
 *   where the code must not reach the browser.
 */
export function deliverCode(args: {
  readonly mobile: string
  readonly code: string | null
}): string | null {
  if (args.code === null) return null
  if (getEnv().isProduction) return null

  console.info(`[dev] one-time code for ${maskMobile(args.mobile)}: ${args.code}`)
  return args.code
}

/** The last four digits, which are the ones a person checks the code against. */
function maskMobile(mobile: string): string {
  return mobile.length < 4 ? '••••' : `•••• ${mobile.slice(-4)}`
}