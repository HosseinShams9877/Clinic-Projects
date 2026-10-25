'use client'

import { useState } from 'react'
import { asLocalDate, dateToLocalDate, formatDate, formatMoney, formatPhone, toPersianDigits } from '@/core/localization'
import { cx } from '@/core/lib'
import { ADMIN_DEBTS } from '@/app/admin/catalog'
import type { DebtRow } from '@/modules/debts'
import { daysBetween } from './helpers'
import { PaymentDialog } from './PaymentDialog'
import { FollowUpDialog } from './FollowUpDialog'

const PROFILE_BASE_PATH = '/admin/customer'

export const DEBT_COLUMNS = [
  { key: 'customer', width: 'w-[16%]', align: 'start' },
  { key: 'doctor', width: 'w-[10%]', align: 'start' },
  { key: 'service', width: 'w-[12%]', align: 'start' },
  { key: 'due', width: 'w-[10%]', align: 'start' },
  { key: 'status', width: 'w-[10%]', align: 'start' },
  { key: 'balance', width: 'w-[12%]', align: 'start' },
  { key: 'stage', width: 'w-[10%]', align: 'start' },
  { key: 'followUp', width: 'w-[10%]', align: 'start' },
  { key: 'nextFollowUp', width: 'w-[8%]', align: 'start' },
  { key: 'action', width: 'w-[15%]', align: 'start' },
] as const

export interface DebtRowViewProps {
  readonly row: DebtRow
  readonly today: string
  readonly serviceName: string | null
  readonly doctorName: string | null
}

export function DebtRowView({ row, today, serviceName, doctorName }: DebtRowViewProps) {
  const name = row.customerLastName === null ? row.customerFirstName : `${row.customerFirstName} ${row.customerLastName}`
  const delay = daysBetween(row.dueLocalDate, today)
  
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false)

  return (
    <>
      <tr className="border-b border-line last:border-b-0 hover:bg-surface-2">
        <td className="px-4 py-3 text-start align-middle">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-bg text-xs font-bold text-info" aria-hidden="true">
              {row.customerFirstName.slice(0, 1)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-ink">{name}</span>
              <span className="self-start text-xs text-ink-3 tabular-nums" dir="ltr">
                {formatPhone(row.customerMobile)}
              </span>
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-start align-middle text-ink-2">{doctorName ?? '—'}</td>
        <td className="px-4 py-3 text-start align-middle text-ink-2">{serviceName ?? '—'}</td>
        <td className="px-4 py-3 text-start align-middle text-ink-3 tabular-nums">
          {formatDate(asLocalDate(row.dueLocalDate), 'short')}
        </td>
        <td className="px-4 py-3 text-start align-middle">
          {delay > 0 ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-danger-bg px-3 py-1 text-xs font-semibold text-danger tabular-nums">
              <span className="size-1.5 rounded-full bg-danger"></span>
              {toPersianDigits(delay)} {ADMIN_DEBTS.daysLateSuffix}
            </span>
          ) : delay === 0 ? (
            <span className="inline-flex whitespace-nowrap rounded-pill bg-warn-bg px-3 py-1 text-xs font-semibold text-warn">
              {ADMIN_DEBTS.dueToday}
            </span>
          ) : (
            <span className="inline-flex whitespace-nowrap rounded-pill bg-info-bg px-3 py-1 text-xs font-semibold text-info tabular-nums">
              {toPersianDigits(-delay)} {ADMIN_DEBTS.daysLeftSuffix}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-start align-middle font-bold text-ink tabular-nums">
          {formatMoney(row.balance)}
        </td>
               <td className="px-4 py-3 text-start align-middle">
          {row.totalInstallments > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-ink-2 whitespace-nowrap">
                {/* 👈 نمایش چک یا قسط بر اساس نوع */}
                {(row as any).type === 'CHEQUE' ? 'چک' : 'قسط'} {toPersianDigits(row.paidInstallments + 1)} از {toPersianDigits(row.totalInstallments)}
              </span>
              <span className="text-xs text-ink-3">
                {toPersianDigits(row.paidInstallments)} از {toPersianDigits(row.totalInstallments)} پرداخت شده
              </span>
            </div>
          ) : (
            <span className="text-xs text-ink-3">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-start align-middle">
          {row.lastFollowUp === null ? (
            <span className="text-xs text-ink-3">{ADMIN_DEBTS.notFollowedUp}</span>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-2 whitespace-nowrap">{ADMIN_DEBTS.followedUp}</span>
              <span className="text-xs text-ink-3 tabular-nums whitespace-nowrap">
                {formatDate(dateToLocalDate(row.lastFollowUp.at), 'short')}
              </span>
              {row.lastFollowUp.note && (
                <span className="text-[11px] text-ink-3 line-clamp-2 leading-tight mt-0.5" title={row.lastFollowUp.note}>
                  {row.lastFollowUp.note}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-start align-middle">
          {row.nextContactAt === null ? (
            <span className="text-xs text-ink-3">—</span>
          ) : (
            <span className="inline-flex rounded-pill bg-warn-bg px-3 py-1 text-xs font-semibold text-warn tabular-nums">
              {formatDate(dateToLocalDate(row.nextContactAt), 'short')}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-start align-middle">
          <div className="flex flex-row items-center gap-2 flex-nowrap">
            <button 
              onClick={() => setIsFollowUpOpen(true)}
              className="rounded-full border border-line-2 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition-colors whitespace-nowrap shadow-sm"
            >
              ثبت پیگیری
            </button>
            <button
              onClick={() => setIsPaymentOpen(true)}
              className="rounded-full bg-[#ba6a73] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity whitespace-nowrap shadow-sm"
            >
              ثبت پرداخت
            </button>
          </div>
        </td>
      </tr>

      {isPaymentOpen && (
        <PaymentDialog 
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          customerId={row.customerId}
          appointmentId={row.appointmentId}
          customerName={name}
          amountDue={row.installmentAmount > 0n ? row.installmentAmount : row.balance}
          totalAmountDue={row.balance}
          remainingAmount={row.balance}   // 👈 اضافه شد
          installmentId={row.installmentId}
          onSuccess={() => setIsPaymentOpen(false)}
        />
      )}

      {isFollowUpOpen && (
        <FollowUpDialog
          isOpen={isFollowUpOpen}
          onClose={() => setIsFollowUpOpen(false)}
          appointmentId={row.appointmentId}
          customerName={name}
          amountDue={row.balance}
          onSuccess={() => setIsFollowUpOpen(false)}
        />
      )}
    </>
  )
}

export function Th({ children, align = 'start', className }: { readonly children: React.ReactNode; readonly align?: 'start' | 'end'; readonly className?: string }) {
  return (
    <th
      scope="col"
      className={cx(
        'whitespace-nowrap px-4 py-3 align-middle text-xs font-semibold text-ink-3 bg-surface-2/50',
        align === 'end' ? 'text-end' : 'text-start',
        className,
      )}
    >
      {children}
    </th>
  )
}