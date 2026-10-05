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
 * the `permission.*` ones a `requirePermission` refusal raises, `customers`'s owns
 * the `customer.*` ones a dedupe refusal raises, and `core` owns the two `error.*`
 * sentences that are the honest apology when no catalog names what happened. A key is
 * looked up in that order because that is the order the modules are called in, and
 * the fallback is last rather than absent because a failure the catalogs do not name
 * is a failure that still has to say something in Persian.
 *
 * ## Why nothing else is translated here
 *
 * A *form's* own sentence — "choose a service first" — is the page's, from
 * `src/app/catalog.ts`, because it is app-tier validation and no module raises it.
 * Those are not errors and never reach the lookup.
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { isAppError } from '@/core/types'
import { VALIDATION_MESSAGES } from '@/core/localization'
import { createOrFindCustomer } from '@/modules/customers'
import {
  MESSAGES as APPOINTMENT_MESSAGES,
  type AppointmentsMessageKey,
} from '@/modules/appointments'
import {
  MESSAGES as ROLES_MESSAGES,
  type RolesPermissionsMessageKey,
} from '@/modules/roles-permissions'
import {
  MESSAGES as CUSTOMER_MESSAGES,
  type CustomersMessageKey,
} from '@/modules/customers'

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
  if (isCustomersKey(error.messageKey)) return CUSTOMER_MESSAGES[error.messageKey]
  if (isRolesKey(error.messageKey)) return ROLES_MESSAGES[error.messageKey]
  return UNEXPECTED
}

/** The one apology, read once so the two paths name the same sentence. */
const UNEXPECTED = VALIDATION_MESSAGES['error.unhandledCase']

/** Whether the key is one `appointments`'s catalog holds a sentence for. */
function isAppointmentKey(key: string): key is AppointmentsMessageKey {
  return key in APPOINTMENT_MESSAGES
}

/** Whether the key is one `customers`'s catalog holds a sentence for. */
function isCustomersKey(key: string): key is CustomersMessageKey {
  return key in CUSTOMER_MESSAGES
}

/** Whether the key is one `roles-permissions`'s catalog holds a sentence for. */
function isRolesKey(key: string): key is RolesPermissionsMessageKey {
  return key in ROLES_MESSAGES
}

/**
 * The customer a booking is for — an existing row, or a new one.
 *
 * Delegated to `customers`'s `createOrFindCustomer`, which owns the mobile key
 * (`customer_mobile_key`), the lead conversion, and the sentence the desk reads when
 * the person is already in the file. That function is the one path every booking
 * takes, which is why the conversion happens inside it and not here: a popup is not
 * the only caller, and a conversion written here would be a conversion the lead
 * desk's own booking never made.
 *
 * @returns the customer's id, for `bookAppointment`'s `customerId`.
 * @throws ValidationError — the mobile is not a mobile, raised by the module that
 *   stores the column.
 */
export async function resolveCustomerId(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly mobile: string
  readonly firstName: string
  readonly lastName?: string
  readonly acquisitionSource?: string
}): Promise<string> {
  const customer = await createOrFindCustomer({
    tx: args.tx,
    ctx: args.ctx,
    mobile: args.mobile,
    firstName: args.firstName,
    lastName: args.lastName,
    acquisitionSource: args.acquisitionSource,
  })
  return customer.id
}
