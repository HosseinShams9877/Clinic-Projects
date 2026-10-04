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
 * ## Why the drawer closes by derivation
 *
 * Navigating to a nav link does not unmount this component — the layout stays, the
 * route segment below it swaps — so a drawer that closed only on a click handler
 * would stay open over the page it had just opened. The drawer is therefore keyed to
 * the route it was opened on: `null` means closed, and the open button writes the
 * pathname it was pressed on, so any change to `pathname` — a nav tap, the back
 * button, a redirect — makes the comparison false on the next render. The one
 * `useEffect` left is the Escape key, which is a browser fact rather than a routing
 * one.
 *
 * ## Why the classes are long
 *
 * The shell is the one place in the product whose styling is behavioural rather
 * than presentational: the sidebar is fixed off-canvas below §43's breakpoint and a
 * sticky column above it, and the two are the same element. That is expressed with
 * `panel:` and `max-panel:` rather than with two media queries writing the literal,
 * so the one breakpoint the design system has is the one breakpoint the classes
 * name.
 *
 * The two had agreed on 1000px as the boundary — this element wrote
 * `min-width: 1001px` for the desktop half and `max-width: 1000px` for the mobile
 * half, a partition that leaves 1000px itself on the mobile side; `panel:` is
 * `min-width: 1000px` and `max-panel:` is its complement, which puts 1000px itself
 * on the desktop side. One pixel at one exact viewport width is the whole
 * difference, and §43 says the breakpoint *is* 1000px, so the variant that names the
 * token is the one that reads the section correctly.
 *
 * ## Why no `transform` on the off-canvas sidebar
 *
 * §43 makes the sidebar fixed off-canvas below the breakpoint. Hiding it with a
 * translation would mean reasoning about which way `translateX` points in RTL, and
 * the answer is the one a reviewer has to look up. Pushing the box off the inline
 * edge with a negative `inset-inline-start` of its own width is the same visual
 * result in one logical property, and it is wrong in neither direction.
 *
 * The visibility transition is the one genuinely awkward thing to say in utilities —
 * the close wants `visibility` to wait for the slide to finish and the open wants it
 * not to — so it is written as an arbitrary property pair, one per state, which is
 * the same two declarations the stylesheet had in the same two places.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { NAV_LABELS, SHELL_ARIA } from '@/app/catalog'

import { signOut } from './actions'
import type { NavItem, Panel } from './navigation'
import { panelPath } from './navigation'

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
    <div className="flex min-h-dvh bg-bg">
      <aside
        id="panel-sidebar"
        className={cx(
          'fixed inset-block-0 z-[var(--z-overlay)] flex w-[var(--sidebar-w)] shrink-0 flex-col overflow-y-auto bg-surface shadow-3',
          '[border-inline-end:1px_solid_var(--line)]',
          '[inset-inline-start:calc(var(--sidebar-w)*-1)] invisible',
          '[transition:inset-inline-start_var(--transition-control),visibility_0s_linear_var(--transition-control)]',
          drawerOpen &&
            'visible [inset-inline-start:0] [transition:inset-inline-start_var(--transition-control)]',
          'panel:sticky panel:top-0 panel:h-dvh panel:[inset-inline-start:auto] panel:visible panel:shadow-none panel:[transition:none]',
        )}
        aria-label={panelName}
      >
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <span className="grid size-[38px] shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
            <Icon name="doctor" size="card" />
          </span>
          <span className="text-lg font-bold tracking-[var(--ls-heading)] text-ink">{panelName}</span>
        </div>
        <nav
          className="flex flex-col gap-1 px-3 pt-2 pb-5"
          aria-label={SHELL_ARIA.navigation}
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                'flex items-center gap-3 rounded-sm px-3 py-[10px] text-sm font-semibold text-ink-2 no-underline',
                '[transition:background-color_var(--transition-control),color_var(--transition-control)]',
                'hover:bg-surface-sunken hover:text-ink',
                isActive(pathname, item, home) && 'bg-brand-50 text-brand-700',
              )}
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
          className="hidden max-panel:block max-panel:fixed max-panel:inset-0 max-panel:z-[var(--z-sticky)] max-panel:bg-[var(--overlay)]"
          onClick={() => setOpenOnPath(null)}
          aria-hidden="true"
        />
      ) : null}

      <div className="flex min-w-0 flex-[1_1_auto] flex-col">
        <header className="sticky top-0 z-[var(--z-sticky)] flex h-[var(--topbar-h)] items-center gap-4 border-b border-line bg-surface px-[var(--content-pad)] max-panel:px-[var(--content-pad-sm)]">
          <button
            type="button"
            className={cx(
              'grid size-[38px] shrink-0 place-items-center rounded-sm border-none bg-transparent text-ink-2',
              '[transition:background-color_var(--transition-control),color_var(--transition-control)]',
              'hover:bg-surface-sunken hover:text-ink',
              'panel:hidden',
            )}
            onClick={() => setOpenOnPath(pathname)}
            aria-expanded={drawerOpen}
            aria-controls="panel-sidebar"
            aria-label={SHELL_ARIA.openMenu}
          >
            <Icon name="menu" size="nav" />
          </button>
          <h2 className="min-w-0 text-lg font-bold tracking-[var(--ls-heading)] text-ink">
            {panelName}
          </h2>
          <div className="ms-auto flex items-center gap-3">
            {roleLabel === null ? null : (
              <span className="flex items-center gap-2 rounded-pill bg-surface-sunken px-3 py-1 text-ink-2">
                <span className="grid size-[26px] shrink-0 place-items-center rounded-pill bg-brand-50 text-brand">
                  <Icon name="customer" size="compact" />
                </span>
                {/* §43: "user metadata may hide" below the breakpoint. The role stays
                    announced through the avatar's label, so nothing is lost to a
                    screen reader when the text goes. */}
                <span className="whitespace-nowrap text-sm font-semibold max-panel:hidden">
                  {roleLabel}
                </span>
              </span>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className={cx(
                  'grid size-[38px] shrink-0 place-items-center rounded-sm border-none bg-transparent text-ink-2',
                  '[transition:background-color_var(--transition-control),color_var(--transition-control)]',
                  'hover:bg-surface-sunken hover:text-ink',
                )}
                aria-label={NAV_LABELS.logout}
              >
                <Icon name="logout" size="nav" />
              </button>
            </form>
          </div>
        </header>
        <main className="flex-[1_1_auto] p-[var(--content-pad)] max-panel:p-[var(--content-pad-sm)]">
          {children}
        </main>
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
