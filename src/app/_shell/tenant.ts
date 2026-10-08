/**
 * The tenant of the request, resolved from the address the request came to.
 *
 * `02-architecture.md` §11: "**Tenant context is resolved, never received.**" For
 * the two login pages that resolution happens *before* any session exists, and the
 * only fact available is the host. This file is that fact's reader.
 *
 * ## Why the customer login needs this and the staff login does not
 *
 * A staff login looks a mobile up **across** tenants (`auth`'s `loginWithPassword`:
 * a mobile is unique per tenant and not globally), so the tenant is resolved by the
 * row the password verifies against — the login finds it, the page never names it.
 *
 * A customer login is the other way around: `issueOtp` writes a challenge row that
 * carries a `tenantId`, and it has to know the tenant *before* it can look the
 * mobile up, because the mobile's uniqueness is per tenant too. So the page reads
 * the tenant from the subdomain and hands it to the module, and a body that named a
 * tenant would be a body nothing reads — `issueOtp`'s parameter is filled here and
 * nowhere else.
 *
 * ## Why `null` rather than an error
 *
 * A host that names no active tenant is a configuration fact, not a user error: the
 * clinic's DNS points somewhere the platform does not serve, or the tenant was
 * closed. `null` lets the login page say the one honest sentence it can — that the
 * clinic at this address was not identified — without the platform guessing a
 * tenant to log the person into. `tenantIdOfSlug` makes the same choice for a slug
 * that names a *closed* tenant, which a subdomain must not resolve.
 *
 * ## Single-tenant mode
 *
 * ADR-0004's single-tenant mode is one seeded tenant and no subdomain to read, so
 * the configured slug is the answer and the host is not consulted. `env.ts` already
 * refuses the impossible combinations around this; nothing here has to guess.
 */

import { headers } from 'next/headers'

import { getEnv } from '@/core/config/env'
import { tenantIdOfSlug, unscopedPrisma } from '@/core/db'
import type { TenantId } from '@/core/types'

/**
 * The tenant this request belongs to, or `null` if its address names none.
 *
 * Unscoped client, because no tenant scope exists yet — this is one of the reads
 * that establishes one, and a scoped client would refuse it for the same reason it
 * refuses the session read in `getTenantContext()`.
 */
export async function resolveTenantId(): Promise<TenantId | null> {
  const env = getEnv()
  const slug = env.multiTenant ? await slugFromHost() : env.singleTenantSlug
  if (slug === undefined) return null
  return tenantIdOfSlug(unscopedPrisma(), slug)
}

/**
 * The tenant's slug from the request's own host, or `undefined` when the host names
 * no subdomain.
 *
 * The first label is the tenant: `sara.beauty-clinic.ir` → `sara`. The port is
 * stripped first, because a development host carries one and `localhost:3000` would
 * otherwise resolve a tenant named `localhost`.
 *
 * `localhost` itself names no tenant — a development machine serving the platform
 * on `localhost` is in single-tenant mode, where the slug comes from configuration
 * and this function is not called at all. Returning `undefined` rather than a slug
 * keeps a multi-tenant boot against `localhost` honest: nobody is logged in, and
 * the login page says so.
 */
async function slugFromHost(): Promise<string | undefined> {
  const host = (await headers()).get('host')
  if (host === null) return undefined

  const firstLabel = host.split(':')[0]?.split('.')[0]
  if (firstLabel === undefined || firstLabel === '') return undefined
  if (firstLabel === 'localhost') return undefined
  return firstLabel
}
