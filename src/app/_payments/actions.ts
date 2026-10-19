'use server'

import { prisma, runInTenantScope } from '@/core/db'
import { requireStaffPanel } from '@/app/_shell/session'
import { createInstallmentPlan } from '@/modules/payments'
import { realClock } from '@/core/lib/clock'
import { z } from 'zod'
import { ADMIN_INSTALLMENTS } from '@/app/catalog'

const formSchema = z.object({
  appointmentId: z.string().min(1),
  totalAmount: z.coerce.bigint().positive(),
  count: z.coerce.number().int().positive(),
  firstDueAt: z.string().min(1),
  note: z.string().optional(),
})

export async function createInstallmentAction(prevState: unknown, formData: FormData) {
  const session = await requireStaffPanel('admin')
  
  const raw = Object.fromEntries(formData.entries())
  const parsed = formSchema.safeParse(raw)
  
  if (!parsed.success) {
    return { error: ADMIN_INSTALLMENTS.form.invalidData }
  }

  try {
    await runInTenantScope(session.permissions, prisma(), async (tx) => {
      // تبدیل مقادیر به تایپ دقیق مورد انتظار
      const input = {
        ...parsed.data,
        firstDueAt: new Date(parsed.data.firstDueAt),
        note: parsed.data.note ?? null, // 👈 undefined به null تبدیل میشه
      }

      await createInstallmentPlan({
        tx,
        ctx: session.permissions,
        input,
        now: realClock(),
      })
    })
    return { success: true }
  } catch {
    return { error: ADMIN_INSTALLMENTS.form.error }
  }
}