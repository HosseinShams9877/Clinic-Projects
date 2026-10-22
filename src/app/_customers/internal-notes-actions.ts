'use server'

import { revalidatePath } from 'next/cache'
import { prisma, runInTenantScope } from '@/core/db'
import { resolveStaffPanel } from '@/app/_shell/session'
import { moduleFailureMessage } from '../_shared/module-failure'
import type { Panel } from '@/app/_shell/navigation'

export type NoteActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

export interface CreateInternalNoteInput {
  readonly customerId: string
  readonly content: string
  readonly category: string
}

export async function createInternalNoteAction(
  panel: Panel,
  input: CreateInternalNoteInput
): Promise<NoteActionResult> {
  try {
    const session = await resolveStaffPanel(panel)

    await runInTenantScope(session.permissions, prisma(), async (tx) => {
      await tx.internalNote.create({
        data: {
          tenantId: session.tenantId,
          customerId: input.customerId,
          authorId: session.permissions.userId,
          content: input.content,
          category: input.category,
        },
      })
    })

    // آپدیت کردن مسیرها برای نمایش یادداشت جدید
    revalidatePath(`/admin/customer/${input.customerId}`)
    revalidatePath(`/doctor/customers/${input.customerId}`)
    revalidatePath(`/reception/customers/${input.customerId}`)

    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, message: moduleFailureMessage(error) }
  }
}