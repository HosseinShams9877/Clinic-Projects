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
  readonly panelName: string
  readonly nav: readonly NavItem[]
  readonly roleLabel: string | null
  readonly children: React.ReactNode
}

export function PanelChrome({ panel, panelName, nav, roleLabel, children }: PanelChromeProps) {
  const pathname = usePathname()

  // The drawer belongs to the route it was opened on, so a navigation closes it by
  // derivation rather than by an effect: any change to `pathname` — a nav tap, the
  // back button, a redirect — makes the comparison below false on the next render.
  const [openOnPath, setOpenOnPath] = useState<string | null>(null)
  const drawerOpen = openOnPath === pathname

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
          'fixed top-0 bottom-0 z-[var(--z-overlay)] flex h-dvh w-[var(--sidebar-w)] shrink-0 flex-col overflow-y-auto bg-surface shadow-3',
          '[border-inline-end:1px_solid_var(--line)]',
          drawerOpen
            ? 'visible [inset-inline-start:0] [transition:inset-inline-start_var(--transition-control)]'
            : 'invisible [inset-inline-start:calc(var(--sidebar-w)*-1)] [transition:inset-inline-start_var(--transition-control),visibility_0s_linear_var(--transition-control)]',
          'panel:sticky panel:h-dvh panel:[inset-inline-start:auto]! panel:visible! panel:shadow-none panel:[transition:none]',
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

function isActive(pathname: string, item: NavItem, home: string): boolean {
  if (item.href === home) return pathname === home
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}