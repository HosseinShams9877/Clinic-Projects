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
  console.log('STEP 1: mobile =', args.mobile)

  const now = realClock()

  let opened: OpenedSession
  try {
    const staff = await loginWithPassword({
      client: unscopedPrisma(),
      mobile: args.mobile,
      password: args.password,
    })
    console.log('STEP 2: login OK, userId =', staff.userId, 'tenantId =', staff.tenantId)

    opened = await openSession({
      client: unscopedPrisma(),
      tenantId: staff.tenantId,
      userId: staff.userId,
      now,
      ip: await clientIp(),
      userAgent: await userAgent(),
    })
    console.log('STEP 3: session opened, token =', opened.token.slice(0, 8))
  } catch (error) {
    console.error('STEP ERR:', error)
    return { ok: false, message: loginFailureMessage(error) }
  }

  console.log('STEP 4: setting cookie')
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, opened.token, sessionCookieAttributes(SESSION_TTL_MS / 1000))
  console.log('STEP 5: cookie set')

  const context = await getTenantContext({
    client: unscopedPrisma(),
    token: opened.token,
    now,
    multiTenant: getEnv().multiTenant,
  }).catch((err) => {
    console.error('STEP 6 ERR (getTenantContext):', err)
    return null
  })

  console.log('STEP 6: context =', context)

  const path = panelPath(ROLE_PANEL[context?.role ?? 'MANAGER'])
  console.log('STEP 7: path =', path)

  return { ok: true, panelPath: path }
}