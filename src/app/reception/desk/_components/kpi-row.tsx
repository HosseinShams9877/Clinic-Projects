/**
 * The desk's counters — «مانده حساب», «تماس امروز», «نوبت امروز».
 *
 * The demo renders them as one row of equal cards on desktop and a two-by-two
 * grid below the panel breakpoint, which is `08-ui-design-system.md` §43's one
 * breakpoint (1000px) — the `panel:` variant, not Tailwind's `lg:`.
 *
 * ## Why the debt card is a link and the others are not
 *
 * «مانده حساب» is the one number that has a *page* behind it: a click takes the
 * desk to `/reception/debts`, which is where the money is worked. The other two
 * are read as context — the calls are made from the reminders panel, and the
 * appointments are worked from the day grid — so they stay plain cards.
 *
 * Every Persian string comes from `DESK_PAGE` in `@/app/catalog`.
 */

import Link from 'next/link'

import { Icon, type IconName } from '@/core/components/icons'
import { formatMoney, formatNumber } from '@/core/localization'
import { cx } from '@/core/lib'

import { DESK_PAGE } from '@/app/catalog'

/** One KPI, as the row renders it. */
interface KpiCardProps {
  readonly icon: IconName
  readonly tone: 'call' | 'appointment' | 'money'
  readonly value: string
  readonly label: string
  readonly hint?: string
  /** When set, the card is a link to this path. */
  readonly href?: string
}

/** The tone's icon square background and foreground. */
const TONE_CLASS: Readonly<Record<KpiCardProps['tone'], string>> = {
  call: 'bg-warning-bg text-warning',
  appointment: 'bg-info-bg text-info',
  money: 'bg-success-bg text-success',
}

/**
 * The three cards.
 *
 * Two columns below the panel breakpoint and three at or above it, so the row
 * reads as one line on the desktop the demo is drawn for.
 */
export function KpiRow({
  calls,
  appointments,
  debtRial,
  debtors,
  debtHref,
}: {
  calls: number
  appointments: number
  debtRial: bigint
  debtors: number
  debtHref: string
}) {
  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-3">
      <KpiCard
        icon="debt"
        tone="money"
        value={formatMoney(debtRial)}
        label={DESK_PAGE.kpi.debt}
        hint={`${formatNumber(debtors)} ${DESK_PAGE.kpi.debtorsSuffix}`}
        href={debtHref}
      />
      <KpiCard
        icon="phone"
        tone="call"
        value={formatNumber(calls)}
        label={DESK_PAGE.kpi.calls}
      />
      <KpiCard
        icon="calendar"
        tone="appointment"
        value={formatNumber(appointments)}
        label={DESK_PAGE.kpi.appointments}
      />
    </div>
  )
}

function KpiCard({ icon, tone, value, label, hint, href }: KpiCardProps) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-ink-2">{label}</span>
        <span className="truncate text-xl font-bold text-ink tabular-nums panel:text-2xl">
          {value}
        </span>
        {hint === undefined ? null : (
          <span className="text-xs text-ink-2">{hint}</span>
        )}
      </div>
      <span
        className={cx(
          'grid size-10 shrink-0 place-items-center rounded-md',
          TONE_CLASS[tone],
        )}
        aria-hidden="true"
      >
        <Icon name={icon} />
      </span>
    </div>
  )

  if (href === undefined) {
    return (
      <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-card">
        {body}
      </article>
    )
  }

  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-card no-underline transition-colors hover:border-brand-300 hover:bg-brand-50"
    >
      {body}
    </Link>
  )
}