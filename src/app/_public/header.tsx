/**
 * The public header — `08-ui-design-system.md` §29.
 *
 * 76px, sticky, a translucent white over a blurred page, and a horizontal menu on a
 * wide screen that collapses to a hamburger on a narrow one. The one piece of state is
 * the drawer's open flag, which is the whole reason the component is a client island —
 * the links and the brand are props the server built from the catalog and the clinic's
 * row, and nothing here reads a Persian literal of its own.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Icon } from '@/core/components/icons'
import { cx } from '@/core/lib/cx'
import type { PublicNavLink } from '@/modules/public-site'

interface HeaderProps {
  readonly brandName: string
  readonly nav: readonly PublicNavLink[]
  readonly cta: { readonly href: string; readonly label: string }
  readonly aria: { readonly primaryNav: string; readonly menu: string; readonly mobileNav: string }
}

/** §29 — the header's own height, named once so the sticky offset and the bar agree. */
const HEADER_HEIGHT = 'h-[76px]'

export function PublicHeader({ brandName, nav, cta, aria }: HeaderProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header
      className={cx(
        HEADER_HEIGHT,
        'sticky top-0 z-50 flex items-center border-b border-line',
        'bg-white/92 backdrop-blur-[10px]',
      )}
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-[var(--content-pad)] panel:px-[var(--content-pad-sm)]">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline" aria-label={brandName}>
          <span className="grid size-[30px] place-items-center rounded-md bg-brand text-white">
            <Icon name="home" size="compact" />
          </span>
          <span className="text-[19px] font-extrabold tracking-[var(--ls-heading)] text-ink">
            {brandName}
          </span>
        </Link>

        <nav className="hidden items-center gap-6 panel:flex" aria-label={aria.primaryNav}>
          {nav.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cx(
                'text-[13px] font-semibold no-underline transition-colors',
                isActive(pathname, link.href) ? 'text-brand' : 'text-ink-2 hover:text-brand',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={cta.href}
            className="hidden rounded-lg bg-brand-btn px-4 py-2 text-[13px] font-semibold text-white no-underline transition-colors hover:bg-brand panel:inline-flex"
          >
            {cta.label}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={aria.menu}
            className="grid size-10 place-items-center rounded-md text-ink-2 hover:bg-surface panel:hidden"
          >
            <Icon name={open ? 'close' : 'menu'} size="action" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-[76px] border-b border-line bg-surface panel:hidden">
          <nav className="mx-auto flex w-full max-w-[1200px] flex-col px-[var(--content-pad-sm)] py-3" aria-label={aria.mobileNav}>
            {nav.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-line py-3 text-sm font-semibold text-ink no-underline last:border-b-0"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={cta.href}
              onClick={() => setOpen(false)}
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-brand-btn px-4 py-2.5 text-sm font-semibold text-white no-underline"
            >
              {cta.label}
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  )
}

/** A link is active when the pathname is its page, and the home link is the root. */
function isActive(pathname: string | null, href: string): boolean {
  if (pathname === null) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
