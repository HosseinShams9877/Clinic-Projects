// src/app/_appointments/filter-bar.tsx

'use client'

import { useRouter } from 'next/navigation'

import { APPOINTMENT_STATUS_LABELS } from '@/modules/appointments'

import { APPOINTMENTS_PAGE } from '@/app/catalog'
import type { DayDoctors } from './page-data'

export interface FilterBarProps {
  readonly basePath: string
  readonly doctors: DayDoctors
  readonly doctor: string
  readonly status: string
  readonly day: string | null
}

export function FilterBar({ basePath, doctors, doctor, status, day }: FilterBarProps) {
  const router = useRouter()

  function navigate(next: { readonly doctor?: string; readonly status?: string }): void {
    const query = new URLSearchParams()
    const merged = { doctor, status, ...next }
    if (merged.doctor !== '') query.set('doctor', merged.doctor)
    if (merged.status !== '') query.set('status', merged.status)
    if (day !== null) query.set('day', day)

    const search = query.toString()
    router.replace(search === '' ? basePath : `${basePath}?${search}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* سلکتور پزشک - خیلی ظریف */}
      <select
        name="doctor"
        value={doctor}
        onChange={(event) => navigate({ doctor: event.target.value })}
        className="h-7 rounded border border-line-2 bg-surface px-1.5 py-0 text-[11px] text-ink-2 transition-colors hover:border-brand-300 focus:border-brand-300 focus:outline-none"
      >
        <option value="">{APPOINTMENTS_PAGE.admin.filters.doctor}</option>
        {doctors.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>

      {/* سلکتور وضعیت - خیلی ظریف */}
      <select
        name="status"
        value={status}
        onChange={(event) => navigate({ status: event.target.value })}
        className="h-7 rounded border border-line-2 bg-surface px-1.5 py-0 text-[11px] text-ink-2 transition-colors hover:border-brand-300 focus:border-brand-300 focus:outline-none"
      >
        <option value="">{APPOINTMENTS_PAGE.admin.filters.status}</option>
        {Object.keys(APPOINTMENT_STATUS_LABELS).map((value) => (
          <option key={value} value={value}>
            {APPOINTMENT_STATUS_LABELS[value as keyof typeof APPOINTMENT_STATUS_LABELS]}
          </option>
        ))}
      </select>

      {day === null ? null : <input type="hidden" name="day" value={day} readOnly />}
    </div>
  )
}