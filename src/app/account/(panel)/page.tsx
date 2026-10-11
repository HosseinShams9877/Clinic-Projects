/**
 * The customer panel's home — `02-architecture.md` §9's `account/dashboard.html`.
 *
 * The demo's own arrangement: a greeting with the person's name and a «رزرو نوبت جدید»
 * button, a prominent nearest-appointment banner, three KPI tiles (upcoming count,
 * sessions remaining in the open course, outstanding balance), and two cards — the
 * latest care instructions and the course's suggested next session.
 *
 * The panel has no permission primitive (`09-security.md` §7): the scope is the
 * `customerId` the session resolved, in every `where` clause, taken from the resolution
 * and nowhere else. The five reads are one `runInTenantScope` so the KPIs and the banner
 * are one person's record at one instant, not five that a booking could land between.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { CycleStatus } from '@/core/constants'
import { realClock } from '@/core/lib/clock'
import { cx } from '@/core/lib'
import {
  dateToLocalDate,
  formatDate,
  formatMoney,
  formatNumber,
  toPersianDigits,
} from '@/core/localization'
import { CUSTOMER_PANEL, ownCareInstructions, readOwnProfile } from '@/modules/customers'
import { customerAppointments } from '@/modules/appointments'
import { customerCycles } from '@/modules/cycles'
import { customerDebts } from '@/modules/debts'

import { ACCOUNT_DASHBOARD } from '@/app/account/catalog'
import { requireCustomerPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMER_PANEL.dashboard.title }

export default async function AccountDashboardPage() {
  const session = await requireCustomerPanel()
  const now = realClock()

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const scope = { tx, tenantId: session.tenantId, customerId: session.customerId }
    const [profile, appointments, cycles, instructions, debts] = await Promise.all([
      readOwnProfile(scope),
      customerAppointments({ ...scope, now }),
      customerCycles(scope),
      ownCareInstructions(scope),
      customerDebts({ ...scope, now }),
    ])
    return {
      firstName: profile?.firstName ?? '',
      upcoming: appointments.upcoming,
      cycle: cycles.find((row) => row.status === CycleStatus.Active) ?? cycles[0] ?? null,
      care: instructions[0] ?? null,
      balance: debts.reduce((total, row) => total + (row.balance > 0n ? row.balance : 0n), 0n),
    }
  })

  const next = data.upcoming[0] ?? null
  const remaining =
    data.cycle !== null && data.cycle.totalSessions > 0
      ? Math.max(0, data.cycle.totalSessions - data.cycle.completedSessions)
      : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{ACCOUNT_DASHBOARD.greeting(data.firstName)}</h1>
          <p className="text-sm text-ink-2">{ACCOUNT_DASHBOARD.lead}</p>
        </div>
        <Link
          href="/booking"
          className="inline-flex items-center gap-2 rounded-sm bg-brand-btn px-[18px] py-[10px] text-sm font-semibold text-ink-inverse no-underline shadow-brand hover:bg-brand-600"
        >
          <Icon name="add" size="compact" />
          {ACCOUNT_DASHBOARD.book}
        </Link>
      </div>

      <NextBanner next={next} />

      <div className="grid grid-cols-1 gap-3 panel:grid-cols-3">
        <KpiTile label={ACCOUNT_DASHBOARD.kpi.upcoming} value={formatNumber(data.upcoming.length)} icon="appointment" tone="bg-info-bg text-info" />
        <KpiTile
          label={ACCOUNT_DASHBOARD.kpi.remaining}
          value={remaining === null ? '—' : formatNumber(remaining)}
          sub={data.cycle !== null && data.cycle.totalSessions > 0 ? ACCOUNT_DASHBOARD.kpi.remainingSub(data.cycle.totalSessions) : undefined}
          icon="treatment"
          tone="bg-ok-bg text-ok"
        />
        <KpiTile
          label={ACCOUNT_DASHBOARD.kpi.balance}
          value={formatMoney(data.balance, { unit: false })}
          sub={ACCOUNT_DASHBOARD.kpi.toman}
          icon="debt"
          tone="bg-warn-bg text-warn"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 panel:grid-cols-2">
        <LatestCare care={data.care} />
        <SuggestedSession cycle={data.cycle} />
      </div>
    </div>
  )
}

/* ── The nearest-appointment banner ───────────────────────────────────────────── */

function NextBanner({
  next,
}: {
  readonly next: {
    readonly scheduledAt: Date
    readonly localTime: string
    readonly serviceName: string | null
    readonly doctorName: string | null
    readonly depositAmount: bigint
  } | null
}) {
  const copy = ACCOUNT_DASHBOARD.next
  if (next === null) {
    return (
      <section className="rounded-lg border border-line bg-surface px-5 py-8 text-center text-sm text-ink-3">
        {copy.empty}
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-brand-100 bg-brand-50 p-5 panel:flex-row panel:items-center panel:justify-between">
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold text-brand-700">{copy.label}</span>
        <span className="text-lg font-bold text-ink">{next.serviceName ?? '—'}</span>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
          <FactRow icon="calendar" label={formatDate(dateToLocalDate(next.scheduledAt), 'long')} />
          <FactRow icon="clock" label={`${copy.at} ${toPersianDigits(next.localTime)}`} />
          {next.doctorName === null ? null : (
            <FactRow icon="doctor" label={`${copy.withDoctor} ${next.doctorName}`} />
          )}
        </div>
      </div>
      <div className="flex flex-col items-start gap-3 panel:items-end">
        {next.depositAmount > 0n ? (
          <span className="inline-flex rounded-pill bg-surface px-2 py-1 text-xs font-semibold text-ink-2 tabular-nums">
            {`${copy.deposit} ${formatMoney(next.depositAmount)}`}
          </span>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/account/appointments"
            className="inline-flex items-center rounded-sm border border-line-2 bg-surface px-3 py-[6px] text-xs font-semibold text-ink-2 no-underline hover:bg-surface-2"
          >
            {copy.details}
          </Link>
          <Link
            href="/account/appointments"
            className="inline-flex items-center rounded-sm border border-line-2 bg-surface px-3 py-[6px] text-xs font-semibold text-ink-2 no-underline hover:bg-surface-2"
          >
            {copy.reschedule}
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ── The latest care ──────────────────────────────────────────────────────────── */

function LatestCare({
  care,
}: {
  readonly care: { readonly id: string; readonly serviceName: string; readonly afterCare: string | null } | null
}) {
  const copy = ACCOUNT_DASHBOARD.care
  return (
    <SectionCard
      title={copy.title}
      icon="treatment"
      action={
        <Link href="/account/care" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 no-underline hover:underline">
          {copy.all}
          <Icon name="chevronEnd" size="compact" />
        </Link>
      }
    >
      {care === null || care.afterCare === null ? (
        <p className="text-sm text-ink-3">{copy.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-ink">{care.serviceName}</span>
          <p className="whitespace-pre-line text-sm leading-7 text-ink-2">{care.afterCare}</p>
        </div>
      )}
    </SectionCard>
  )
}

/* ── The suggested next session ─────────────────────────────────────────────────── */

function SuggestedSession({
  cycle,
}: {
  readonly cycle: {
    readonly serviceName: string
    readonly nextDueDate: Date | null
    readonly totalSessions: number
    readonly completedSessions: number
  } | null
}) {
  const copy = ACCOUNT_DASHBOARD.suggested
  return (
    <SectionCard title={copy.title} icon="appointment">
      {cycle === null ? (
        <p className="text-sm text-ink-3">{copy.empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold text-ink">{cycle.serviceName}</span>
          <span className="text-sm text-ink-2">
            {toPersianDigits(
              CUSTOMER_PANEL.dashboard.cycle.progress(cycle.completedSessions, cycle.totalSessions),
            )}
          </span>
          {cycle.nextDueDate === null ? null : (
            <FactRow icon="calendar" label={`${copy.due} ${formatDate(dateToLocalDate(cycle.nextDueDate), 'long')}`} />
          )}
          <Link
            href="/booking"
            className="inline-flex w-fit items-center gap-2 rounded-sm bg-brand-btn px-3 py-[6px] text-xs font-semibold text-ink-inverse no-underline hover:bg-brand-600"
          >
            <Icon name="add" size="compact" />
            {copy.book}
          </Link>
        </div>
      )}
    </SectionCard>
  )
}

/* ── The pieces the cards share ───────────────────────────────────────────────── */

function KpiTile({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  readonly label: string
  readonly value: string
  readonly sub?: string
  readonly icon: IconName
  readonly tone: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-md', tone)}>
        <Icon name={icon} size="card" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-ink-3">{label}</span>
        <span className="truncate text-lg font-bold text-ink tabular-nums">{value}</span>
        {sub === undefined ? null : <span className="truncate text-xs text-ink-3">{sub}</span>}
      </span>
    </div>
  )
}

function SectionCard({
  title,
  icon,
  action,
  children,
}: {
  readonly title: string
  readonly icon: IconName
  readonly action?: React.ReactNode
  readonly children: React.ReactNode
}) {
  return (
    <section className="flex flex-col rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Icon name={icon} size="card" />
          {title}
        </h2>
        {action ?? null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function FactRow({ icon, label }: { readonly icon: IconName; readonly label: string }) {
  return (
    <span className="flex items-center gap-2">
      <Icon name={icon} size="compact" />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}
