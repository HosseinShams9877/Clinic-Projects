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

import { fromUtcInstant, formatTime, jalaliWeekday, type LocalDate } from '@/core/localization'
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

/**
 * One day's complete grid: its columns, its rows, the doctors' windows, and the
 * popup's options.
 */
export interface DayGridData {
  readonly doctors: DayDoctors
  readonly rows: DayRows
  readonly windows: readonly DoctorDayWindow[]
  readonly services: readonly ServiceOption[]
  readonly customers: readonly CustomerOption[]
  /** The slot step for each doctor on the day, keyed by doctor id. */
  readonly slotMinutesByDoctorId: Readonly<Record<string, number | null>>
  /** The service ids each doctor offers, keyed by doctor id. */
  readonly servicesByDoctorId: Readonly<Record<string, readonly string[]>>
  /** The weekdays each doctor works (0=شنبه … 6=جمعه), keyed by doctor id. */
  readonly workingDaysByDoctorId: Readonly<Record<string, readonly number[]>>
  /** The doctors who offer each service, keyed by service id. */
  readonly doctorsByServiceId: Readonly<Record<string, readonly DoctorColumn[]>>
}

/**
 * One reminder card the side panel renders, flattened from the ledger row.
 */
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

/**
 * The badge, tone and follow-up a reminder shows, by the message's kind.
 */
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

/**
 * One day of the week view, carrying its own doctors.
 */
export interface WeekDayData {
  readonly localDate: LocalDate
  readonly doctors: DayGridData['doctors']
  readonly rows: DayGridData['rows']
}

/**
 * The day the page is showing, the week the week view holds, and the cartable.
 */
export interface AppointmentsPageData {
  readonly day: DayGridData
  readonly week: readonly WeekDayData[]
  readonly cartable: DayGridData['rows']
  readonly reminders: readonly ReminderCard[]
}

/**
 * The day's own grid: the doctors who work it, the rows it holds, and the popup's
 * options.
 */
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

  return {
    doctors,
    windows,
    rows: [...rows, ...unrecorded],
    services: options.services,
    customers: options.customers,
    slotMinutesByDoctorId,
    servicesByDoctorId,
    workingDaysByDoctorId,
    doctorsByServiceId,
  }
}

/**
 * The week the week view shows: the seven days of the Jalali week the anchor is in.
 */
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

/**
 * Everything the reception page's three tabs render, in one scope.
 */
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