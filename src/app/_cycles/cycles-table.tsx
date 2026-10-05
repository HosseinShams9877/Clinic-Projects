/**
 * The cycle surfaces' shared table — the one row the three pages render.
 *
 * The three pages (`reception/cycles`, `admin/cycles`, `doctor/cycles`) are one row read
 * through three permissions, which is why the table is one component and the three pages
 * differ only in the copy block they hand it and the writes they offer. A fourth table
 * would be a fourth place a course's columns are decided.
 *
 * ## Why the names are relations the module already joined
 *
 * `ContactListEntry` and `CycleRow` carry `serviceName`, `doctorName` and `customerName`
 * because the module reads them through the live relations (`queries.ts`'s header) — no
 * `serviceName` column exists anywhere in the schema, and the catalogue may rename a
 * service after a course started. The table renders those and never an id, because a
 * uuid is not a column a person reads.
 *
 * ## Why the progress column is derived and not stored
 *
 * `completedSessions` and `totalSessions` are the row's own, and the column renders the
 * two beside each other: a bounded course reads «۳ از ۶» and an unbounded one reads
 * «۳ جلسه», because `totalSessions = 0` is the open-ended course the manager closes by
 * hand. A division by zero is not a number the page can render, so the two shapes are
 * two branches rather than one format.
 *
 * ## Why the empty state is the caller's sentence
 *
 * The three pages' empty states are three different facts: the desk's list is empty
 * because nothing is due, the manager's table is empty because no course exists, and the
 * doctor's is empty because the doctor has no course. One component renders the row and
 * the caller names the absence.
 */

import { CYCLES_PAGE } from '@/app/catalog'
import { CYCLE_STATUS_LABELS } from '@/modules/cycles'
import type { ContactListEntry, CycleRow } from '@/modules/cycles'
import { CycleStatus, isMember } from '@/core/constants'
import { dateToLocalDate, formatDate, fromUtcInstant, formatPhone, toPersianDigits } from '@/core/localization'
import { cx } from '@/core/lib'

import { ContactListActions, OversightActions } from './cycle-forms'

/** The table's own props: the rows, the writes the caller's panel may offer, and the copy. */
export interface CyclesTableProps {
  /** The rows, as the module's own reads answer them. */
  readonly rows: readonly CycleRow[]
  /** The desk's contact-list entries, keyed by cycle id, when the caller is the desk. */
  readonly contactEntries?: Readonly<Record<string, ContactListEntry>>
  /**
   * The tenant's own offset, which the stored instants are converted by — a due date the
   * desk reads as a day has to land on that day in the clinic's clock.
   */
  readonly utcOffsetMinutes: number
  /** Whether the desk's three row actions belong on the table. */
  readonly showDeskActions?: boolean
  /** Whether the manager's two row actions belong on the table. */
  readonly showOversightActions?: boolean
  /** The sentence for a table with no rows, from the caller's own copy block. */
  readonly emptyMessage: string
}

/**
 * The courses, as the three pages render them.
 *
 * The contact list's own column — the mobile the desk dials — renders only when the
 * caller handed the entries, which is the desk's page and not the other two.
 */
export function CyclesTable({
  rows,
  contactEntries,
  utcOffsetMinutes,
  showDeskActions,
  showOversightActions,
  emptyMessage,
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
          <tr className="border-b border-line bg-surface-2 text-ink-3">
            <Th>{CYCLES_PAGE.columns.customer}</Th>
            <Th>{CYCLES_PAGE.columns.service}</Th>
            <Th>{CYCLES_PAGE.columns.doctor}</Th>
            <Th className="text-end">{CYCLES_PAGE.columns.progress}</Th>
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
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One course, as the table renders it. */
function CycleRow({
  row,
  entry,
  utcOffsetMinutes,
  showDeskActions,
  showOversightActions,
}: {
  readonly row: CycleRow
  readonly entry?: ContactListEntry
  readonly utcOffsetMinutes: number
  readonly showDeskActions?: boolean
  readonly showOversightActions?: boolean
}) {
  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-3 font-semibold text-ink">{row.customerName}</td>
      <td className="px-4 py-3 text-ink-2">{row.serviceName}</td>
      <td className="px-4 py-3 text-ink-2">{row.doctorName}</td>
      <td className="px-4 py-3 text-end font-semibold text-ink tabular-nums">
        {progressOf(row)}
      </td>
      <td className="px-4 py-3 text-ink-2 tabular-nums">{dueLabel(row, entry, utcOffsetMinutes)}</td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      {entry !== undefined ? (
        <td className="px-4 py-3 text-ink-2 tabular-nums" dir="ltr">
          {formatPhone(entry.mobile)}
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
          <ContactListActions entry={entry} />
        </td>
      ) : showOversightActions ? (
        <td className="px-4 py-3">
          <OversightActions cycleId={row.id} status={row.status} />
        </td>
      ) : null}
    </tr>
  )
}

/**
 * The course's progress, as the two shapes of course render it.
 *
 * `totalSessions = 0` is the unbounded course — no total to reach and no fraction to
 * render, so the column names the sessions it holds. A bounded course reads as a
 * fraction, which is what tells the desk how many sessions remain without a second
 * column for it.
 */
function progressOf(row: CycleRow): string {
  const done = toPersianDigits(row.completedSessions)
  if (row.totalSessions === 0) return `${done} ${CYCLES_PAGE.columns.session}`
  return `${done} ${CYCLES_PAGE.columns.of} ${toPersianDigits(row.totalSessions)}`
}

/**
 * The day the next session is due, as the desk reads it.
 *
 * The module stores the instant at the day's own start in the clinic's clock, so the
 * local date the row already carries is the day the person reads — no conversion here,
 * because the module did it and a second one would be the one that lands on the wrong
 * day.
 */
function dueLabel(row: CycleRow, entry: ContactListEntry | undefined, utcOffsetMinutes: number): string {
  const due =
    entry?.dueLocalDate ??
    (row.nextDueDate === null ? null : fromUtcInstant(row.nextDueDate, utcOffsetMinutes).localDate)
  if (due === null) return '—'
  return `${formatDate(due, 'short')}${entry === undefined ? '' : ` (${toPersianDigits(entry.dueSessionNumber)})`}`
}

/** One status, as the chip the column renders. */
function StatusBadge({ status }: { readonly status: string }) {
  if (!isMember(CycleStatus, status)) {
    // A status the catalog does not hold is a row a release this one does not know; the
    // raw code is not Persian copy, so the dash is what the column renders.
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

/** One column header, with the alignment the design system's tables keep. */
function Th({
  children,
  className,
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <th
      scope="col"
      className={cx('whitespace-nowrap px-4 py-3 text-start text-xs font-semibold', className)}
    >
      {children}
    </th>
  )
}
