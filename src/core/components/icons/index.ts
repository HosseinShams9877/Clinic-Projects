/**
 * `src/core/components/icons` — the icon layer's public surface.
 *
 * `01-tech-stack.md` §8.2 makes this directory the only place `lucide-react` may be
 * imported, and `eslint.config.mjs` enforces that with a `no-restricted-imports`
 * rule whose message names this barrel. So the barrel is not a convenience: it is
 * the door the rule points at.
 *
 * ## What is exported, and what deliberately is not
 *
 * `Icon` is the component. `ICON_SIZES` and `ICON_STROKE_WIDTH` are the design
 * system's numbers, exported so a test asserts against the token rather than
 * against a second literal and so a CSS Module that needs the stroke width cannot
 * invent its own. `IconName` and `IconSize` are the two types a caller needs in a
 * signature — a nav configuration typed as `readonly { icon: IconName }[]`, say.
 *
 * The registry itself is **not** exported. A caller that could reach `ICONS.appointment.glyph`
 * could render it directly and skip the stroke assertion, which is precisely the
 * bypass §8.2 exists to close. Naming a concept is the whole interface.
 */

export { Icon } from './Icon'
export type { IconProps } from './Icon'
export { ICON_SIZES, ICON_STROKE_WIDTH } from './icons'
export type { IconName, IconSize } from './icons'
