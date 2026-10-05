/**
 * The tenant's debt settings — `03-data-model.md` §4.1's grace period and §4's toggle 4.
 *
 * Both are NULL-able on `TenantSettings`, and for each one NULL is the documented
 * absence rather than a value: no grace period means the due date is the session's own
 * day, and a secretary on a clinic with toggle 4 off may not move a due date.
 */

import { DEFAULT_CLINIC_UTC_OFFSET_MINUTES } from '@/core/constants'
import { TOGGLE_DEFAULTS, Toggle } from '@/modules/roles-permissions'
import type { TransactionClient } from '@/core/db/scope'

/** The columns this module reads, named once so a rename touches one select. */
const SETTINGS_SELECT = {
  debtGraceDays: true,
  toggles: true,
  utcOffsetMinutes: true,
} as const

/** What a debt path asks of the tenant's settings, resolved once per read. */
export interface DebtSettings {
  /** §4.1's grace period in days — NULL is no grace. */
  readonly debtGraceDays: number
  /** Toggle 4 — whether the desk may move a due date the customer promised. */
  readonly secretaryCanMoveDueDate: boolean
  readonly utcOffsetMinutes: number
}

export const DEFAULT_DEBT_SETTINGS: DebtSettings = Object.freeze({
  debtGraceDays: 0,
  secretaryCanMoveDueDate: TOGGLE_DEFAULTS[Toggle.SecretaryMoveDueDate],
  utcOffsetMinutes: DEFAULT_CLINIC_UTC_OFFSET_MINUTES,
})

/** The tenant's settings, or the documented defaults when the row is absent. */
export async function readDebtSettings(
  tx: TransactionClient,
  tenantId: string,
): Promise<DebtSettings> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: SETTINGS_SELECT,
  })
  if (row === null) return DEFAULT_DEBT_SETTINGS

  return Object.freeze({
    ...DEFAULT_DEBT_SETTINGS,
    debtGraceDays: row.debtGraceDays === null ? 0 : row.debtGraceDays,
    secretaryCanMoveDueDate: toggleOrDefault(row.toggles, Toggle.SecretaryMoveDueDate),
    utcOffsetMinutes: row.utcOffsetMinutes,
  })
}

/** One toggle out of the JSON blob, or its documented default when the blob cannot answer. */
function toggleOrDefault(stored: string | null, key: Toggle): boolean {
  if (stored === null) return TOGGLE_DEFAULTS[key]
  try {
    const parsed: unknown = JSON.parse(stored) as unknown
    if (parsed === null || typeof parsed !== 'object') return TOGGLE_DEFAULTS[key]
    const value: unknown = (parsed as Record<string, unknown>)[key]
    return typeof value === 'boolean' ? value : TOGGLE_DEFAULTS[key]
  } catch {
    return TOGGLE_DEFAULTS[key]
  }
}
