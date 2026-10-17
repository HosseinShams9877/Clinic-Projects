// src/app/_customers/customers-table.tsx

'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Button } from '@/core/components/button'
import { Field, TextArea } from '@/core/components/form'
import { Icon } from '@/core/components/icons'
import { CUSTOMERS_PAGE, CUSTOMER_PROFILE_PAGE } from '@/app/catalog'
import {
  CUSTOMER_LIFECYCLE_LABELS,
  LEAD_STATUS_LABELS,
} from '@/modules/customers'
import type { CustomerListRow } from '@/modules/customers'
import {
  dateToLocalDate,
  formatDate,
  formatPhone,
  toPersianDigits,
} from '@/core/localization'
import { CustomerLifecycle, LeadStatus, isMember } from '@/core/constants'
import { cx } from '@/core/lib'

import { updateCustomerNoteAction } from './actions'

export interface CustomersTableProps {
  readonly rows: readonly CustomerListRow[]
  readonly doctorNames: Readonly<Record<string, string>>
  readonly profileBasePath?: string
  readonly showBookAction?: boolean
  readonly emptyMessage: string
  readonly panel?: 'admin' | 'reception' | 'doctor'
}

export function CustomersTable({
  rows,
  doctorNames,
  profileBasePath,
  showBookAction,
  emptyMessage,
  panel,
}: CustomersTableProps) {
  const router = useRouter()
  const [noteCustomerId, setNoteCustomerId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [pending, startTransition] = useTransition()

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
        {emptyMessage}
      </p>
    )
  }

  function submitNote() {
    if (!noteCustomerId || noteText.trim() === '') return
    startTransition(async () => {
      const outcome = await updateCustomerNoteAction('doctor', noteCustomerId, noteText.trim())
      if (outcome.ok) {
        setNoteCustomerId(null)
        setNoteText('')
        router.refresh()
      } else {
        alert(outcome.message)
      }
    })
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-line-2 bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{CUSTOMERS_PAGE.reception.title}</caption>
            <thead className="bg-surface-2">
              <tr className="border-b border-line-2 text-ink-3">
                <Th>{CUSTOMERS_PAGE.columns.name}</Th>
                <Th>{CUSTOMERS_PAGE.columns.mobile}</Th>
                <Th>{CUSTOMERS_PAGE.columns.lifecycle}</Th>
                <Th>{CUSTOMERS_PAGE.columns.leadStatus}</Th>
                <Th>{CUSTOMERS_PAGE.columns.primaryDoctor}</Th>
                <Th>{CUSTOMERS_PAGE.columns.lastVisit}</Th>
                <Th>{CUSTOMERS_PAGE.columns.sessions}</Th>
                {showBookAction ? <Th>{CUSTOMERS_PAGE.columns.actions}</Th> : null}
                {panel === 'doctor' ? <Th align="end">{CUSTOMERS_PAGE.columns.actions}</Th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <CustomerRow
                  key={row.id}
                  row={row}
                  doctorNames={doctorNames}
                  profileBasePath={profileBasePath}
                  showBookAction={showBookAction}
                  panel={panel}
                  onNoteClick={() => setNoteCustomerId(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {noteCustomerId && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[400px] overflow-hidden rounded-xl bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-base font-bold text-ink">
                {CUSTOMER_PROFILE_PAGE.note.modalTitle}
              </h2>
              <button
                type="button"
                onClick={() => setNoteCustomerId(null)}
                className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-danger"
                aria-label={CUSTOMER_PROFILE_PAGE.note.close}
              >
                <Icon name="close" size="compact" />
              </button>
            </div>
            
            <div className="p-5">
              <Field label={CUSTOMER_PROFILE_PAGE.fields.doctorNote}>
                <TextArea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={4}
                  placeholder={CUSTOMER_PROFILE_PAGE.note.modalPlaceholder}
                  className="w-full resize-none"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-4">
              <Button variant="ghost" onClick={() => setNoteCustomerId(null)} disabled={pending}>
                {CUSTOMER_PROFILE_PAGE.note.cancel}
              </Button>
              <Button variant="primary" onClick={submitNote} disabled={pending || noteText.trim() === ''}>
                {CUSTOMER_PROFILE_PAGE.note.save}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

function CustomerRow({
  row,
  doctorNames,
  profileBasePath,
  showBookAction,
  panel,
  onNoteClick,
}: {
  readonly row: CustomerListRow
  readonly doctorNames: Readonly<Record<string, string>>
  readonly profileBasePath?: string
  readonly showBookAction?: boolean
  readonly panel?: 'admin' | 'reception' | 'doctor'
  readonly onNoteClick: () => void
}) {
  const name = row.lastName === null ? row.firstName : `${row.firstName} ${row.lastName}`
  const doctorName = row.primaryDoctorId === null ? null : (doctorNames[row.primaryDoctorId] ?? null)

  return (
    <tr className="group border-b border-line-2 transition-colors last:border-b-0 hover:bg-surface-2/50">
      <td className="px-4 py-3 font-semibold text-ink">
        {profileBasePath === undefined ? (
          name
        ) : (
          <Link
            href={`${profileBasePath}/${row.id}`}
            className="text-brand-700 transition-colors group-hover:text-brand-800 hover:underline"
          >
            {name}
          </Link>
        )}
      </td>
      <td className="px-4 py-3 text-ink-2 tabular-nums">
        <span dir="ltr" className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-xs">
          {formatPhone(row.mobile)}
        </span>
      </td>
      <td className="px-4 py-3">
        <LifecycleBadge lifecycle={row.lifecycle} />
      </td>
      <td className="px-4 py-3 text-ink-2">
        {row.leadStatus === null ? (
          '—'
        ) : (
          <LeadStatusBadge status={row.leadStatus} />
        )}
      </td>
      <td className="px-4 py-3 text-ink-2">{doctorName ?? '—'}</td>
      <td className="px-4 py-3 text-ink-2 tabular-nums">
        {row.lastVisitAt === null ? '—' : formatDate(dateToLocalDate(row.lastVisitAt), 'short')}
      </td>
      <td className="px-4 py-3 font-semibold text-ink tabular-nums">
        {toPersianDigits(row.completedSessions)}
      </td>
      
      {showBookAction ? (
        <td className="px-4 py-3">
          <Link
            href="/reception/appointments"
            className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 no-underline transition-colors hover:bg-brand-100"
          >
            <Icon name="appointment" size="compact" />
            {CUSTOMERS_PAGE.actions.book}
          </Link>
        </td>
      ) : null}

      {panel === 'doctor' ? (
        <td className="px-4 py-3 text-end">
          <div className="flex items-center justify-end gap-2 opacity-90 transition-opacity group-hover:opacity-100">
            {profileBasePath && (
              <Link
                href={`${profileBasePath}/${row.id}`}
                className="inline-flex items-center gap-1 rounded-md bg-brand-btn px-3 py-1.5 text-xs font-semibold text-ink-inverse no-underline shadow-brand transition-colors hover:bg-brand-600"
              >
                {CUSTOMERS_PAGE.actions.file}
              </Link>
            )}
            <Button 
              size="small" 
              variant="outline" 
              onClick={onNoteClick}
              className="rounded-md px-2.5 py-1.5 text-xs"
            >
              {CUSTOMERS_PAGE.actions.note}
            </Button>
          </div>
        </td>
      ) : null}
    </tr>
  )
}

function LifecycleBadge({ lifecycle }: { readonly lifecycle: string }) {
  if (!isMember(CustomerLifecycle, lifecycle)) {
    return <span className="text-ink-3">—</span>
  }
  const isCustomer = lifecycle === CustomerLifecycle.Customer
  return (
    <span
      className={cx(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
        isCustomer 
          ? 'bg-ok-bg/50 text-ok border border-ok/20' 
          : 'bg-neutral-bg text-ink-2 border border-line-2',
      )}
    >
      {CUSTOMER_LIFECYCLE_LABELS[lifecycle]}
    </span>
  )
}

function LeadStatusBadge({ status }: { readonly status: string }) {
  if (!isMember(LeadStatus, status)) return <span className="text-ink-3">—</span>
  return (
    <span
      className={cx(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
        status === LeadStatus.Converted 
          ? 'bg-ok-bg/50 text-ok border border-ok/20' 
          : 'bg-surface-sunken text-ink-3 border border-line-2',
      )}
    >
      {LEAD_STATUS_LABELS[status]}
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
        'whitespace-nowrap px-4 py-3.5 text-xs font-bold uppercase tracking-wider',
        align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start',
      )}
    >
      {children}
    </th>
  )
}