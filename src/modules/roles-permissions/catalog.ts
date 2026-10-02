/**
 * The Persian sentences `roles-permissions` raises.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside a catalog a
 * finding, and the ESLint config enforces it on every rendering file — a module
 * catalog is one of the two exemptions (`src/modules/<module>/catalog.ts`), the
 * other being `src/app/catalog.ts`. So a message raised from this module lives
 * here and is referenced by **key** everywhere else: `core/types/errors.ts` carries
 * a `messageKey` rather than a message for exactly this reason.
 *
 * ## The keys, and where the sentences go
 *
 * Four refusals, and no two of them tell the user the same thing — `07-localization.md`
 * §8 requires a message to name the **fix**, and each of these has a different one:
 *
 * | Key | The fix it names |
 * |---|---|
 * | `permission.denied` | Ask the manager for the capability. |
 * | `permission.selfEdit` | Have a different manager make the change. |
 * | `permission.managerColumnLocked` | None — the column is locked by design, so the sentence says why rather than offering a retry. |
 * | `permission.lastManager` | Appoint another manager first, then make the change. |
 *
 * The last two are the pair most likely to be collapsed into one sentence by
 * someone tidying up, and they are deliberately not: one is a rule about a single
 * row and the other is a rule about the whole tenant, and the second one has an
 * action attached that the first does not. A user who is told «ابتدا مدیر دیگری
 * تعیین کنید» has been given the way forward; a user told only that the change is
 * refused has not.
 *
 * ## The ZWNJ
 *
 * Four labels below carry a ZWNJ (U+200C), written as `${ZWNJ}` for the reason
 * `catalog/common.ts` gives at length: the character is invisible, so a literal one
 * survives review, a formatter and a copy-paste with nobody noticing its absence,
 * and the string left behind reads as a spacing error. `docs/knowledge/` contains no
 * U+200C anywhere, so a sentence copied from the specification will be missing
 * every one it is due — `catalog/enums.ts` records the same finding.
 */

import { ZWNJ } from '@/core/localization'

/** Every catalog key this module can raise. */
export type RolesPermissionsMessageKey =
  | 'permission.denied'
  | 'permission.selfEdit'
  | 'permission.managerColumnLocked'
  | 'permission.lastManager'

/**
 * The sentence for each key.
 *
 * Typed as a `Record` over the union, so a key with no sentence is a compile error
 * rather than an empty string on a screen.
 */
export const MESSAGES: Readonly<Record<RolesPermissionsMessageKey, string>> = {
  'permission.denied':
    'برای این کار دسترسی ندارید. از مدیر کلینیک بخواهید این دسترسی را برای شما فعال کند.',

  'permission.selfEdit': `دسترسی${ZWNJ}های خودتان را نمی${ZWNJ}توانید تغییر دهید. این تغییر را باید مدیر دیگری انجام دهد.`,

  'permission.managerColumnLocked': `ستون مدیر قفل است. دسترسی مدیر را نمی${ZWNJ}توان کم کرد، چون ممکن است کلینیک بدون مدیر بماند.`,

  'permission.lastManager': `این تغییر آخرین مدیر فعال کلینیک را حذف می${ZWNJ}کند. ابتدا مدیر دیگری تعیین کنید.`,
}
