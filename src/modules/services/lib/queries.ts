/**
 * The catalogue's reads — the list the page renders, the detail the edit form reads,
 * and the bookable guard that makes deactivation bite on the booking path.
 *
 * ## Why `loadBookableService` is the DoD 4 function
 *
 * Deactivating a service removes it from booking. The `_appointments` module's option
 * loader already filters `isActive: true` for the picker, so a deactivated service
 * does not appear — but a picker is a hint, not a gate, and a stale form or a crafted
 * request still posts its id. The gate has to be on the write path, in the module
 * that owns the row, which is why `createOrFindService` answers the service the
 * booking is made against and refuses the inactive one with `service.notBookable`.
 *
 * What the gate does **not** do is touch any appointment that already exists. Each
 * appointment snapshotted `serviceName` and `priceAtBooking` at booking
 * (`03-data-model.md` §2.2), so a deactivated service leaves every past row's price
 * and name intact — the second half of DoD 4, held by the schema and not by this
 * file.
 *
 * ## Why the reads take no permission argument
 *
 * A catalogue is read by the booking picker (which holds `manage_appointments`) and by
 * the public site (which holds nothing), and a clinic's services are not a secret. The
 * tenant scoping is still enforced — every `where` carries `tenantId` — because a
 * clinic's catalogue is still nobody else's.
 */

import type { TenantContext, TenantPrincipal } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { DomainError, NotFoundError } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { ServicesMessageKey } from '../catalog'
import type { ServiceRow } from './manage'

/** The most a page reads in one go; a catalogue is scrolled, not paged. */
const LIST_LIMIT = 200

/**
 * The catalogue — the tenant's services, inactive ones last.
 *
 * Inactive services are included because the page is the catalogue's own editor and a
 * clinic that re-offers a service should not have to re-enter it; the booking picker
 * is the surface that excludes them, and it excludes them through
 * `loadBookableService`.
 */
export async function listServices(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  /** Filter to the four categories' one, or all four when absent. */
  readonly category?: string
  /** Whether to read the inactive ones too; the catalogue page reads both. */
  readonly includeInactive?: boolean
}): Promise<readonly ServiceRow[]> {
  requireServices(args.ctx)

  const rows = await args.tx.service.findMany({
    where: {
      tenantId: args.ctx.tenantId,
      ...(args.includeInactive === false ? { isActive: true } : {}),
      ...(args.category === undefined ? {} : { category: args.category }),
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    take: LIST_LIMIT,
  })

  return rows.map(asServiceRow)
}

/**
 * One service, as the edit form reads it — the row plus its doctors.
 *
 * @throws PermissionError — the caller holds no `manage_services`.
 * @throws NotFoundError — the service is outside the caller's tenant.
 */
export async function serviceDetail(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly serviceId: string
}): Promise<ServiceDetail> {
  requireServices(args.ctx)

  const row = await args.tx.service.findFirst({
    where: { id: args.serviceId, tenantId: args.ctx.tenantId },
  })
  if (row === null) {
    throw new NotFoundError(`Service ${args.serviceId} was not found in this tenant.`, {
      messageKey: 'service.notFound' satisfies ServicesMessageKey,
      detail: { serviceId: args.serviceId },
    })
  }

  const doctors = await args.tx.serviceDoctor.findMany({
    where: { serviceId: row.id },
    select: {
      doctorId: true,
      doctor: { select: { firstName: true, lastName: true } },
    },
    orderBy: { doctor: { firstName: 'asc' } },
  })

  return {
    ...asServiceRow(row),
    doctors: {
      doctorIds: doctors.map((row) => row.doctorId),
      doctorNames: doctors.map((row) =>
        [row.doctor.firstName, row.doctor.lastName].filter(Boolean).join(' '),
      ),
    },
  }
}

/**
 * The services the booking picker offers — active ones only (DoD 4's read half).
 *
 * Takes no permission, because the picker is rendered by the booking path and the
 * clinic's services are not a secret. `manage_services` is not required and is not
 * checked here so the doctor's own quick-book can read the same list.
 */
export async function bookableServices(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}): Promise<readonly ServiceRow[]> {
  const rows = await args.tx.service.findMany({
    where: { tenantId: args.ctx.tenantId, isActive: true },
    orderBy: { name: 'asc' },
  })

  return rows.map(asServiceRow)
}

/**
 * The service a booking is made against — the gate that makes deactivation bite (DoD 4).
 *
 * Reads the row and refuses it when `isActive` is `false`, so the write path can never
 * book a service the clinic no longer offers no matter what the posted form said. The
 * refusal is a `DomainError` and not a `ValidationError`, because the caller did not
 * type anything wrong — the catalogue changed underneath them.
 *
 * Takes no permission for the same reason `bookableServices` does not: the booking
 * path holds `manage_appointments`, the doctor's quick-book holds three permissions
 * and none of them is `manage_services`, and requiring it here would break the
 * shortcut.
 *
 * @throws NotFoundError — the service is outside the caller's tenant.
 * @throws DomainError, as `service.notBookable` — the service is inactive.
 */
export async function loadBookableService(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantPrincipal
  readonly serviceId: string
}): Promise<ServiceRow> {
  const row = await args.tx.service.findFirst({
    where: { id: args.serviceId, tenantId: args.ctx.tenantId },
  })
  if (row === null) {
    throw new NotFoundError(`Service ${args.serviceId} was not found in this tenant.`, {
      messageKey: 'service.notFound' satisfies ServicesMessageKey,
      detail: { serviceId: args.serviceId },
    })
  }
  if (!row.isActive) {
    throw new DomainError(
      `Service ${args.serviceId} is inactive and cannot be booked.`,
      {
        messageKey: 'service.notBookable' satisfies ServicesMessageKey,
        detail: { serviceId: args.serviceId, name: row.name },
      },
    )
  }

  return asServiceRow(row)
}

/**
 * The doctors a service is bookable by, as the booking picker needs them.
 *
 * The picker offers the service's own doctors and not the tenant's, so a customer who
 * picks a service the clinic offers only on one floor is not offered a doctor who
 * never performs it. Takes no permission for the same reason the two above do not.
 */
export async function serviceDoctors(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantPrincipal
  readonly serviceId: string
}): Promise<readonly ServiceDoctorRow[]> {
  const rows = await args.tx.serviceDoctor.findMany({
    where: { serviceId: args.serviceId, tenantId: args.ctx.tenantId },
    select: {
      doctorId: true,
      doctor: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { doctor: { firstName: 'asc' } },
  })

  return rows.map((row) => ({
    doctorId: row.doctor.id,
    name: [row.doctor.firstName, row.doctor.lastName].filter(Boolean).join(' '),
  }))
}

/**
 * One doctor a service is bookable by.
 *
 * `doctorId` is the **`User` id**, because `service_doctors.doctorId` is a `User`
 * relation (`03-data-model.md` §2.3) and every other `doctorId` in the schema — the
 * appointment's, the working hours', the leave request's — is the same one. The
 * catalogue's checkbox writes it straight back, so the column and the form are one
 * value with no translation between them.
 */
export interface ServiceDoctorRow {
  /** The `User` id — the catalogue's checkbox writes this, and the column stores it. */
  readonly doctorId: string
  readonly name: string
}

/** The detail shape the edit form reads: the row plus its doctors. */
export interface ServiceDetail extends ServiceRow {
  readonly doctors: {
    readonly doctorIds: readonly string[]
    readonly doctorNames: readonly string[]
  }
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/** `manage_services` — the permission the matrix gives a manager for this surface. */
function requireServices(ctx: TenantContext): void {
  requirePermission(ctx, 'manage_services')
}

/** One row as the catalogue page's own shape. */
function asServiceRow(row: ServiceSelectRow): ServiceRow {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    depositAmount: row.depositAmount,
    durationMinutes: row.durationMinutes,
    defaultSessions: row.defaultSessions,
    defaultIntervalDays: row.defaultIntervalDays,
    isActive: row.isActive,
    showPriceOnSite: row.showPriceOnSite,
  }
}

/** The shape Prisma hands back from a full `service` read. */
type ServiceSelectRow = {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly price: bigint
  readonly depositAmount: bigint
  readonly durationMinutes: number
  readonly defaultSessions: number
  readonly defaultIntervalDays: number
  readonly isActive: boolean
  readonly showPriceOnSite: boolean
}
