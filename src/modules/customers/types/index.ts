/**
 * The `customers` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel for the reason §15.5
 * states — it has to be "explicit … so an override cannot accidentally satisfy it by
 * exporting something adjacent".
 *
 * ## What the contract covers
 *
 * The module's **values**. The types this module exports (`CustomerListRow`,
 * `CustomerProfile`, `DedupedCustomer`, `LeadRow`) travel with `types/` and are
 * re-exported by an override's own barrel; they are not members of a value interface.
 *
 * ## What the contract deliberately omits
 *
 * The Prisma client, and any notion of *which* row the person is. Every function takes
 * a `TransactionClient` because the caller already opened the tenant scope
 * (`02-architecture.md` §11), and the person's identity is `(tenantId, mobile)` — a
 * fact `lib/dedupe.ts` owns, and not one the contract re-states.
 */

import type {
  AcquisitionSource,
  CustomerLifecycle,
  LeadStatus,
} from '@/core/constants'
import type { TenantContext, TransactionClient } from '@/core/db/scope'

import type { CustomersMessageKey } from '../catalog'
import type {
  AppointmentHistoryRow,
  CustomerListRow,
  CustomerProfile,
  PaymentHistoryRow,
} from '../lib/queries'
import type { ConsentFlags, ConsentRow } from '../lib/profile'
import type { DedupedCustomer } from '../lib/dedupe'
import type { LeadCounts, LeadRow } from '../lib/leads'

/** Re-exported so an override's barrel names the shapes from one place. */
export type {
  AppointmentHistoryRow,
  ConsentFlags,
  ConsentRow,
  CustomerListRow,
  CustomerProfile,
  CustomersMessageKey,
  DedupedCustomer,
  LeadCounts,
  LeadRow,
  PaymentHistoryRow,
}

/** The four arguments `createOrFindCustomer` and `createLead` share. */
export interface PersonArgs {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly mobile: string
  readonly firstName: string
  readonly lastName?: string
}

/**
 * This module's public surface, as a contract an override must reproduce.
 *
 * Keeping this in step with the barrel is a review obligation the type checker only
 * half covers: an interface **wider** than the barrel fails to compile against the
 * fixture, an interface narrower than the barrel does not. See the note in
 * `roles-permissions/types/index.ts` for the same asymmetry.
 */
export interface CustomersModule {
  /* ── The person, and the key that makes them one (DoD 1) */
  /**
   * The person behind a mobile — an existing row, or a new one.
   * @throws ValidationError — the mobile is not a mobile.
   */
  readonly createOrFindCustomer: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly mobile: string
    readonly firstName: string
    readonly lastName?: string
    readonly acquisitionSource?: string
  }) => Promise<DedupedCustomer>

  /* ── The lead cartable */
  /** The open leads, ordered by the contact the desk owes them. */
  readonly listLeads: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
  }) => Promise<readonly LeadRow[]>

  /** The four numbers the cartable's KPI row shows. */
  readonly leadCounts: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
  }) => Promise<LeadCounts>

  /**
   * «ثبت لید دستی» — the desk writes down a person who called or walked in.
   * @throws ValidationError — the mobile is not a mobile.
   */
  readonly createLead: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly mobile: string
    readonly firstName: string
    readonly lastName?: string
    readonly acquisitionSource?: string
    readonly note?: string
  }) => Promise<LeadRow>

  /** «تماس» — the desk records that it followed a lead up. */
  readonly recordFollowUp: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly leadId: string
    readonly nextContactAt: Date
  }) => Promise<LeadRow>

  /** «از دست رفته» — the desk closes a lead it could not reach. */
  readonly markLeadLost: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly leadId: string
  }) => Promise<LeadRow>

  /* ── The file */
  /** The customer file, searched by name or mobile. */
  readonly searchCustomers: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly query?: string
  }) => Promise<readonly CustomerListRow[]>

  /** The doctor's own patients — `view_own_customer_records`. */
  readonly ownPatients: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly query?: string
  }) => Promise<readonly CustomerListRow[]>

  /**
   * One customer's profile, scoped by the caller's permission (DoD 8).
   * @throws NotFoundError — the customer is another doctor's patient and the caller
   *   cannot see the whole file.
   */
  readonly customerProfile: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly customerId: string
  }) => Promise<CustomerProfile>

  /** «تنظیمات ارسال» — the four channel-consent flags, and their evidence rows. */
  readonly recordConsent: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly customerId: string
    readonly flags: ConsentFlags
    readonly source?: string
    readonly now: Date
  }) => Promise<ConsentRow>

  /** «یادداشت پزشک» — the clinical note the profile holds. */
  readonly updateCustomerNote: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly customerId: string
    readonly note: string | null
  }) => Promise<void>

  /** «ویرایش پرونده» — the facts the desk edits; the mobile is not an input. */
  readonly updateCustomerProfile: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly customerId: string
    readonly firstName?: string
    readonly lastName?: string | null
    readonly birthDate?: string | null
    readonly residenceArea?: string | null
    readonly medicalHistory?: string | null
    readonly sensitivities?: string | null
  }) => Promise<void>

  /* ── The catalog */
  /** The Persian sentence for each key this module raises. */
  readonly MESSAGES: Readonly<Record<CustomersMessageKey, string>>

  /** The two lifecycle values, as the cartable and the profile name them. */
  readonly CUSTOMER_LIFECYCLE_LABELS: Readonly<Record<CustomerLifecycle, string>>

  /** The lead cartable's four states, as its chips name them. */
  readonly LEAD_STATUS_LABELS: Readonly<Record<LeadStatus, string>>

  /** The five acquisition sources, as the lead form and the report name them. */
  readonly ACQUISITION_SOURCE_LABELS: Readonly<Record<AcquisitionSource, string>>
}
