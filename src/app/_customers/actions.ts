/**
 * The customers and leads Server Actions — the write half of the six customer
 * surfaces.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and an action is
 * composition of a specific kind: it resolves the person from the session, opens the
 * tenant scope, calls the module's barrel and hands back a sentence. It runs no
 * business rule of its own — not one dedupe, not one lead transition — because the
 * module is where those live and an action that re-implemented a rule would be the
 * second implementation that drifts.
 *
 * ## Why every action resolves the panel again
 *
 * The shell resolved the same cookie a moment ago, and this is the same one indexed
 * read, done again because the resolution is not serialisable across the render
 * boundary (`session.ts` says so at the shell). The re-resolution is the security
 * property: an action cannot be invoked without a session the panel accepts, and the
 * `panel` argument is what keeps an action from being a door into another panel's
 * surface — `resolveStaffPanel('reception')` refuses a doctor's token, and the
 * refusal is a `TenantResolutionError` the caller renders as a sentence rather than
 * as a navigation.
 *
 * ## Why a lead is never deleted
 *
 * `markLeadLost` is a state change and nothing more. A lost lead stays, because the
 * acquisition report counts it (`03-data-model.md` §2.1), and an action that removed
 * a row would make the clinic's own marketing spend unreadable. The same rule keeps a
 * customer undeletable, which is why no action here names a delete.
 *
 * ## Why failures are sentences and never exceptions
 *
 * An action's contract is a result a component renders. A thrown error surfaces as
 * the framework's own error page, which is English and unhelpful and loses the
 * sentence the module raised on purpose — so every call is wrapped and the key
 * becomes Persian through `moduleFailureMessage`. The one thing that is not caught
 * is a bug the product wants to see.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import {
  asLocalDate,
  fromClockParts,
  toUtcInstant,
} from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import {
  createLead,
  markLeadLost,
  recordConsent,
  recordFollowUp,
  updateCustomerNote,
  updateCustomerProfile,
} from '@/modules/customers'
import type { ConsentFlags } from '@/modules/customers'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'
import { realClock } from '@/core/lib/clock'

import { moduleFailureMessage } from '../_shared/module-failure'

/** The answer every action gives: nothing to render on success, or the sentence. */
export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** The fields the manual-lead form collects. */
export interface LeadInput {
  readonly mobile: string
  readonly firstName: string
  readonly lastName?: string
  readonly acquisitionSource?: string
  readonly note?: string
}

/** The fields the profile's edit form collects; the mobile is not among them. */
export interface CustomerEditInput {
  readonly firstName?: string
  readonly lastName?: string | null
  /** A `LocalDate` string, or `null` to clear a birth date that was wrong. */
  readonly birthDate?: string | null
  readonly residenceArea?: string | null
  readonly medicalHistory?: string | null
  readonly sensitivities?: string | null
}

/**
 * The arguments a block runs with: the scoped transaction, the permission context the
 * module functions take, and the membership's own facts.
 */
interface ScopeArgs {
  readonly tx: Parameters<Parameters<typeof runInTenantScope<unknown>>[2]>[0]
  /** Hand this to a module function as its `ctx`; it is what `requirePermission` reads. */
  readonly ctx: TenantContext
  readonly tenantId: string
  readonly userId: string
}

/**
 * Runs a block in the caller's tenant scope and answers with a sentence on failure.
 *
 * One helper because the shape is every action's: resolve, scope, call, revalidate.
 * The `panel` is the caller's own and reaches the resolution, which is what keeps
 * the desk's lead form from being callable with a doctor's token.
 */
async function inTenantScope<T>(
  panel: Panel,
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(panel)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({ tx, ctx: session.permissions, tenantId: session.tenantId, userId: session.permissions.userId }),
  ).catch((error: unknown) => ({ ok: false, message: moduleFailureMessage(error) } as const))
}

/**
 * The sentinel a block returns when it has nothing but a success to report.
 *
 * The module functions below all answer `void`, so the action needs an object to
 * tell the two arms of the union apart: `'succeeded' in result` narrows to this and
 * away from the failure, and `in` on the `null` a `void` block would return is a
 * `TypeError` rather than a narrowing.
 */
const SUCCESS = { succeeded: true } as const

/**
 * Re-renders every surface the action could have changed, so the row the person just
 * wrote is on the list when the popup closes.
 *
 * The six paths are the six surfaces of `02-architecture.md` §9 that read these
 * tables, and revalidating all six is cheaper than deciding which one the caller is
 * looking at — the profile is reached from any of the three lists.
 */
function revalidateCustomers(customerId?: string): void {
  revalidatePath('/reception/customers')
  revalidatePath('/reception/leads')
  revalidatePath('/admin/customers')
  revalidatePath('/doctor/customers')
  if (customerId !== undefined) revalidatePath(`/admin/customer/${customerId}`)
}

/**
 * «ثبت لید» — a person who contacted the clinic and has not had a service yet.
 *
 * The dedupe is the module's: a mobile the file already holds is a customer and not a
 * new lead, and the sentence the desk reads comes back from the module's own key.
 */
export async function createLeadAction(panel: Panel, input: LeadInput): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await createLead({
      tx,
      ctx,
      mobile: input.mobile,
      firstName: input.firstName,
      lastName: input.lastName,
      acquisitionSource: input.acquisitionSource,
      note: input.note,
    })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCustomers()
  return { ok: true }
}

/** «ثبت پیگیری» — records that the desk contacted the lead, and when to try again. */
export async function recordFollowUpAction(
  panel: Panel,
  leadId: string,
  /** A `LocalDate` string the action converts to the instant the column stores. */
  nextContactAt: string,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await recordFollowUp({ tx, ctx, leadId, nextContactAt: asFollowUpAt(nextContactAt) })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCustomers()
  return { ok: true }
}

/** «از دست رفته» — closes the lead without removing it, so the report still counts it. */
export async function markLeadLostAction(panel: Panel, leadId: string): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await markLeadLost({ tx, ctx, leadId })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCustomers()
  return { ok: true }
}

/** «ذخیره تغییرات» — the profile's own facts, which the mobile is not one of. */
export async function updateCustomerProfileAction(
  panel: Panel,
  customerId: string,
  input: CustomerEditInput,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await updateCustomerProfile({
      tx,
      ctx,
      customerId,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate === undefined ? undefined : input.birthDate,
      residenceArea: input.residenceArea,
      medicalHistory: input.medicalHistory,
      sensitivities: input.sensitivities,
    })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCustomers(customerId)
  return { ok: true }
}

/** «ذخیره یادداشت» — the clinical note, which a doctor and a manager both keep. */
export async function updateCustomerNoteAction(
  panel: Panel,
  customerId: string,
  note: string | null,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await updateCustomerNote({ tx, ctx, customerId, note })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCustomers(customerId)
  return { ok: true }
}

/** «ذخیره تنظیمات ارسال» — the four consent flags, written with their evidence rows. */
export async function recordConsentAction(
  panel: Panel,
  customerId: string,
  flags: ConsentFlags,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await recordConsent({ tx, ctx, customerId, flags, source: 'desk', now: realClock() })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCustomers(customerId)
  return { ok: true }
}

/**
 * The follow-up date the module stores, as the instant the column holds.
 *
 * `recordFollowUp` takes a `Date` because the column is an instant, and the date the
 * picker hands the action is a `LocalDate` string. The shift is the library's own
 * `toUtcInstant` and not arithmetic here, because `07-localization.md` §6.1 draws
 * that line — the second conversion is the one that would be wrong, and a follow-up
 * set for a day the person reads as «۱۴۰۵/۰۳/۰۴» has to land on that day.
 */

/** The day's own start, which is the time a follow-up's date carries. */
const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })
function asFollowUpAt(localDate: string): Date {
  return toUtcInstant(asLocalDate(localDate), MIDNIGHT)
}
