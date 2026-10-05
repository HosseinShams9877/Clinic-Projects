/**
 * The one place a module's `AppError` key becomes the Persian sentence a page or a
 * Server Action renders.
 *
 * `05-conventions.md` §7 keeps English in the error and Persian in the catalog, and
 * a Server Action is where the two meet. `_appointments/support.ts` is this file for
 * the three scheduling pages; the customers, services, staff and cycles surfaces need
 * the same lookup over five catalogs instead of four, and they share one file rather
 * than five copies because the lookup's whole reason to exist is that a key's
 * *owner* is the one place a sentence is written — a second copy would be the copy
 * that drops a key.
 *
 * ## Why the lookup is a chain and not a map
 *
 * Each catalog is a `Record` over its own key union, and `key in messages` is the
 * narrowing that makes the lookup type-safe without a map the compiler cannot check.
 * A key is tried in each catalog in turn, and the fallback is last rather than
 * absent because a failure the catalogs do not name is a failure that still has to
 * say something in Persian — the same sentence `_appointments` falls back to.
 *
 * ## What is not translated here
 *
 * A *form's* own sentence — "type the mobile as 09xxxxxxxxx" — is the page's, from
 * `src/app/catalog.ts`, because it is app-tier validation and no module raises it.
 * Those are not errors and never reach the lookup.
 */

import { isAppError } from '@/core/types'
import { VALIDATION_MESSAGES } from '@/core/localization'
import {
  MESSAGES as CUSTOMER_MESSAGES,
  type CustomersMessageKey,
} from '@/modules/customers'
import {
  MESSAGES as ROLES_MESSAGES,
  type RolesPermissionsMessageKey,
} from '@/modules/roles-permissions'
import {
  MESSAGES as SERVICE_MESSAGES,
  type ServicesMessageKey,
} from '@/modules/services'
import {
  MESSAGES as STAFF_MESSAGES,
  type StaffMessageKey,
} from '@/modules/staff'
import {
  MESSAGES as CYCLES_MESSAGES,
  type CyclesMessageKey,
} from '@/modules/cycles'

/**
 * The Persian sentence for a failure one of the five modules raised, or the catalog's
 * one apology for a failure no catalog names.
 *
 * Returns the apology for a non-`AppError` throw as well, which a caller treats as
 * "the platform failed" — the same sentence, arrived by the other path.
 */
export function moduleFailureMessage(error: unknown): string {
  if (!isAppError(error)) return UNEXPECTED
  const key = error.messageKey
  if (isCyclesKey(key)) return CYCLES_MESSAGES[key]
  if (isCustomersKey(key)) return CUSTOMER_MESSAGES[key]
  if (isServicesKey(key)) return SERVICE_MESSAGES[key]
  if (isStaffKey(key)) return STAFF_MESSAGES[key]
  if (isRolesKey(key)) return ROLES_MESSAGES[key]
  return UNEXPECTED
}

/** The one apology, read once so every caller names the same sentence. */
const UNEXPECTED = VALIDATION_MESSAGES['error.unhandledCase']

/** Whether the key is one `cycles`'s catalog holds a sentence for. */
function isCyclesKey(key: string): key is CyclesMessageKey {
  return key in CYCLES_MESSAGES
}

/** Whether the key is one `customers`'s catalog holds a sentence for. */
function isCustomersKey(key: string): key is CustomersMessageKey {
  return key in CUSTOMER_MESSAGES
}

/** Whether the key is one `services`'s catalog holds a sentence for. */
function isServicesKey(key: string): key is ServicesMessageKey {
  return key in SERVICE_MESSAGES
}

/** Whether the key is one `staff`'s catalog holds a sentence for. */
function isStaffKey(key: string): key is StaffMessageKey {
  return key in STAFF_MESSAGES
}

/** Whether the key is one `roles-permissions`'s catalog holds a sentence for. */
function isRolesKey(key: string): key is RolesPermissionsMessageKey {
  return key in ROLES_MESSAGES
}
