'use client'

import { useState } from 'react'
import { formatMoney, toPersianDigits } from '@/core/localization'
import type { DebtRow } from '@/modules/debts'

// 👈 ایمپورت کردن دیالوگ‌های ادمین
import { PaymentDialog as AdminPaymentDialog } from '@/app/admin/debts/_components/PaymentDialog'
import { FollowUpDialog as AdminFollowUpDialog } from '@/app/admin/debts/_components/FollowUpDialog'

// 👈 ایمپورت کردن دیالوگ‌های منشی
import { PaymentDialog as ReceptionPaymentDialog } from '@/app/reception/debts/_components/PaymentDialog'
import { FollowUpDialog as ReceptionFollowUpDialog } from '@/app/reception/debts/_components/FollowUpDialog'

type PaymentOptions = {
  method: { value: string; label: string }[]
  kind: { value: string; label: string }[]
}

const FOLLOW_UP_RESULTS: Record<string, string> = {
  PROMISE_TO_PAY: 'وعده پرداخت',
  NO_ANSWER: 'تماس شد؛ پاسخ نداد',
  SMS_SENT: 'پیامک ارسال شد',
  DISCOUNT_REQUEST: 'درخواست تخفیف',
  PROMISE_TOMORROW: 'قول پرداخت تا فردا',
  AWAITING_REVIEW: 'در انتظار بررسی',
}

// 👈 تابع جدید برای ترجمه دقیق کدها به فارسی
function translateFollowUpNote(note: string | null | undefined) {
  if (!note) return '—'
  
  let translated = note
  // جایگزینی کدهای انگلیسی با متن فارسی
  Object.entries(FOLLOW_UP_RESULTS).forEach(([code, label]) => {
    translated = translated.replace(new RegExp(code, 'g'), label)
  })
  
  // حذف خط تیره‌های اضافه در ابتدا یا انتها
  return translated.replace(/^ - /, '').replace(/ - $/, '')
}

export function DebtsTable({
  rows,
  showActions,
  paymentOptions,
  followUpsMap,
  panel, // 👈 پراپ جدید
}: {
  rows: readonly DebtRow[]
  showActions: boolean
  paymentOptions?: PaymentOptions
  followUpsMap?: Record<string, any>
  panel: 'admin' | 'reception' | 'doctor' // 👈 پراپ جدید
}) {
  const [selectedPaymentRow, setSelectedPaymentRow] = useState<DebtRow | null>(null)
  const [selectedFollowUpRow, setSelectedFollowUpRow] = useState<DebtRow | null>(null)

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-8 text-center text-sm text-ink-3">
        هیچ بدهی‌ای یافت نشد.
      </p>
    )
  }

  // 👈 انتخاب کامپوننت بر اساس پنل
  const PaymentDialog = panel === 'reception' ? ReceptionPaymentDialog : AdminPaymentDialog
  const FollowUpDialog = panel === 'reception' ? ReceptionFollowUpDialog : AdminFollowUpDialog

  return (
    <>
      <section className="flex flex-col rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed border-collapse text-sm text-right">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2/50 text-ink-3">
                <th className="px-4 py-3 font-semibold text-start">مشتری</th>
                <th className="px-4 py-3 font-semibold text-start">پزشک</th>
                <th className="px-4 py-3 font-semibold text-start">خدمت</th>
                <th className="px-4 py-3 font-semibold text-start">سررسید</th>
                <th className="px-4 py-3 font-semibold text-start">وضعیت</th>
                <th className="px-4 py-3 font-semibold text-start">مبلغ</th>
                <th className="px-4 py-3 font-semibold text-start">آخرین پیگیری</th>
                <th className="px-4 py-3 font-semibold text-start">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const followUps = followUpsMap?.[row.appointmentId] || []
                const lastFollowUp = followUps[0]

                return (
                  <tr key={row.appointmentId} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink">
                          {row.customerFirstName} {row.customerLastName ?? ''}
                        </span>
                        <span className="text-xs text-ink-3 tabular-nums" dir="ltr">{row.customerMobile}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-ink-2">{row.doctorName}</td>
                    <td className="px-4 py-4 text-ink-2">{row.serviceName ?? '—'}</td>
                    <td className="px-4 py-4 text-ink-3">{row.dueLocalDate}</td>
                    <td className="px-4 py-4">
                      {row.daysOverdue > 0 ? (
                        <span className="inline-flex rounded-pill bg-danger-bg px-2 py-1 text-xs font-semibold text-danger items-center gap-1">
                          <span className="size-1.5 rounded-full bg-danger"></span> {toPersianDigits(row.daysOverdue)} روز گذشته
                        </span>
                      ) : (
                        <span className="inline-flex rounded-pill bg-warn-bg px-2 py-1 text-xs font-semibold text-warn items-center gap-1">
                          <span className="size-1.5 rounded-full bg-warn"></span> در انتظار
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 font-bold text-ink tabular-nums">{formatMoney(row.balance)}</td>
                    <td className="px-4 py-4 text-ink-3 text-xs">
                       {lastFollowUp ? (
                         <div className="flex flex-col gap-1">
                           <span className="font-medium text-ink-2">
                             {/* 👈 استفاده از تابع ترجمه */}
                             {translateFollowUpNote(lastFollowUp.note)}
                           </span>
                           <span className="text-[10px] opacity-70">
                             {new Date(lastFollowUp.createdAt).toLocaleDateString('fa-IR')}
                           </span>
                         </div>
                       ) : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {showActions && (
                          <>
                            <button
                              onClick={() => setSelectedPaymentRow(row)}
                              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-600 transition-colors shadow-sm"
                            >
                              ثبت پرداخت
                            </button>
                            <button
                              onClick={() => setSelectedFollowUpRow(row)}
                              className="rounded-lg border border-line-2 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2 transition-colors"
                            >
                              پیگیری
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedPaymentRow && (
        <PaymentDialog
          isOpen={!!selectedPaymentRow}
          onClose={() => setSelectedPaymentRow(null)}
          customerId={selectedPaymentRow.customerId}
          appointmentId={selectedPaymentRow.appointmentId}
          customerName={`${selectedPaymentRow.customerFirstName} ${selectedPaymentRow.customerLastName ?? ''}`.trim()}
          amountDue={selectedPaymentRow.balance}
          onSuccess={() => setSelectedPaymentRow(null)}
        />
      )}

      {selectedFollowUpRow && (
        <FollowUpDialog
          isOpen={!!selectedFollowUpRow}
          onClose={() => setSelectedFollowUpRow(null)}
          appointmentId={selectedFollowUpRow.appointmentId}
          customerName={`${selectedFollowUpRow.customerFirstName} ${selectedFollowUpRow.customerLastName ?? ''}`.trim()}
          amountDue={selectedFollowUpRow.balance}
          onSuccess={() => setSelectedFollowUpRow(null)}
        />
      )}
    </>
  )
}