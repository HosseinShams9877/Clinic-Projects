/**
 * The `customers` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its
 * barrel and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — `@/modules/*​/*`
 * is a banned specifier — so a file that is not listed below does not exist as far as
 * the rest of the repository is concerned.
 *
 * ## What is public
 *
 * The person, the key that makes them one, the lead cartable, and the file. The three
 * pages this module serves — `reception/customers`, `reception/leads` and
 * `admin/customer/[id]` — are three scopes over one set of rows, which is why the
 * scope is a `where` clause inside the queries and not three sets of functions here.
 *
 * ## What is deliberately not
 *
 * `createOrFindCustomer` carries no permission check. Its two callers hold two
 * different permissions (`manage_appointments` and `manage_leads`), and a doctor's
 * quick-book reaches it through the booking path with neither; the permission is the
 * caller's business and the invariant is the key. See `lib/dedupe.ts`'s header.
 *
 * Nothing that deletes a person. A converted lead is a state change, and a lost lead
 * stays, because both are facts the acquisition report counts (`03-data-model.md`
 * §2.1) — deleting either would make the clinic's own marketing spend unreadable.
 */

export type {
  ConsentFlags,
  ConsentRow,
  CustomerListRow,
  CustomerProfile,
  CustomersMessageKey,
  AppointmentHistoryRow,
  DedupedCustomer,
  LeadCounts,
  LeadRow,
  PaymentHistoryRow,
} from './types'
export type { CustomersModule } from './types'

export {
  ACQUISITION_SOURCE_LABELS,
  CUSTOMER_LIFECYCLE_LABELS,
  CUSTOMER_PANEL,
  LEAD_STATUS_LABELS,
  MESSAGES,
} from './catalog'

export { createOrFindCustomer } from './lib/dedupe'

export {
  createLead,
  createPublicLead,
  leadCounts,
  listLeads,
  markLeadLost,
  recordFollowUp,
} from './lib/leads'

export {
  customerProfile,
  ownPatients,
  searchCustomers,
} from './lib/queries'

export {
  recordConsent,
  updateCustomerNote,
  updateCustomerProfile,
} from './lib/profile'

export {
  ownCareInstructions,
  readOwnProfile,
  recordOwnConsent,
  updateOwnProfile,
} from './lib/own-panel'
export type { OwnCareInstruction, OwnProfile } from './lib/own-panel'
