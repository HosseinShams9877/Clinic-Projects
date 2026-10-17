/**
 * The `customers` module's complete public surface.
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
export type { CustomerNoteRow } from './lib/profile' // <-- اضافه شد
export type { OwnCareInstruction, OwnProfile } from './lib/own-panel'

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
  getCustomerNotes, // <-- اضافه شد
} from './lib/profile'

export {
  ownCareInstructions,
  readOwnProfile,
  recordOwnConsent,
  updateOwnProfile,
  getOwnNotes, // <-- اضافه شد
} from './lib/own-panel'