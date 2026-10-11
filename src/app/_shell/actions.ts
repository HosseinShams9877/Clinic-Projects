/**
 * Signing out.
 *
 * `09-security.md` §10: "**Logout** | Server-side session invalidation, not just
 * cookie clearing." The row is revoked, so a token the client still holds is dead on
 * the next request — clearing the cookie alone would leave a live credential behind
 * on a machine where the cookie was copied, and the specification names that
 * difference. This action does both, in that order, because a cleared cookie with a
 * live row is the bug the order exists to prevent.
 *
 * ## Why an action and not a link
 *
 * Signing out writes to the database, which a `GET` route must not, and it needs the
 * session cookie — a request fact, not a form field. A Server Action is the one
 * mechanism the App Router gives a form that runs on the server and may write, and
 * the shell's sign-out button is its only caller.
 *
 * ## What happens to a signed-out person
 *
 * `redirect('/')` sends them to the entry page, which is the page that presents the
 * two ways back in. Not to the login they came from: they may have been a customer,
 * and the entry page is the one surface that offers both doors rather than guessing
 * which one they want.
 *
 * ## Why an already-revoked session is not an error
 *
 * `revokeSession()` returns `false` when no row held the token, and that is the
 * ordinary case of a second press of the button, or of a cookie whose row expired
 * and was cleaned. The person is signed out either way, so the action answers the
 * same thing it answers for a real sign-out and never reports a failure the user
 * cannot act on.
 *
 * ## What is not here
 *
 * The idle-expiry renewal and the token rotation are the session module's; this only
 * revokes. The row is kept rather than deleted, because the audit trail is the
 * reason §10 makes invalidation server-side.
 */

'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { prisma, unscopedPrisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { revokeSession, SESSION_COOKIE } from '@/modules/auth'

import { loadCustomersList } from '@/app/_customers/page-data'
import { resolveStaffPanel, sessionToken } from './session'
import type { Panel } from './navigation'

/**
 * Revokes the session the cookie names and sends the person to the entry page.
 *
 * Unscoped client, for the same reason `revokeSession`'s other caller takes one: the
 * row is being killed, not read through a tenant's scope, and the scoped client
 * would refuse a write that has no tenant context to name.
 */
export async function signOut(): Promise<void> {
  const token = await sessionToken()
  if (token !== null) {
    await revokeSession({ client: unscopedPrisma(), token, now: realClock() })
  }
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect('/')
}

/** One topbar search hit — a customer the staff member may open. */
export interface TopbarSearchResult {
  readonly id: string
  readonly name: string
  readonly mobile: string
}

/**
 * The topbar's live customer search — the top few customers matching a name or mobile.
 *
 * Reuses the app's own `loadCustomersList` (the same read the customers page runs), so
 * no new module query is added; the doctor's panel searches their own patients and the
 * desk and manager the whole file, which is the scope each already reads under. Services
 * are deliberately not searched here — there is no exposed services-by-name query and no
 * reception destination for one — so the dropdown is customers only.
 */
export async function quickSearchCustomersAction(
  panel: Panel,
  query: string,
): Promise<readonly TopbarSearchResult[]> {
  if (query.trim() === '') return []
  const session = await resolveStaffPanel(panel)
  const scope = panel === 'doctor' ? 'own' : 'all'
  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadCustomersList({ tx, ctx: session.permissions, scope, query }),
  )
  return data.rows.slice(0, 6).map((row) => ({
    id: row.id,
    name: row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`,
    mobile: row.mobile,
  }))
}
