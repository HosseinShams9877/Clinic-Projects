// src/app/doctor/page.tsx

/**
 * The doctor panel's home — `02-architecture.md` §7's «برنامه من» and §9's
 * `doctor/dashboard.html`.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { asLocalDate, formatNumber, isValidLocalDate, todayLocalDate, type LocalDate } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { AppointmentStatus, CycleStatus, isMember } from '@/core/constants'
import { doctorDay, readBookingSettings } from '@/modules/appointments'
import { doctorCycles } from '@/modules/cycles'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { cx } from '@/core/lib'

import { APPOINTMENTS_PAGE, PANEL_HOMES } from '@/app/catalog'
import { DOCTOR_DASHBOARD } from '@/app/doctor/catalog'
import { DayGrid, DayNav } from '@/app/_appointments/day-grid'
import { DayPicker } from '@/app/_appointments/day-picker' // <-- اضافه شد
import { loadPopupOptions } from '@/app/_appointments/options'
import { LeaveForm } from '@/app/doctor/_components/LeaveForm'
import { requireStaffPanel } from '@/app/_shell/session'

export const metadata: Metadata = { title: PANEL_HOMES.doctor }

const BASE_PATH = '/doctor'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

export default async function DoctorHomePage({ searchParams }: { readonly searchParams: PageSearchParams }) {
  const session = await requireStaffPanel('doctor')
  const params = await searchParams
  const localDate = dateFromParam(params.day)

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    const [rows, options, settings, cycles] = await Promise.all([
      doctorDay({
        tx,
        tenantId: session.tenantId,
        doctorId: session.permissions.userId,
        localDate,
      }),
      loadPopupOptions({ tx, ctx: session.permissions }),
      readBookingSettings(tx, session.tenantId),
      doctorCycles({ tx, ctx: session.permissions }),
    ])
    return { rows, options, settings, cycles }
  })

  const doctorName = doctorDisplayName(data.rows)
  const bookings = data.rows.filter((row) => !row.isSlotBlock)
  const doneToday = bookings.filter((row) => row.status === AppointmentStatus.Completed).length
  const activeCycles = data.cycles.filter(
    (row) => isMember(CycleStatus, row.status) &&
      (row.status === CycleStatus.Active || row.status === CycleStatus.Due || row.status === CycleStatus.AtRisk),
  ).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{PANEL_HOMES.doctor}</h1>
          <p className="text-sm text-ink-2">{APPOINTMENTS_PAGE.doctor.lead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeaveForm />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 panel:grid-cols-3">
        <KpiTile label={DOCTOR_DASHBOARD.kpi.today} value={formatNumber(bookings.length)} icon="appointment" tone="bg-info-bg text-info" />
        <KpiTile label={DOCTOR_DASHBOARD.kpi.doneSoFar} value={formatNumber(doneToday)} icon="confirm" tone="bg-ok-bg text-ok" />
        <KpiTile label={DOCTOR_DASHBOARD.kpi.activeCycles} value={formatNumber(activeCycles)} icon="treatment" tone="bg-brand-50 text-brand" />
      </div>

      <section className="flex flex-col rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{DOCTOR_DASHBOARD.scheduleTitle}</h2>
          {/* دکمه‌های ناوبری و انتخاب تاریخ در اینجا قرار گرفتند */}
          <div className="flex flex-wrap items-center gap-2">
            <DayNav localDate={localDate} basePath={BASE_PATH} />
            <DayPicker localDate={localDate} basePath={BASE_PATH} />
          </div>
        </div>
        <div className="overflow-x-auto p-4">
          <DayGrid
            localDate={localDate}
            doctors={[{ id: session.permissions.userId, name: doctorName }]}
            rows={data.rows}
            services={data.options.services}
            customers={data.options.customers}
            panel="doctor"
            writable={false}
          />
        </div>
      </section>
    </div>
  )
}

function KpiTile({
  label,
  value,
  icon,
  tone,
}: {
  readonly label: string
  readonly value: string
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
      </span>
    </div>
  )
}

function doctorDisplayName(rows: ReadonlyArray<{ readonly doctorName: string }>): string {
  return rows[0]?.doctorName ?? PANEL_HOMES.doctor
}

function dateFromParam(value: string | string[] | undefined): LocalDate {
  if (typeof value === 'string' && isValidLocalDate(value)) return asLocalDate(value)
  return todayLocalDate(realClock())
}