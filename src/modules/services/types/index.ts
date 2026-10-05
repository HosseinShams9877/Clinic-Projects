/**
 * The `services` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel for the reason §15.5
 * states — it has to be "explicit … so an override cannot accidentally satisfy it by
 * exporting something adjacent".
 *
 * ## What the contract deliberately omits
 *
 * **A delete.** There is no `deleteService` member, and the absence is the contract:
 * an override that added one would be adding a surface the default does not have, and
 * the module's own header (`lib/manage.ts`) documents why the path does not exist
 * (DoD 3, immutable rule 10).
 *
 * The Prisma client. Every function takes a `TransactionClient` because the caller
 * already opened the tenant scope (`02-architecture.md` §11), and the models are the
 * storage, not the surface.
 */

import type { ServiceCategory } from '@/core/constants'
import type { TenantContext, TransactionClient } from '@/core/db/scope'

import type { ServicesMessageKey } from '../catalog'
import type { ServiceDetail, ServiceRow } from '../lib/manage'
import type { ServiceDoctorRow } from '../lib/queries'

/** Re-exported so an override's barrel names the shapes from one place. */
export type {
  ServiceDetail,
  ServiceDoctorRow,
  ServiceRow,
  ServicesMessageKey,
}

/**
 * This module's public surface, as a contract an override must reproduce.
 *
 * Keeping this in step with the barrel is a review obligation the type checker only
 * half covers: an interface **wider** than the barrel fails to compile against the
 * fixture, an interface narrower than the barrel does not. See the note in
 * `roles-permissions/types/index.ts` for the same asymmetry.
 */
export interface ServicesModule {
  /* ── The catalogue's writes */
  /**
   * «افزودن خدمت».
   * @throws DomainError, as `service.nameTaken` — the name is taken in this tenant.
   */
  readonly createService: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly name: string
    readonly category?: string
    readonly price: bigint
    readonly depositAmount?: bigint
    readonly durationMinutes: number
    readonly defaultSessions?: number
    readonly defaultIntervalDays?: number
    readonly showPriceOnSite?: boolean
  }) => Promise<ServiceRow>

  /**
   * «ویرایش خدمت».
   * @throws NotFoundError — the service is outside the caller's tenant.
   * @throws DomainError, as `service.nameTaken` — the new name is taken.
   */
  readonly updateService: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly serviceId: string
    readonly name?: string
    readonly category?: string
    readonly price?: bigint
    readonly depositAmount?: bigint
    readonly durationMinutes?: number
    readonly defaultSessions?: number
    readonly defaultIntervalDays?: number
    readonly showPriceOnSite?: boolean
  }) => Promise<ServiceRow>

  /**
   * «غیرفعال کردن» — the deactivation that replaces deletion (DoD 3, DoD 4).
   * @throws NotFoundError — the service is outside the caller's tenant.
   */
  readonly deactivateService: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly serviceId: string
  }) => Promise<ServiceRow>

  /** «فعال کردن» — the deactivation's reverse. */
  readonly activateService: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly serviceId: string
  }) => Promise<ServiceRow>

  /** «پزشکان مجاز» — a full replacement; non-doctor ids are dropped. */
  readonly assignServiceDoctors: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly serviceId: string
    readonly doctorIds: readonly string[]
  }) => Promise<{ readonly doctorIds: readonly string[]; readonly doctorNames: readonly string[] }>

  /* ── The catalogue's reads */
  /** The tenant's services, inactive ones last. */
  readonly listServices: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly category?: string
    readonly includeInactive?: boolean
  }) => Promise<readonly ServiceRow[]>

  /** One service, as the edit form reads it — the row plus its doctors. */
  readonly serviceDetail: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly serviceId: string
  }) => Promise<ServiceDetail>

  /** The services the booking picker offers — active ones only (DoD 4's read half). */
  readonly bookableServices: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
  }) => Promise<readonly ServiceRow[]>

  /**
   * The gate that makes deactivation bite on the write path (DoD 4).
   * @throws NotFoundError — the service is outside the caller's tenant.
   * @throws DomainError, as `service.notBookable` — the service is inactive.
   */
  readonly loadBookableService: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly serviceId: string
  }) => Promise<ServiceRow>

  /** The doctors a service is bookable by, as the booking picker needs them. */
  readonly serviceDoctors: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly serviceId: string
  }) => Promise<readonly ServiceDoctorRow[]>

  /* ── The catalog */
  /** The Persian sentence for each key this module raises. */
  readonly MESSAGES: Readonly<Record<ServicesMessageKey, string>>

  /** The four categories, keyed by the stored value. */
  readonly SERVICE_CATEGORY_LABELS: Readonly<Record<ServiceCategory, string>>

  /** The two `isActive` values, keyed by the state the row holds. */
  readonly SERVICE_STATUS_LABELS: Readonly<Record<'ACTIVE' | 'INACTIVE', string>>
}

/**
 * The two states a service's `isActive` holds, for the catalogue's own badge.
 *
 * Not in `06-constants.md` §4 — `isActive` is a boolean and not a closed set — but the
 * badge needs two labels and the check needs the name, so the pair lives in the
 * module's catalog where the two are one fact.
 */
export type ServiceStatusKey = 'ACTIVE' | 'INACTIVE'
