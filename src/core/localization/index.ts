/**
 * The localization layer — the module's only public surface.
 *
 * `01-tech-stack.md` §8.6 and `07-localization.md` §6.1 both draw the same line:
 * the calendar conversion and the calendar arithmetic come from
 * `date-fns-jalali`, and **everything about how a value is displayed is ours**.
 * That line runs along `jalali.ts`: it is the only file that imports the library,
 * and this barrel is the only door into the layer.
 *
 * ## What is exported
 *
 * - `digits` — Persian ↔ Latin conversion, the separators, the ZWNJ.
 * - `jalali` — the calendar: validation, parts, arithmetic, the UTC bridge.
 * - `calendar` — the week starting on شنبه, month grids, report ranges.
 * - `format` — every value rendered as text. Persian digits, `٬`, Toman, and the
 *   bidi isolation §5 requires.
 * - `message` — the template renderer of §7.3, which fills a stored Persian
 *   sentence with values and converts the substituted digits.
 * - `normalize` — search folding and mobile normalisation.
 * - `catalog` — the shared labels.
 *
 * ## What is deliberately not
 *
 * `GregorianParts` and the private helpers beside it stay inside the layer. So
 * does `date-fns-jalali` itself: a module that imports it directly has bypassed
 * the display layer, the digit conversion and the bidi rules in one step, and the
 * import-boundary rule in `eslint.config.mjs` fails the build when it does — this
 * barrel is the whole reason that rule is enforceable by name rather than by
 * convention.
 */

export * from './calendar'
export * from './catalog'
export * from './digits'
export * from './format'
export * from './jalali'
export * from './message'
export * from './normalize'
export * from './types'
