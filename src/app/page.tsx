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

import styles from './page.module.css'

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
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>{PANELS_PAGE.title}</h1>
        <p className={styles.lead}>{PANELS_PAGE.lead}</p>
        <div className={styles.cards}>
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

/** One door. The heading is the link, so a card's whole name is its own destination. */
function Card({ href, icon, title, description }: CardProps) {
  return (
    <Link href={href} className={styles.card}>
      <span className={styles.cardIcon}>
        <Icon name={icon} size="action" />
      </span>
      <h2 className={styles.cardTitle}>{title}</h2>
      <p className={styles.cardText}>{description}</p>
      <span className={styles.cardGo}>
        <Icon name="chevronEnd" size="compact" />
      </span>
    </Link>
  )
}
