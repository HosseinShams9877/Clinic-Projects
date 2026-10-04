/**
 * The client half of the panel shell.
 *
 * Two things need the browser, and only these two:
 *
 * - **The active nav item.** `usePathname()` says which of the panel's pages the
 *   person is on, so the link that led there is the one §26 styles as active. The
 *   server could not do this: the shell is rendered for the route segment the
 *   layout owns, and a page's own pathname is a client fact unless the shell were
 *   rebuilt per route, which the App Router does not do for a layout.
 * - **The mobile drawer.** §43's below-1000px behaviour is an open/closed state,
 *   which is `useState` and nothing more.
 *
 * Everything else — the session, the permission set, the nav items themselves — is
 * resolved on the server and handed down as props, so this component holds no
 * security fact and no Persian literal. The labels arrived from
 * `src/app/catalog.ts` by way of `navigation.ts`.
 *
 * ## Why closing the drawer is `useEffect` and not `onClick`
 *
 * Navigating to the link's route does not unmount this component — the layout
 * stays, the route segment below it swaps — so a drawer that closed only on a
 * click handler would stay open over the page it had just opened. The pathname
 * changing is the reliable signal that a navigation happened, and watching it is
 * one effect with one job.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Icon } from '@/core/components/icons'

import { NAV_LABELS, SHELL_ARIA } from '@/app/catalog'

import { signOut } from './actions'
import type { NavItem, Panel } from './navigation'
import { panelPath } from './navigation'

import styles from './PanelShell.module.css'

export interface PanelChromeProps {
  readonly panel: Panel
  /** The panel's Persian name, for the topbar. */
  readonly panelName: string
  readonly nav: readonly NavItem[]
  /**
   * The Persian role label for the topbar's chip, or `null` for the customer panel,
   * which has no role (`09-security.md` §7).
   */
  readonly roleLabel: string | null
  readonly children: React.ReactNode
}

export function PanelChrome({ panel, panelName, nav, roleLabel, children }: PanelChromeProps) {
  const pathname = usePathname()

  // The drawer belongs to the route it was opened on, so a navigation closes it by
  // derivation rather than by an effect: any change to `pathname` — a nav tap, the
  // back button, a redirect — makes the comparison below false on the next render.
  // `null` means closed, and the open button writes the route it was pressed on.
  const [openOnPath, setOpenOnPath] = useState<string | null>(null)
  const drawerOpen = openOnPath === pathname

  // Escaping closes the drawer too, so a keyboard user is not stranded behind a
  // scrim that a pointer user clicks away.
  useEffect(() => {
    if (!drawerOpen) return
    const onClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenOnPath(null)
    }
    window.addEventListener('keydown', onClose)
    return () => window.removeEventListener('keydown', onClose)
  }, [drawerOpen])

  const home = panelPath(panel)

  return (
    <div className={styles.shell}>
      <aside
        id="panel-sidebar"
        className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ''}`}
        aria-label={panelName}
      >
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="doctor" size="card" />
          </span>
          <span className={styles.brandName}>{panelName}</span>
        </div>
        <nav className={styles.nav} aria-label={SHELL_ARIA.navigation}>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${isActive(pathname, item, home) ? styles.navLinkActive : ''}`}
              aria-current={isActive(pathname, item, home) ? 'page' : undefined}
            >
              <Icon name={item.icon} size="nav" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {drawerOpen ? (
        <div
          className={`${styles.overlay} ${styles.overlayOpen}`}
          onClick={() => setOpenOnPath(null)}
          aria-hidden="true"
        />
      ) : null}

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.hamburger}`}
            onClick={() => setOpenOnPath(pathname)}
            aria-expanded={drawerOpen}
            aria-controls="panel-sidebar"
            aria-label={SHELL_ARIA.openMenu}
          >
            <Icon name="menu" size="nav" />
          </button>
          <h2 className={styles.topbarTitle}>{panelName}</h2>
          <div className={styles.topbarEnd}>
            {roleLabel === null ? null : (
              <span className={styles.chip}>
                <span className={styles.avatar}>
                  <Icon name="customer" size="compact" />
                </span>
                <span className={styles.chipLabel}>{roleLabel}</span>
              </span>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className={styles.iconButton}
                aria-label={NAV_LABELS.logout}
              >
                <Icon name="logout" size="nav" />
              </button>
            </form>
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  )
}

/**
 * Whether a nav item is the one for the route the person is on.
 *
 * A panel's home is matched exactly, because every route in the panel starts with
 * its own path — `/admin` against `/admin/customers` would be a false positive that
 * left the home link permanently active. Any other page matches its own route and
 * the ones under it, so `/admin/customers/123` still marks «مشتریان».
 */
function isActive(pathname: string, item: NavItem, home: string): boolean {
  if (item.href === home) return pathname === home
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
