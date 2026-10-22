'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cx } from '@/core/lib'
import { formatDate, formatMoney, toPersianDigits, dateToLocalDate } from '@/core/localization'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'

import { InstallmentPaymentDialog } from '@/app/admin/installments/_components/InstallmentPaymentDialog'

const PAYMENT_KIND_LABELS: Record<string, string> = {
  PAYMENT: 'پرداخت',
  REFUND: 'بازگشت وجه',
  INSTALLMENT: 'قسط',
  CASH: 'نقدی',
  SETTLEMENT: 'تسویه',
  PARTIAL: 'جزئی',
  FINAL: 'تسویه نهایی',
  DEPOSIT: 'بیعانه',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدی',
  CARD: 'کارت به کارت',
  POS: 'کارتخوان',
  ONLINE: 'آنلاین',
  BANK_TRANSFER: 'انتقال بانکی',
  CHEQUE: 'چک',
}

export type InstallmentRow = {
  id: string
  appointmentId: string
  sequence: number
  amount: bigint
  dueAt: Date
  note: string | null
  status: 'PAID' | 'PENDING' | 'OVERDUE' | 'REFUNDED' | 'PARTIAL'
  paidAmount: bigint
  paidAt: Date | null
  paymentMethod: string | null
}

export type PaymentRow = {
  id: string
  amount: bigint
  paidAt: Date | null
  method: string
  kind: string
}

interface PaymentsTabProps {
  customerId: string
  totalAmount: bigint
  totalPaid: bigint
  totalRemaining: bigint
  nextDueDate: Date | null
  nextDueAmount: bigint
  installments: InstallmentRow[]
  payments: PaymentRow[]
  totalInstallmentsAmount: bigint
  totalPaidOnInstallments: bigint
  totalCount: number
}

export function PaymentsTab({
  customerId,
  totalAmount,
  totalPaid,
  totalRemaining,
  nextDueDate,
  nextDueAmount,
  installments,
  payments,
  totalInstallmentsAmount,
  totalPaidOnInstallments,
  totalCount,
}: PaymentsTabProps) {
  const router = useRouter()
  
  const [activeSubTab, setActiveSubTab] = useState<'schedule' | 'open' | 'received' | 'invoices'>('schedule')
  const [isHistoryOpen, setIsHistoryOpen] = useState(true)

  const [paymentDialogData, setPaymentDialogData] = useState<{ isOpen: boolean; installmentId: string; amount: bigint } | null>(null)

  const totalAllInstallmentsAmount = totalInstallmentsAmount
  
  const progressPercent = totalAllInstallmentsAmount === 0n 
    ? 0 
    : Math.min(100, Math.round(Number((totalPaidOnInstallments * 100n) / totalAllInstallmentsAmount)))
    
  // 👈 اصلاح شد: بررسی undefined بودن
  const firstInst = installments[0]
  const installmentAmount = installments.length > 0 && firstInst ? firstInst.amount : 0n
  
  const paidCount = installmentAmount > 0n 
    ? Math.min(totalCount, Number(totalPaidOnInstallments / installmentAmount)) 
    : 0

  const recentPayments = payments.slice(0, 20)

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-6">
      {/* ۱. کارت‌های آماری */}
      <div className="grid w-full grid-cols-2 gap-2.5 sm:gap-3 panel:grid-cols-4">
        <StatCard
          title="هزینه کل خدمات"
          value={formatMoney(totalAmount)}
          tone="bg-brand-50 text-brand"
          icon="payment"
        />
        <StatCard
          title="کل دریافتی"
          value={formatMoney(totalPaid)}
          tone="bg-ok-bg text-ok"
          icon="treatment"
        />
        <StatCard
          title="مانده بدهی"
          value={formatMoney(totalRemaining)}
          tone={totalRemaining > 0n ? "bg-danger-bg text-danger" : "bg-surface-2 text-ink-3"}
          icon="debt"
        />
        <StatCard
          title="سررسید بعدی"
          value={nextDueDate ? formatDate(dateToLocalDate(nextDueDate), 'short') : '—'}
          subtitle={nextDueAmount > 0n ? formatMoney(nextDueAmount) : undefined}
          tone="bg-warn-bg text-warn"
          icon="calendar"
        />
      </div>

      {/* ۲. نوار تب‌های داخلی */}
      <div className="w-full border-b border-line">
        <div className="flex w-full gap-1 overflow-x-auto scrollbar-none sm:gap-2">
          {[
            { id: 'schedule', label: 'برنامه پرداخت' },
            { id: 'open', label: 'سررسیدهای باز' },
            { id: 'received', label: 'دریافت‌شده‌ها' },
            { id: 'invoices', label: 'فاکتورها' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
              className={cx(
                'relative shrink-0 px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4',
                activeSubTab === tab.id ? 'text-brand-700' : 'text-ink-3 hover:text-ink'
              )}
            >
              {tab.label}
              {activeSubTab === tab.id && (
                <span className="absolute bottom-0 right-0 left-0 h-0.5 rounded-t bg-brand-700" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ۳. محتوای تب‌ها */}
      {activeSubTab === 'schedule' && (
        <div className="flex w-full flex-col gap-5 sm:gap-6">
          
          {/* بخش اقساط و چک‌ها */}
          <div className="w-full rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
            
            {totalCount === 0 || installments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="mb-3 grid size-12 place-items-center rounded-full bg-surface-2 text-ink-3">
                  <Icon name="payment" size="card" />
                </span>
                <h3 className="text-sm font-bold text-ink sm:text-base">برنامه اقساطی ثبت نشده است</h3>
                <p className="mt-1 text-xs text-ink-3">برای این بیمار هیچ چک یا قسطی تعریف نشده و تمام تسویه‌ها نقدی بوده است.</p>
              </div>
            ) : (
              <>
                {/* هدر پیشرفت اقساط */}
                <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-2 sm:size-16">
                      <svg className="absolute inset-0 size-full -rotate-90 text-brand-100" viewBox="0 0 36 36">
                        <path
                          className="text-brand-500"
                          strokeDasharray={`${progressPercent}, 100`}
                          strokeWidth="3"
                          strokeLinecap="round"
                          fill="none"
                          stroke="currentColor"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <span className="text-sm font-bold text-brand-700 sm:text-base">
                        {toPersianDigits(progressPercent)}٪
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-ink sm:text-base">
                        {formatMoney(totalPaidOnInstallments)} از {formatMoney(totalAllInstallmentsAmount)} پرداخت شده
                      </h3>
                      <p className="mt-0.5 text-xs text-ink-2 sm:text-sm">
                        {toPersianDigits(paidCount)} از {toPersianDigits(totalCount)} قسط/چک تسویه شده
                      </p>
                    </div>
                  </div>
                  <button className="self-start text-sm font-semibold text-brand-700 hover:underline sm:self-auto">
                    جزئیات اقساط
                  </button>
                </div>

                {/* جدول اقساط */}
                <div className="w-full overflow-x-auto rounded-lg border border-line-2">
                  <table className="w-full min-w-[640px] border-collapse text-sm text-right">
                    <thead>
                      <tr className="bg-surface-2 text-ink-3">
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold sm:px-4">مرحله</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold sm:px-4">تاریخ سررسید</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold sm:px-4">مانده</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold sm:px-4">مبلغ</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold sm:px-4">وضعیت</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-center font-semibold sm:px-4">عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {installments.map((inst) => (
                        <tr
                          key={inst.id}
                          className={cx(
                            'border-b border-line last:border-b-0',
                            inst.status === 'PAID' && 'bg-ok-bg/20',
                            inst.status === 'OVERDUE' && 'bg-danger-bg/20',
                            inst.status === 'PARTIAL' && 'bg-warn-bg/20'
                          )}
                        >
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink sm:px-4">
                            قسط {toPersianDigits(inst.sequence)} از {toPersianDigits(totalCount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-2 sm:px-4">
                            {formatDate(dateToLocalDate(inst.dueAt), 'short')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-2 sm:px-4">
                            {inst.status === 'PAID' ? (
                              '—'
                            ) : inst.paidAmount > 0n ? (
                              <span className="font-semibold text-warn">مانده: {formatMoney(inst.amount - inst.paidAmount)}</span>
                            ) : inst.status === 'OVERDUE' ? (
                              <span className="font-semibold text-danger">گذشته</span>
                            ) : (
                              <span className="font-semibold text-warn">در انتظار</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-ink sm:px-4">
                            {formatMoney(inst.amount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 sm:px-4">
                            <StatusBadge status={inst.status} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center sm:px-4">
                            {inst.status === 'PAID' ? (
                              <button className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2">
                                رسید
                              </button>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5">
                                <button 
                                  onClick={() => setPaymentDialogData({
                                    isOpen: true,
                                    installmentId: inst.id,
                                    amount: inst.amount - inst.paidAmount
                                  })}
                                  className="inline-flex items-center gap-1 rounded-md bg-[#ba6a73] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity shadow-sm"
                                >
                                  ثبت پرداخت
                                </button>
                                <button className="rounded-md border border-line bg-white p-1.5 text-ink-3 hover:bg-surface-2">
                                  تماس
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {totalCount > 0 && installments.length > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-ink-3 sm:mt-4">
                سررسید پرداخت‌نشده قرمز و پرداخت‌شده سبز است. هر سررسیدی که بیش از یک روز بگذرد، خودکار به «بدهکاری‌ها» می‌رود.
              </p>
            )}
          </div>

          {/* تاریخچه پرداخت‌ها */}
          <div className="w-full rounded-xl border border-line bg-surface shadow-sm">
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3.5 text-right sm:px-5 sm:py-4"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <h3 className="text-sm font-bold text-ink sm:text-base">تاریخچه پرداخت‌ها</h3>
                <span className="shrink-0 text-xs text-ink-3">
                  {toPersianDigits(recentPayments.length)} مورد اخیر
                </span>
              </div>
              <span
                className={cx(
                  'shrink-0 text-ink-3 transition-transform duration-200',
                  isHistoryOpen && 'rotate-180'
                )}
              >
                ▼
              </span>
            </button>

            {isHistoryOpen && (
              <div className="w-full overflow-x-auto p-3 sm:p-4">
                <table className="w-full min-w-[420px] border-collapse text-sm text-right">
                  <thead>
                    <tr className="text-ink-3">
                      <th className="whitespace-nowrap pb-2.5 font-semibold">تاریخ پرداخت</th>
                      <th className="whitespace-nowrap pb-2.5 font-semibold">مبلغ</th>
                      <th className="whitespace-nowrap pb-2.5 font-semibold">روش پرداخت</th>
                      <th className="whitespace-nowrap pb-2.5 font-semibold">نوع پرداخت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-ink-3">
                          هیچ پرداختی ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      recentPayments.map((pay) => (
                        <tr key={pay.id} className="border-t border-line-2">
                          <td className="whitespace-nowrap py-2.5 tabular-nums text-ink-2">
                            {pay.paidAt ? formatDate(dateToLocalDate(pay.paidAt), 'short') : '—'}
                          </td>
                          <td className="whitespace-nowrap py-2.5 font-semibold tabular-nums text-ink">
                            {formatMoney(pay.amount)}
                          </td>
                          <td className="whitespace-nowrap py-2.5 text-ink-2">
                            {PAYMENT_METHOD_LABELS[pay.method] || pay.method}
                          </td>
                          <td className="whitespace-nowrap py-2.5 text-ink-2">
                            {PAYMENT_KIND_LABELS[pay.kind] || pay.kind}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab !== 'schedule' && (
        <div className="w-full rounded-xl border border-line bg-surface px-4 py-12 text-center text-sm text-ink-3 shadow-sm sm:py-16">
          محتوای این بخش در حال آماده‌سازی است.
        </div>
      )}

      {paymentDialogData?.isOpen && (
        <InstallmentPaymentDialog
          isOpen={paymentDialogData.isOpen}
          onClose={() => setPaymentDialogData(null)}
          installmentId={paymentDialogData.installmentId}
          customerName="بیمار" 
          amountDue={paymentDialogData.amount}
          onSuccess={() => {
            setPaymentDialogData(null)
            router.refresh() 
          }}
        />
      )}
    </div>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  tone,
  icon,
}: {
  title: string
  value: string
  subtitle?: string
  tone: string
  icon: IconName
}) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 sm:gap-3 sm:px-3.5 sm:py-3">
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-md sm:size-9', tone)}>
        <Icon name={icon} size="compact" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[11px] leading-tight text-ink-3 sm:text-xs">{title}</span>
        <span className="mt-0.5 block truncate text-sm font-bold tabular-nums leading-tight text-ink sm:text-[15px]">
          {value}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[10px] leading-tight text-ink-3">{subtitle}</span>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'PAID') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">
        <span className="size-1.5 rounded-full bg-ok" />
        پرداخت‌شده
      </span>
    )
  }
  if (status === 'OVERDUE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger">
        <span className="size-1.5 rounded-full bg-danger" />
        معوق
      </span>
    )
  }
  if (status === 'PARTIAL') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">
        <span className="size-1.5 rounded-full bg-warn" />
        پرداخت جزئی
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">
      <span className="size-1.5 rounded-full bg-info" />
      در انتظار
    </span>
  )
}