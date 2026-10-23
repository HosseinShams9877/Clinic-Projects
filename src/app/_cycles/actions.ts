/**
 * The cycles Server Actions — the write half of the three cycle surfaces.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { asLocalDate, fromClockParts, toUtcInstant } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import type { TenantContext } from '@/core/tenant'
import { AbandonmentReason } from '@/core/constants'
import {
  abandonCycle,
  completeCycle,
  recordContactResult,
  readUtcOffsetMinutes,
} from '@/modules/cycles'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'

import { moduleFailureMessage } from '../_shared/module-failure'

export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

// 👈 اینترفیس رو آپدیت کردیم تا پارامترهای جدید رو بگیره
export interface ContactResultInput {
  readonly nextContactAt: string
  readonly promiseDate?: string | null
  readonly note?: string | null
  readonly result?: string | null
  readonly contactMethod?: string | null
}

export interface AbandonCycleInput {
  readonly reason: AbandonmentReason
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
  ).catch((error: unknown) => ({ ok: false, message: moduleFailureMessage(error) } as const))
}

const SUCCESS = { succeeded: true } as const

function revalidateCycles(): void {
  revalidatePath('/reception/cycles')
  revalidatePath('/admin/cycles')
  revalidatePath('/doctor/cycles')
  revalidatePath('/admin/customer')
  revalidatePath('/reception/customers')
}

export async function recordContactResultAction(
  panel: Panel,
  cycleId: string,
  input: ContactResultInput,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId, userId }) => {
    await recordContactResult({
      tx,
      ctx,
      cycleId,
      nextContactAt: await asNextContactAt(tx, tenantId, input.nextContactAt),
      now: realClock(),
      // 👈 پاس دادن پارامترهای جدید به سرویس
      promiseDate: input.promiseDate ? await asNextContactAt(tx, tenantId, input.promiseDate) : null,
      note: input.note || null,
      result: input.result || null,
      contactMethod: input.contactMethod || null,
      userId,
    })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCycles()
  return { ok: true }
}

export async function abandonCycleAction(
  panel: Panel,
  cycleId: string,
  input: AbandonCycleInput,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await abandonCycle({ tx, ctx, cycleId, reason: input.reason, now: realClock() })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCycles()
  return { ok: true }
}

export async function completeCycleAction(panel: Panel, cycleId: string): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await completeCycle({ tx, ctx, cycleId, now: realClock() })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCycles()
  return { ok: true }
}

const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

async function asNextContactAt(
  tx: ScopeArgs['tx'],
  tenantId: string,
  localDate: string,
): Promise<Date> {
  const offset = await readUtcOffsetMinutes(tx, tenantId)
  return toUtcInstant(asLocalDate(localDate), MIDNIGHT, offset)
}