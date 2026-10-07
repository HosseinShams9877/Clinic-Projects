/**
 * The eight toggles' read and their enforcement.
 *
 * `04-roles-permissions.md` §4 is explicit that a toggle is not a permission — the
 * matrix says who may be on a page, a toggle says how much authority they have
 * inside it. So this file is the settings module's own half of that boundary: it
 * reads the tenant's toggles blob and it answers the one question a write path asks
 * of it, which is "does this clinic allow this".
 *
 * ## Why the enforcement lives in `settings` and not in `roles-permissions`
 *
 * The permission module owns the closed list and the defaults; the *value* is the
 * tenant's own row, and the row is what `settings` reads and writes. A gate in the
 * permission module would reach across the module boundary for a column this module
 * owns, and the two halves of "which eight are there" and "what did this clinic set
 * them to" would drift into two modules.
 *
 * ## Why an enforcement function and not a boolean
 *
 * A gate that returns a boolean is a gate the caller can forget to check. The five
 * write paths that already read a toggle each check it themselves, and they keep
 * their own readers; the three that did not check anything now call
 * `requireToggle`, which reads the row and raises when the answer is no. The
 * raised error is a `DomainError` and not a `PermissionError`, because §4's own
 * distinction is that this is not the matrix.
 */

import { DomainError } from '@/core/types'
import { TOGGLE_DEFAULTS, type Toggle } from '@/modules/roles-permissions'
import type { TransactionClient } from '@/core/db/scope'

/** The columns the toggles are stored in, named once so a rename touches one select. */
const TOGGLES_SELECT = {
  toggles: true,
} as const

/** All eight, at the value the tenant's row holds or the documented default. */
export async function readToggles(
  tx: TransactionClient,
  tenantId: string,
): Promise<Readonly<Record<Toggle, boolean>>> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: TOGGLES_SELECT,
  })
  return Object.freeze(
    Object.fromEntries(
      (Object.keys(TOGGLE_DEFAULTS) as readonly Toggle[]).map((toggle) => [
        toggle,
        toggleValue(row?.toggles ?? null, toggle),
      ]),
    ) as Readonly<Record<Toggle, boolean>>,
  )
}

/** One toggle's answer, read from the row. */
export async function toggleEnabled(
  tx: TransactionClient,
  tenantId: string,
  toggle: Toggle,
): Promise<boolean> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: TOGGLES_SELECT,
  })
  return toggleValue(row?.toggles ?? null, toggle)
}

/**
 * The gate: resolves when the clinic allows `toggle`, raises when it does not.
 *
 * Reads the row rather than the caller's snapshot, because a toggle is per request
 * and a value the caller loaded earlier is a value another tab may have changed
 * since. The error carries the toggle's code so the caller's sentence can name the
 * authority that is missing.
 */
export async function requireToggle(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly toggle: Toggle
}): Promise<void> {
  if (await toggleEnabled(args.tx, args.tenantId, args.toggle)) return

  throw new DomainError(`The ${args.toggle} toggle is disabled on this tenant's settings`, {
    messageKey: 'settings.toggleDisabled',
    detail: { toggle: args.toggle },
  })
}

/**
 * Writes the toggles blob from a partial map, keeping every key the constants close.
 *
 * Keys the caller did not send keep the value the row already holds, and keys the
 * row has never held keep their default — so a form that edits one toggle cannot
 * unset the other seven, and a new toggle is never silently absent from the row.
 */
export async function writeToggles(
  tx: TransactionClient,
  tenantId: string,
  changes: Readonly<Partial<Record<Toggle, boolean>>>,
): Promise<Readonly<Record<Toggle, boolean>>> {
  const current = await readToggles(tx, tenantId)
  const next = { ...current, ...changes }

  await tx.tenantSettings.upsert({
    where: { tenantId },
    create: { tenantId, toggles: JSON.stringify(next) },
    update: { toggles: JSON.stringify(next) },
  })

  return Object.freeze(next)
}

/** One toggle out of the blob, or its documented default when the blob cannot answer. */
function toggleValue(stored: string | null, toggle: Toggle): boolean {
  if (stored === null) return TOGGLE_DEFAULTS[toggle]
  try {
    const parsed: unknown = JSON.parse(stored)
    if (parsed === null || typeof parsed !== 'object') return TOGGLE_DEFAULTS[toggle]
    const value: unknown = (parsed as Record<string, unknown>)[toggle]
    return typeof value === 'boolean' ? value : TOGGLE_DEFAULTS[toggle]
  } catch {
    return TOGGLE_DEFAULTS[toggle]
  }
}
