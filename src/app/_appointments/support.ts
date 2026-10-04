/**
 * The boundary helpers the three appointments pages share.
 *
 * `05-conventions.md` §7 keeps English in the error and Persian in the catalog, and
 * a Server Action is where the two meet: this file is the one place an
 * `AppError`'s key becomes the sentence a person reads. It is the appointments
 * counterpart of `src/app/_login/login-support.ts`, and it exists for the same
 * reason — three pages would otherwise each re-derive the lookup, and the third one
 * would be the one that drops a key.
 *
 * ## Why the lookup is ordered
 *
 * `appointments`'s catalog owns the `appointment.*` keys, `roles-permissions`'s owns
 * the `permission.*` ones a `requirePermission` refusal raises, and `core` owns the
 * two `error.*` sentences that are the honest apology when no catalog names what
 * happened. A key is looked up in that order because that is the order the modules
 * are called in, and the fallback is last rather than absent because a failure the
 * catalogs do not name is a failure that still has to say something in Persian.
 *
 * ## Why nothing else is translated here
 *
 * A *form's* own sentence — "choose a service first" — is the page's, from
 * `src/app/catalog.ts`, because it is app-tier validation and no module raises it.
 * Those are not errors and never reach the lookup.
 *
 * ## The new-customer write, and why it is here for now
 *
 * The booking popup's third step is name and mobile (`10-testing-strategy.md` line
 * 309), and a mobile that names nobody is a person the clinic is booking for the
 * first time. The `customers` module that will own that write is Phase 3, and a
 * popup that could not book a new person would be a popup that only works for the
 * people already in the file — so the write is here, in the app tier, using the
 * constants `core` already owns (`CustomerLifecycle`, `normalizeForSearch`) and no
 * lifecycle state a later module would disagree about. When `customers` lands, this
 * function is the call it replaces, and the appointments module's own signature does
 * not change: it takes a `customerId`, and where the id comes from has always been
 * the caller's.
 */

import type { TransactionClient } from '@/core/db/scope'
import { isAppError } from '@/core/types'
import { CustomerLifecycle } from '@/core/constants'
import {
  normalizeForSearch,
  normalizeMobile,
  VALIDATION_MESSAGES,
} from '@/core/localization'
import { MESSAGES as APPOINTMENT_MESSAGES, type AppointmentsMessageKey } from '@/modules/appointments'
import { MESSAGES as ROLES_MESSAGES, type RolesPermissionsMessageKey } from '@/modules/roles-permissions'

/**
 * The Persian sentence for a failure the appointments module raised, or the
 * catalog's one apology for a failure no catalog names.
 *
 * Returns the apology for a non-`AppError` throw as well, which a caller treats as
 * "the platform failed" — the same sentence, arrived by the other path.
 */
export function appointmentsFailureMessage(error: unknown): string {
  if (!isAppError(error)) return UNEXPECTED
  if (isAppointmentKey(error.messageKey)) return APPOINTMENT_MESSAGES[error.messageKey]
  if (isRolesKey(error.messageKey)) return ROLES_MESSAGES[error.messageKey]
  return UNEXPECTED
}

/** The one apology, read once so the two paths name the same sentence. */
const UNEXPECTED = VALIDATION_MESSAGES['error.unhandledCase']

/** Whether the key is one `appointments`'s catalog holds a sentence for. */
function isAppointmentKey(key: string): key is AppointmentsMessageKey {
  return key in APPOINTMENT_MESSAGES
}

/** Whether the key is one `roles-permissions`'s catalog holds a sentence for. */
function isRolesKey(key: string): key is RolesPermissionsMessageKey {
  return key in ROLES_MESSAGES
}

/**
 * The customer a booking is for — an existing row, or a new one.
 *
 * Looked up by the mobile the desk typed, because the mobile is the identity
 * (`03-data-model.md` §2.1's Decision 1) and a second row for the same person is
 * what `customer_mobile_key` exists to prevent. A mobile that names nobody is a new
 * customer, written with the lifecycle the constants hold and a `searchName` built
 * by the normalizer every other writer uses.
 *
 * @returns the customer's id, for `bookAppointment`'s `customerId`.
 */
export async function resolveCustomerId(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly mobile: string
  readonly firstName: string
  readonly lastName?: string
}): Promise<string> {
  const mobile = normalizeMobile(args.mobile)
  const existing = await args.tx.customer.findUnique({
    where: { tenantId_mobile: { tenantId: args.tenantId, mobile } },
    select: { id: true },
  })
  if (existing !== null) return existing.id

  const created = await args.tx.customer.create({
    data: {
      tenantId: args.tenantId,
      mobile,
      firstName: args.firstName.trim(),
      lastName: args.lastName?.trim() || null,
      searchName: normalizeForSearch(`${args.firstName} ${args.lastName ?? ''}`),
      lifecycle: CustomerLifecycle.Customer,
    },
  })
  return created.id
}
