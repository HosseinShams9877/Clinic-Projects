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
  todayLocalDate,
} from '@/core/localization'
import { realClock } from '@/core/lib/clock'

import { requireStaffPanel } from '@/app/_shell/session'

import { clinicDay, unrecordedCartable } from '@/modules/appointments'
import { contactList as debtContactList } from '@/modules/debts'
import { todaysReminders } from '@/modules/notifications'

import { FreeSlotsCard, type FreeSlot } from './_components/free-slots-card'
import { KpiRow } from './_components/kpi-row'
import { PageHeader } from './_components/page-header'
import { TaskCartable, type TaskRow } from './_components/task-cartable'

export const metadata: Metadata = { title: 'میز کار امروز' }

export default async function DeskPage() {
  const session = await requireStaffPanel('reception')
  const now = realClock()
  const today = todayLocalDate(now)

  return runInTenantScope(
    tenantContextOf({ tenantId: session.tenantId }),
    prisma(),
    async (tx) => {
      const [dayAppointments, unrecorded, reminders, debtBuckets] = await Promise.all([
        clinicDay({ tx, ctx: session.permissions, clinicId: null, localDate: today }),
        unrecordedCartable({ tx, tenantId: session.tenantId }),
        todaysReminders(tx, session.tenantId, now),
        debtContactList({ tx, ctx: session.permissions, now }),
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
          description: `نتیجه نوبت ${formatTime(asLocalTime(appointment.localTime))} ثبت نشده`,
          names:
            appointment.customerName === null
              ? []
              : [
                  appointment.serviceName === null
                    ? appointment.customerName
                    : `${appointment.customerName} · ${appointment.serviceName}`,
                ],
          action: {
            label: 'ثبت نتیجه',
            href: `/reception/appointments/${appointment.id}/result`,
          },
        })
      }

      // 2. The debts past due — one row for the whole set.
      if (overdueDebts.length > 0) {
        tasks.push({
          id: 'debts-past-due',
          priority: 'today',
          kind: 'debt',
          description: `${formatNumber(overdueDebts.length)} بدهی سررسیدشان گذشته`,
          names: [
            `مجموع ${formatMoney(debtTotalRial)}`,
            ...overdueDebts
              .slice(0, 3)
              .map((row) =>
                row.customerLastName === null
                  ? row.customerFirstName
                  : `${row.customerFirstName} ${row.customerLastName}`,
              ),
          ],
          action: { label: 'پیگیری بدهی', href: '/reception/debts' },
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
            label: 'ارسال پیام',
            href: `/reception/customers/${reminder.customerId}`,
          },
        })
      }

      // ── The free slots ──────────────────────────────────────────────────
      // The grid's own slot generation lands in a follow-up phase; until then
      // the card renders an empty state rather than a fabricated slot.
      const freeSlots: FreeSlot[] = []

      const dateLabel = formatDate(today, 'long')

      return (
        <div className="flex flex-col gap-4">
          <PageHeader
            dateLabel={dateLabel}
            countLabel={`${formatNumber(tasks.length)} کار برای امروز`}
            firstFreeHref="/reception/appointments"
            bookHref="/reception/appointments/new"
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