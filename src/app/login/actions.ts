/**
 * The staff login's Server Action — `09-security.md` §10's first login.
 *
 * > Staff login | Mobile or username + password.
 *
 * The page asks for this and nothing else, and it calls the `auth` barrel and never
 * the lib files. One action, because a password login is one round trip.
 *
 * ## Why the action answers with the panel path
 *
 * `loginWithPassword` returns a user and a tenant, and deliberately not a role: a
 * login that returned one would be an authentication step making an authorisation
 * decision (`04-roles-permissions.md` §2). The panel is the *membership's*, so the
 * action resolves it by reading the session it just wrote — the same resolution every
 * request will make from then on — and hands the path back so the person lands on
 * their own panel.
 *
 * The resolution runs in a `catch`-free block of its own after the cookie is set, and
 * a failure there falls back to `/admin`, where `requireStaffPanel` routes any other
 * role to its own panel. That is not a swallowed error: the person lands somewhere
 * correct either way, and the session row the resolution would have read is the one
 * the shell will read again.
 *
 * ## Enumeration
 *
 * §10 requires that a wrong mobile and a wrong password produce the same response,
 * and the module raises one key for both — and does the unknown mobile's hash work so
 * the two take the same time. This action maps that key to one sentence and returns
 * it, and adds nothing to it: no distinction, no timing leak, no branch that reveals
 * which half was wrong.
 */

'use server'

import { cookies } from 'next/headers'

import { getEnv } from '@/core/config/env'
import { getTenantContext, unscopedPrisma } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import {
  loginWithPassword,
  openSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type OpenedSession,
} from '@/modules/auth'

import { loginFailureMessage, sessionCookieAttributes } from '@/app/_login/login-support'
import { clientIp, userAgent } from '@/app/_login/request'
import { ROLE_PANEL, panelPath } from '@/app/_shell/navigation'

/** The action's answer: the panel the person belongs in, or a sentence. */
export type StaffLoginResult =
  | { readonly ok: true; readonly panelPath: string }
  | { readonly ok: false; readonly message: string }

export async function staffLoginAction(args: {
  readonly mobile: string
  readonly password: string
}): Promise<StaffLoginResult> {
  const now = realClock()

  let opened: OpenedSession
  try {
    const staff = await loginWithPassword({
      client: unscopedPrisma(),
      mobile: args.mobile,
      password: args.password,
    })
    // Rotation happens here, not on the row the cookie names: `openSession` revokes
    // every earlier row this principal holds and writes a new one, which is §10's
    // fixation rule (`09-security.md`).
    opened = await openSession({
      client: unscopedPrisma(),
      tenantId: staff.tenantId,
      userId: staff.userId,
      now,
      ip: await clientIp(),
      userAgent: await userAgent(),
    })
  } catch (error) {
    return { ok: false, message: loginFailureMessage(error) }
  }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, opened.token, sessionCookieAttributes(SESSION_TTL_MS / 1000))

  // The session is written and the cookie is set; the panel is the membership's. A
  // resolution failure here cannot strand the person — the shell resolves the same
  // token again and routes the role itself — so the manager's panel is the fallback
  // rather than an error a user would have to read.
  const context = await getTenantContext({
    client: unscopedPrisma(),
    token: opened.token,
    now,
    multiTenant: getEnv().multiTenant,
  }).catch(() => null)

  return { ok: true, panelPath: panelPath(ROLE_PANEL[context?.role ?? 'MANAGER']) }
}
