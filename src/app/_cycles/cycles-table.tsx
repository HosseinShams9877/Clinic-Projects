/**
 * The cycle surfaces' shared table — the one row the three pages render.
 */

import { CYCLES_PAGE } from '@/app/catalog'
import { CYCLE_STATUS_LABELS } from '@/modules/cycles'
import type { ContactListEntry, CycleRow } from '@/modules/cycles'
import { CycleStatus, isMember } from '@/core/constants'
import {
  dateToLocalDate,
  formatDate,
  fromUtcInstant,
  formatPhone,
  toPersianDigits,
} from '@/core/localization'
import { cx } from '@/core/lib'

import type { CustomerOption, DoctorOption, ServiceOption } from '../_appointments/booking-dialog'
import { ContactListActions, OversightActions } from './cycle-forms'

/** The booking-options map a page may hand the desk's row actions. */
export interface CycleBookingOptions {
  readonly services: readonly ServiceOption[]
  readonly customers: readonly CustomerOption[]
  readonly doctorsByServiceId: Readonly<Record<string, readonly DoctorOption[]>>
  readonly freeSlotsByDoctorId: Readonly<Record<string, readonly string[]>>
}

/** The table's own props. */
export interface CyclesTableProps {
  readonly rows: readonly CycleRow[]
  readonly contactEntries?: Readonly<Record<string, ContactListEntry>>
  readonly utcOffsetMinutes: number
  readonly showDeskActions?: boolean
  readonly showOversightActions?: boolean
  readonly emptyMessage: string
  /**
   * The booking popup's own options, when the caller's page reads a day grid. The
   * desk's «رزرو جلسه بعدی» opens the popup against them; a page that does not
   * hand them renders the desk's other two writes and no booking button.
   */
  readonly bookingOptions?: CycleBookingOptions
}

export function CyclesTable({
  rows,
  contactEntries,
  utcOffsetMinutes,
  showDeskActions,
  showOversightActions,
  emptyMessage,
  bookingOptions,
}: CyclesTableProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{CYCLES_PAGE.reception.title}</caption>
        <thead>
          <tr className="border-b border-line-2 bg-surface-2 text-ink-3">
            <Th>{CYCLES_PAGE.columns.customer}</Th>
            <Th>{CYCLES_PAGE.columns.service}</Th>
            <Th>{CYCLES_PAGE.columns.doctor}</Th>
            <Th>{CYCLES_PAGE.columns.progress}</Th>
            <Th>{CYCLES_PAGE.columns.nextDue}</Th>
            <Th>{CYCLES_PAGE.columns.status}</Th>
            {contactEntries !== undefined ? <Th>{CYCLES_PAGE.columns.mobile}</Th> : null}
            <Th>{CYCLES_PAGE.columns.lastContact}</Th>
            <Th>{CYCLES_PAGE.columns.nextContact}</Th>
            {showDeskActions || showOversightActions ? <Th>{CYCLES_PAGE.columns.actions}</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <CycleRow
              key={row.id}
              row={row}
              entry={contactEntries?.[row.id]}
              utcOffsetMinutes={utcOffsetMinutes}
              showDeskActions={showDeskActions}
              showOversightActions={showOversightActions}
              bookingOptions={bookingOptions}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CycleRow({
  row,
  entry,
  utcOffsetMinutes,
  showDeskActions,
  showOversightActions,
  bookingOptions,
}: {
  readonly row: CycleRow
  readonly entry?: ContactListEntry
  readonly utcOffsetMinutes: number
  readonly showDeskActions?: boolean
  readonly showOversightActions?: boolean
  readonly bookingOptions?: CycleBookingOptions
}) {
  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-3 font-semibold text-ink">{row.customerName}</td>
      <td className="px-4 py-3 text-ink-2">{row.serviceName}</td>
      <td className="px-4 py-3 text-ink-2">{row.doctorName}</td>
     <td className="px-4 py-3 font-semibold text-ink tabular-nums">{progressOf(row)}</td>
      <td className="px-4 py-3 text-ink-2 tabular-nums">{dueLabel(row, entry, utcOffsetMinutes)}</td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      {entry !== undefined ? (
        <td className="px-4 py-3 text-ink-2 tabular-nums">
  <span dir="ltr" className="inline-block">
    {formatPhone(entry.mobile)}
  </span>
</td>
      ) : null}
      <td className="px-4 py-3 text-ink-2 tabular-nums">
        {row.lastContactAt === null ? '—' : formatDate(dateToLocalDate(row.lastContactAt), 'short')}
      </td>
      <td className="px-4 py-3 text-ink-2 tabular-nums">
        {row.nextContactAt === null ? '—' : formatDate(dateToLocalDate(row.nextContactAt), 'short')}
      </td>
      {showDeskActions && entry !== undefined ? (
        <td className="px-4 py-3">
          <ContactListActions
            entry={entry}
            services={bookingOptions?.services}
            customers={bookingOptions?.customers}
            doctorsByServiceId={bookingOptions?.doctorsByServiceId}
            freeSlotsByDoctorId={bookingOptions?.freeSlotsByDoctorId}
          />
        </td>
      ) : showOversightActions ? (
        <td className="px-4 py-3">
          <OversightActions cycleId={row.id} status={row.status} />
        </td>
      ) : null}
    </tr>
  )
}

function progressOf(row: CycleRow): string {
  const done = toPersianDigits(row.completedSessions)
  if (row.totalSessions === 0) return `${done} ${CYCLES_PAGE.columns.session}`
  return `${done} ${CYCLES_PAGE.columns.of} ${toPersianDigits(row.totalSessions)}`
}

function dueLabel(
  row: CycleRow,
  entry: ContactListEntry | undefined,
  utcOffsetMinutes: number,
): string {
  const due =
    entry?.dueLocalDate ??
    (row.nextDueDate === null ? null : fromUtcInstant(row.nextDueDate, utcOffsetMinutes).localDate)
  if (due === null) return '—'
  return `${formatDate(due, 'short')}${entry === undefined ? '' : ` (${toPersianDigits(entry.dueSessionNumber)})`}`
}

function StatusBadge({ status }: { readonly status: string }) {
  if (!isMember(CycleStatus, status)) {
    return <span className="text-ink-3">—</span>
  }
  return (
    <span
      className={cx(
        'inline-flex rounded-pill px-2 py-1 text-xs font-semibold',
        status === CycleStatus.Due
          ? 'bg-danger-bg text-danger'
          : status === CycleStatus.AtRisk
            ? 'bg-brand-100 text-brand-700'
            : status === CycleStatus.Completed
              ? 'bg-ok-bg text-ok'
              : status === CycleStatus.Abandoned
                ? 'bg-surface-sunken text-ink-3'
                : 'bg-neutral-bg text-ink-2',
      )}
    >
      {CYCLE_STATUS_LABELS[status]}
    </span>
  )
}

function Th({
  children,
  align = 'start',
}: {
  readonly children: React.ReactNode
  readonly align?: 'start' | 'center' | 'end'
}) {
  return (
    <th
      scope="col"
      className={cx(
        'whitespace-nowrap px-4 py-3 text-xs font-semibold',
        align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start',
      )}
    >
      {children}
    </th>
  )
}