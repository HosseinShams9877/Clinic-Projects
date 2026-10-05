/**
 * The tenant's two cycle settings — `04-roles-permissions.md` §5.
 *
 * That section is explicit about where these live: "Present in تنظیمات › چرخه درمان
 * and enforced in the `cycles` module — recorded here because they read like
 * behavioural toggles but sit with the cycle engine." They are therefore **not** among
 * §4's eight, and this file does not read them out of the `toggles` blob the
 * permission module owns. A ninth toggle would be a second place that module's closed
 * eight could drift, and the matrix's own test asserts the count.
 *
 * ## Why every default is named, and both are ON
 *
 * §5's table states both defaults, and the document's own reason for the second is the
 * reason the setting exists at all: "without it, moving one session forward silently
 * compresses every remaining interval." ON is the behaviour the specification ships,
 * and a clinic that turns it off is choosing the compressed spacing with the setting
 * in front of them.
 *
 * ## Why a stored value that is not a boolean is the default, not an error
 *
 * The column is JSON in a plain `String` (`03-data-model.md` §5), so a row written by
 * a release this one does not know is a real possibility. The fail-safe answer to
 * "does this clinic do the documented thing" is the documented thing, and a settings
 * read that threw would take the whole contact list down for one malformed row.
 *
 * ## Why the parse is permissive and the write is not
 *
 * Unknown *keys* are ignored, because a third setting added later is a setting this
 * release does not read and not a reason to lose the two it does. A key that is
 * present and not a boolean is also the default, for the reason above. What the parse
 * refuses is a column that is not an object at all — that is corruption, and the whole
 * point of reading settings is to answer with something, so the permissive read is the
 * one that still answers.
 */

import { z } from 'zod'

import { DEFAULT_CLINIC_UTC_OFFSET_MINUTES } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

import type { CycleSettings } from '../types'

/**
 * The shape of the stored column: two booleans, and anything else ignored.
 *
 * `.catch(true)` rather than `.default(true)` — the distinction is what a key that is
 * present but wrong answers, and `default` would only answer for a key that is absent.
 * Both settings default ON, so both are caught at ON, which is also the documented
 * behaviour for a column a release does not recognise.
 */
const cycleSettingsSchema = z
  .object({
    noShowAddsToContactList: z.boolean().catch(true),
    rescheduleShiftsDueDates: z.boolean().catch(true),
  })
  .catch({ noShowAddsToContactList: true, rescheduleShiftsDueDates: true })

/**
 * The settings a tenant that has never opened چرخه درمان gets — §5's own table, and
 * the state of every tenant at onboarding (`02-architecture.md` §13.4).
 */
export const DEFAULT_CYCLE_SETTINGS: CycleSettings = Object.freeze({
  noShowAddsToContactList: true,
  rescheduleShiftsDueDates: true,
})

/** The column the two settings are stored in, named once so a rename touches one string. */
const SETTINGS_SELECT = {
  cycleSettings: true,
} as const

/**
 * The tenant's two cycle settings, or the documented ON defaults when the row is
 * absent, holds no blob, or holds one this release does not recognise.
 *
 * Takes the transaction the caller already opened: the contact list reads the settings
 * and writes the cycle inside one transaction, and reading them through a second
 * client would be a read outside the scope the sweep writes under.
 */
export async function readCycleSettings(
  tx: TransactionClient,
  tenantId: string,
): Promise<CycleSettings> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: SETTINGS_SELECT,
  })
  if (row === null || row.cycleSettings === null) return DEFAULT_CYCLE_SETTINGS

  return Object.freeze({
    ...DEFAULT_CYCLE_SETTINGS,
    ...cycleSettingsSchema.parse(safeJson(row.cycleSettings)),
  })
}

/**
 * The blob as an object, or `undefined` for a column that is not JSON or not an
 * object — which `.catch` answers with both settings at their ON default.
 *
 * Not `JSON.parse` alone: the column holds a string the settings screen wrote, and a
 * string that is not JSON is a defect in the writer that the read has to survive
 * rather than propagate, because the contact list renders underneath it.
 */
function safeJson(stored: string): unknown {
  try {
    const parsed: unknown = JSON.parse(stored)
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * The tenant's UTC offset, or the documented constant when the row is absent.
 *
 * `nextDueDate` is stored as the instant of a clinic-local day, so the conversion needs
 * the tenant's own calendar (`07-localization.md` §6.1's line about who owns the second
 * conversion). Read here and not from the `appointments` module's settings so the cycle
 * engine does not reach into another module for a fact the tenant's own row holds — the
 * offset is `TenantSettings.utcOffsetMinutes`, documented in ADR-0009 as a fixed
 * UTC+3:30.
 */
export async function readUtcOffsetMinutes(
  tx: TransactionClient,
  tenantId: string,
): Promise<number> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: { utcOffsetMinutes: true },
  })
  return row === null ? DEFAULT_CLINIC_UTC_OFFSET_MINUTES : row.utcOffsetMinutes
}
