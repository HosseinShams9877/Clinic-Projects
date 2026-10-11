'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Icon } from '@/core/components/icons'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from '@/core/components/popover'
import { cx } from '@/core/lib'

import { NAV_LABELS, SHELL_ARIA } from '@/app/catalog'

import { TOPBAR } from './catalog'
import { NotificationBell } from './NotificationBell'
import type { NotificationEntry } from './notifications'
import { TopbarSearch } from './TopbarSearch'
import { signOut } from './actions'
import type { NavItem, Panel } from './navigation'
import { panelPath } from './navigation'

export interface PanelChromeProps {
  readonly panel: Panel
  readonly panelName: string
  readonly nav: readonly NavItem[]
  readonly roleLabel: string | null
  /** The long Jalali date the topbar chip shows, computed by the shell. */
  readonly dateLabel: string
  /** The notifications the bell lists, read once by the shell. */
  readonly notifications: readonly NotificationEntry[]
  /** How many of them are unread — the bell's badge. */
  readonly unreadCount: number
  /** Where «همه اعلان‌ها» leads. */
  readonly notificationsHref: string
  readonly children: React.ReactNode
}

export function PanelChrome({ panel, panelName, nav, roleLabel, dateLabel, notifications, unreadCount, notificationsHref, children }: PanelChromeProps) {
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
          'fixed top-0 bottom-0 z-[var(--z-overlay)] flex h-dvh w-[var(--sidebar-w)] shrink-0 flex-col overflow-y-auto bg-sidebar-dark text-ink-inverse shadow-3',
          '[border-inline-end:1px_solid_var(--sidebar-dark-2)]',
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
          <span className="text-lg font-bold tracking-[var(--ls-heading)] text-ink-inverse">{panelName}</span>
        </div>
        <nav
          className="flex flex-1 flex-col gap-1 px-3 pt-2 pb-5"
          aria-label={SHELL_ARIA.navigation}
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                'flex items-center gap-3 rounded-sm px-3 py-[10px] text-sm font-semibold no-underline',
                '[color:color-mix(in_srgb,var(--ink-inverse),transparent_28%)]',
                '[transition:background-color_var(--transition-control),color_var(--transition-control)]',
                'hover:bg-sidebar-dark-2 hover:text-ink-inverse',
                isActive(pathname, item, home) && 'bg-brand text-ink-inverse!',
              )}
              aria-current={isActive(pathname, item, home) ? 'page' : undefined}
            >
              <Icon name={item.icon} size="nav" />
              <span className="flex-1">{item.label}</span>
              {item.badge === undefined ? null : (
                <span className="grid min-w-5 place-items-center rounded-pill bg-danger px-[6px] py-[1px] text-xs font-bold text-ink-inverse tabular-nums">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="mt-auto px-3 pb-5">
          <button
            type="submit"
            className={cx(
              'flex w-full items-center gap-3 rounded-sm px-3 py-[10px] text-sm font-semibold no-underline',
              '[color:color-mix(in_srgb,var(--ink-inverse),transparent_28%)]',
              '[transition:background-color_var(--transition-control),color_var(--transition-control)]',
              'border-none bg-transparent hover:bg-sidebar-dark-2 hover:text-ink-inverse',
            )}
          >
            <Icon name="logout" size="nav" />
            <span className="flex-1 text-start">{NAV_LABELS.logout}</span>
          </button>
        </form>
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

          {panel === 'account' ? (
            <label className="flex min-w-0 max-w-md flex-1 items-center gap-2 rounded-pill bg-surface-sunken px-4 py-2 text-ink-2">
              <Icon name="search" size="compact" />
              <input
                type="search"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
                placeholder={TOPBAR.searchPlaceholder}
                aria-label={TOPBAR.searchLabel}
              />
            </label>
          ) : (
            <TopbarSearch
              panel={panel}
              basePath={`/${panel}/customers`}
              detailPath={panel === 'reception' ? '/reception/customers' : null}
            />
          )}

          <div className="ms-auto flex items-center gap-2">
            <span className="flex items-center gap-2 rounded-pill bg-surface-2 px-3 py-1 text-sm text-ink-2 max-panel:hidden">
              <Icon name="calendar" size="compact" />
              <span className="whitespace-nowrap tabular-nums">{dateLabel}</span>
            </span>

            <button
              type="button"
              className={cx(
                'grid size-[38px] shrink-0 place-items-center rounded-sm border-none bg-transparent text-ink-2 max-panel:hidden',
                '[transition:background-color_var(--transition-control),color_var(--transition-control)]',
                'hover:bg-surface-sunken hover:text-ink',
              )}
              aria-label={TOPBAR.messagesLabel}
            >
              <Icon name="message" size="nav" />
            </button>

            <NotificationBell panel={panel} items={notifications} unreadCount={unreadCount} allHref={notificationsHref} />

            {roleLabel === null ? null : (
              <PopoverRoot>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cx(
                      'flex items-center gap-2 rounded-pill border-none bg-surface-sunken px-2 py-1 text-ink-2',
                      '[transition:background-color_var(--transition-control)] hover:bg-surface-2',
                    )}
                    aria-label={TOPBAR.menuLabel}
                  >
                    <span className="grid size-[26px] shrink-0 place-items-center rounded-pill bg-brand-50 text-brand">
                      <Icon name="customer" size="compact" />
                    </span>
                    <span className="whitespace-nowrap text-sm font-semibold max-panel:hidden">{roleLabel}</span>
                    <Icon name="chevronDown" size="compact" />
                  </button>
                </PopoverTrigger>
                <PopoverPortal>
                  <PopoverContent align="end" sideOffset={8} className="w-56 p-0">
                    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-brand-50 text-brand">
                        <Icon name="customer" size="compact" />
                      </span>
                      <span className="text-sm font-semibold text-ink">{roleLabel}</span>
                    </div>
                    <form action={signOut}>
                      <button
                        type="submit"
                        className={cx(
                          'flex w-full items-center gap-3 border-none bg-transparent px-4 py-3 text-start text-sm font-semibold text-ink-2',
                          '[transition:background-color_var(--transition-control),color_var(--transition-control)]',
                          'hover:bg-surface-sunken hover:text-danger',
                        )}
                      >
                        <Icon name="logout" size="compact" />
                        {NAV_LABELS.logout}
                      </button>
                    </form>
                  </PopoverContent>
                </PopoverPortal>
              </PopoverRoot>
            )}
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