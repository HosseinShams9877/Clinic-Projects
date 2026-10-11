/**
 * «خروجی Excel» — download the current customer list as a CSV.
 *
 * Client-only: it builds the file from the rows the server already passed (no new
 * query), with the same columns as the table, in Persian digits, prefixed with a UTF-8
 * BOM so Excel renders Persian correctly. The filename carries a Latin-digit date for
 * the filesystem. It exports the current filter/search result, every page of it.
 */

'use client'

import { Button } from '@/core/components/button'
import { CustomerLifecycle, LeadStatus, isMember } from '@/core/constants'
import { dateToLocalDate, formatDate, formatPhone, toPersianDigits } from '@/core/localization'
import { CUSTOMER_LIFECYCLE_LABELS, LEAD_STATUS_LABELS } from '@/modules/customers'
import type { CustomerListRow } from '@/modules/customers'

import { CUSTOMERS_PAGE, RECEPTION_CUSTOMERS } from '@/app/catalog'

export interface ExportButtonProps {
  readonly rows: readonly CustomerListRow[]
  readonly doctorNames: Readonly<Record<string, string>>
  /** The Latin-digit date stamp for the filename, from the server's injected clock. */
  readonly dateStamp: string
}

export function ExportButton({ rows, doctorNames, dateStamp }: ExportButtonProps) {
  function onExport() {
    const headers = [
      CUSTOMERS_PAGE.columns.name,
      CUSTOMERS_PAGE.columns.mobile,
      CUSTOMERS_PAGE.columns.lifecycle,
      CUSTOMERS_PAGE.columns.leadStatus,
      CUSTOMERS_PAGE.columns.primaryDoctor,
      CUSTOMERS_PAGE.columns.lastVisit,
      CUSTOMERS_PAGE.columns.sessions,
    ]
    const body = rows.map((row) => [
      row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`,
      formatPhone(row.mobile),
      isMember(CustomerLifecycle, row.lifecycle) ? CUSTOMER_LIFECYCLE_LABELS[row.lifecycle] : '—',
      row.leadStatus !== null && isMember(LeadStatus, row.leadStatus) ? LEAD_STATUS_LABELS[row.leadStatus] : '—',
      row.primaryDoctorId === null ? '—' : (doctorNames[row.primaryDoctorId] ?? '—'),
      row.lastVisitAt === null ? '—' : formatDate(dateToLocalDate(row.lastVisitAt), 'short'),
      toPersianDigits(row.completedSessions),
    ])
    const csv = [headers, ...body].map((cells) => cells.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `customers-${dateStamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" leadingIcon="download" onClick={onExport}>
      {RECEPTION_CUSTOMERS.exportLabel}
    </Button>
  )
}

/** One CSV cell, quoted and with embedded quotes doubled. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
