/**
 * The public site's shell — `08-ui-design-system.md` §29's 76px header on every one
 * of `02-architecture.md` §9's eight pages.
 *
 * The panel shell resolves a membership; this one resolves a tenant and nothing else,
 * because a visitor holds no session and the eight pages are the clinic's own. The
 * header's links and the footer's facts are built on the server from the catalog and
 * the tenant's row, and the one client island is the mobile drawer, which is state.
 */

import type { Metadata } from 'next'

import { unscopedPrisma } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { resolveTenantId } from '@/app/_shell/tenant'
import { asTenantId } from '@/core/types'

import { PUBLIC_LAYOUT, type PublicNavLink } from '@/modules/public-site'
import { PublicHeader } from '@/app/_public/header'
import { PublicFooter } from '@/app/_public/footer'

export const metadata: Metadata = {
  title: { default: PUBLIC_LAYOUT.title.default, template: PUBLIC_LAYOUT.title.template },
  description: PUBLIC_LAYOUT.description,
}

/** The links the header renders, in the catalog's order. */
const NAV_LINKS: readonly PublicNavLink[] = PUBLIC_LAYOUT.nav

/**
 * The eight pages' shared chrome. A tenant that the host does not name still gets the
 * header and footer, with the clinic's own facts absent rather than invented.
 */
export default async function PublicLayout({ children }: { readonly children: React.ReactNode }) {
  const tenantId = await resolveTenantId()
  const clinic = await clinicFacts(tenantId)

  return (
    <body className="flex min-h-dvh flex-col bg-bg text-ink">
      <PublicHeader
        brandName={clinic?.name ?? PUBLIC_LAYOUT.brandFallback}
        nav={NAV_LINKS}
        cta={PUBLIC_LAYOUT.bookingCta}
        aria={PUBLIC_LAYOUT.aria}
      />
      <main className="flex-1">{children}</main>
      <PublicFooter facts={PUBLIC_LAYOUT.footer} clinic={clinic} nav={NAV_LINKS} year={realClock().getFullYear()} />
    </body>
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
