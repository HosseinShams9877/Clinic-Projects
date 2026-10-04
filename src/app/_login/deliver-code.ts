/**
 * Delivering the one-time code — the one thing Phase 1 does not have a provider for.
 *
 * `09-security.md` §10's customer login texts a code, and `auth`'s `issueOtp`
 * deliberately hands the code to the *caller* rather than sending it itself: "the
 * module issues the code and the boundary delivers it", because a module that knew
 * an SMS gateway would be a module that could not be called from a test. This file
 * is the boundary's delivery, and in Phase 1 that delivery is a development channel
 * only.
 *
 * ## Why the code never goes back to the browser
 *
 * The action that calls this never puts the code in the result it returns, and the
 * reason is the whole point of the second factor: a page that displayed the code
 * would make the code the first factor, and anyone who typed any mobile would be
 * handed a working credential for it. `issueOtp` writes a challenge row for a mobile
 * the tenant does not know too — §10's enumeration rule — and a code on the page
 * would be exactly the disclosure that arrangement exists to prevent.
 *
 * ## Why nothing happens in production
 *
 * No SMS provider is configured in Phase 1. Pretending to send would be a login that
 * looks like it works and never lets anyone in, and failing loudly would be a login
 * that breaks on the page a customer reaches first. So a production boot delivers
 * nothing and the flow is an honest dead end until the provider lands, while a
 * development boot prints the code to the server console so the flow is usable and
 * testable end to end. The mobile is masked in the line, because a development log is
 * still a log.
 *
 * ## What closes it
 *
 * An SMS provider: this function becomes the one call site, and nothing else in the
 * product changes — `issueOtp`'s signature already separates "issue" from "deliver"
 * for exactly this.
 */

import { getEnv } from '@/core/config/env'

/**
 * Delivers the code, if there is one to deliver and a channel to deliver it on.
 *
 * `code` is `null` for a mobile the tenant does not know, and that is not a delivery:
 * no code exists for it, and nothing about the mobile may be revealed.
 */
export function deliverCode(args: { readonly mobile: string; readonly code: string | null }): void {
  if (args.code === null) return
  if (getEnv().isProduction) return

  console.info(`[dev] one-time code for ${maskMobile(args.mobile)}: ${args.code}`)
}

/** The last four digits, which are the ones a person checks the code against. */
function maskMobile(mobile: string): string {
  return mobile.length < 4 ? '••••' : `•••• ${mobile.slice(-4)}`
}
