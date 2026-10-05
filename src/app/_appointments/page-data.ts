/**
 * The reads the three scheduling pages share, in one place.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and the composition these
 * three pages have in common is not the grid — each page renders its own — but the
 * reads behind it: a day's rows, its doctors, and the options the booking popup
 * offers. Those are one transaction's worth of queries, and writing them once is what
 * keeps the reception desk and the manager's oversight page from drifting apart on
 * which doctors a day holds.
 *
 * ## What is deliberately not here
 *
 * A row. Nothing here writes, because a page is a read and a write is an action
 * (`row-actions.tsx` and `actions.ts`). The one thing that mutates on the way to
 * rendering is the lifecycle sweep, which the cartable runs because the alarm is
 * raised by the clock and not by a person — and the sweep is the module's own
 * idempotent function, called from the request path for the reason `lifecycle.ts`
 * states.
 */

import { jalaliWeekday, type LocalDate } from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'

import {
  clinicDay,
  doctorsOnDay,
  unrecordedCartable,
  weekDays,
} from '@/modules/appointments'

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

/** One day's complete grid: its columns, its rows, and the popup's options. */
export interface DayGridData {
  readonly doctors: DayDoctors
  readonly rows: DayRows
  readonly services: readonly ServiceOption[]
  readonly customers: readonly CustomerOption[]
}

/**
 * One day of the week view, carrying its own doctors because a weekday's columns are
 * the doctors who work that weekday and not the ones who work the anchor's.
 */
export interface WeekDayData {
  readonly localDate: LocalDate
  readonly doctors: DayGridData['doctors']
  readonly rows: DayGridData['rows']
}

/**
 * The day the page is showing, the week the week view holds, and the cartable — the
 * three things a tab asks for, read in one scope.
 */
export interface AppointmentsPageData {
  readonly day: DayGridData
  readonly week: readonly WeekDayData[]
  readonly cartable: DayGridData['rows']
}

/**
 * The day's own grid: the doctors who work it, the rows it holds, and the popup's
 * options.
 *
 * `clinicId` is the caller's own — the manager's oversight reads the same function and
 * passes the same value, which is what makes the two pages agree about which branch a
 * day belongs to.
 */
export async function loadDayGrid(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly clinicId: string | null
  readonly localDate: LocalDate
}): Promise<DayGridData> {
  const [doctors, rows, options] = await Promise.all([
    doctorsOnDay({ tx: args.tx, tenantId: args.ctx.tenantId, weekday: jalaliWeekday(args.localDate) }),
    clinicDay({ tx: args.tx, ctx: args.ctx, clinicId: args.clinicId, localDate: args.localDate }),
    loadPopupOptions({ tx: args.tx, ctx: args.ctx }),
  ])

  return { doctors, rows, services: options.services, customers: options.customers }
}

/**
 * The week the week view shows: the seven days of the Jalali week the anchor is in,
 * each with its own doctors and rows.
 *
 * Read as one `Promise.all` because the seven days are seven independent reads, and
 * reading them in sequence would make the week view seven trips where the day view is
 * one.
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
 *
 * The day and the week are both read on every view because the tab bar links to both
 * and the navigation between them is a link, not a reload — a person on the week tab
 * is one tap from the day a row is on, and the data is already there. The cartable is
 * read alongside them for the same reason, and because the tab's own badge is the
 * cartable's length.
 */
export async function loadAppointmentsPage(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly clinicId: string | null
  readonly localDate: LocalDate
}): Promise<AppointmentsPageData> {
  const [day, week, cartable] = await Promise.all([
    loadDayGrid(args),
    loadWeek(args),
    unrecordedCartable({ tx: args.tx, tenantId: args.ctx.tenantId }),
  ])

  return { day, week, cartable }
}
