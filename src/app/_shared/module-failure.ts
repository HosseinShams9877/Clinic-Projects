/**
 * The one place a module's `AppError` key becomes the Persian sentence a page or a
 * Server Action renders.
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
import {
  MESSAGES as STORAGE_MESSAGES,
  type StorageMessageKey,
} from '@/modules/storage'

export function moduleFailureMessage(error: unknown): string {
  if (!isAppError(error)) return UNEXPECTED
  const key = error.messageKey
  if (isStorageKey(key)) return STORAGE_MESSAGES[key]
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

const UNEXPECTED = VALIDATION_MESSAGES['error.unhandledCase']

function isStorageKey(key: string): key is StorageMessageKey {
  return key in STORAGE_MESSAGES
}

function isDebtsKey(key: string): key is DebtsMessageKey {
  return key in DEBTS_MESSAGES
}

function isAssistantKey(key: string): key is CampaignAssistantMessageKey {
  return key in ASSISTANT_MESSAGES
}

function isAudienceKey(key: string): key is AudienceGroupsMessageKey {
  return key in AUDIENCE_MESSAGES
}

function isCampaignsKey(key: string): key is CampaignsMessageKey {
  return key in CAMPAIGN_MESSAGES
}

function isPaymentsKey(key: string): key is PaymentsMessageKey {
  return key in PAYMENTS_MESSAGES
}

function isCyclesKey(key: string): key is CyclesMessageKey {
  return key in CYCLES_MESSAGES
}

function isCustomersKey(key: string): key is CustomersMessageKey {
  return key in CUSTOMER_MESSAGES
}

function isServicesKey(key: string): key is ServicesMessageKey {
  return key in SERVICE_MESSAGES
}

function isStaffKey(key: string): key is StaffMessageKey {
  return key in STAFF_MESSAGES
}

function isRolesKey(key: string): key is RolesPermissionsMessageKey {
  return key in ROLES_MESSAGES
}

function isSettingsKey(key: string): key is SettingsMessageKey {
  return key in SETTINGS_MESSAGES
}