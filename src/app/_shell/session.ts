/**
 * How a panel shell gets the person it renders for.
 *
 * `02-architecture.md` §11 puts the resolution in a `middleware.ts` that reads the
 * cookie and redirects to the login when it is absent. **That middleware is not part
 * of Phase 1** — the roadmap ships the panels before it ships the edge guard — so
 * the resolution the architecture assigns to the middleware is done here, by the
 * panel's own layout, on the server. The properties §11 guarantees are the same
 * properties this keeps:
 *
 * - **The context is resolved, never received.** The only input is the session
 *   cookie; `tenantId`, `clinicId`, `role` and `overrides` all come from the
 *   membership the token's row names, and nothing on the request body is read.
 * - **Authorisation happens at the module layer.** These helpers resolve and
 *   redirect; they grant nothing. `can()` answers the navigation question, and the
 *   page a link points at is a page whose module will check the same permission
 *   again when Phase 2 builds it.
 *
 * ## What a visitor with no session gets
 *
 * A redirect to the panel's own login route: `/login` for the three staff panels,
 * `/account/login` for the customer panel. Not a 404 and not an empty shell — the
 * page exists, the person simply has no session for it, and the login is where one
 * is acquired. The same redirect answers an expired or revoked token, because
 * `getTenantContext()` reports both as failures rather than as a context with a
 * hole in it, and a shell that rendered on would render a page whose every link the
 * module layer would refuse.
 *
 * ## What a person with the wrong role gets
 *
 * A redirect to *their* panel. A doctor who opens `/admin` is signed in and
 * authorised for the product, only not for that door, and the architecture's answer
 * is the panel that is theirs (`ROLE_PANEL`). A customer's token at a staff panel
 * resolves to no membership at all, so it takes the staff login rather than a guess
 * about which panel a customer wants.
 *
 * ## Why this is not a `middleware.ts`
 *
 * It is the same work at the same place in the lifecycle, done by a function instead
 * of a matcher. When the middleware lands it will call these helpers rather than
 * re-resolve, because the resolution is the security property and the property
 * belongs in one file.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getEnv } from '@/core/config/env'
import {
  getTenantContext,
  getTenantContextForCustomer,
  tenantContextOf,
  unscopedPrisma,
} from '@/core/db'
import { TenantResolutionError } from '@/core/db/context'
import { realClock } from '@/core/lib/clock'
import {
  asClinicId,
  asCustomerId,
  asUserId,
  type CustomerId,
  type TenantId,
} from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import { SESSION_COOKIE } from '@/modules/auth'

import type { Panel } from './navigation'
import { ROLE_PANEL } from './navigation'

/**
 * The context a staff panel shell renders from: the resolved facts, plus the
 * permission context `can()` takes.
 *
 * The two are separate objects because they serve two readers. `can()` takes
 * `@/core/tenant`'s `TenantContext` — branded ids, the role union, the overrides —
 * while the resolution carries the membership id and the single-tenant flag, which
 * the shell's own copy needs and the permission primitive does not. Building the
 * permission context here, once, is what keeps a shell from branding an id at the
 * point of use, which is where a wrong brand would be written.
 */
export interface PanelSession {
  /** The context the navigation and, in Phase 2, the module calls take. */
  readonly permissions: TenantContext
  /** The membership's own facts: who, which tenant, which role. */
  readonly tenantId: TenantId
  /** The Persian role label the topbar's chip shows. */
  readonly role: TenantContext['role']
}

/**
 * The session cookie's token, or `null` when the request carries none.
 *
 * `cookies()` is async in Next 16; awaiting it here is the whole reason this file is
 * not a set of plain values. The cookie's name is `auth`'s to know and this file's
 * to read, so the name comes from the barrel and not from a second literal.
 */
export async function sessionToken(): Promise<string | null> {
  const store = await cookies()
  const cookie = store.get(SESSION_COOKIE)
  return cookie?.value ?? null
}

/**
 * Resolves the staff session a panel renders under, or redirects to the login.
 *
 * Reads the cookie, resolves the membership and returns the two contexts a shell
 * needs. Any resolution failure — no cookie, no row, an expired or revoked token, a
 * membership that no longer holds, a tenant that closed — sends the request to the
 * staff login, because none of them is a state a shell can render past and the
 * person's next useful step is the same one.
 */
export async function requireStaffPanel(panel: Panel): Promise<PanelSession> {
  try {
    return await resolveStaffPanel(panel)
  } catch (error) {
    // Every reason the resolution can fail is a reason the request has no usable
    // staff session, and the staff login is where one is acquired. `redirect()` is
    // how the boundary answers, so the failure is caught here rather than let to
    // surface as a 500 — the architecture's own answer to these is a redirect and
    // not an error page.
    if (error instanceof Error) redirect('/login')
    throw error
  }
}

/**
 * The same resolution, raising instead of redirecting.
 *
 * A Server Action answers a person, not a page: its contract is a result the caller
 * renders, and a `redirect()` from inside one is a navigation the caller did not ask
 * for and cannot turn into a sentence. Actions call this and map the failure to
 * their own answer; shells call `requireStaffPanel` and let it navigate.
 *
 * Everything the resolution checks is the same, because the two readers are the two
 * halves of one boundary: the shell renders for a person the resolution accepted,
 * and the action acts for that same person.
 *
 * @throws `TenantResolutionError` — the session is not usable for this panel.
 */
export async function resolveStaffPanel(panel: Panel): Promise<PanelSession> {
  const token = await sessionToken()
  if (token === null) {
    throw new TenantResolutionError('The request carries no session cookie.', 'session-not-found')
  }

  const resolved = await getTenantContext({
    client: unscopedPrisma(),
    token,
    now: realClock(),
    multiTenant: getMultiTenant(),
  })

  if (ROLE_PANEL[resolved.role] !== panel) {
    // Signed in, and for a different door. The action is not the shell, so it says
    // so rather than sending the person somewhere — the caller renders the sentence,
    // and the panel the person does hold is the one their own topbar links to.
    throw new TenantResolutionError(
      `The membership's role opens the ${ROLE_PANEL[resolved.role]} panel, not ${panel}.`,
      'no-membership',
    )
  }

  return Object.freeze({
    permissions: permissionContext(resolved),
    tenantId: resolved.tenantId,
    role: resolved.role,
  })
}

/**
 * Resolves the customer session the account panel renders under, or redirects to
 * the customer login.
 *
 * The customer half of `Session`'s pair (`09-security.md` §7): the resolution
 * answers a `customerId`, not a membership, and the panel's every query will be
 * scoped to it. The id is returned from here and from nowhere else — a component
 * that read a customer id off a request would be the thing §7 forbids.
 */
export async function requireCustomerPanel(): Promise<ResolvedCustomerPanel> {
  const token = await sessionToken()
  if (token === null) redirect('/account/login')

  const resolved = await getTenantContextForCustomer({
    client: unscopedPrisma(),
    token,
    now: realClock(),
  }).catch((error: unknown) => {
    if (error instanceof Error) redirect('/account/login')
    throw error
  })

  return Object.freeze({
    permissions: tenantContextOf({ tenantId: resolved.tenantId, role: 'customer' }),
    tenantId: resolved.tenantId,
    customerId: asCustomerId(resolved.customerId),
  })
}

/**
 * The facts the account panel renders from, once the session resolved a customer.
 *
 * `permissions` is the db scope's `TenantContext` and not `@/core/tenant`'s: the latter
 * is membership-shaped, carrying a role that is one of exactly three and overrides a
 * customer holds neither of. The account panel has no permission primitive, so the
 * scope's only reader is `runInTenantScope`, which takes this type.
 */
export interface ResolvedCustomerPanel {
  readonly permissions: ReturnType<typeof tenantContextOf>
  readonly tenantId: TenantId
  /** The authenticated customer. Never accepted from an input. */
  readonly customerId: CustomerId
}

/**
 * `can()`'s context, built from the resolution.
 *
 * The resolution's `userId` and `clinicId` are plain strings — `scope`'s context is
 * what the database extension consumes, and the brand is a `@/core/tenant` concern.
 * Branded here, at the one boundary between the two, so a caller that asks what a
 * person may do gets the ids in the shape the permission primitive requires and
 * never has to cast one itself.
 */
function permissionContext(resolved: Awaited<ReturnType<typeof getTenantContext>>): TenantContext {
  return Object.freeze({
    userId: asUserId(resolved.userId),
    tenantId: resolved.tenantId,
    clinicId: resolved.clinicId === null ? null : asClinicId(resolved.clinicId),
    role: resolved.role,
    overrides: resolved.overrides,
  })
}

/** The route a panel's home sits on. */
export function panelPath(panel: Panel): string {
  return panel === 'account' ? '/account' : `/${panel}`
}

/**
 * Whether the platform resolves tenants from subdomains, read once per resolution.
 *
 * Handed to the resolver because it is the one fact the resolver cannot derive
 * itself, and read from `env.ts` rather than `process.env` for the reason
 * `client.ts` reads its URL there: the authority has already refused the impossible
 * combinations, and reading the parsed value is how a module skips them.
 */
function getMultiTenant(): boolean {
  return getEnv().multiTenant
}
