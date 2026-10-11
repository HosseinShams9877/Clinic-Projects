/**
 * «خروجی» — download the manager's customer file as a CSV.
 *
 * Client-only: it builds the file from the rows the server already passed (no new
 * query), with the same columns as the manager's table, in Persian digits, prefixed
 * with a UTF-8 BOM so Excel renders Persian correctly. The filename carries a
 * Latin-digit date for the filesystem. It exports the current filter/search result,
 * every page of it.
 */

'use client'

import { Button } from '@/core/components/button'
import { AcquisitionSource, isMember } from '@/core/constants'
import {
  asLocalDate,
  dateToLocalDate,
  formatDate,
  formatMoney,
  formatPhone,
  toPersianDigits,
} from '@/core/localization'
import { ACQUISITION_SOURCE_LABELS } from '@/modules/customers'
import type { CustomerListRow } from '@/modules/customers'

import { ADMIN_CUSTOMERS } from '@/app/admin/catalog'

export interface ExportButtonProps {
  readonly rows: readonly CustomerListRow[]
  /** The Latin-digit date stamp for the filename, from the server's injected clock. */
  readonly dateStamp: string
}

export function ExportButton({ rows, dateStamp }: ExportButtonProps) {
  function onExport() {
    const headers = [
      ADMIN_CUSTOMERS.columns.name,
      ADMIN_CUSTOMERS.columns.mobile,
      ADMIN_CUSTOMERS.columns.birthday,
      ADMIN_CUSTOMERS.columns.source,
      ADMIN_CUSTOMERS.columns.lastVisit,
      ADMIN_CUSTOMERS.columns.visits,
      ADMIN_CUSTOMERS.columns.balance,
    ]
    const body = rows.map((row) => [
      row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`,
      formatPhone(row.mobile),
      row.birthDate === null ? '—' : formatDate(asLocalDate(row.birthDate), 'short'),
      sourceLabel(row.acquisitionSource),
      row.lastVisitAt === null ? '—' : formatDate(dateToLocalDate(row.lastVisitAt), 'short'),
      toPersianDigits(row.completedSessions),
      formatMoney(row.chargedTotal - row.paidTotal),
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
      {ADMIN_CUSTOMERS.exportLabel}
    </Button>
  )
}

/** One acquisition source, or the dash a person the form never named renders. */
function sourceLabel(source: string | null): string {
  if (source === null) return '—'
  if (!isMember(AcquisitionSource, source)) return source
  return ACQUISITION_SOURCE_LABELS[source]
}

/** One CSV cell, quoted and with embedded quotes doubled. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
