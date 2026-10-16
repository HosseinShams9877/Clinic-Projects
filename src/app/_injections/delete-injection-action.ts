'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@/core/db'

export async function deleteInjection(
  id: string,
): Promise<{ readonly ok: true } | { readonly ok: false }> {
  try {
    await prisma().injectionRecord.delete({ where: { id } })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}