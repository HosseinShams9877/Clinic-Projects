import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import {
  asLocalDate,
  isValidLocalDate,
  todayLocalDate,
  type LocalDate,
} from '@/core/localization'
import { realClock } from '@/core/lib/clock'

import { APPOINTMENTS_PAGE } from '@/app/catalog'
import { BookingDialog } from '@/app/_appointments/booking-dialog'
import { DayGrid, DayNav } from '@/app/_appointments/day-grid'
import { DayPicker } from '@/app/_appointments/day-picker'
import { FilterBar } from '@/app/_appointments/filter-bar'
import { loadDayGrid } from '@/app/_appointments/page-data'
import { requireStaffPanel } from '@/app/_shell/session'
import { FullscreenWrapper } from '@/app/_appointments/fullscreen-wrapper'

export const metadata: Metadata = { title: APPOINTMENTS_PAGE.admin.title }

const BASE_PATH = '/admin/appointments'

type PageSearchParams = Promise<{ readonly [key: string]: string | string[] | undefined }>

export default async function AdminAppointmentsPage({
  searchParams,
}: {
  readonly searchParams: PageSearchParams
}) {
  const session = await requireStaffPanel('admin')
  const params = await searchParams
  const localDate = dateFromParam(params.day)

  const data = await runInTenantScope(session.permissions, prisma(), (tx) =>
    loadDayGrid({
      tx,
      ctx: session.permissions,
      clinicId: session.permissions.clinicId,
      localDate,
    }),
  )

  const doctorFilter = asString(params.doctor)
  const statusFilter = asString(params.status)

  const filteredRows = data.rows.filter(
    (row) =>
      (doctorFilter === '' || row.doctorId === doctorFilter) &&
      (statusFilter === '' || row.status === statusFilter),
  )

  const filteredDoctors = doctorFilter
    ? data.doctors.filter((doctor) => doctor.id === doctorFilter)
    : data.doctors

  const filteredWindows = doctorFilter
    ? data.windows.filter((window) => window.id === doctorFilter)
    : data.windows

  return (
    // h-[calc(100vh-120px)] باعث می‌شود صفحه دقیقاً به اندازه ارتفاع مرورگر باز شود
    <div className="flex h-[calc(100vh-120px)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">{APPOINTMENTS_PAGE.admin.title}</h1>
          <p className="text-sm text-ink-2">{APPOINTMENTS_PAGE.admin.lead}</p>
        </div>
        <BookingDialog
          variant="book"
          panel="admin"
          triggerLabel={APPOINTMENTS_PAGE.registerAppointment}
          triggerVariant="primary"
          triggerSize="default"
          triggerIcon="add"
          localDate={localDate}
          services={data.services}
          customers={data.customers}
          doctorsByServiceId={data.doctorsByServiceId}
          freeSlotsByDoctorId={data.freeSlotsByDoctorId}
        />
      </div>

      <FullscreenWrapper>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1.5 pl-12">
          <div className="flex flex-wrap items-center gap-2">
            <DayNav localDate={localDate} basePath={BASE_PATH} />
            <DayPicker localDate={localDate} basePath={BASE_PATH} />
            <FilterBar
              basePath={BASE_PATH}
              doctors={data.doctors}
              doctor={doctorFilter}
              status={statusFilter}
              day={typeof params.day === 'string' ? params.day : null}
            />
          </div>
        </div>
        
        <div className="flex flex-1 flex-col overflow-hidden">
          <DayGrid
            localDate={localDate}
            doctors={filteredDoctors}
            windows={filteredWindows}
            rows={filteredRows}
            services={data.services}
            customers={data.customers}
            servicesByDoctorId={data.servicesByDoctorId}
            workingDaysByDoctorId={data.workingDaysByDoctorId}
            panel="admin"
            writable={true}
            fullHeight={true} // بسیار مهم
          />
        </div>
      </FullscreenWrapper>
    </div>
  )
}

function asString(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function dateFromParam(value: string | string[] | undefined): LocalDate {
  if (typeof value === 'string' && isValidLocalDate(value)) return asLocalDate(value)
  return todayLocalDate(realClock())
}