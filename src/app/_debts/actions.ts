'use server'

import { revalidatePath } from 'next/cache'
import { prisma, runInTenantScope } from '@/core/db'
import { asLocalDate, asLocalTime, fromClockParts, toUtcInstant, fromUtcInstant, addLocalMonths, todayLocalDate } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import type { TenantContext } from '@/core/tenant'
import { PaymentMethod, PaymentKind, isMember } from '@/core/constants'
import { ValidationError } from '@/core/types'
import { recordFollowUp, rescheduleDueDate, readDebtSettings } from '@/modules/debts'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'
import { withOverrideTokens, stripOverrideTokens } from '@/app/_payments/installment-overrides'
import { moduleFailureMessage } from '../_shared/module-failure'

export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

const NOTE_MAX_LENGTH = 500
const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

export interface RecordPaymentInput {
  readonly amount: string
  readonly method: string
  readonly kind: string
  readonly discountAmount: string
  readonly discountReason: string | null
  readonly note: string | null
  readonly installmentId?: string | null
}

export interface FollowUpInput {
  readonly nextContactAt: string
  readonly note?: string | null
}

export interface RescheduleInput {
  readonly dueDate: string
}

interface ScopeArgs {
  readonly tx: Parameters<Parameters<typeof runInTenantScope<unknown>>[2]>[0]
  readonly ctx: TenantContext
  readonly tenantId: string
  readonly userId: string
}

async function inTenantScope<T>(
  panel: Panel,
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(panel)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({
      tx,
      ctx: session.permissions,
      tenantId: session.tenantId,
      userId: session.permissions.userId,
    }),
  ).catch((error: unknown) => {
    console.error('\n\n🚨 [Error in inTenantScope] 🚨\n', error, '\n\n')
    return { ok: false, message: moduleFailureMessage(error) } as const
  })
}

const SUCCESS = { succeeded: true } as const

function revalidateDebts(): void {
  revalidatePath('/reception/debts')
  revalidatePath('/admin/debts')
  revalidatePath('/doctor/debts')
  revalidatePath('/admin/installments')
  revalidatePath('/reception/installments')
  revalidatePath('/doctor/installments')
}

/**
 * 👈 صفحه‌ی پروفایلِ مشتری در سه پنل. مسیرها مثل internal-notes-actions هستند:
 * ادمین `/admin/customer/:id` و منشی/پزشک `/reception|doctor/customers/:id`.
 */
function revalidateCustomer(customerId: string): void {
  revalidatePath(`/admin/customer/${customerId}`)
  revalidatePath(`/reception/customers/${customerId}`)
  revalidatePath(`/doctor/customers/${customerId}`)
}

/**
 * 👈 آپدیت paidAmount فقط روی اقساط باز. به رکوردهای تسویه‌شده دست نمی‌زنه.
 */
async function syncInstallmentPaidAmount(
  tx: ScopeArgs['tx'],
  installments: readonly { id: string; paidAmount: bigint; totalPlanAmount: bigint | null; amount: bigint }[],
  totalPlanAmount: bigint,
  newPaidTotal: bigint,
) {
  let capped = newPaidTotal
  if (capped > totalPlanAmount) capped = totalPlanAmount

  for (const inst of installments) {
    const instTotal = inst.totalPlanAmount ?? inst.amount
    if (inst.paidAmount < instTotal) {
      await tx.installment.update({
        where: { id: inst.id },
        data: { paidAmount: capped },
      })
    }
  }
  return capped
}

export async function recordPaymentAction(
  panel: Panel,
  appointmentId: string,
  input: RecordPaymentInput,
): Promise<ActionResult> {
  const method = input.method
  const kind = input.kind
  if (!isMember(PaymentMethod, method) || !isMember(PaymentKind, kind)) {
    return { ok: false, message: moduleFailureMessage(new Error('invalid payment input')) }
  }

  const amountBigInt = asAmount(input.amount)
  const discountBigInt = asAmount(input.discountAmount)

  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    const now = realClock()

    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId, tenantId },
      select: { customerId: true, priceAtBooking: true },
    })

    if (!appointment || !appointment.customerId) {
      throw new Error('Appointment or customer not found')
    }

    let openInstallment = null
    if (input.installmentId) {
      openInstallment = await tx.installment.findUnique({
        where: { id: input.installmentId, tenantId }
      })
    } else {
      openInstallment = await tx.installment.findFirst({
        where: { appointmentId, tenantId, paidAmount: { lt: 999999999999n } },
        orderBy: { sequence: 'desc' }
      })
    }

    const totalPaidBefore = await tx.payment.aggregate({
      where: { tenantId, appointmentId },
      _sum: { amount: true },
    })
    const paidSoFar = totalPaidBefore._sum.amount ?? 0n

    const totalPlan = openInstallment ? (openInstallment.totalPlanAmount ?? openInstallment.amount) : 0n
    const ceiling = openInstallment ? totalPlan : appointment.priceAtBooking

    if (amountBigInt + discountBigInt > ceiling - paidSoFar) {
      return {
        ok: false as const,
        message: 'مبلغ پرداختی نمی‌تواند بیشتر از باقی‌مانده بدهی باشد.',
      }
    }

    if (amountBigInt > 0n || discountBigInt > 0n) {
      await tx.payment.create({
        data: {
          tenantId,
          appointmentId,
          customerId: appointment.customerId,
          recordedByUserId: ctx.userId,
          amount: amountBigInt,
          method,
          kind,
          discountAmount: discountBigInt,
          discountReason: input.discountReason,
          note: input.note,
          paidAt: now,
          installmentId: openInstallment?.id ?? null,
        },
      })
    }

    if (openInstallment && amountBigInt > 0n) {
      const openInstallments = await tx.installment.findMany({
        where: { appointmentId, tenantId }
      })
      
      const onlyOpen = openInstallments.filter(i => i.paidAmount < (i.totalPlanAmount ?? i.amount))

      await syncInstallmentPaidAmount(
        tx,
        onlyOpen,
        totalPlan,
        openInstallment.paidAmount + amountBigInt,
      )
    }

    await tx.appointment.update({
      where: { id: appointmentId, tenantId },
      data: {
        resultNote: input.note || null,
        resultRecordedAt: now,
        status: 'COMPLETED',
      },
    })

    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

export async function recordPaymentWithInstallmentsAction(
  panel: Panel,
  appointmentId: string,
  customerId: string,
  input: {
    amount: string
    method: string
    installmentCount: number
    firstDueDate: string
    installmentInterval?: string
    discountAmount?: string 
    discountReason?: string | null 
    forceInstallment?: boolean 
    note?: string | null
    installmentId?: string | null
  }
): Promise<ActionResult> {
  let dbMethod = input.method
  if (input.method === 'POS' || input.method === 'CARD_TO_CARD') {
    dbMethod = 'CARD'
  }

  const amountBigInt = asAmount(input.amount)
  const discountBigInt = asAmount(input.discountAmount || '0')

  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    const now = realClock()
    const settings = await readDebtSettings(tx, tenantId)

    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId, tenantId },
      select: { customerId: true, priceAtBooking: true }
    })

    if (!appointment || !appointment.customerId) {
      throw new Error('Appointment or customer not found')
    }

    const realCustomerId = appointment.customerId

    const totalPaidBefore = await tx.payment.aggregate({
      where: { tenantId, appointmentId },
      _sum: { amount: true },
    })
    const paidSoFar = totalPaidBefore._sum.amount ?? 0n

    let currentInstallment = null
    if (input.installmentId) {
      currentInstallment = await tx.installment.findUnique({
        where: { id: input.installmentId, tenantId }
      })
    } else {
      currentInstallment = await tx.installment.findFirst({
        where: { appointmentId, tenantId },
        orderBy: { sequence: 'desc' }
      })
    }

    const totalDebt = currentInstallment
      ? (currentInstallment.totalPlanAmount ?? currentInstallment.amount)
      : appointment.priceAtBooking

    const intervalMonths = input.installmentInterval
      ? Number(input.installmentInterval.replace('_MONTH', ''))
      : 1

    const isInstallmentMode = input.method === 'INSTALLMENT' || input.method === 'CHEQUE' || input.forceInstallment

    const currentInstallmentTotal = currentInstallment
      ? (currentInstallment.totalPlanAmount ?? currentInstallment.amount)
      : appointment.priceAtBooking

    const limitCheck = currentInstallment
      ? (currentInstallmentTotal - currentInstallment.paidAmount)
      : (appointment.priceAtBooking - paidSoFar)

    /**
     * The balance a re-installment redistributes. The dialog pre-fills `amount` with
     * the remaining figure and the desk may edit it — but when the field is cleared
     * (or only a discount is sent), the debt left to re-bill is the **outstanding
     * balance**, not the price the visit was booked at. Falling back to
     * `priceAtBooking` here re-charged what the customer had already paid — a
     * «بازتعریف» that turned ۲٬۰۰۰٬۰۰۰ of settled debt back into ۲٬۰۰۰٬۰۰۰ owed —
     * and it is the same `limitCheck` the desk-payment branch guards with, so the
     * two paths cannot disagree about what remains.
     */
    const outstandingBalance = limitCheck
    const effectiveAmount = amountBigInt > 0n ? amountBigInt : outstandingBalance
    const payableAmount = effectiveAmount - discountBigInt

    if (!isInstallmentMode && amountBigInt + discountBigInt > limitCheck) {
      return {
        ok: false as const,
        message: 'مبلغ پرداختی نمی‌تواند بیشتر از باقی‌مانده این قسط باشد.',
      }
    }

    if (isInstallmentMode && amountBigInt > 0n && amountBigInt + discountBigInt > outstandingBalance) {
      return {
        ok: false as const,
        message: 'مبلغ پرداختی نمی‌تواند بیشتر از باقی‌مانده این قسط باشد.',
      }
    }

    if (isInstallmentMode && input.installmentCount > 0) {
      const allInstallments = await tx.installment.findMany({
        where: { appointmentId, tenantId },
        orderBy: { sequence: 'desc' },
      })

      const remainingAmount = payableAmount

      if (remainingAmount <= 0n) {
        return { ok: false, message: 'بدهی به طور کامل پرداخت شده است.' }
      }

      // 👈 بستن همه‌ی اقساط قبلی (تسویه کامل)
      for (const inst of allInstallments) {
        await tx.installment.update({
          where: { id: inst.id },
          data: { 
            totalPlanAmount: inst.paidAmount, 
            paidAmount: inst.paidAmount,      
            totalPlanCount: inst.totalPlanCount || 1,
          }
        })
      }

      const maxSequence = allInstallments.length > 0 
        ? Math.max(...allInstallments.map(i => i.sequence))
        : 0

           let baseDate: Date
      
      // 👈 اگر کاربر تاریخ جدیدی در فرم انتخاب کرده، از همون استفاده کن
      if (input.firstDueDate && input.firstDueDate !== todayLocalDate(realClock())) {
        baseDate = toUtcInstant(
          asLocalDate(input.firstDueDate),
          MIDNIGHT,
          settings.utcOffsetMinutes,
        )
      } else if (currentInstallment && intervalMonths > 0) {
        // در غیر این صورت، از تاریخ قسط قبلی + فاصله ماه‌ها استفاده کن
        const currentLocalDate = fromUtcInstant(currentInstallment.dueAt, settings.utcOffsetMinutes).localDate
        const nextLocalDate = addLocalMonths(currentLocalDate, intervalMonths)
        baseDate = toUtcInstant(nextLocalDate, MIDNIGHT, settings.utcOffsetMinutes)
      } else {
        baseDate = toUtcInstant(
          asLocalDate(input.firstDueDate || '1405-01-01'),
          MIDNIGHT,
          settings.utcOffsetMinutes,
        )
      }
      
      const newPerInstallmentAmount = remainingAmount / BigInt(input.installmentCount)

      const newInstallment = await tx.installment.create({
        data: {
          tenantId,
          appointmentId,
          sequence: maxSequence + 1,
          amount: newPerInstallmentAmount,
          paidAmount: 0n,
          dueAt: baseDate,
          totalPlanAmount: remainingAmount,
          totalPlanCount: input.installmentCount,
          intervalMonths,
          type: input.method === 'CHEQUE' ? 'CHEQUE' : 'INSTALLMENT',
          // 👈 ویرایش موقتِ مرحله‌ی قبل نباید به طرح جدید نشت کند
          note: stripOverrideTokens(input.note ?? null),
        }
      })

      if (discountBigInt > 0n) {
        await tx.payment.create({
          data: {
            tenantId,
            appointmentId,
            customerId: realCustomerId, 
            recordedByUserId: ctx.userId,
            amount: 0n,
            discountAmount: discountBigInt,
            discountReason: input.discountReason || null,
            method: dbMethod,
            kind: PaymentKind.Final,
            note: 'تخفیف هنگام قسطی کردن',
            paidAt: now,
            installmentId: newInstallment.id,
          }
        })
      }
    } else if (amountBigInt > 0n || discountBigInt > 0n) {
      if (!isMember(PaymentMethod, dbMethod)) {
        return { ok: false, message: moduleFailureMessage(new Error('invalid method')) }
      }

      await tx.payment.create({
        data: {
          tenantId,
          appointmentId,
          customerId: realCustomerId,
          recordedByUserId: ctx.userId,
          amount: amountBigInt,
          method: dbMethod,
          kind: PaymentKind.Partial,
          discountAmount: discountBigInt,
          discountReason: input.discountReason || null,
          note: input.note || null,
          paidAt: now,
          installmentId: currentInstallment?.id ?? null,
        }
      })

      if (currentInstallment && amountBigInt > 0n) {
        const openInstallments = await tx.installment.findMany({
          where: { appointmentId, tenantId }
        })
        
        const onlyOpen = openInstallments.filter(i => i.paidAmount < (i.totalPlanAmount ?? i.amount))

        await syncInstallmentPaidAmount(
          tx,
          onlyOpen,
          totalDebt,
          currentInstallment.paidAmount + amountBigInt,
        )
      }
    }

    await tx.appointment.update({
      where: { id: appointmentId, tenantId },
      data: {
        resultNote: input.note || null,
        resultRecordedAt: now,
        status: 'COMPLETED',
      }
    })

    return SUCCESS
  })

  if (!('succeeded' in result)) {
    return result
  }
  
  revalidateDebts()
  return { ok: true }
}

export async function recordFollowUpWithDetailsAction(
  panel: Panel,
  appointmentId: string,
  input: {
    contactMethod: 'PHONE' | 'SMS'
    result: string
    note: string
    promiseDate?: string
    promiseTime?: string
    nextFollowUpDate: string
    nextFollowUpTime: string
    createReminder: boolean
  }
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    const now = realClock()

    const resultLabels: Record<string, string> = {
      PROMISE_TO_PAY: 'وعده پرداخت',
      NO_ANSWER: 'تماس شد؛ پاسخ نداد',
      SMS_SENT: 'پیامک ارسال شد',
      DISCOUNT_REQUEST: 'درخواست تخفیف',
      PROMISE_TOMORROW: 'قول پرداخت تا فردا',
      AWAITING_REVIEW: 'در انتظار بررسی',
    }
    const resultText = resultLabels[input.result] || input.result

    // 👈 اضافه کردن تاریخ وعده پرداخت به متن پیگیری
    let finalNote = input.note ? `${resultText} - ${input.note}` : resultText
    if (input.promiseDate) {
      finalNote += ` [وعده: ${input.promiseDate}]`
    }

    const nextContactDate = await asInstant(tx, tenantId, input.nextFollowUpDate)

    await recordFollowUp({
      tx,
      ctx,
      appointmentId,
      nextContactAt: nextContactDate,
      note: finalNote,
      now,
    })

    await tx.appointment.update({
      where: { id: appointmentId, tenantId },
      data: {
        debtFollowUpAt: now,
        debtFollowUpNote: finalNote,
        debtNextContactAt: nextContactDate,
      }
    })

    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

export async function recordFollowUpAction(
  panel: Panel,
  appointmentId: string,
  input: FollowUpInput,
): Promise<ActionResult> {
  const note = normaliseNote(input.note)
  if (note !== null && note.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      message: moduleFailureMessage(
        new ValidationError('The follow-up note is longer than the ceiling', {
          messageKey: 'debt.noteTooLong',
          detail: { length: note.length },
        }),
      ),
    }
  }

  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    await recordFollowUp({
      tx,
      ctx,
      appointmentId,
      nextContactAt: await asInstant(tx, tenantId, input.nextContactAt),
      note,
      now: realClock(),
    })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

export async function rescheduleDueDateAction(
  panel: Panel,
  appointmentId: string,
  input: RescheduleInput,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    await rescheduleDueDate({
      tx,
      ctx,
      appointmentId,
      dueDate: await asInstant(tx, tenantId, input.dueDate),
      now: realClock(),
    })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

export async function recordInstallmentPaymentAction(
  panel: Panel,
  installmentId: string,
  input: { amount: string; method: string; receiveDate: string; receiveTime: string }
): Promise<ActionResult> {
  let dbMethod = input.method
  if (input.method === 'POS' || input.method === 'CARD_TO_CARD') dbMethod = 'CARD'
  const paymentAmount = asAmount(input.amount)

  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId, userId }) => {
    const currentInstallment = await tx.installment.findUnique({
      where: { id: installmentId, tenantId },
      include: { appointment: { select: { customerId: true } } }
    })
    
    if (!currentInstallment || !currentInstallment.appointment.customerId) {
      throw new Error('Installment not found')
    }
    if (!isMember(PaymentMethod, dbMethod)) {
      return { ok: false, message: 'روش پرداخت نامعتبر است' }
    }

    const customerId = currentInstallment.appointment.customerId
    const appointmentId = currentInstallment.appointmentId

    const totalPlan = currentInstallment.totalPlanAmount ?? currentInstallment.amount
    const remainingForThisInstallment = totalPlan - currentInstallment.paidAmount
    if (paymentAmount > remainingForThisInstallment) {
      return { ok: false, message: 'مبلغ پرداختی نمی‌تواند بیشتر از باقی‌مانده این قسط باشد.' }
    }

    // 👈 تاریخ و ساعت دریافت از فرم — وقتی فرم چیزی نگفته، همان لحظه ثبت می‌خوره
    const paidAt = await asReceiveInstant(tx, tenantId, input.receiveDate, input.receiveTime)

    await tx.payment.create({
      data: {
        tenantId,
        appointmentId,
        customerId,
        recordedByUserId: userId,
        amount: paymentAmount,
        method: dbMethod,
        kind: PaymentKind.Partial,
        discountAmount: 0n,
        discountReason: null,
        note: `پرداخت بابت قسط ${currentInstallment.sequence}`,
        paidAt,
        installmentId: currentInstallment.id,
      }
    })

    const openInstallments = await tx.installment.findMany({
      where: { appointmentId, tenantId }
    })
    
    const onlyOpen = openInstallments.filter(i => i.paidAmount < (i.totalPlanAmount ?? i.amount))

    let totalPaidBefore = 0n
    for (const inst of onlyOpen) {
      if (inst.paidAmount > totalPaidBefore) {
        totalPaidBefore = inst.paidAmount
      }
    }

    let newTotalPaid = totalPaidBefore + paymentAmount
    if (newTotalPaid > totalPlan) {
      newTotalPaid = totalPlan
    }

    for (const inst of onlyOpen) {
      await tx.installment.update({
        where: { id: inst.id },
        data: { paidAmount: newTotalPaid }
      })
    }
    
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

export async function updateInstallmentAction(
  panel: Panel,
  installmentId: string,
  input: { newDueDate: string; newAmount: string }
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, tenantId }) => {
    const amountBigInt = asAmount(input.newAmount)

    const currentInst = await tx.installment.findUnique({
      where: { id: installmentId, tenantId },
      // 👈 برای revalidate کردن صفحه‌ی مشتری: ویرایشِ موقت باید روی پروفایل هم
      // فوراً دیده شود، نه فقط روی جدول‌های بدهی/قسط
      select: {
        id: true,
        note: true,
        appointment: { select: { customerId: true } },
      },
    })
    if (!currentInst) throw new Error('Installment not found')

    // 👈 ویرایش فقط برای همین مرحله است: تاریخ و مبلغ موقت در note ذخیره می‌شوند
    // و ستون‌های `dueAt`/`amount` دست‌نخورده باقی می‌مانند. وقتی قسط پرداخت شد
    // و سیستم به مرحله‌ی بعد رفت، سررسید و مبلغ استاندارد دوباره استفاده می‌شوند.
    await tx.installment.update({
      where: { id: installmentId, tenantId },
      data: {
        note: withOverrideTokens(currentInst.note, input.newDueDate, amountBigInt)
      }
    })
    return { succeeded: true as const, customerId: currentInst.appointment.customerId }
  })
  if (!('succeeded' in result)) return result
  revalidateDebts()
  if (result.customerId) revalidateCustomer(result.customerId)
  return { ok: true }
}

export async function updateFutureInstallmentsAction(
  panel: Panel,
  appointmentId: string,
  currentSequence: number,
  input: { newAmount: string; newIntervalMonths: number }
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, tenantId }) => {
    const amountBigInt = asAmount(input.newAmount)
    const settings = await readDebtSettings(tx, tenantId)
    
    const futureInstallments = await tx.installment.findMany({
      where: { appointmentId, tenantId, sequence: { gt: currentSequence } },
      orderBy: { sequence: 'asc' }
    })

    for (let i = 0; i < futureInstallments.length; i++) {
      const inst = futureInstallments[i]
      if (!inst) continue

      const currentLocalDate = fromUtcInstant(inst.dueAt, settings.utcOffsetMinutes).localDate
      // 👈 استفاده از addLocalMonths برای دقت کامل روی روز ماه
      const nextLocalDate = addLocalMonths(currentLocalDate, input.newIntervalMonths)
      const nextDueDate = toUtcInstant(nextLocalDate, MIDNIGHT, settings.utcOffsetMinutes)
      
      await tx.installment.update({
        where: { id: inst.id },
        data: { amount: amountBigInt, dueAt: nextDueDate, intervalMonths: input.newIntervalMonths }
      })
    }
    return SUCCESS
  })
  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

export async function deleteInstallmentAction(
  panel: Panel,
  installmentId: string
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, tenantId }) => {
    const inst = await tx.installment.findUnique({ where: { id: installmentId, tenantId } })
    if (!inst) return SUCCESS
    
    await tx.payment.deleteMany({ where: { installmentId } })
    await tx.installment.delete({ where: { id: installmentId } })
    
    return SUCCESS
  })
  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

function asAmount(text: string | null): bigint {
  const digits = (text ?? '').replace(/[^\d]/g, '')
  if (digits === '') return 0n
  return BigInt(digits)
}

async function asInstant(tx: ScopeArgs['tx'], tenantId: string, localDate: string): Promise<Date> {
  const settings = await readDebtSettings(tx, tenantId)
  return toUtcInstant(asLocalDate(localDate), MIDNIGHT, settings.utcOffsetMinutes)
}

/**
 * 👈 لحظه‌ای که فرم پرداخت قسط برای دریافت ثبت کرده.
 *
 * فرم همیشه یک تاریخ و ساعت می‌فرستد؛ وقتی مقدارها نامعتبر بودند (مثلاً قدیمی‌ترین
 * مسیرها که چیزی نمی‌فرستادند) به ساعت همین لحظه برمی‌گردد تا هیچ پرداختی بدون
 * مهر زمان ثبت نشود.
 */
async function asReceiveInstant(
  tx: ScopeArgs['tx'],
  tenantId: string,
  receiveDate: string,
  receiveTime: string,
): Promise<Date> {
  try {
    const settings = await readDebtSettings(tx, tenantId)
    return toUtcInstant(asLocalDate(receiveDate), asLocalTime(receiveTime), settings.utcOffsetMinutes)
  } catch {
    return realClock()
  }
}

function normaliseNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null
  const trimmed = note.trim()
  return trimmed === '' ? null : trimmed
}