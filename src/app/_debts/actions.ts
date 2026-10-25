'use server'

import { revalidatePath } from 'next/cache'
import { prisma, runInTenantScope } from '@/core/db'
import { asLocalDate, fromClockParts, toUtcInstant, fromUtcInstant } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import type { TenantContext } from '@/core/tenant'
import { PaymentMethod, PaymentKind, isMember } from '@/core/constants'
import { ValidationError } from '@/core/types'
import { recordPayment } from '@/modules/payments'
import { recordFollowUp, rescheduleDueDate, readDebtSettings } from '@/modules/debts'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'
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
  // 🚀 لاگ ۱: ورودی‌هایی که از سمت فرانت‌اند میاد
  console.log('\n🚀 [Backend - recordPaymentWithInstallments] STARTED')
  console.log('📥 Input:', { appointmentId, customerId, input })

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
    const effectiveAmount = amountBigInt > 0n ? amountBigInt : appointment.priceAtBooking
    const payableAmount = effectiveAmount - discountBigInt

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
    
    // 🚀 لاگ ۲: وضعیت پرداخت و بدهی
    console.log('📊 Status:', { 
      isInstallmentMode, 
      amountBigInt: amountBigInt.toString(), 
      totalDebt: totalDebt.toString(), 
      paidSoFar: paidSoFar.toString() 
    })
    const currentInstallmentTotal = currentInstallment 
      ? (currentInstallment.totalPlanAmount ?? currentInstallment.amount) 
      : appointment.priceAtBooking
      
    const limitCheck = currentInstallment 
      ? (currentInstallmentTotal - currentInstallment.paidAmount) 
      : (appointment.priceAtBooking - paidSoFar)

    if (!isInstallmentMode && amountBigInt + discountBigInt > limitCheck) {
      console.log('❌ Limit reached: amount + discount > limitCheck')
      return {
        ok: false as const,
        message: 'مبلغ پرداختی نمی‌تواند بیشتر از باقی‌مانده این قسط باشد.',
      }
    }

    if (isInstallmentMode && input.installmentCount > 0) {
      // 🚀 لاگ ۳: وارد حالت قسطی شد
      console.log('🔄 Entering Installment Mode (Creating/Updating)...')
      
      const allInstallments = await tx.installment.findMany({
        where: { appointmentId, tenantId },
        orderBy: { sequence: 'desc' },
      })

           const remainingAmount = payableAmount

      console.log('💰 RemainingAmount for installment:', remainingAmount.toString())

      if (remainingAmount <= 0n) {
        console.log('❌ Error: RemainingAmount <= 0')
        return { ok: false, message: 'بدهی به طور کامل پرداخت شده است.' }
      }

      // 👈 ۵. بستن همه‌ی اقساط قبلی (تسویه کامل)
      console.log('🔒 Closing previous installments...')
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

      let baseDate = toUtcInstant(asLocalDate(input.firstDueDate || '1405-01-01'), MIDNIGHT, settings.utcOffsetMinutes)
      
      if (currentInstallment && intervalMonths > 0) {
        const currentLocalDate = fromUtcInstant(currentInstallment.dueAt, settings.utcOffsetMinutes).localDate
        const dateParts = currentLocalDate.split('-').map(Number)
        let y = dateParts[0] ?? 0
        let m = dateParts[1] ?? 0
        let d = dateParts[2] ?? 0
        
        m += intervalMonths
        while (m > 12) { m -= 12; y += 1 }
        
        const isLeapYear = (y % 33 === 1 || y % 33 === 5 || y % 33 === 9 || y % 33 === 13 || y % 33 === 17 || y % 33 === 22 || y % 33 === 26 || y % 33 === 30)
        const maxDaysInMonth = m === 12 ? (isLeapYear ? 30 : 29) : (m <= 6 ? 31 : 30)
        if (d > maxDaysInMonth) d = maxDaysInMonth
        
        const nextLocalDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        baseDate = toUtcInstant(asLocalDate(nextLocalDate), MIDNIGHT, settings.utcOffsetMinutes)
      }
      
      const newPerInstallmentAmount = remainingAmount / BigInt(input.installmentCount)
      console.log('📝 Creating new installment record...', { newPerInstallmentAmount: newPerInstallmentAmount.toString(), maxSequence: maxSequence + 1 })

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
          note: input.note || null,
        }
      })
      console.log('✅ New installment created:', newInstallment.id)

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
      // 🚀 لاگ ۴: وارد حالت پرداخت عادی (نقدی/آنلاین) شد
      console.log('🔄 Entering Normal Payment Mode (CASH/ONLINE)...')
      
      if (!isMember(PaymentMethod, dbMethod)) {
        console.log('❌ Invalid method:', dbMethod)
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
      console.log('✅ Normal payment created')

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

    console.log('🎉 [Backend] Successfully finished transaction.')
    return SUCCESS
  })

  if (!('succeeded' in result)) {
    console.log('🚨 [Backend] Action failed and returned error:', result)
    return result
  }
  
  revalidateDebts()
  console.log('🚀 [Backend] ENDED SUCCESSFULLY\n')
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

    const finalNote = input.note ? `${resultText} - ${input.note}` : resultText
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
    const now = realClock()
    
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
        paidAt: now,
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
    const settings = await readDebtSettings(tx, tenantId)
    const dueAt = toUtcInstant(asLocalDate(input.newDueDate), MIDNIGHT, settings.utcOffsetMinutes)
    const amountBigInt = asAmount(input.newAmount)

    await tx.installment.update({
      where: { id: installmentId, tenantId },
      data: { dueAt, amount: amountBigInt }
    })
    return SUCCESS
  })
  if (!('succeeded' in result)) return result
  revalidateDebts()
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
      const dateParts = currentLocalDate.split('-').map(Number)
      let y = dateParts[0] ?? 0, m = dateParts[1] ?? 0, d = dateParts[2] ?? 0
      
      m += input.newIntervalMonths
      while (m > 12) { m -= 12; y += 1 }
      
      const isLeapYear = (y % 33 === 1 || y % 33 === 5 || y % 33 === 9 || y % 33 === 13 || y % 33 === 17 || y % 33 === 22 || y % 33 === 26 || y % 33 === 30)
      const maxDaysInMonth = m === 12 ? (isLeapYear ? 30 : 29) : (m <= 6 ? 31 : 30)
      if (d > maxDaysInMonth) d = maxDaysInMonth
      
      const nextLocalDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const nextDueDate = toUtcInstant(asLocalDate(nextLocalDate), MIDNIGHT, settings.utcOffsetMinutes)
      
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

function normaliseNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null
  const trimmed = note.trim()
  return trimmed === '' ? null : trimmed
}