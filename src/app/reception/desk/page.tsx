/**
 * The reception panel's home — «میز کار امروز», `02-architecture.md` §9's
 * `reception/` route.
 *
 * The desk is the receptionist's *starting* page: one screen that answers "what
 * needs me now". It reads the day's appointments, the unrecorded results, the
 * day's reminders, and the debts past due, and composes them into four KPIs, a
 * task cartable, a reminders panel, and a free-slots card.
 *
 * ## The reminders panel
 *
 * `RemindersPanel` is the same component `reception/appointments` used to render
 * in its side column, and it is fed by the same `ReminderCard` shape. The desk
 * is where the reminders belong: a reminder is a *call the desk makes*, and the
 * desk is the surface the receptionist works from. The appointments page is the
 * day's *grid*, and it does not need a second list beside it.
 *
 * ## Why the page is a Server Component
 *
 * Every read is a database read inside the request's tenant scope; every write
 * is a Server Action the rows link to. The page itself holds no state, and the
 * one interactive section — the cartable's filter and the reminders panel — is a
 * Client Component that receives its rows as plain data.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope, tenantContextOf } from '@/core/db'
import {
  asLocalTime,
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  jalaliWeekday,
  minutesToTime,
  timeToMinutes,
  todayLocalDate,
} from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import { fromUtcInstant } from '@/core/localization'

import { requireStaffPanel } from '@/app/_shell/session'

import { clinicDay, doctorWindowsOnDay, unrecordedCartable } from '@/modules/appointments'
import { contactList as debtContactList } from '@/modules/debts'
import { todaysReminders } from '@/modules/notifications'

import { PANEL_HOMES, RECEPTION_DESK, RECEPTION_APPOINTMENTS } from '@/app/catalog'
import {
  type ReminderCard,
} from '@/app/_appointments/page-data'
import { RemindersPanel } from '@/app/_appointments/reminders-panel'
import { FreeSlotsCard, type FreeSlot } from './_components/free-slots-card'
import { KpiRow } from './_components/kpi-row'
import { PageHeader } from './_components/page-header'
import { TaskCartable, type TaskRow } from './_components/task-cartable'

export const metadata: Metadata = { title: PANEL_HOMES.reception }

export default async function DeskPage() {
  const session = await requireStaffPanel('reception')
  const now = realClock()
  const today = todayLocalDate(now)

  return runInTenantScope(
    tenantContextOf({ tenantId: session.tenantId }),
    prisma(),
    async (tx) => {
      const [dayAppointments, unrecorded, reminders, debtBuckets, windows] = await Promise.all([
        clinicDay({ tx, ctx: session.permissions, clinicId: null, localDate: today }),
        unrecordedCartable({ tx, tenantId: session.tenantId }),
        todaysReminders(tx, session.tenantId, now),
        debtContactList({ tx, ctx: session.permissions, now }),
        doctorWindowsOnDay({ tx, tenantId: session.tenantId, clinicId: null, weekday: jalaliWeekday(today) }),
      ])

      // ── The four KPI numbers ────────────────────────────────────────────
      const appointmentsCount = dayAppointments.filter(
        (row) => row.status !== 'CANCELLED' && row.status !== 'RESCHEDULED',
      ).length

      const overdueDebts = [
        ...debtBuckets.overdue30,
        ...debtBuckets.overdue7,
        ...debtBuckets.overdue,
      ]
      const debtTotalRial = overdueDebts.reduce((sum, row) => sum + row.balance, 0n)
      const debtorsCount = overdueDebts.length

      const heldMessages = reminders.filter(
        (row) => row.status === 'SUPPRESSED' || row.status === 'QUEUED',
      )
      const arrivalsToday = dayAppointments.filter(
        (row) => row.status === 'ARRIVED' || row.status === 'AWAITING_ARRIVAL',
      ).length
      const callsCount = heldMessages.length + arrivalsToday

      const urgentCount = unrecorded.length + overdueDebts.length

      // ── The reminders panel's cards ─────────────────────────────────────
      // The panel the appointments page used to render, built from the same
      // `ReminderCard` shape and fed by the same `todaysReminders` read.
      const reminderCards: readonly ReminderCard[] = reminders.map((row) => {
        const meta = reminderMeta(row.kind)
        return {
          id: row.id,
          time: formatTime(fromUtcInstant(row.createdAt, 210).localTime),
          text: row.renderedText,
          customerName: row.customerName,
          badge: meta?.badge ?? null,
          badgeTone: meta?.tone ?? 'neutral',
          actionHref: meta?.href ?? null,
          actionLabel: meta?.label ?? null,
        }
      })

      // ── The cartable's rows ─────────────────────────────────────────────
      const tasks: TaskRow[] = []

      for (const appointment of unrecorded.slice(0, 2)) {
        tasks.push({
          id: `unrecorded-${appointment.id}`,
          priority: 'urgent',
          kind: 'overdue',
          description: `${RECEPTION_DESK.taskResultPendingPre}${formatTime(asLocalTime(appointment.localTime))}${RECEPTION_DESK.taskResultPendingPost}`,
          names:
            appointment.customerName === null
              ? []
              : [
                  appointment.serviceName === null
                    ? appointment.customerName
                    : `${appointment.customerName} · ${appointment.serviceName}`,
                ],
          action: {
            label: RECEPTION_DESK.actionRecordResult,
            href: '/reception/appointments?view=cartable',
          },
        })
      }

      if (overdueDebts.length > 0) {
        tasks.push({
          id: 'debts-past-due',
          priority: 'today',
          kind: 'debt',
          description: `${formatNumber(overdueDebts.length)} ${RECEPTION_DESK.taskDebtsOverdue}`,
          names: [
            `${RECEPTION_DESK.taskDebtTotalPre}${formatMoney(debtTotalRial)}`,
            ...overdueDebts
              .slice(0, 3)
              .map((row) =>
                row.customerLastName === null
                  ? row.customerFirstName
                  : `${row.customerFirstName} ${row.customerLastName}`,
              ),
          ],
          action: { label: RECEPTION_DESK.actionFollowDebt, href: '/reception/debts' },
        })
      }

      for (const reminder of heldMessages.slice(0, 3)) {
        tasks.push({
          id: `reminder-${reminder.id}`,
          priority: 'today',
          kind: 'call',
          description: `${reminder.customerName} — ${reminder.renderedText.slice(0, 50)}`,
          names: [],
          action: {
            label: RECEPTION_DESK.actionSendMessage,
            href: '/reception/customers',
          },
        })
      }

      // ── The free slots ──────────────────────────────────────────────────
      const freeSlots: FreeSlot[] = []
      for (const window of windows) {
        const taken = new Set(
          dayAppointments
            .filter((row) => row.doctorId === window.id)
            .map((row) => timeToMinutes(asLocalTime(row.localTime))),
        )
        let found: number | null = null
        for (const range of window.ranges) {
          for (let minute = range.startMinute; minute < range.endMinute; minute += 30) {
            if (!taken.has(minute)) {
              found = minute
              break
            }
          }
          if (found !== null) break
        }
        if (found !== null) {
          freeSlots.push({
            time: minutesToTime(found),
            doctorName: window.name,
            href: '/reception/appointments',
          })
        }
      }

      const dateLabel = formatDate(today, 'long')

      return (
        <div className="flex flex-col gap-4">
          <PageHeader
            dateLabel={dateLabel}
            countLabel={`${formatNumber(tasks.length)} ${RECEPTION_DESK.countTasksSuffix}`}
            firstFreeHref="/reception/appointments"
            bookHref="/reception/appointments"
          />

          <KpiRow
            urgent={urgentCount}
            calls={callsCount}
            appointments={appointmentsCount}
            debtRial={debtTotalRial}
            debtors={debtorsCount}
          />

          <div className="grid grid-cols-1 gap-4 panel:grid-cols-[minmax(0,1fr)_320px]">
            <TaskCartable rows={tasks} />
            <RemindersPanel reminders={reminderCards} />
          </div>

          <FreeSlotsCard slots={freeSlots} gridHref="/reception/appointments" />
        </div>
      )
    },
  )
}

/**
 * The badge, tone and follow-up a reminder shows, by the message's kind.
 *
 * The same mapping `reception/appointments` used before the panel moved here.
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