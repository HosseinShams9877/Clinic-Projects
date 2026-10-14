/**
 * The `injections` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its
 * barrel and nothing else, and "if something is not in the barrel, it is private".
 *
 * ## What is public
 *
 * The customer's injections and their four counts, the one write path, the five
 * closed sets' labels, and the module's own sentences. That is the whole surface
 * the profile's «نقشه تزریق» tab needs.
 */

export type {
  CreateInjectionInput,
  InjectionCounts,
  InjectionRow,
  InjectionsModule,
} from './types'
export type { InjectionsMessageKey } from './catalog'

export {
  INJECTION_AREA_LABELS,
  INJECTION_DEPTH_LABELS,
  INJECTION_MATERIAL_LABELS,
  INJECTION_TECHNIQUE_LABELS,
  INJECTION_UNIT_LABELS,
  MESSAGES,
} from './catalog'

export { customerInjections, injectionCounts } from './lib/queries'
export { recordInjection } from './lib/manage'