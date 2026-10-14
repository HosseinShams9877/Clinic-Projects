/**
 * The injection map's Server Actions — the write half of the profile's
 * «نقشه تزریق» tab.
 *
 * The tab is a read (its table and its counts come from the module) and this file
 * is its one write: the «افزودن تزریق» dialog's submit. The action resolves the
 * panel's session, runs the module's `recordInjection` in the tenant scope, and
 * revalidates the two profile pages so the new row shows without a reload.
 *
 * ## Why the two paths and not the customer id alone
 *
 * The dialog opens on either the manager's profile (`/admin/customer/[id]`) or the
 * desk's read-only record (`/reception/customers/[id]`), and the two are different
 * routes. The action revalidates both, because the same injection is rendered by
 * both — the manager's tab and the desk's tab are two views of one row, and a
 * revalidation that named only one would leave the other stale until the user
 * navigated away and back.
 */

'use server'

import { revalidatePath } from 'next/cache'
import { INJECTION_TAB } from './catalog'
import { prisma, runInTenantScope } from '@/core/db'
import { DomainError, isAppError, NotFoundError } from '@/core/types'
import { recordInjection } from '@/modules/injections'

import { resolveStaffPanel } from '@/app/_shell/session'

/** The result the dialog renders: a success, or the sentence a failure became. */
export type InjectionActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }

/** The fields the add dialog collects. */
export interface InjectionInput {
  readonly customerId: string
  readonly area: string
  readonly material: string
  readonly brand?: string
  readonly amount?: string
  readonly amountUnit?: string
  readonly depth?: string
  readonly technique?: string
  readonly batchNumber?: string
  readonly note?: string
  /** The session day as a Jalali `YYYY-MM-DD`. */
  readonly localDate: string
}

/**
 * Writes one injection row for the customer the dialog names.
 *
 * The `sessionAt` instant is derived from the Jalali `localDate` the dialog sends:
 * a `Date` at midnight UTC of that day. The table sorts by `sessionAt` descending
 * and the row's own `localDate` is what the date cell renders, so the instant's
 * time-of-day is not a fact the write needs — the day is.
 *
 * @returns the two-path result the dialog renders.
 */
export async function createInjectionAction(
  panel: 'reception' | 'doctor' | 'admin',
  input: InjectionInput,
): Promise<InjectionActionResult> {
  const session = await resolveStaffPanel(panel)

  try {
    await runInTenantScope(session.permissions, prisma(), async (tx) => {
      const sessionAt = new Date(`${input.localDate}T00:00:00.000Z`)
      return recordInjection({
        tx,
        ctx: session.permissions,
        input: {
          customerId: input.customerId,
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
    return { ok: false, message: injectionFailureMessage(error) }
  }

  revalidatePath(`/admin/customer/${input.customerId}`)
  revalidatePath(`/reception/customers/${input.customerId}`)
  return { ok: true }
}

/**
 * The one sentence an injection failure renders.
 *
 * A dedicated boundary because the module raises its own keys and the two pages
 * are the same surface. The known keys are named; everything else falls through to
 * one apology, which is the same shape `appointmentsFailureMessage` uses.
 */
function injectionFailureMessage(error: unknown): string {
  if (isAppError(error)) {
    if (error instanceof NotFoundError) return INJECTION_TAB.errors.customerNotFound
    if (error instanceof DomainError) return INJECTION_TAB.errors.illegalValue
  }
  return INJECTION_TAB.errors.unexpected
}