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
import {
  MESSAGES as PAYMENTS_MESSAGES,
  type PaymentsMessageKey,
} from '@/modules/payments'
import {
  MESSAGES as DEBTS_MESSAGES,
  type DebtsMessageKey,
} from '@/modules/debts'
import {
  MESSAGES as CAMPAIGN_MESSAGES,
  type CampaignsMessageKey,
} from '@/modules/campaigns'
import {
  MESSAGES as AUDIENCE_MESSAGES,
  type AudienceGroupsMessageKey,
} from '@/modules/audience-groups'
import {
  MESSAGES as ASSISTANT_MESSAGES,
  type CampaignAssistantMessageKey,
} from '@/modules/campaign-assistant'
import {
  MESSAGES as SETTINGS_MESSAGES,
  type SettingsMessageKey,
} from '@/modules/settings'

/**
 * The Persian sentence for a failure one of the modules raised, or the catalog's
 * one apology for a failure no catalog names.
 *
 * Returns the apology for a non-`AppError` throw as well, which a caller treats as
 * "the platform failed" — the same sentence, arrived by the other path.
 */
export function moduleFailureMessage(error: unknown): string {
  if (!isAppError(error)) return UNEXPECTED
  const key = error.messageKey
  if (isSettingsKey(key)) return SETTINGS_MESSAGES[key]
  if (isAssistantKey(key)) return ASSISTANT_MESSAGES[key]
  if (isAudienceKey(key)) return AUDIENCE_MESSAGES[key]
  if (isCampaignsKey(key)) return CAMPAIGN_MESSAGES[key]
  if (isDebtsKey(key)) return DEBTS_MESSAGES[key]
  if (isPaymentsKey(key)) return PAYMENTS_MESSAGES[key]
  if (isCyclesKey(key)) return CYCLES_MESSAGES[key]
  if (isCustomersKey(key)) return CUSTOMER_MESSAGES[key]
  if (isServicesKey(key)) return SERVICE_MESSAGES[key]
  if (isStaffKey(key)) return STAFF_MESSAGES[key]
  if (isRolesKey(key)) return ROLES_MESSAGES[key]
  return UNEXPECTED
}

/** The one apology, read once so every caller names the same sentence. */
const UNEXPECTED = VALIDATION_MESSAGES['error.unhandledCase']

/** Whether the key is one `debts`'s catalog holds a sentence for. */
function isDebtsKey(key: string): key is DebtsMessageKey {
  return key in DEBTS_MESSAGES
}

/** Whether the key is one `campaign-assistant`'s catalog holds a sentence for. */
function isAssistantKey(key: string): key is CampaignAssistantMessageKey {
  return key in ASSISTANT_MESSAGES
}

/** Whether the key is one `audience-groups`'s catalog holds a sentence for. */
function isAudienceKey(key: string): key is AudienceGroupsMessageKey {
  return key in AUDIENCE_MESSAGES
}

/** Whether the key is one `campaigns`'s catalog holds a sentence for. */
function isCampaignsKey(key: string): key is CampaignsMessageKey {
  return key in CAMPAIGN_MESSAGES
}

/** Whether the key is one `payments`'s catalog holds a sentence for. */
function isPaymentsKey(key: string): key is PaymentsMessageKey {
  return key in PAYMENTS_MESSAGES
}

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

/** Whether the key is one `settings`'s catalog holds a sentence for. */
function isSettingsKey(key: string): key is SettingsMessageKey {
  return key in SETTINGS_MESSAGES
}
