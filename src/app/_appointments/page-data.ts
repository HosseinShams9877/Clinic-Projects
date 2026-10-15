/**
 * The reads the three scheduling pages share, in one place.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and the composition these
 * three pages have in common is not the grid — each page renders its own — but the
 * reads behind it: a day's rows, its doctors, and the options the booking popup
 * offers. Those are one transaction's worth of queries, and writing them once is what
 * keeps the reception desk and the manager's oversight page from drifting apart on
 * which doctors a day holds.
 */

import { fromUtcInstant, formatTime, jalaliWeekday, timeToMinutes, asLocalTime, type LocalDate } from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'

import {
  clinicDay,
  doctorsOnDay,
  doctorWindowsOnDay,
  slotMinutesForDoctor,
  unrecordedCartable,
  unrecordedOnDay,
  weekDays,
  type DoctorColumn,
  type DoctorDayWindow,
} from '@/modules/appointments'
import { todaysReminders } from '@/modules/notifications'

import { RECEPTION_APPOINTMENTS } from '@/app/catalog'

import type { CustomerOption, ServiceOption } from './booking-dialog'
import { loadPopupOptions } from './options'

/** The views the reception page's tab bar offers, keyed as the search param is. */
export type AppointmentsView = 'day' | 'week' | 'cartable'

/** The search-param values the tab bar writes, in the tab bar's own order. */
export const VIEW_VALUES: readonly AppointmentsView[] = ['day', 'week', 'cartable']

/** The rows a day grid renders, as the module's own query answers them. */
export type DayRows = Awaited<ReturnType<typeof clinicDay>>

/** The columns a day grid renders, as the module's own query answers them. */
export type DayDoctors = Awaited<ReturnType<typeof doctorsOnDay>>

/** The default slot step, in minutes, when a doctor has no override. */
const DEFAULT_SLOT_MINUTES = 30

export interface DayGridData {
  readonly doctors: DayDoctors
  readonly rows: DayRows
  readonly windows: readonly DoctorDayWindow[]
  readonly services: readonly ServiceOption[]
  readonly customers: readonly CustomerOption[]
  readonly slotMinutesByDoctorId: Readonly<Record<string, number | null>>
  readonly servicesByDoctorId: Readonly<Record<string, readonly string[]>>
  readonly workingDaysByDoctorId: Readonly<Record<string, readonly number[]>>
  readonly doctorsByServiceId: Readonly<Record<string, readonly DoctorColumn[]>>
  readonly freeSlotsByDoctorId: Readonly<Record<string, readonly string[]>>
}

export interface ReminderCard {
  readonly id: string
  readonly time: string
  readonly text: string
  readonly customerName: string
  readonly badge: string | null
  readonly badgeTone: 'brand' | 'warn' | 'info' | 'neutral'
  readonly actionHref: string | null
  readonly actionLabel: string | null
}

function reminderMeta(kind: string | null): {
  readonly badge: string
  readonly tone: ReminderCard['badgeTone']
  readonly href: string
  readonly label: string
} | null {
  switch (kind) {
    case 'NEXT_SESSION_REMINDER':
      return {
        badge: RECEPTION_APPOINTMENTS.reminder.cycle.badge,
        tone: 'brand',
        href: '/reception/cycles',
        label: RECEPTION_APPOINTMENTS.reminder.cycle.action,
      }
    case 'BALANCE_REMINDER':
      return {
        badge: RECEPTION_APPOINTMENTS.reminder.balance.badge,
        tone: 'warn',
        href: '/reception/debts',
        label: RECEPTION_APPOINTMENTS.reminder.balance.action,
      }
    case 'NO_SHOW_FOLLOW_UP':
      return {
        badge: RECEPTION_APPOINTMENTS.reminder.followUp.badge,
        tone: 'info',
        href: '/reception/leads',
        label: RECEPTION_APPOINTMENTS.reminder.followUp.action,
      }
    case null:
      return null
    default:
      return {
        badge: RECEPTION_APPOINTMENTS.reminder.general.badge,
        tone: 'neutral',
        href: '/reception/customers',
        label: RECEPTION_APPOINTMENTS.reminder.general.action,
      }
  }
}

export interface WeekDayData {
  readonly localDate: LocalDate
  readonly doctors: DayGridData['doctors']
  readonly rows: DayGridData['rows']
}

export interface AppointmentsPageData {
  readonly day: DayGridData
  readonly week: readonly WeekDayData[]
  readonly cartable: DayGridData['rows']
  readonly reminders: readonly ReminderCard[]
}

export async function loadDayGrid(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly clinicId: string | null
  readonly localDate: LocalDate
}): Promise<DayGridData> {
  const weekday = jalaliWeekday(args.localDate)
  const [doctors, windows, rows, unrecorded, options] = await Promise.all([
    doctorsOnDay({ tx: args.tx, tenantId: args.ctx.tenantId, weekday }),
    doctorWindowsOnDay({
      tx: args.tx,
      tenantId: args.ctx.tenantId,
      clinicId: args.clinicId,
      weekday,
    }),
    clinicDay({ tx: args.tx, ctx: args.ctx, clinicId: args.clinicId, localDate: args.localDate }),
    unrecordedOnDay({
      tx: args.tx,
      ctx: args.ctx,
      clinicId: args.clinicId,
      localDate: args.localDate,
    }),
    loadPopupOptions({ tx: args.tx, ctx: args.ctx }),
  ])

  const allRows = [...rows, ...unrecorded]

  const [servicesByDoctorId, workingDaysByDoctorId, doctorsByServiceId, slotMinutesByDoctorId] =
    await Promise.all([
      loadServicesByDoctor({
        tx: args.tx,
        tenantId: args.ctx.tenantId,
        doctorIds: doctors.map((d) => d.id),
      }),
      loadWorkingDaysByDoctor({
        tx: args.tx,
        tenantId: args.ctx.tenantId,
        doctorIds: doctors.map((d) => d.id),
      }),
      loadDoctorsByService({
        tx: args.tx,
        tenantId: args.ctx.tenantId,
        serviceIds: options.services.map((s) => s.id),
      }),
      loadSlotMinutesByDoctor({
        tx: args.tx,
        tenantId: args.ctx.tenantId,
        weekday,
        doctorIds: doctors.map((d) => d.id),
      }),
    ])

  const freeSlotsByDoctorId = buildFreeSlots({
    windows,
    rows: allRows,
    slotMinutesByDoctorId,
  })

  return {
    doctors,
    windows,
    rows: allRows,
    services: options.services,
    customers: options.customers,
    slotMinutesByDoctorId,
    servicesByDoctorId,
    workingDaysByDoctorId,
    doctorsByServiceId,
    freeSlotsByDoctorId,
  }
}

export async function loadWeek(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly clinicId: string | null
  readonly localDate: LocalDate
}): Promise<readonly WeekDayData[]> {
  const days = weekDays(args.localDate)
  return Promise.all(
    days.map(async (localDate) => {
      const [doctors, rows] = await Promise.all([
        doctorsOnDay({ tx: args.tx, tenantId: args.ctx.tenantId, weekday: jalaliWeekday(localDate) }),
        clinicDay({ tx: args.tx, ctx: args.ctx, clinicId: args.clinicId, localDate }),
      ])
      return { localDate, doctors, rows }
    }),
  )
}

export async function loadAppointmentsPage(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly clinicId: string | null
  readonly localDate: LocalDate
  readonly now: Date
  readonly utcOffsetMinutes: number
}): Promise<AppointmentsPageData> {
  const [day, week, cartable, reminderRows] = await Promise.all([
    loadDayGrid(args),
    loadWeek(args),
    unrecordedCartable({ tx: args.tx, tenantId: args.ctx.tenantId }),
    todaysReminders(args.tx, args.ctx.tenantId, args.now),
  ])

  const reminders: readonly ReminderCard[] = reminderRows.map((row) => {
    const meta = reminderMeta(row.kind)
    return {
      id: row.id,
      time: formatTime(fromUtcInstant(row.createdAt, args.utcOffsetMinutes).localTime),
      text: row.renderedText,
      customerName: row.customerName,
      badge: meta?.badge ?? null,
      badgeTone: meta?.tone ?? 'neutral',
      actionHref: meta?.href ?? null,
      actionLabel: meta?.label ?? null,
    }
  })

  return { day, week, cartable, reminders }
}

/* ── The free-slot map ─────────────────────────────────────────────────────── */

/**
 * The times each doctor on the day is free to be booked at.
 *
 * The rules are the ones the grid is drawn with, kept in one place so the popup's
 * time step and the grid's own cells cannot disagree about what a slot is:
 *
 * 1. The candidate starts are the doctor's own range starts stepped by their own
 *    `slotMinutes` (default 30) — the same walk `generateSlots` in the module
 *    performs, done here over the window the page already read rather than a second
 *    query.
 * 2. A candidate whose slot would overrun the range's end is dropped, which is the
 *    same rule `slotsInRange` states.
 * 3. A candidate that any row already holds (a booking, a block, a `slotBlock`) is
 *    dropped, including a *partial* overlap — the slot is at the step's own start,
 *    so a row starting at the same minute is the row that holds it, and a row
 *    starting earlier is checked by its own duration.
 * 4. A candidate whose minute is inside a previous slot's span is dropped by the
 *    step walk itself, because the walk advances by the step.
 * 5. A row named by `excludeAppointmentId` is not treated as occupied. The edit
 *    dialog is the one caller that passes it — the row the desk is correcting is
 *    the row whose own slot must stay in the list, because the desk is editing
 *    *that* slot and the slot it is holding is the slot it was holding.
 *
 * The output is keyed by doctor and sorted ascending, and it is what the popup's
 * time step renders as its options.
 */
export function buildFreeSlots(args: {
  readonly windows: readonly DoctorDayWindow[]
  readonly rows: DayGridData['rows']
  readonly slotMinutesByDoctorId: Readonly<Record<string, number | null>>
  /** A row to treat as free — the edit dialog's own appointment, when editing. */
  readonly excludeAppointmentId?: string
}): Readonly<Record<string, readonly string[]>> {
  const map: Record<string, readonly string[]> = {}

  for (const window of args.windows) {
    const step = args.slotMinutesByDoctorId[window.id] ?? DEFAULT_SLOT_MINUTES
    const doctorRows = args.rows.filter(
      (row) => row.doctorId === window.id && row.id !== args.excludeAppointmentId,
    )

    // The occupied ranges of this doctor's day, as [start, end) minutes.
    const occupied = doctorRows.map((row) => {
      const start = timeToMinutes(asLocalTime(row.localTime))
      const end = start + Math.max(row.durationMinutes, step)
      return { start, end }
    })

    const free: string[] = []
    for (const range of window.ranges) {
      let cursor = range.startMinute
      while (cursor + step <= range.endMinute) {
        const candidate = { start: cursor, end: cursor + step }
        const taken = occupied.some(
          (busy) => busy.start < candidate.end && busy.end > candidate.start,
        )
        if (!taken) {
          const hours = Math.floor(cursor / 60)
          const minutes = cursor % 60
          free.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
        }
        cursor += step
      }
    }

    map[window.id] = free
  }

  return map
}

/* ── The filter maps ───────────────────────────────────────────────────────── */

async function loadServicesByDoctor(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly doctorIds: readonly string[]
}): Promise<Readonly<Record<string, readonly string[]>>> {
  if (args.doctorIds.length === 0) return {}
  const rows = await args.tx.serviceDoctor.findMany({
    where: { tenantId: args.tenantId, doctorId: { in: [...args.doctorIds] } },
    select: { doctorId: true, serviceId: true },
  })
  const map: Record<string, string[]> = {}
  for (const row of rows) {
    const held = map[row.doctorId] ?? []
    held.push(row.serviceId)
    map[row.doctorId] = held
  }
  return map
}

async function loadWorkingDaysByDoctor(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly doctorIds: readonly string[]
}): Promise<Readonly<Record<string, readonly number[]>>> {
  if (args.doctorIds.length === 0) return {}
  const rows = await args.tx.doctorWorkingHours.findMany({
    where: { tenantId: args.tenantId, doctorId: { in: [...args.doctorIds] } },
    select: { doctorId: true, weekday: true },
    distinct: ['doctorId', 'weekday'],
  })
  const map: Record<string, number[]> = {}
  for (const row of rows) {
    const held = map[row.doctorId] ?? []
    held.push(row.weekday)
    map[row.doctorId] = held
  }
  for (const key of Object.keys(map)) map[key] = [...new Set(map[key])].sort((a, b) => a - b)
  return map
}

async function loadDoctorsByService(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly serviceIds: readonly string[]
}): Promise<Readonly<Record<string, readonly DoctorColumn[]>>> {
  if (args.serviceIds.length === 0) return {}
  const rows = await args.tx.serviceDoctor.findMany({
    where: { tenantId: args.tenantId, serviceId: { in: [...args.serviceIds] } },
    select: {
      serviceId: true,
      doctor: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { doctor: { firstName: 'asc' } },
  })
  const map: Record<string, DoctorColumn[]> = {}
  for (const row of rows) {
    const held = map[row.serviceId] ?? []
    const name =
      row.doctor.lastName === null || row.doctor.lastName === ''
        ? row.doctor.firstName
        : `${row.doctor.firstName} ${row.doctor.lastName}`
    held.push({ id: row.doctor.id, name })
    map[row.serviceId] = held
  }
  return map
}

async function loadSlotMinutesByDoctor(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly weekday: number
  readonly doctorIds: readonly string[]
}): Promise<Readonly<Record<string, number | null>>> {
  if (args.doctorIds.length === 0) return {}
  const pairs = await Promise.all(
    args.doctorIds.map(async (doctorId) => [
      doctorId,
      await slotMinutesForDoctor({
        tx: args.tx,
        tenantId: args.tenantId,
        doctorId,
        weekday: args.weekday,
      }),
    ] as const),
  )
  const map: Record<string, number | null> = {}
  for (const [doctorId, minutes] of pairs) map[doctorId] = minutes
  return map
}