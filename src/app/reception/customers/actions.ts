/**
 * The reception customers page's writes — adding a customer from the desk.
 *
 * `createOrFindCustomer` is the customers module's own dedupe-aware create (it carries
 * no permission check by design; `view_all_customers`/the desk's scope is the gate the
 * page already passed). This action resolves the reception session, runs the create in
 * the tenant scope, and revalidates the list so the new row shows without a reload.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { createOrFindCustomer } from '@/modules/customers'

import { resolveStaffPanel } from '@/app/_shell/session'

/** The result the dialog renders: a success, or the sentence a failure became. */
export type AddCustomerResult = { readonly ok: true } | { readonly ok: false }

export interface AddCustomerInput {
  readonly firstName: string
  readonly lastName: string
  readonly mobile: string
  readonly acquisitionSource: string
}

export async function addCustomerAction(input: AddCustomerInput): Promise<AddCustomerResult> {
  try {
    const session = await resolveStaffPanel('reception')
    await runInTenantScope(session.permissions, prisma(), (tx) =>
      createOrFindCustomer({
        tx,
        ctx: session.permissions,
        mobile: input.mobile,
        firstName: input.firstName,
        lastName: input.lastName === '' ? undefined : input.lastName,
        acquisitionSource: input.acquisitionSource === '' ? undefined : input.acquisitionSource,
      }),
    )
    revalidatePath('/reception/customers')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
