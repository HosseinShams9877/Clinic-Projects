/**
 * The `services` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its
 * barrel and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — `@/modules/*​/*`
 * is a banned specifier — so a file that is not listed below does not exist as far as
 * the rest of the repository is concerned.
 *
 * ## What is deliberately not here
 *
 * A delete. There is no `deleteService`, no `removeService`, and no function with a
 * name like one — the path does not exist (DoD 3, immutable rule 10). An inactive
 * service leaves the public list and the booking picker and stays for the history of
 * every appointment that used it; `loadBookableService` is the gate that makes the
 * absence bite, and `service_tenant_active_idx` is the index that keeps the two reads
 * cheap.
 *
 * The Prisma client is not re-exported. Functions take a `TransactionClient` because
 * the caller opened the scope; the models are the storage, not the surface.
 */

export type {
  ServiceDetail,
  ServiceDoctorRow,
  ServiceRow,
  ServicesMessageKey,
} from './types'
export type { ServicesModule } from './types'

export {
  SERVICE_CATEGORY_LABELS,
  SERVICE_STATUS_LABELS,
  MESSAGES,
} from './catalog'

export {
  activateService,
  assignServiceDoctors,
  createService,
  deactivateService,
  updateService,
} from './lib/manage'

export {
  bookableServices,
  listServices,
  loadBookableService,
  serviceDetail,
  serviceDoctors,
} from './lib/queries'
