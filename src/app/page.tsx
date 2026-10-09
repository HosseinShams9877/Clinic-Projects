/**
 * The root URL — `02-architecture.md` §9's `index.html`, served at `/`.
 *
 * §9 puts the public site's home at the root, and this file is that home: it
 * composes the same header and footer `(public)/layout.tsx` gives the other seven
 * pages, then renders `(public)/page.tsx` as its body. The composition is explicit
 * rather than a redirect because the root URL is the home, not a door that sends a
 * visitor somewhere else.
 *
 * ## Why the chrome is here and not in `(public)/layout.tsx`
 *
 * `(public)` is a route group: its layout wraps the pages inside the group, and the
 * root URL is not one of them. A visitor who opens `/` would otherwise get the home
 * page without the header and the footer. This file brings them, from the same
 * components and the same reads, so the two ways into the home — `/` and
 * `/services` — render one chrome.
 */

import type { Metadata } from 'next'

import { unscopedPrisma } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { resolveTenantId } from '@/app/_shell/tenant'
import { asTenantId } from '@/core/types'

import { PUBLIC_LAYOUT, type PublicNavLink } from '@/modules/public-site'
import { PublicHeader } from '@/app/_public/header'
import { PublicFooter } from '@/app/_public/footer'

import PublicHomePage, { metadata as homeMetadata } from './(public)/page'

export const metadata: Metadata = homeMetadata

/** The links the header renders, in the catalog's order. */
const NAV_LINKS: readonly PublicNavLink[] = PUBLIC_LAYOUT.nav

export default async function RootPage() {
  const tenantId = await resolveTenantId()
  const clinic = await clinicFacts(tenantId)

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <PublicHeader
        brandName={clinic?.name ?? PUBLIC_LAYOUT.brandFallback}
        nav={NAV_LINKS}
        cta={PUBLIC_LAYOUT.bookingCta}
        aria={PUBLIC_LAYOUT.aria}
      />
      <main className="flex-1">
        <PublicHomePage />
      </main>
      <PublicFooter
        facts={PUBLIC_LAYOUT.footer}
        clinic={clinic}
        nav={NAV_LINKS}
        year={realClock().getFullYear()}
      />
    </div>
  )
}

/**
 * The clinic's own name and contact facts, for the header's brand and the footer.
 *
 * Read unscoped and by id, because the tenant is already resolved and a scoped client
 * would re-resolve it from a session nobody holds. A tenant with no clinics is a
 * tenant whose public facts are absent, and `null` is what the header and footer
 * render around.
 */
async function clinicFacts(tenantId: Awaited<ReturnType<typeof resolveTenantId>>) {
  if (tenantId === null) return null
  const row = await unscopedPrisma().clinic.findFirst({
    where: { tenantId, isActive: true },
    select: { name: true, phone: true, address: true },
  })
  if (row === null) return null
  return { tenantId: asTenantId(tenantId), ...row }
}