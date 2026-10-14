/**
 * The two tabs the customer profile renders under — «خلاصه پرونده» and
 * «نقشه تزریق».
 *
 * The tabs are a `?tab=` search param and links, not client state: the URL is the
 * memory, and the two pages that carry the tabs (`admin/customer/[id]` and
 * `reception/customers/[id]`) read it back. A tab is a link the browser can
 * bookmark, share, and reach with the back button, and a client-side tab strip
 * would give up all three for no benefit at this size.
 */

import Link from 'next/link'

import { cx } from '@/core/lib'

export type CustomerTab = 'summary' | 'injections'

export function CustomerTabs({
  basePath,
  active,
  summaryLabel,
  injectionsLabel,
}: {
  readonly basePath: string
  readonly active: CustomerTab
  readonly summaryLabel: string
  readonly injectionsLabel: string
}) {
  return (
    <nav
      className="flex flex-wrap items-center gap-1 border-b border-line"
      aria-label={summaryLabel}
    >
      <TabLink
        href={basePath}
        active={active === 'summary'}
        label={summaryLabel}
      />
      <TabLink
        href={`${basePath}?tab=injections`}
        active={active === 'injections'}
        label={injectionsLabel}
      />
    </nav>
  )
}

/** One tab, as the strip renders it. */
function TabLink({
  href,
  active,
  label,
}: {
  readonly href: string
  readonly active: boolean
  readonly label: string
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative -mb-px inline-flex items-center gap-2 rounded-t-sm px-4 py-3 text-sm font-semibold no-underline transition-colors',
        active
          ? 'border-b-2 border-brand text-brand-700'
          : 'border-b-2 border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      {label}
    </Link>
  )
}

/** The `?tab=` value, or `summary` when the URL does not carry one. */
export function tabFromParam(value: string | string[] | undefined): CustomerTab {
  if (value === 'injections') return 'injections'
  return 'summary'
}