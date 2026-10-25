/**
 * The desk's read-only customer record — `/reception/customers/[id]`.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { prisma, runInTenantScope } from '@/core/db'
import { realClock } from '@/core/lib/clock'
import {
  asLocalDate,
  dateToLocalDate,
  formatDate,
  formatMoney,
  formatPhone,
  jalaliParts,
  monthName,
  toPersianDigits,
  addLocalMonths,
  toUtcInstant,
  fromClockParts,
  type LocalDate,
} from '@/core/localization'
import { AcquisitionSource, CycleStatus, PaymentKind, PaymentMethod, isMember, AppointmentStatus } from '@/core/constants'

import { CUSTOMER_PROFILE_PAGE, CUSTOMERS_PAGE, RECEPTION_CUSTOMERS } from '@/app/catalog'
import { loadCustomerProfile } from '@/app/_customers/page-data'
import { CustomerTabs, tabFromParam } from '@/app/_customers/customer-tabs'
import {
  InjectionTab,
  DEFAULT_INJECTION_VIEW,
  type InjectionView,
} from '@/app/_injections'
import { Pagination, paginate, pageFromParam } from '@/app/_components/Pagination'
import {
  ACQUISITION_SOURCE_LABELS,
  CUSTOMER_LIFECYCLE_LABELS,
  getCustomerNotes,
} from '@/modules/customers'
import { APPOINTMENT_STATUS_LABELS } from '@/modules/appointments'
import { requireStaffPanel } from '@/app/_shell/session'
import { customerDebtFollowUps } from '@/modules/debts'
import { customerCycles, CYCLE_STATUS_LABELS } from '@/modules/cycles' // 👈 ایمپورت اصلاح شد
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/payments'
import { customerMessageHistory } from '@/modules/messages'
import { CollapsibleCard } from '@/app/_customers/CollapsibleCard'
import { calculateAge } from '@/core/localization/age'
import { cx } from '@/core/lib'
import { Icon } from '@/core/components/icons'
import type { IconName } from '@/core/components/icons'
import { ProgressBar } from '@/app/_components/ProgressBar'
import { isAppError, NotFoundError } from '@/core/types'

import { PaymentsTab, type InstallmentRow, type PaymentRow, type OpenDebtRow } from '@/app/_customers/payments-tab'
import { InternalNotesTab } from '@/app/_customers/internal-notes-tab'

export const metadata: Metadata = { title: CUSTOMERS_PAGE.reception.title }

const APPTS_PAGE_PARAM = 'appts'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export default async function ReceptionCustomerDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>
  readonly searchParams: Promise<{ readonly [key: string]: string | string[] | undefined }>
}) {
  const session = await requireStaffPanel('reception')
  const { id } = await params
  const query = await searchParams
  const tab = tabFromParam(query.tab)
  const apptsPage = pageFromParam(query[APPTS_PAGE_PARAM])
  const injectionView = injectionViewFromParam(query.injectionView)

  const dbAppts = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    return tx.appointment.findMany({
      where: { customerId: id, isSlotBlock: false },
      include: { service: true, doctor: true },
      orderBy: { scheduledAt: 'desc' },
    })
  })

  const data = await runInTenantScope(session.permissions, prisma(), async (tx) => {
    try {
      const base = await loadCustomerProfile({ tx, ctx: session.permissions, customerId: id })
      const followUps = await customerDebtFollowUps({ tx, tenantId: session.tenantId, customerId: id })
      const cycles = await customerCycles({ tx, tenantId: session.tenantId, customerId: id })
      const messages = await customerMessageHistory({ tx, tenantId: session.tenantId, customerId: id })
      const notes = await getCustomerNotes({ tx, tenantId: session.tenantId, customerId: id })
      
      const internalNotes = await tx.internalNote.findMany({
        where: { customerId: id },
        include: { 
          author: { 
            select: { 
              firstName: true, 
              lastName: true, 
              memberships: { 
                where: { tenantId: session.tenantId },
                select: { role: true } 
              } 
            } 
          } 
        },
        orderBy: { createdAt: 'desc' },
      })

      const installments = await tx.installment.findMany({
        where: { appointment: { customerId: id } },
        include: { payments: true },
        orderBy: { dueAt: 'asc' }
      })

      return { ...base, followUps, cycles, messages, notes, internalNotes, installments }
    } catch {
      return null
    }
  })
  
  if (data === null) notFound()

  const { profile, primaryDoctorName, primaryClinicName, injections, injectionCounts, followUps, cycles, messages, notes, internalNotes, installments } = data
  const name = profile.lastName === null ? profile.firstName : `${profile.firstName} ${profile.lastName}`
  
  const appts = paginate(dbAppts, apptsPage)
  const basePath = `/reception/customers/${id}`
  const customerAge = profile.birthDate ? calculateAge(profile.birthDate) : '—'
  const activeCycles = cycles.filter(
    (row) => row.status === CycleStatus.Active || row.status === CycleStatus.Due || row.status === CycleStatus.AtRisk
  )

  // ─────────────────────────────────────────────
  // محاسبات مالی اقساط
  // ─────────────────────────────────────────────
  const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

  let totalCount = 1
  let totalInstallmentsAmount = 0n
  
  installments.forEach((inst: any) => {
    if (inst.note && inst.note.startsWith('TOTAL:')) {
      const parts = inst.note.split(':')
      const count = Number(parts[1] || 1)
      const totalAmt = parts[3] ? BigInt(parts[3]) : inst.amount
      
      if (count > totalCount) totalCount = count 
      totalInstallmentsAmount += totalAmt
    } else {
      totalInstallmentsAmount += inst.amount
    }
  })

  const totalPaidOnInstallments = installments.reduce((sum: bigint, inst: any) => sum + (inst.paidAmount || 0n), 0n)
    
  const installmentsData: InstallmentRow[] = installments.map((inst: any) => {
    const paidAmount = inst.paidAmount || 0n
    const totalPlan = inst.totalPlanAmount || inst.amount
    
    const instPayments = inst.payments || []
    const firstPayment = instPayments.length > 0 ? instPayments[0] : null
    const paidAt = firstPayment ? firstPayment.paidAt : null
    const paymentMethod = firstPayment ? firstPayment.method : null

    let finalDueAt = new Date(inst.dueAt)
    const totalInstallments = inst.totalPlanCount || 1
    const safePerInstallment = inst.amount > 0n ? inst.amount : 1n
    const paidCount = Math.min(totalInstallments, Math.floor(Number(paidAmount) / Number(safePerInstallment)))

    if (paidCount > 0 && inst.intervalMonths) {
      const baseLocalDate = dateToLocalDate(inst.dueAt)
      const nextLocalDate = addLocalMonths(baseLocalDate, paidCount * inst.intervalMonths)
      finalDueAt = toUtcInstant(nextLocalDate, MIDNIGHT)
    }

    const isOverdue = paidAmount < totalPlan && !paidAt && finalDueAt < new Date()

    return {
      id: inst.id,
      appointmentId: inst.appointmentId,
      sequence: inst.sequence,
      amount: inst.amount,
      totalPlanAmount: inst.totalPlanAmount,
      dueAt: finalDueAt, 
      note: inst.note,
      type: inst.type,
      status: paidAmount >= totalPlan ? 'PAID' : isOverdue ? 'OVERDUE' : 'PENDING', 
      paidAmount,
      paidAt,
      paymentMethod,
    }
  })
  
  const paymentsData: PaymentRow[] = profile.payments
    .filter((p: any) => !p.installmentId)
    .map((p: any) => ({
      id: p.id,
      amount: p.amount,
      paidAt: p.paidAt,
      method: p.method,
      kind: p.kind,
    }))

  const openDebts: OpenDebtRow[] = [];

  installmentsData.forEach(inst => {
    if (inst.status !== 'PAID') {
      openDebts.push({
        id: inst.id,
        appointmentId: inst.appointmentId,
        customerId: profile.id,
        amount: inst.totalPlanAmount || inst.amount,
        paidAmount: inst.paidAmount,
        dueAt: inst.dueAt,
        type: inst.type || 'INSTALLMENT',
        installmentId: inst.id
      });
    }
  });

  const installmentAppIds = new Set(installmentsData.map(i => i.appointmentId));
  dbAppts.forEach(appt => {
    if (appt.status === 'COMPLETED' && !installmentAppIds.has(appt.id)) {
      const paidForThisAppt = profile.payments
        .filter((p: any) => p.appointmentId === appt.id)
        .reduce((sum: bigint, p: any) => sum + BigInt(p.amount || 0), 0n);
      
      const remaining = appt.priceAtBooking - paidForThisAppt;
      if (remaining > 0n) {
        openDebts.push({
          id: `debt-${appt.id}`,
          appointmentId: appt.id,
          customerId: profile.id,
          amount: appt.priceAtBooking,
          paidAmount: paidForThisAppt,
          dueAt: appt.scheduledAt,
          type: 'NORMAL',
          installmentId: null
        });
      }
    }
  });

  const nextInst = installmentsData.find((i) => i.status !== 'PAID')
  const balance = profile.chargedTotal - profile.paidTotal

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      {/* هدر صفحه */}
      <div className="flex w-full flex-col gap-3 panel:flex-row panel:items-center panel:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-brand-50 text-lg font-bold text-brand-700 sm:size-12">
            {profile.firstName.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <Link href="/reception/customers" className="text-xs font-semibold text-brand-700 no-underline hover:underline">
              {RECEPTION_CUSTOMERS.detail.back}
            </Link>
            <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">{name}</h1>
            <span className="block text-sm text-ink-2 tabular-nums" dir="ltr">
              {formatPhone(profile.mobile)}
            </span>
          </div>
        </div>
        <Link
          href="/reception/appointments"
          className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-brand-btn bg-brand-btn p-[10px_18px] text-sm font-semibold text-ink-inverse no-underline shadow-brand hover:bg-brand-600 panel:w-auto"
        >
          <Icon name="calendar" size="compact" />
          {CUSTOMERS_PAGE.actions.book}
        </Link>
      </div>

      {/* نوار تب‌ها */}
      <div className="w-full overflow-x-auto pb-1">
        <CustomerTabs
          basePath={basePath}
          active={tab}
          summaryLabel={RECEPTION_CUSTOMERS.tabs.summary}
          injectionsLabel={RECEPTION_CUSTOMERS.tabs.injections}
        />
      </div>

      {/* محتوای تب‌ها */}
      {tab === 'injections' && (
        <div className="w-full min-w-0">
          <InjectionTab
            rows={injections}
            counts={injectionCounts}
            panel="reception"
            customerId={profile.id}
            view={injectionView}
            basePath={`${basePath}?tab=injections`}
            appointments={dbAppts.map((a: any) => ({
              id: a.id,
              localDate: a.localDate,
              localTime: a.localTime,
              serviceName: a.service?.name ?? null,
            }))}
          />
        </div>
      )}

      {tab === 'payments' && (
        <div className="w-full min-w-0">
          <PaymentsTab
            customerId={profile.id}
            panel="reception"
            totalAmount={profile.chargedTotal}
            totalPaid={profile.paidTotal}
            totalRemaining={profile.chargedTotal - profile.paidTotal}
            nextDueDate={nextInst ? nextInst.dueAt : null}
            nextDueAmount={nextInst ? nextInst.amount : 0n}
            installments={installmentsData}
            payments={paymentsData}
            openDebts={openDebts}
            totalInstallmentsAmount={totalInstallmentsAmount}
            totalPaidOnInstallments={totalPaidOnInstallments}
            totalCount={totalCount}
          />
        </div>
      )}

      {tab === 'internal' && (
        <div className="w-full min-w-0">
          <InternalNotesTab
            customerId={profile.id}
            panel="reception"
            notes={internalNotes.map((n: any) => {
              const role = n.author.memberships[0]?.role;
              let roleLabel = 'کادر درمان';
              if (role === 'MANAGER') roleLabel = 'مدیر';
              else if (role === 'DOCTOR') roleLabel = 'پزشک';
              else if (role === 'RECEPTION') roleLabel = 'منشی';

              return {
                id: n.id,
                content: n.content,
                category: n.category,
                createdAt: n.createdAt,
                authorName: n.author.lastName ? `${n.author.firstName} ${n.author.lastName}` : n.author.firstName,
                authorRole: roleLabel,
              }
            })}
          />
        </div>
      )}

      {tab === 'summary' && (
        <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
          {/* KPI ها */}
          <div className="grid w-full grid-cols-2 gap-2.5 sm:gap-3 panel:grid-cols-4">
            <KpiTile
              label="تعداد مراجعات"
              value={toPersianDigits(dbAppts.length)}
              icon="appointment"
              tone="bg-info-bg text-info"
            />
            <KpiTile
              label="دوره‌های فعال"
              value={toPersianDigits(activeCycles.length)}
              icon="treatment"
              tone="bg-ok-bg text-ok"
            />
            <KpiTile
              label="مانده بدهی"
              value={formatMoney(balance)}
              icon="debt"
              tone="bg-warn-bg text-warn"
            />
            <KpiTile
              label="کل پرداختی"
              value={formatMoney(profile.paidTotal)}
              icon="payment"
              tone="bg-brand-50 text-brand"
            />
          </div>

          {/* محتوای اصلی + سایدبار */}
          <div className="grid w-full grid-cols-1 gap-5 sm:gap-6 panel:grid-cols-[1fr_320px] panel:items-start">
            <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
              <CollapsibleCard title="دوره‌های درمانی">
                <CyclesTable rows={cycles} />
              </CollapsibleCard>

              <CollapsibleCard title="تاریخچه مراجعات" note={`${toPersianDigits(dbAppts.length)} مورد اخیر`}>
                <AppointmentHistory
                  rows={appts.slice.map((a: any) => ({
                    id: a.id,
                    scheduledAt: a.scheduledAt,
                    localDate: a.localDate,
                    localTime: a.localTime,
                    status: a.status,
                    priceAtBooking: a.priceAtBooking,
                    serviceName: a.service?.name ?? null,
                    doctorName: a.doctor ? `${a.doctor.firstName} ${a.doctor.lastName || ''}`.trim() : null,
                  }))}
                  page={apptsPage}
                  totalPages={appts.totalPages}
                  hrefFor={(next) => {
                    const sp = new URLSearchParams()
                    if (next > 1) sp.set(APPTS_PAGE_PARAM, String(next))
                    const qs = sp.toString()
                    return qs === '' ? basePath : `${basePath}?${qs}`
                  }}
                />
              </CollapsibleCard>

              <CollapsibleCard title="تاریخچه پرداخت‌ها">
                <PaymentHistory
                  rows={profile.payments.slice(0, 10)}
                  page={1}
                  totalPages={1}
                  hrefFor={() => basePath}
                />
              </CollapsibleCard>

              <CollapsibleCard title="پیگیری‌های انجام شده" note={`${toPersianDigits(followUps.length)} مورد`}>
                <FollowUpsList rows={followUps} />
              </CollapsibleCard>

              <CollapsibleCard title="یادداشت‌های بالینی">
                <NotesList notes={notes} />
              </CollapsibleCard>
            </div>

            <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
              <CollapsibleCard title="اطلاعات مشتری">
                <DetailsDl profile={profile} doctorName={primaryDoctorName} clinicName={primaryClinicName} />
              </CollapsibleCard>

              <CollapsibleCard title="پیام‌های ارسال شده">
                <MessageList rows={messages} />
              </CollapsibleCard>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// توابع کمکی
// ─────────────────────────────────────────────────────────────

function FollowUpsList({ rows }: { readonly rows: any[] }) {
  if (rows.length === 0) {
    return <p className="rounded-sm bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">هیچ پیگیری‌ای ثبت نشده است.</p>
  }
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm text-right">
        <thead>
          <tr className="border-b border-line-2 text-ink-3">
            <Th>تاریخ ثبت</Th><Th>مسئول پیگیری</Th><Th>نتیجه / توضیحات</Th><Th>تاریخ وعده پرداخت</Th><Th>تاریخ پیگیری بعدی</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            let finalText = row.note || ''
            const replacements: Record<string, string> = { PROMISE_TO_PAY: 'وعده پرداخت', NO_ANSWER: 'تماس شد؛ پاسخ نداد', SMS_SENT: 'پیامک ارسال شد', DISCOUNT_REQUEST: 'درخواست تخفیف', PROMISE_TOMORROW: 'قول پرداخت تا فردا', AWAITING_REVIEW: 'در انتظار بررسی', INSTALLMENT_REQUEST: 'درخواست تقسیط' }
            Object.entries(replacements).forEach(([eng, fa]) => { finalText = finalText.replace(new RegExp(eng, 'g'), fa) })
            const parts = finalText.split(' - ')
            return (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="whitespace-nowrap px-3 py-3 text-ink-2 tabular-nums">{formatDate(dateToLocalDate(row.createdAt), 'short')}</td>
                <td className="px-3 py-3 text-ink-2">{row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName ?? ''}` : 'سیستم'}</td>
                <td className="px-3 py-3 text-ink whitespace-pre-wrap"><span className="font-semibold">{parts[0]}</span>{parts.slice(1).join(' - ') && <span className="mt-1 block text-xs text-ink-3">{parts.slice(1).join(' - ')}</span>}</td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-2 tabular-nums">—</td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-2 tabular-nums">{row.nextContactAt ? formatDate(dateToLocalDate(row.nextContactAt), 'short') : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function injectionViewFromParam(value: string | string[] | undefined): InjectionView {
  if (value === 'table') return 'table'
  return DEFAULT_INJECTION_VIEW
}

function KpiTile({ label, value, icon, tone }: { readonly label: string; readonly value: string; readonly icon: IconName; readonly tone: string }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-md sm:size-9', tone)}><Icon name={icon} size="compact" /></span>
      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-[10px] text-ink-3 sm:text-xs">{label}</span>
        <span className="mt-0.5 truncate text-xs font-bold tabular-nums text-ink sm:text-sm md:text-base">{value}</span>
      </span>
    </div>
  )
}

function NotesList({ notes }: { readonly notes: readonly { id: string; text: string; createdAt: Date; authorName: string | null }[] }) {
  if (notes.length === 0) return <p className="rounded-sm bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">{CUSTOMER_PROFILE_PAGE.note.historyEmpty}</p>
  return (
    <div className="flex flex-col gap-3">
      {notes.map((note) => (
        <div key={note.id} className="rounded-md bg-surface-2 p-3 text-sm">
          <p className="whitespace-pre-wrap text-ink">{note.text}</p>
          <span className="mt-2 block text-xs text-ink-3">{note.authorName ?? CUSTOMER_PROFILE_PAGE.note.authorUnknown} — {formatDate(dateToLocalDate(note.createdAt), 'short')}</span>
        </div>
      ))}
    </div>
  )
}

function CyclesTable({ rows }: { readonly rows: readonly any[] }) {
  if (rows.length === 0) return <EmptyState sentence="هیچ دوره درمانی ثبت نشده است." />
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-2 text-ink-3">
            <Th>خدمت</Th><Th>پزشک</Th><Th>جلسات</Th><Th>فاصله</Th><Th>سررسید بعدی</Th><Th>وضعیت</Th>
          </tr>
        </thead>
        <tbody>{rows.map((row) => <CycleRow key={row.id} row={row} />)}</tbody>
      </table>
    </div>
  )
}

function CycleRow({ row }: { readonly row: any }) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="px-3 py-2 font-semibold text-ink">{row.serviceName}</td>
      <td className="px-3 py-2 text-ink-2">{row.doctorName}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1 tabular-nums">
          <span className="font-semibold text-ink">{toPersianDigits(row.completedSessions)}{row.totalSessions === 0 ? '' : ` از ${toPersianDigits(row.totalSessions)} جلسه`}</span>
          {row.totalSessions === 0 ? null : <ProgressBar done={row.completedSessions} total={row.totalSessions} />}
        </div>
      </td>
      <td className="px-3 py-2 text-ink-2 tabular-nums">{row.intervalDays % 7 === 0 ? `${toPersianDigits(row.intervalDays / 7)} هفته` : `${toPersianDigits(row.intervalDays)} روز`}</td>
      <td className="px-3 py-2 font-semibold text-ink tabular-nums">{row.nextDueDate === null ? '—' : formatDate(dateToLocalDate(row.nextDueDate), 'short')}</td>
      <td className="px-3 py-2"><span className={cx('inline-flex rounded-pill px-2 py-1 text-xs font-semibold', row.status === 'DUE' ? 'bg-danger-bg text-danger' : row.status === 'AT_RISK' ? 'bg-brand-100 text-brand-700' : row.status === 'COMPLETED' ? 'bg-ok-bg text-ok' : row.status === 'ABANDONED' ? 'bg-surface-sunken text-ink-3' : 'bg-neutral-bg text-ink-2')}>{CYCLE_STATUS_LABELS[row.status as CycleStatus] ?? row.status}</span></td>
    </tr>
  )
}

function AppointmentHistory({ rows, page, totalPages, hrefFor }: { readonly page: number; readonly totalPages: number; readonly hrefFor: (page: number) => string; readonly rows: ReadonlyArray<{ readonly id: string; readonly scheduledAt: Date; readonly localDate: string; readonly localTime: string; readonly status: string; readonly priceAtBooking: bigint; readonly serviceName: string | null; readonly doctorName: string | null }> }) {
  if (rows.length === 0) return <EmptyState sentence={CUSTOMER_PROFILE_PAGE.empty.appointments} />
  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-2 text-ink-3">
              <Th>تاریخ</Th><Th>خدمت</Th><Th>پزشک</Th><Th>وضعیت</Th><Th align="end">مبلغ</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="whitespace-nowrap px-3 py-2 text-ink-2 tabular-nums">{formatDate(row.localDate as LocalDate, 'short')}</td>
                <td className="px-3 py-2 font-semibold text-ink">{row.serviceName ?? '—'}</td>
                <td className="px-3 py-2 text-ink-2">{row.doctorName ?? '—'}</td>
                <td className="px-3 py-2">{statusBadge(row.status)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-end font-semibold text-ink tabular-nums">{formatMoney(row.priceAtBooking)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

function PaymentHistory({ rows, page, totalPages, hrefFor }: { readonly page: number; readonly totalPages: number; readonly hrefFor: (page: number) => string; readonly rows: ReadonlyArray<{ readonly id: string; readonly amount: bigint; readonly paidAt: Date | null; readonly method: string; readonly kind: string }> }) {
  if (rows.length === 0) return <EmptyState sentence={CUSTOMER_PROFILE_PAGE.empty.payments} />
  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-2 text-ink-3">
              <Th>تاریخ پرداخت</Th><Th>مبلغ</Th><Th>روش</Th><Th>نوع</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="whitespace-nowrap px-3 py-2 text-ink-2 tabular-nums">{row.paidAt === null ? '—' : formatDate(dateToLocalDate(row.paidAt), 'short')}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink tabular-nums">{formatMoney(row.amount)}</td>
                <td className="px-3 py-2 text-ink-2">{methodLabel(row.method)}</td>
                <td className="px-3 py-2 text-ink-2">{kindLabel(row.kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </div>
  )
}

function statusBadge(status: string): React.ReactNode {
  if (!isMember(AppointmentStatus, status)) return <span className="text-ink-3">{status}</span>
  const tone = status === AppointmentStatus.Completed ? 'bg-ok-bg text-ok' : status === AppointmentStatus.NoShow ? 'bg-neutral-bg text-ink-3' : status === AppointmentStatus.Cancelled ? 'bg-danger-bg text-danger' : 'bg-surface-sunken text-ink-2'
  return <span className={cx('inline-flex rounded-pill px-2 py-1 text-xs font-semibold', tone)}>{APPOINTMENT_STATUS_LABELS[status]}</span>
}

function DetailsDl({ profile, doctorName, clinicName }: { readonly profile: any; readonly doctorName: string | null; readonly clinicName: string | null }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3">
      <Detail label={CUSTOMER_PROFILE_PAGE.fields.mobile} value={formatPhone(profile.mobile)} ltr />
      <Detail label={CUSTOMERS_PAGE.columns.lifecycle} value={lifecycleLabel(profile.lifecycle)} />
      <Detail label={CUSTOMER_PROFILE_PAGE.fields.acquisitionSource} value={sourceLabel(profile.acquisitionSource)} />
      <Detail label={CUSTOMER_PROFILE_PAGE.fields.birthDate} value={profile.birthDate === null ? null : formatDate(profile.birthDate as LocalDate, 'long')} />
      <Detail label={CUSTOMER_PROFILE_PAGE.fields.primaryDoctor} value={doctorName} />
      <Detail label={CUSTOMER_PROFILE_PAGE.fields.primaryClinic} value={clinicName} />
      <Detail label={CUSTOMER_PROFILE_PAGE.fields.firstVisit} value={profile.firstVisitAt === null ? null : formatDate(dateToLocalDate(profile.firstVisitAt), 'long')} />
      <Detail label={CUSTOMER_PROFILE_PAGE.fields.lastVisit} value={profile.lastVisitAt === null ? null : formatDate(dateToLocalDate(profile.lastVisitAt), 'long')} />
      <Detail label={CUSTOMER_PROFILE_PAGE.fields.completedSessions} value={toPersianDigits(profile.appointments.filter((a: any) => a.status === 'COMPLETED').length)} />
    </dl>
  )
}

function Detail({ label, value, span, ltr }: { readonly label: string; readonly value: string | null; readonly span?: boolean; readonly ltr?: boolean }) {
  return (
    <div className={span ? 'col-span-1' : undefined}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={cx('mt-1 text-sm font-semibold text-ink', ltr && 'tabular-nums')} dir={ltr ? 'ltr' : undefined}>{value ?? '—'}</dd>
    </div>
  )
}

function MessageList({ rows }: { readonly rows: ReadonlyArray<{ readonly id: string; readonly renderedText: string; readonly createdAt: Date }> }) {
  if (rows.length === 0) return <EmptyState sentence="هیچ پیامی ارسال نشده است." />
  const lastFive = rows.slice(0, 5)
  return (
    <div className="flex flex-col gap-3">
      {lastFive.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-ink-2" title={row.renderedText}>{row.renderedText}</span>
          <span className="shrink-0 text-xs text-ink-3 tabular-nums">{formatDate(dateToLocalDate(row.createdAt), 'short')}</span>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ sentence }: { readonly sentence: string }) {
  return <p className="rounded-sm bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">{sentence}</p>
}

function Th({ children, align = 'start' }: { readonly children: React.ReactNode; readonly align?: 'start' | 'center' | 'end' }) {
  return (
    <th
      scope="col"
      className={cx('whitespace-nowrap px-3 py-2 text-xs font-semibold', align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start')}
    >
      {children}
    </th>
  )
}

function sourceLabel(source: string | null): string | null {
  if (source === null) return null
  if (!isMember(AcquisitionSource, source)) return source
  return ACQUISITION_SOURCE_LABELS[source]
}

function methodLabel(method: string): string {
  return isMember(PaymentMethod, method) ? PAYMENT_METHOD_LABELS[method] : method
}

function kindLabel(kind: string): string {
  return isMember(PaymentKind, kind) ? PAYMENT_KIND_LABELS[kind] : kind
}

function lifecycleLabel(lifecycle: string): string {
  return CUSTOMER_LIFECYCLE_LABELS[lifecycle as keyof typeof CUSTOMER_LIFECYCLE_LABELS] ?? lifecycle
}