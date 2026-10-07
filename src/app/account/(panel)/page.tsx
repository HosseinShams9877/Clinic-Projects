/**
 * The customer panel's home — `02-architecture.md` §7's customer dashboard and §9's
 * `account/dashboard.html`.
 *
 * The three facts a person opens the panel for, each from the one query the module
 * scopes to the session's customer: the next session, the course the sessions belong
 * to, and the care the clinic wrote for it. The panel has no permission primitive
 * (`09-security.md` §7) — the scope is the `customerId` the session resolved, in
 * every `where` clause, and the page takes it from the resolution and nowhere else.
 *
 * ## Why the three are one transaction
 *
 * The three reads are one `runInTenantScope` rather than three, because they are three
 * projections of one person's record at one instant: three transactions could see a
 * booking land between them and the page would show a next appointment the cycle's
 * count does not yet include. One scope, one snapshot.
 *
 * ## Why the progress bar reads the module's count
 *
 * The DoD requires the bar to match `completedSessions/totalSessions`, and the only
 * place those two are a pair is the cycle row the module computed. The page formats
 * the pair and never re-derives either term — a bar that recomputed `completedSessions`
 * from the appointment table would be a bar that could disagree with the desk's own
 * view of the same course.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { Icon } from '@/core/components/icons'
import { CycleStatus } from '@/core/constants'
import { realClock } from '@/core/lib/clock'
import {
  dateToLocalDate,
  formatDate,
  formatMoney,
  toPersianDigits,
} from '@/core/localization'
import { CUSTOMER_PANEL, ownCareInstructions } from '@/modules/customers'
import { customerAppointments } from '@/modules/appointments'
import { customerCycles } from '@/modules/cycles'

import { requireCustomerPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: CUSTOMER_PANEL.dashboard.title }

/**
 * «داشبورد من» — the person's own three facts.
 */
export default async function AccountDashboardPage() {
  const session = await requireCustomerPanel()
  const now = realClock()

  const { next, cycle, care } = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const scope = { tx, tenantId: session.tenantId, customerId: session.customerId }
    const [appointments, cycles, instructions] = await Promise.all([
      customerAppointments({ ...scope, now }),
      customerCycles(scope),
      ownCareInstructions(scope),
    ])

    return {
      next: appointments.upcoming[0] ?? null,
      cycle: cycles.find((row) => row.status === CycleStatus.Active) ?? cycles[0] ?? null,
      care: instructions[0] ?? null,
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">{CUSTOMER_PANEL.dashboard.title}</h1>
        <p className="text-sm text-ink-2">{CUSTOMER_PANEL.dashboard.lead}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 panel:grid-cols-2">
        <NextAppointment next={next} />
        <CycleProgress cycle={cycle} />
      </div>

      <LatestCare care={care} />
    </div>
  )
}

/* ── The next session ─────────────────────────────────────────────────────────── */

/** The soonest future session the person has, or the sentence that says there is none. */
function NextAppointment({
  next,
}: {
  readonly next: {
    readonly scheduledAt: Date
    readonly localTime: string
    readonly serviceName: string | null
    readonly doctorName: string | null
    readonly priceAtBooking: bigint
  } | null
}) {
  const copy = CUSTOMER_PANEL.dashboard.nextAppointment

  if (next === null) {
    return (
      <SectionCard title={copy.title} icon="appointment">
        <p className="text-sm text-ink-3">{copy.empty}</p>
      </SectionCard>
    )
  }

  return (
    <SectionCard title={copy.title} icon="appointment">
      <div className="flex flex-col gap-3">
        <span className="text-lg font-bold text-ink">{next.serviceName ?? '—'}</span>
        <div className="flex flex-col gap-2 text-sm text-ink-2">
          <FactRow icon="calendar" label={formatDate(dateToLocalDate(next.scheduledAt), 'long')} />
          <FactRow icon="clock" label={`${copy.at} ${toPersianDigits(next.localTime)}`} />
          {next.doctorName === null ? null : (
            <FactRow icon="doctor" label={`${copy.withDoctor} ${next.doctorName}`} />
          )}
        </div>
        {next.priceAtBooking > 0n ? (
          <span className="text-sm font-semibold tabular-nums text-ink">
            {formatMoney(next.priceAtBooking)}
          </span>
        ) : null}
      </div>
    </SectionCard>
  )
}

/* ── The course's progress ───────────────────────────────────────────────────── */

/**
 * The bar, as a fraction the module computed.
 *
 * `totalSessions` is the course's own length and may be open-ended in the schema's
 * terms; the two sentences the catalog holds cover the bounded and the unbounded
 * course, and the bar is only drawn when the course has an end to fill toward.
 */
function CycleProgress({
  cycle,
}: {
  readonly cycle: {
    readonly serviceName: string
    readonly totalSessions: number
    readonly completedSessions: number
    readonly status: string
  } | null
}) {
  const copy = CUSTOMER_PANEL.dashboard.cycle

  if (cycle === null) {
    return (
      <SectionCard title={copy.title} icon="treatment">
        <p className="text-sm text-ink-3">{copy.empty}</p>
      </SectionCard>
    )
  }

  const bounded = cycle.totalSessions > 0
  const sentence = bounded
    ? copy.progress(cycle.completedSessions, cycle.totalSessions)
    : copy.unbounded(cycle.completedSessions)
  const fraction = bounded
    ? Math.min(100, Math.round((cycle.completedSessions / cycle.totalSessions) * 100))
    : 0

  return (
    <SectionCard title={copy.title} icon="treatment">
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-ink">{cycle.serviceName}</span>
          <span className="text-sm font-bold tabular-nums text-brand">{toPersianDigits(sentence)}</span>
        </div>
        {bounded ? (
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-brand-100"
            role="progressbar"
            aria-valuenow={cycle.completedSessions}
            aria-valuemin={0}
            aria-valuemax={cycle.totalSessions}
            aria-label={sentence}
          >
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${fraction}%` }}
            />
          </div>
        ) : null}
        <span className="text-xs text-ink-3">
          {copy.completed}: {toPersianDigits(String(cycle.completedSessions))}
        </span>
      </div>
    </SectionCard>
  )
}

/* ── The latest care ─────────────────────────────────────────────────────────── */

function LatestCare({
  care,
}: {
  readonly care: {
    readonly id: string
    readonly serviceName: string
    readonly afterCare: string | null
  } | null
}) {
  const copy = CUSTOMER_PANEL.dashboard.care

  if (care === null || care.afterCare === null) {
    return (
      <SectionCard title={copy.title} icon="treatment">
        <p className="text-sm text-ink-3">{copy.empty}</p>
      </SectionCard>
    )
  }

  return (
    <SectionCard title={copy.title} icon="treatment">
      <div className="flex flex-col gap-4">
        <span className="text-sm font-semibold text-ink">{care.serviceName}</span>
        <p className="whitespace-pre-line text-sm leading-7 text-ink-2">{care.afterCare}</p>
        <Link
          href="/account/care"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-brand no-underline hover:text-brand-600"
        >
          {copy.viewAll}
          <Icon name="chevronEnd" size="compact" />
        </Link>
      </div>
    </SectionCard>
  )
}

/* ── The card the three sections share ───────────────────────────────────────── */

function SectionCard({
  title,
  icon,
  children,
}: {
  readonly title: string
  readonly icon: 'appointment' | 'treatment'
  readonly children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-1">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Icon name={icon} size="card" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function FactRow({ icon, label }: { readonly icon: 'calendar' | 'clock' | 'doctor'; readonly label: string }) {
  return (
    <span className="flex items-center gap-2">
      <Icon name={icon} size="compact" />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}
