/**
 * The boundary helpers the three appointments pages share.
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
import {
  MESSAGES as CYCLES_MESSAGES,
  type CyclesMessageKey,
} from '@/modules/cycles'

export function appointmentsFailureMessage(error: unknown): string {
  console.error('[appointmentsFailureMessage] raw error:', error)
  if (!isAppError(error)) return UNEXPECTED
  if (isAppointmentKey(error.messageKey)) return APPOINTMENT_MESSAGES[error.messageKey]
  if (isCustomersKey(error.messageKey)) return CUSTOMER_MESSAGES[error.messageKey]
  if (isRolesKey(error.messageKey)) return ROLES_MESSAGES[error.messageKey]
  if (isCyclesKey(error.messageKey)) return CYCLES_MESSAGES[error.messageKey]
  return UNEXPECTED
}

const UNEXPECTED = VALIDATION_MESSAGES['error.unhandledCase']

function isAppointmentKey(key: string): key is AppointmentsMessageKey {
  return key in APPOINTMENT_MESSAGES
}

function isCustomersKey(key: string): key is CustomersMessageKey {
  return key in CUSTOMER_MESSAGES
}

function isRolesKey(key: string): key is RolesPermissionsMessageKey {
  return key in ROLES_MESSAGES
}

function isCyclesKey(key: string): key is CyclesMessageKey {
  return key in CYCLES_MESSAGES
}

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