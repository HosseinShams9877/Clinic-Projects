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

import { fromUtcInstant, formatTime, jalaliWeekday, type LocalDate } from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'

import {
  clinicDay,
  doctorsOnDay,
  doctorWindowsOnDay,
  unrecordedCartable,
  unrecordedOnDay,
  weekDays,
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

/** One day's complete grid: its columns, its rows, the doctors' windows, and the popup's options. */
export interface DayGridData {
  readonly doctors: DayDoctors
  readonly rows: DayRows
  /** Each working doctor's hour window, for the grid's off-schedule vs free-slot axis. */
  readonly windows: readonly DoctorDayWindow[]
  readonly services: readonly ServiceOption[]
  readonly customers: readonly CustomerOption[]
}

/**
 * One reminder card the side panel renders, flattened from the ledger row.
 *
 * The panel is a pure view, so the instant → clinic-local time conversion happens here
 * where the tenant's offset is in hand, and the automatic-message label is resolved
 * here against the `notifications` catalog rather than in the component.
 */
export interface ReminderCard {
  readonly id: string
  /** The clinic-local time the message was produced, Persian-digit formatted. */
  readonly time: string
  /** The rendered message text, as the ledger stored it. */
  readonly text: string
  /** The person the message was about. */
  readonly customerName: string
  /** The category badge's label, or `null` for a hand-sent message. */
  readonly badge: string | null
  /** The badge's colour tone. */
  readonly badgeTone: 'brand' | 'warn' | 'info' | 'neutral'
  /** The reception page the reminder's follow-up lives on, keyed by kind. */
  readonly actionHref: string | null
  /** The label of that follow-up link. */
  readonly actionLabel: string | null
}

/**
 * The badge, tone and follow-up a reminder shows, by the message's kind.
 *
 * The three queues the desk acts on — the treatment cycle, the balance, the lead
 * follow-up — get their own badge and page; everything else points at the customer's
 * own list, and a hand-sent message (no kind) gets no badge or action rather than a
 * guessed one. Labels come from the reception catalog and `NAV_LABELS`, never a literal.
 */
function reminderMeta(kind: string | null): {
  readonly badge: string
  readonly tone: ReminderCard['badgeTone']
  readonly href: string
  readonly label: string
} | null {
  switch (kind) {
    case 'NEXT_SESSION_REMINDER':
      return { badge: RECEPTION_APPOINTMENTS.reminder.cycle.badge, tone: 'brand', href: '/reception/cycles', label: RECEPTION_APPOINTMENTS.reminder.cycle.action }
    case 'BALANCE_REMINDER':
      return { badge: RECEPTION_APPOINTMENTS.reminder.balance.badge, tone: 'warn', href: '/reception/debts', label: RECEPTION_APPOINTMENTS.reminder.balance.action }
    case 'NO_SHOW_FOLLOW_UP':
      return { badge: RECEPTION_APPOINTMENTS.reminder.followUp.badge, tone: 'info', href: '/reception/leads', label: RECEPTION_APPOINTMENTS.reminder.followUp.action }
    case null:
      return null
    default:
      return { badge: RECEPTION_APPOINTMENTS.reminder.general.badge, tone: 'neutral', href: '/reception/customers', label: RECEPTION_APPOINTMENTS.reminder.general.action }
  }
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
  /** The desk's «یادآوری‌های امروز» feed, flattened for the side panel. */
  readonly reminders: readonly ReminderCard[]
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
  const weekday = jalaliWeekday(args.localDate)
  const [doctors, windows, rows, unrecorded, options] = await Promise.all([
    doctorsOnDay({ tx: args.tx, tenantId: args.ctx.tenantId, weekday }),
    doctorWindowsOnDay({ tx: args.tx, tenantId: args.ctx.tenantId, clinicId: args.clinicId, weekday }),
    clinicDay({ tx: args.tx, ctx: args.ctx, clinicId: args.clinicId, localDate: args.localDate }),
    unrecordedOnDay({ tx: args.tx, ctx: args.ctx, clinicId: args.clinicId, localDate: args.localDate }),
    loadPopupOptions({ tx: args.tx, ctx: args.ctx }),
  ])

  // The alarm state is excluded from `clinicDay` by construction; merged here so the
  // day's own grid shows the outstanding row inline (the demo's dang cell) rather than
  // only in the cartable tab.
  return {
    doctors,
    windows,
    rows: [...rows, ...unrecorded],
    services: options.services,
    customers: options.customers,
  }
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
  /** The clock the reminder feed's day boundary is read against. */
  readonly now: Date
  /** The tenant's UTC offset, for converting a send's instant to a clinic-local time. */
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
