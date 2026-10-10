/**
 * The reception panel's home — «میز کار امروز», `02-architecture.md` §9's
 * `reception/` route.
 *
 * The desk is the receptionist's *starting* page: one screen that answers "what
 * needs me now". It is not a list of everything; the six pages behind it are
 * that. So the page reads four things and computes the three the receptionist
 * acts on directly:
 *
 * 1. **The day's appointments** — `appointments`'s clinic-wide grid, for the
 *    "نوبت امروز" count.
 * 2. **The unrecorded results** — `appointments`'s cartable, for the «فوری»
 *    count and the row's first entry.
 * 3. **The day's reminders** — `notifications`'s feed, which carries the held
 *    messages and the calls they imply.
 * 4. **The debts past due** — `debts`'s contact list, summed for the fourth
 *    KPI.
 *
 * The page computes every count from the rows it already loaded for its
 * sections, so a KPI cannot disagree with the list beneath it. Nothing here is
 * invented: if a read returns nothing, the row is omitted and the count is
 * zero — the demo's placeholder names never appear.
 *
 * ## Why the page is a Server Component
 *
 * Every read is a database read inside the request's tenant scope; every write
 * is a Server Action the rows link to. The page itself holds no state, and the
 * one interactive section — the cartable's filter — is a Client Component that
 * receives its rows as plain data.
 *
 * ## What this page deliberately does not do yet
 *
 * The free-slots card renders an empty state until `appointments` exposes a
 * query for "the first free slot of each working doctor today". That query does
 * not exist in the barrel today; when it lands, the `freeSlots` array below is
 * filled and the card renders.
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

import { requireStaffPanel } from '@/app/_shell/session'

import { clinicDay, doctorWindowsOnDay, unrecordedCartable } from '@/modules/appointments'
import { contactList as debtContactList } from '@/modules/debts'
import { todaysReminders } from '@/modules/notifications'

import { PANEL_HOMES, RECEPTION_DESK } from '@/app/catalog'
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

      // The four buckets, flattened. The three that are past their due date
      // are the ones the desk acts on today; the due-soon bucket is a warning,
      // not a task.
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

      // ── The cartable's rows ─────────────────────────────────────────────
      const tasks: TaskRow[] = []

      // 1. The unrecorded results — up to two rows for the most recent.
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

      // 2. The debts past due — one row for the whole set.
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

      // 3. The held reminders — up to three rows for the day's held sends.
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
      // The first free time of each working doctor today, computed from the
      // doctors' windows and the day's booked rows. Empty when every doctor is full.
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

          <TaskCartable rows={tasks} />

          <FreeSlotsCard slots={freeSlots} gridHref="/reception/appointments" />
        </div>
      )
    },
  )
}