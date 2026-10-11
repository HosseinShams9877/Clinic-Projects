/**
 * «خروجی» — download the clinic's open balances as a CSV.
 *
 * Client-only: it builds the file from the rows the server already passed (no new query),
 * with the same columns as the manager's table, in Persian digits, prefixed with a UTF-8
 * BOM so Excel renders Persian correctly. The filename carries a Latin-digit date for the
 * filesystem. It exports the filtered file — every page of it — and not the ten rows the
 * current page shows.
 */

'use client'

import { Button } from '@/core/components/button'
import { asLocalDate, dateToLocalDate, formatDate, formatMoney, toPersianDigits } from '@/core/localization'

import { ADMIN_DEBTS } from '@/app/admin/catalog'
import type { DebtRow } from '@/modules/debts'

export interface ExportButtonProps {
  /** The rows the current filters leave, every page of them. */
  readonly rows: readonly DebtRow[]
  /** The service ids → names map, as the page looked them up for the table's «بابت». */
  readonly serviceNames: Readonly<Record<string, string>>
  /** The membership ids → names map, as the page looked them up for the table's «پزشک». */
  readonly doctorNames: Readonly<Record<string, string>>
  /** The clinic-local day, as the status column's delay is counted from. */
  readonly today: string
  /** The Latin-digit date stamp for the filename, from the server's injected clock. */
  readonly dateStamp: string
}

export function ExportButton({ rows, serviceNames, doctorNames, today, dateStamp }: ExportButtonProps) {
  function onExport() {
    const headers = [
      ADMIN_DEBTS.columns.customer,
      ADMIN_DEBTS.columns.service,
      ADMIN_DEBTS.columns.doctor,
      ADMIN_DEBTS.columns.balance,
      ADMIN_DEBTS.columns.due,
      ADMIN_DEBTS.columns.status,
      ADMIN_DEBTS.columns.followUp,
    ]
    const body = rows.map((row) => [
      row.customerLastName === null ? row.customerFirstName : `${row.customerFirstName} ${row.customerLastName}`,
      serviceNames[row.serviceId ?? ''] ?? '—',
      doctorNames[row.doctorId] ?? '—',
      formatMoney(row.balance),
      formatDate(asLocalDate(row.dueLocalDate), 'short'),
      delayLabel(row.dueLocalDate, today),
      row.debtFollowUpAt === null
        ? ADMIN_DEBTS.notFollowedUp
        : formatDate(dateToLocalDate(row.debtFollowUpAt), 'short'),
    ])
    const csv = [headers, ...body].map((cells) => cells.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `debts-${dateStamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" leadingIcon="download" onClick={onExport}>
      {ADMIN_DEBTS.exportLabel}
    </Button>
  )
}

/** The status cell's own sentence, as the export's column writes it. */
function delayLabel(dueLocalDate: string, today: string): string {
  const delay = Math.round((Date.parse(today) - Date.parse(dueLocalDate)) / 86_400_000)
  if (delay === 0) return ADMIN_DEBTS.dueToday
  if (delay > 0) return `${toPersianDigits(delay)} ${ADMIN_DEBTS.daysLateSuffix}`
  return `${toPersianDigits(-delay)} ${ADMIN_DEBTS.daysLeftSuffix}`
}

/** One CSV cell, quoted and with embedded quotes doubled. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
