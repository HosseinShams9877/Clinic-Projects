'use server'

import { revalidatePath } from 'next/cache'
import { INJECTION_TAB } from './catalog'
import { prisma, runInTenantScope } from '@/core/db'
import { DomainError, isAppError, NotFoundError } from '@/core/types'
import { recordInjection } from '@/modules/injections'

import { resolveStaffPanel } from '@/app/_shell/session'

export type InjectionActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }

export interface InjectionInput {
  readonly customerId: string
  readonly appointmentId?: string // 👈 فیلد جدید
  readonly area: string
  readonly material: string
  readonly brand?: string
  readonly amount?: string
  readonly amountUnit?: string
  readonly depth?: string
  readonly technique?: string
  readonly batchNumber?: string
  readonly note?: string
  readonly localDate: string
}

export async function createInjectionAction(
  panel: 'reception' | 'doctor' | 'admin',
  input: InjectionInput,
): Promise<InjectionActionResult> {
  const session = await resolveStaffPanel(panel)

  try {
    await runInTenantScope(session.permissions, prisma(), async (tx) => {
      // 👈 تاریخ از خود جلسه گرفته میشه، ولی چون ممکنه بدون جلسه ثبت بشه، تاریخ رو با همون دیتای فرم ست میکنیم
      const sessionAt = new Date(`${input.localDate}T00:00:00.000Z`)
      return recordInjection({
        tx,
        ctx: session.permissions,
        input: {
          customerId: input.customerId,
          appointmentId: input.appointmentId, // 👈 پاس دادن شناسه جلسه به دیتابیس
          area: input.area,
          material: input.material,
          brand: input.brand === '' ? undefined : input.brand,
          amount: input.amount === '' ? undefined : input.amount,
          amountUnit: input.amountUnit === '' ? undefined : input.amountUnit,
          depth: input.depth === '' ? undefined : input.depth,
          technique: input.technique === '' ? undefined : input.technique,
          batchNumber: input.batchNumber === '' ? undefined : input.batchNumber,
          note: input.note === '' ? undefined : input.note,
          sessionAt,
          localDate: input.localDate,
        },
      })
    })
  } catch (error: unknown) {
    console.error('--- INJECTION ERROR ---', error)
    return { ok: false, message: injectionFailureMessage(error) }
  }

  revalidatePath(`/admin/customer/${input.customerId}`)
  revalidatePath(`/reception/customers/${input.customerId}`)
  revalidatePath(`/doctor/customers/${input.customerId}`)

  return { ok: true }
}

function injectionFailureMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error instanceof NotFoundError) return INJECTION_TAB.errors.customerNotFound
    if (error instanceof DomainError) return INJECTION_TAB.errors.illegalValue
  }
  return INJECTION_TAB.errors.unexpected
}