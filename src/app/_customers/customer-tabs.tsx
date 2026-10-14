/**
 * The two tabs the customer profile renders under — «خلاصه پرونده» and
 * «نقشه تزریق».
 *
 * The tabs are a `?tab=` search param and links, not client state: the URL is the
 * memory, and the two pages that carry the tabs (`admin/customer/[id]` and
 * `reception/customers/[id]`) read it back. A tab is a link the browser can
 * bookmark, share, and reach with the back button.
 *
 * ## The pill strip
 *
 * The two tabs are a pill strip, not underline tabs: the segment sits in a
 * `bg-surface-sunken` track with `rounded-pill`, each link is itself a pill, and
 * the active link is filled with the brand colour and carries the brand shadow.
 * The `role="tablist"` and `aria-selected` wiring is the ARIA tabs pattern, and
 * the two are links because the URL is the state — a link that navigates is the
 * honest control, and a button that mutates state would be a tab strip the back
 * button cannot undo.
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
    <div
      role="tablist"
      aria-label={summaryLabel}
      className="inline-flex items-center gap-1 self-start rounded-pill bg-surface-sunken p-1"
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
    </div>
  )
}

/** One tab, as a pill inside the strip. */
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
      role="tab"
      aria-selected={active}
      className={cx(
        'inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-semibold no-underline transition-all',
        active
          ? 'bg-brand text-ink-inverse shadow-brand'
          : 'text-ink-2 hover:bg-surface hover:text-ink',
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