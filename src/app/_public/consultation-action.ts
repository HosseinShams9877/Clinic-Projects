/**
 * The consultation form's Server Action — `02-architecture.md` §9's `contact.html`.
 *
 * The form's job is the one the deliverable names: a person who wants advice becomes a
 * **lead** with `acquisitionSource: Website`, and the lead appears in the reception
 * cartable the desk opens. Not a customer — a customer is a person the clinic has
 * served, and a consultation request is a person the clinic has only heard from. The
 * distinction is the lead lifecycle's own, and the module's `createLead` is what keeps
 * it, so the action calls it and never writes a row itself.
 *
 * ## Why the lead goes through the customers module and not around it
 *
 * The lead's lifecycle, its mobile validation and its source attribution are the
 * customers module's, and the module exports `createPublicLead` for exactly this caller:
 * the same row and the same validation as the desk's `createLead`, with the staff
 * permission replaced by the principal the action names. The source is fixed to
 * `Website` inside the module and is not an argument, so a request that reached this
 * action from any other surface still counts in the bucket the surface earned.
 *
 * ## Why the source is `Website` and never an argument
 *
 * `acquisitionSource` is the fact the acquisition report counts and the one the
 * deliverable's "source attribution" names. It is set here, from the surface the
 * request reached, and it is not a field the form offers — a person who filled in
 * "Instagram" on a website form would be a person the report counted in the wrong
 * bucket, and the bucket is what the marketing spend is justified by.
 *
 * ## Why a duplicate mobile is the existing person
 *
 * The mobile is the person's identity, and a second request from the same number is not
 * a new lead: it is the same person, asking again. The action answers with the sentence
 * the catalog gives the desk for the same case, and the person is not duplicated —
 * which is also what keeps the follow-up the desk owes pointed at one row.
 *
 * ## Why failures are sentences
 *
 * The island renders a result, and a thrown error is the framework's English page. Every
 * call is wrapped and the key becomes a Persian sentence, so the person who typed a bad
 * mobile reads the mobile sentence and not a stack trace.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { resolveTenantId } from '@/app/_shell/tenant'
import { isValidMobile, normalizeMobile } from '@/core/localization'
import { ValidationError, asTenantId, asUserId, type ClinicId } from '@/core/types'
import type { TenantPrincipal } from '@/core/tenant'
import { createPublicLead } from '@/modules/customers'
import { PUBLIC_FAILURES } from '@/modules/public-site'

/** The form's answer: the lead it wrote, or the sentence to render. */
export type ConsultationResult =
  | { readonly ok: true; readonly leadId: string }
  | { readonly ok: false; readonly message: string }

/** A context the public site acts under: a tenant, and no permissions at all. */
function publicContext(tenantId: string): TenantPrincipal {
  return {
    tenantId: asTenantId(tenantId),
    clinicId: null as ClinicId | null,
    role: 'public',
    userId: asUserId('public'),
    overrides: { granted: [], revoked: [] },
  }
}

/**
 * «درخواست مشاوره» — the consultation form's submit.
 *
 * The mobile is validated before the module is reached, because the mobile is the key
 * the whole file is keyed on and a malformed one is the caller's mistake rather than the
 * clinic's. The lead's note carries the service the person asked about, so the desk
 * opens the row already knowing what to call about.
 */
export async function requestConsultation(args: {
  readonly firstName: string
  readonly lastName: string
  readonly mobile: string
  readonly service: string
  readonly note: string
}): Promise<ConsultationResult> {
  const tenantId = await resolveTenantId()
  if (tenantId === null) return { ok: false, message: PUBLIC_FAILURES.tenantUnknown }

  const mobile = normalizeMobile(args.mobile)
  if (!isValidMobile(mobile)) {
    return { ok: false, message: PUBLIC_FAILURES.mobileInvalid }
  }
  if (args.firstName.trim() === '') {
    return { ok: false, message: PUBLIC_FAILURES.incomplete }
  }

  try {
    return await runInTenantScope(publicContext(tenantId), prisma(), async (tx) => {
      const lead = await createPublicLead({
        tx,
        ctx: publicContext(tenantId),
        mobile,
        firstName: args.firstName.trim(),
        lastName: args.lastName.trim() === '' ? undefined : args.lastName.trim(),
        note: consultationNote(args),
      })

      revalidatePath('/contact')

      return { ok: true as const, leadId: lead.id }
    })
  } catch (error: unknown) {
    return { ok: false, message: consultationFailureMessage(error) }
  }
}

/** The note the desk reads, assembled from the two free-text fields the form collected. */
function consultationNote(args: {
  readonly service: string
  readonly note: string
}): string | undefined {
  const parts = [
    args.service === '' ? null : `${PUBLIC_FAILURES.consultation.servicePrefix}${args.service}`,
    args.note.trim() === '' ? null : args.note.trim(),
  ]
  const joined = parts.filter((part): part is string => part !== null).join('\n')
  return joined === '' ? undefined : joined
}

/** A thrown error as the Persian sentence the form renders. */
function consultationFailureMessage(error: unknown): string {
  if (error instanceof ValidationError) return PUBLIC_FAILURES.incomplete
  if (error instanceof Error && 'messageKey' in error) {
    const key = (error as { readonly messageKey: string }).messageKey
    if (key === 'customer.mobileInvalid') return PUBLIC_FAILURES.mobileInvalid
    if (key === 'customer.duplicateMobile') return PUBLIC_FAILURES.consultation.duplicate
  }
  return PUBLIC_FAILURES.consultation.unknown
}
