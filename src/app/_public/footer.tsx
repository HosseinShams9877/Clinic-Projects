/**
 * The public footer — the eight pages' shared base, in the tokens §29's header sets.
 *
 * The clinic's own facts reach this as props the layout read, and a clinic the host
 * does not name renders the catalog's copy without a phone or an address rather than
 * invented ones.
 */

import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import type { PublicNavLink } from '@/modules/public-site'

interface FooterProps {
  /** The catalog's own copy: titles, the about paragraph, the hours and the copyright. */
  readonly facts: {
    readonly aboutTitle: string
    readonly about: string
    readonly linksTitle: string
    readonly contactTitle: string
    readonly hoursTitle: string
    readonly hours: string
    readonly copyright: (year: number) => string
  }
  /** The clinic's row, or `null` when the host names no active clinic. */
  readonly clinic: {
    readonly tenantId: string
    readonly name: string
    readonly phone: string | null
    readonly address: string | null
  } | null
  /** The same links the header shows, so the two menus are one list. */
  readonly nav: readonly PublicNavLink[]
  /** The copyright line's year, from the clock the layout read. */
  readonly year: number
}

export function PublicFooter({ facts, clinic, nav, year }: FooterProps) {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-[var(--content-pad)] py-12 panel:grid-cols-[1.5fr_1fr_1fr] panel:px-[var(--content-pad-sm)]">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-ink">{facts.aboutTitle}</h3>
          <p className="text-sm leading-7 text-ink-2">{facts.about}</p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-ink">{facts.linksTitle}</h3>
          <ul className="flex flex-col gap-2">
            {nav.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-ink-2 no-underline hover:text-brand">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-ink">{facts.contactTitle}</h3>
          <ul className="flex flex-col gap-2.5 text-sm text-ink-2">
            <li className="flex items-center gap-2">
              <Icon name="phone" size="compact" />
              <span>{clinic?.phone ?? '—'}</span>
            </li>
            <li className="flex items-center gap-2">
              <Icon name="location" size="compact" />
              <span>{clinic?.address ?? '—'}</span>
            </li>
            <li className="flex items-center gap-2">
              <Icon name="clock" size="compact" />
              <span>{facts.hours}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-[1200px] px-[var(--content-pad)] py-5 text-center text-xs text-ink-2 panel:px-[var(--content-pad-sm)]">
          {facts.copyright(year)}
        </p>
      </div>
    </footer>
  )
}
