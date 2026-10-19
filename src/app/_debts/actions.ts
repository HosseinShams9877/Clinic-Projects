'use server'

import { revalidatePath } from 'next/cache'
import { prisma, runInTenantScope } from '@/core/db'
import { asLocalDate, fromClockParts, toUtcInstant } from '@/core/localization'
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

export interface RecordPaymentInput {
  readonly amount: string
  readonly method: string
  readonly kind: string
  readonly discountAmount: string
  readonly discountReason: string | null
  readonly note: string | null
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

  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await recordPayment({
      tx,
      ctx,
      input: {
        appointmentId,
        amount: asAmount(input.amount),
        method,
        kind,
        discountAmount: asAmount(input.discountAmount),
        discountReason: input.discountReason,
        note: input.note,
      },
      now: realClock(),
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
  }
): Promise<ActionResult> {
  let dbMethod = input.method
  if (input.method === 'POS' || input.method === 'CARD_TO_CARD') {
    dbMethod = 'CARD'
  }

  const amountBigInt = asAmount(input.amount)

  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    const now = realClock()
    const settings = await readDebtSettings(tx, tenantId)

    if ((input.method === 'INSTALLMENT' || input.method === 'CHEQUE') && input.installmentCount > 0) {
      const installmentAmount = amountBigInt / BigInt(input.installmentCount)
      const baseDate = toUtcInstant(asLocalDate(input.firstDueDate || '1405-01-01'), MIDNIGHT, settings.utcOffsetMinutes)

      for (let i = 0; i < input.installmentCount; i++) {
        const dueDate = new Date(baseDate)
        
        if (input.installmentInterval === '2_MONTH') {
          dueDate.setMonth(baseDate.getMonth() + ((i + 1) * 2) - 1)
        } else if (input.installmentInterval === '1_WEEK') {
          dueDate.setDate(baseDate.getDate() + (i * 7))
        } else {
          dueDate.setMonth(baseDate.getMonth() + i)
        }

        await tx.installment.create({
          data: {
            tenantId,
            appointmentId,
            sequence: i + 1,
            amount: installmentAmount,
            dueAt: dueDate,
          }
        })
      }
    } else {
      if (!isMember(PaymentMethod, dbMethod)) {
        return { ok: false, message: moduleFailureMessage(new Error('invalid method')) }
      }

      await recordPayment({
        tx,
        ctx,
        input: {
          appointmentId,
          amount: amountBigInt,
          method: dbMethod,
          kind: PaymentKind.Partial,
          discountAmount: 0n,
          discountReason: null,
          note: null,
        },
        now,
      })
    }
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

/** 👈 اکشن اصلاح‌شده برای ثبت پیگیری */
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
  console.log('\n\n🟢 [Action] Started recordFollowUpWithDetailsAction')
  
  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    const now = realClock()

    // 👈 تبدیل کد انگلیسی به متن فارسی
    const resultLabels: Record<string, string> = {
      PROMISE_TO_PAY: 'وعده پرداخت',
      NO_ANSWER: 'تماس شد؛ پاسخ نداد',
      SMS_SENT: 'پیامک ارسال شد',
      DISCOUNT_REQUEST: 'درخواست تخفیف',
      PROMISE_TOMORROW: 'قول پرداخت تا فردا',
      AWAITING_REVIEW: 'در انتظار بررسی',
    }
    const resultText = resultLabels[input.result] || input.result

    // ترکیب متن نتیجه و توضیحات
    const finalNote = input.note ? `${resultText} - ${input.note}` : resultText
    const nextContactDate = await asInstant(tx, tenantId, input.nextFollowUpDate)

    // ۱. ثبت در جدول تاریخچه پیگیری‌ها
    await recordFollowUp({
      tx,
      ctx,
      appointmentId,
      nextContactAt: nextContactDate,
      note: finalNote,
      now,
    })

    // ۲. به‌روزرسانی فیلدهای آخرین پیگیری روی خود نوبت
    await tx.appointment.update({
      where: { id: appointmentId, tenantId },
      data: {
        debtFollowUpAt: now,
        debtFollowUpNote: finalNote,
        debtNextContactAt: nextContactDate,
      }
    })

    console.log('✅ DB Save successful. Note:', finalNote)
    return SUCCESS
  })

  if (!('succeeded' in result)) {
    console.log('🔴 Action Failed:', result)
    return result
  }
  
  console.log('🟢 Action Success. Revalidating...\n\n')
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

/** 👈 اکشن جدید برای ثبت پرداخت روی یک قسط/چک مشخص */
export async function recordInstallmentPaymentAction(
  panel: Panel,
  installmentId: string,
  input: {
    amount: string
    method: string
    receiveDate: string
    receiveTime: string
  }
): Promise<ActionResult> {
  let dbMethod = input.method
  if (input.method === 'POS' || input.method === 'CARD_TO_CARD') {
    dbMethod = 'CARD'
  }

  const amountBigInt = asAmount(input.amount)

  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId, userId }) => {
    const now = realClock()
    
    // پیدا کردن قسط و نوبت مربوطه برای گرفتن customerId
    const installment = await tx.installment.findUnique({
      where: { id: installmentId, tenantId },
      include: { appointment: { select: { customerId: true } } }
    })
    
    if (!installment || !installment.appointment.customerId) {
      throw new Error('Installment or customer not found')
    }

    if (!isMember(PaymentMethod, dbMethod)) {
      return { ok: false, message: moduleFailureMessage(new Error('invalid method')) }
    }

    // ثبت پرداخت (به installmentId وصل میشه)
    await tx.payment.create({
      data: {
        tenantId,
        appointmentId: installment.appointmentId,
        customerId: installment.appointment.customerId,
        installmentId: installment.id, // 👈 اتصال به قسط
        recordedByUserId: userId,
        amount: amountBigInt,
        method: dbMethod,
        kind: PaymentKind.Partial,
        discountAmount: 0n,
        discountReason: null,
        note: null,
        paidAt: now,
      }
    })

    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateDebts()
  return { ok: true }
}

const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

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