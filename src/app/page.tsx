/**
 * The entry page — `02-architecture.md` §9's `panels.html`, served at the root URL.
 *
 * §9 puts this page in the public site and gives it one job: to present the two ways
 * in. Not three, and not one: the staff door and the customer door, and the
 * difference between them is the credential each asks for — a password for the
 * people who work at the clinic, a one-time code for the people it treats. That
 * difference is the copy on the two cards, because it is what a person standing at
 * the wrong door needs to read to walk to the right one.
 *
 * ## Why the root URL is this page and not a login
 *
 * The two logins are two routes, and a root that redirected to one of them would be
 * a root that picked a door for a person who has not said which they are. This page
 * asks instead, and the two cards are the two answers.
 *
 * ## Why the page reads the session
 *
 * A person who is already signed in and opens the root URL is a person the platform
 * can send to their panel instead of asking them again. That read is done here, on
 * the server, and it is the same resolution the panels themselves make — so a
 * signed-in manager arriving at `/` goes to `/admin` and a signed-in customer to
 * `/account`, and the two are never sent to each other's doors. A session that does
 * not resolve — missing, expired, revoked — shows the two cards, which is the
 * honest answer for a person with no session.
 *
 * ## What is not here
 *
 * The public site itself: `index.html` is `public-site`'s, and the eight pages §9
 * gives it are Phase 3. This is the one surface of the eight that Phase 1 needs,
 * because it is the one the two logins lead back to.
 *
 * ## The classes
 *
 * `08-ui-design-system.md` has no `panels.html` section, so the page composes the
 * same tokens the login pages do: a centred column, a §12-style card, the §3
 * heading scale. The one breakpoint is `panel` (§43), and its narrow-side padding
 * is `--content-pad-sm` — a token the scale does not reach (16px is on it, but the
 * token is what the §7 constant is *for*), so it is an arbitrary value while
 * everything else on the page names a theme utility.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Icon } from '@/core/components/icons'
import { getTenantContext, getTenantContextForCustomer, unscopedPrisma } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import { getEnv } from '@/core/config/env'
import { LOGIN_LABELS } from '@/modules/auth'

import { PANELS_PAGE } from '@/app/catalog'
import { panelPath, ROLE_PANEL } from '@/app/_shell/navigation'
import { sessionToken } from '@/app/_shell/session'

export const metadata: Metadata = { title: PANELS_PAGE.title }

export default async function PanelsPage() {
  await redirectToPanelIfExists()
  return <PanelsEntry />
}

/**
 * Sends a signed-in person to their panel, or renders nothing to send them to.
 *
 * Both resolvers are tried, because a session is one of the two halves of `Session`'s
 * pair and the cookie does not say which. Each is allowed to fail — the failures are
 * the reasons a person should see this page rather than be sent somewhere — so a
 * thrown `TenantResolutionError` is caught and read as "no session to use here".
 */
async function redirectToPanelIfExists(): Promise<void> {
  const token = await sessionToken()
  if (token === null) return

  const now = realClock()
  const multiTenant = getEnv().multiTenant

  const staff = await getTenantContext({ client: unscopedPrisma(), token, now, multiTenant }).catch(() => null)
  if (staff !== null) {
    redirect(panelPath(ROLE_PANEL[staff.role]))
  }

  const customer = await getTenantContextForCustomer({ client: unscopedPrisma(), token, now }).catch(() => null)
  if (customer !== null) {
    redirect(panelPath('account'))
  }
}

/** The two doors, side by side on a wide screen and stacked on a narrow one. */
function PanelsEntry() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 px-[var(--content-pad)] panel:p-7 panel:px-[var(--content-pad-sm)]">
      <div className="flex w-full max-w-[880px] flex-col items-center gap-6">
        <h1 className="text-3xl font-extrabold tracking-[var(--ls-heading)] text-ink">
          {PANELS_PAGE.title}
        </h1>
        <p className="text-center text-lg text-ink-2">{PANELS_PAGE.lead}</p>
        <div className="flex w-full flex-wrap justify-center gap-6">
          <Card
            href="/login"
            icon="staff"
            title={LOGIN_LABELS.staffTitle}
            description={PANELS_PAGE.staff.description}
          />
          <Card
            href="/account/login"
            icon="customer"
            title={LOGIN_LABELS.customerTitle}
            description={PANELS_PAGE.customer.description}
          />
        </div>
      </div>
    </main>
  )
}

interface CardProps {
  readonly href: string
  readonly icon: 'staff' | 'customer'
  readonly title: string
  readonly description: string
}

/**
 * One door. The heading is the link, so a card's whole name is its own destination.
 *
 * The whole card is one `<Link>`, so the hover is the card's and not a button inside
 * it — which is also why the transition names `box-shadow` and `border-color`
 * rather than reading `--transition-control`: a card is not a control, and §9's
 * transition is the one §9's states get.
 */
function Card({ href, icon, title, description }: CardProps) {
  return (
    <Link
      href={href}
      className="relative flex min-w-0 flex-[1_1_340px] flex-col gap-3 rounded-lg border border-line bg-surface p-7 shadow-2 no-underline transition-[box-shadow,var(--transition-control),border-color] hover:border-line-2 hover:shadow-3"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
        <Icon name={icon} size="action" />
      </span>
      <h2 className="text-xl font-bold tracking-[var(--ls-heading)] text-ink">{title}</h2>
      <p className="text-md text-ink-2">{description}</p>
      {/* The "go" chevron, which reads as the card's destination and points the
          reading way — `chevronEnd` mirrors in RTL, so it points left here. */}
      <span className="flex items-center text-brand">
        <Icon name="chevronEnd" size="compact" />
      </span>
    </Link>
  )
}
