/**
 * The desk's four counters — «فوری», «تماس امروز», «نوبت امروز», «مانده حساب».
 *
 * The demo renders them as one row of equal cards on desktop and a two-by-two
 * grid below the panel breakpoint, which is `08-ui-design-system.md` §43's one
 * breakpoint (1000px) — the `panel:` variant, not Tailwind's `lg:`.
 *
 * Every Persian string comes from `DESK_PAGE` in `@/app/catalog`.
 */

import { Icon, type IconName } from '@/core/components/icons'
import { formatMoney, formatNumber } from '@/core/localization'
import { cx } from '@/core/lib'

import { DESK_PAGE } from '@/app/catalog'

/** One KPI, as the row renders it. */
interface KpiCardProps {
  readonly icon: IconName
  readonly tone: 'urgent' | 'call' | 'appointment' | 'money'
  readonly value: string
  readonly label: string
  readonly hint?: string
}

/** The tone's icon square background and foreground. */
const TONE_CLASS: Readonly<Record<KpiCardProps['tone'], string>> = {
  urgent: 'bg-brand-50 text-brand',
  call: 'bg-warning-bg text-warning',
  appointment: 'bg-info-bg text-info',
  money: 'bg-success-bg text-success',
}

/**
 * The four cards.
 *
 * Two columns below the panel breakpoint and four at or above it — 2×2 then 1×4,
 * so the row reads as one line on the desktop the demo is drawn for.
 */
export function KpiRow({
  urgent,
  calls,
  appointments,
  debtRial,
  debtors,
}: {
  urgent: number
  calls: number
  appointments: number
  debtRial: bigint
  debtors: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 panel:grid-cols-4">
      <KpiCard
        icon="alert"
        tone="urgent"
        value={formatNumber(urgent)}
        label={DESK_PAGE.kpi.urgent}
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
      <KpiCard
        icon="debt"
        tone="money"
        value={formatMoney(debtRial)}
        label={DESK_PAGE.kpi.debt}
        hint={`${formatNumber(debtors)} ${DESK_PAGE.kpi.debtorsSuffix}`}
      />
    </div>
  )
}

function KpiCard({ icon, tone, value, label, hint }: KpiCardProps) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-card">
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
    </article>
  )
}