/**
 * The `public-site` module's complete public surface (`02-architecture.md` §7).
 *
 * The eight pages of §9 are this module's, and the module is the only place the pages
 * reach the database from — the barrel is the boundary, and `eslint.config.mjs` bans
 * the deep specifier on the importing side.
 *
 * ## What is deliberately not here
 *
 * A `TenantContext`. The public site has no session and no membership, so there is no
 * `userId`, no `role` and no permission to resolve, and the reads take a `tenantId` the
 * layout resolved from the host. The one thing the tenant id is *not* is a value a
 * caller may supply: it comes from `resolveTenantId()` and reaches the reads through
 * the scope the layout opened, and the Prisma extension applies it to every query.
 *
 * A customer read. The public site never reads a person's record, their balance, their
 * notes or their cycle. The two writes it makes — a booking and a lead — create the
 * row the desk needs and nothing more, and the lead's `acquisitionSource` is the
 * attribution the module's own deliverable names.
 *
 * A write that bypasses the desk's rules. The booking path goes through the same
 * `bookAppointment` the reception desk calls, which is why the barrel re-exports the
 * Server Action's helpers and not a second booking implementation: the holiday gate,
 * the deposit gate and the slot's uniqueness are the module's, and a public path that
 * reimplemented them would be a second implementation that drifts.
 */

export type { PublicNavLink, TrustItem } from './catalog'

export type {
  PublicBeforeAfter,
  PublicDoctor,
  PublicService,
} from './lib/reads'

export {
  PUBLIC_ABOUT,
  PUBLIC_BOOKING,
  PUBLIC_CONTACT,
  PUBLIC_DOCTORS,
  PUBLIC_FAILURES,
  PUBLIC_HOME,
  PUBLIC_LAYOUT,
  PUBLIC_PANELS,
  PUBLIC_SERVICE_DETAIL,
  PUBLIC_SERVICES,
} from './catalog'

export {
  publicBeforeAfter,
  publicDoctors,
  publicService,
  publicServiceBeforeAfter,
  publicServices,
  publicSlotsForDay,
} from './lib/reads'
