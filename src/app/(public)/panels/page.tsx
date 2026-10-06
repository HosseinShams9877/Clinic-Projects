/**
 * «ورود کاربران» — `02-architecture.md` §9's `panels.html`, on the public site.
 *
 * The root URL already serves the platform's own `panels.html`, so the public site's
 * page is the same two doors under the public header and footer, for a person who
 * arrived at the site and is looking for the entrance. The two cards are the two
 * credentials the two doors ask for, and the copy is the whole reason the page exists.
 */

import Link from 'next/link'

import { Icon } from '@/core/components/icons'
import { PUBLIC_PANELS, PUBLIC_LAYOUT } from '@/modules/public-site'

export const metadata = { title: PUBLIC_PANELS.title }

export default function PanelsPage() {
  const copy = PUBLIC_PANELS

  return (
    <section className="px-[var(--content-pad)] py-16 panel:px-[var(--content-pad-sm)]">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-3xl font-bold text-ink">{copy.title}</h1>
          <p className="text-sm text-ink-2">{copy.lead}</p>
        </div>
        <div className="flex w-full flex-wrap justify-center gap-6">
          <Door
            href="/login"
            icon="staff"
            title={copy.staff.title}
            description={copy.staff.description}
            action={copy.staff.action}
          />
          <Door
            href="/account/login"
            icon="customer"
            title={copy.customer.title}
            description={copy.customer.description}
            action={copy.customer.action}
          />
        </div>
        <p className="text-center text-xs text-ink-2">{PUBLIC_LAYOUT.brandFallback}</p>
      </div>
    </section>
  )
}

function Door({
  href,
  icon,
  title,
  description,
  action,
}: {
  readonly href: string
  readonly icon: 'staff' | 'customer'
  readonly title: string
  readonly description: string
  readonly action: string
}) {
  return (
    <Link
      href={href}
      className="relative flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-lg border border-line bg-surface p-7 no-underline shadow-2 transition-[box-shadow,border-color] hover:border-line-2 hover:shadow-3"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-50 text-brand">
        <Icon name={icon} size="action" />
      </span>
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      <p className="text-md text-ink-2">{description}</p>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-brand">
        {action}
        <Icon name="chevronStart" size="compact" />
      </span>
    </Link>
  )
}
