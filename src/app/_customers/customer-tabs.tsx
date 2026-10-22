/**
 * The tabs the customer profile renders under — «خلاصه پرونده», «سوابق درمان», 
 * «مالی و پرداخت‌ها», «نقشه تزریق» و «یادداشت‌های داخلی».
 *
 * The tabs are a `?tab=` search param and links, not client state: the URL is the
 * memory, and the pages that carry the tabs read it back.
 */

import Link from 'next/link'
import { cx } from '@/core/lib'

export type CustomerTab = 'summary' | 'history' | 'payments' | 'injections' | 'internal'

export function CustomerTabs({
  basePath,
  active,
  summaryLabel,
  historyLabel = 'سوابق درمان',
  paymentsLabel = 'مالی و پرداخت‌ها',
  injectionsLabel,
}: {
  readonly basePath: string
  readonly active: CustomerTab
  readonly summaryLabel: string
  readonly historyLabel?: string
  readonly paymentsLabel?: string
  readonly injectionsLabel: string
}) {
  return (
    <div
      role="tablist"
      aria-label={summaryLabel}
      className="inline-flex items-center gap-1 self-start overflow-x-auto rounded-pill bg-surface-sunken p-1"
    >
      <TabLink
        href={basePath}
        active={active === 'summary'}
        label={summaryLabel}
      />
      <TabLink
        href={`${basePath}?tab=history`}
        active={active === 'history'}
        label={historyLabel}
      />
      <TabLink
        href={`${basePath}?tab=payments`}
        active={active === 'payments'}
        label={paymentsLabel}
      />
      <TabLink
        href={`${basePath}?tab=injections`}
        active={active === 'injections'}
        label={injectionsLabel}
      />
      <TabLink
        href={`${basePath}?tab=internal`}
        active={active === 'internal'}
        label="یادداشت‌های داخلی"
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
        'whitespace-nowrap rounded-pill px-4 py-2 text-sm font-semibold no-underline transition-all',
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
  if (value === 'payments') return 'payments'
  if (value === 'history') return 'history'
  if (value === 'internal') return 'internal'
  return 'summary'
}