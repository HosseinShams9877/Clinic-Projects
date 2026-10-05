/**
 * The catalogue's writes — create, update, activate, deactivate, and the doctors a
 * service is bookable by.
 *
 * ## Why there is no `deleteService` here (DoD 3)
 *
 * `03-data-model.md` §2.3's comment on `isActive` is immutable rule 10:
 *
 * > `isActive` is the deactivation that replaces deletion — an inactive service leaves
 * > the public list and the booking picker and stays for the history of every
 * > appointment that used it.
 *
 * The delete path does not exist. There is no function, no server action, no button,
 * and no catalog sentence for it; `02-architecture.md` §10 rule 2 says a file that is
 * not in the barrel is private, and the function that would be private here is not
 * written. A caller that wanted to delete would have to reach past the barrel and
 * write the row out itself, and the write would leave orphaned appointments pointing
 * at a service the catalogue no longer names.
 *
 * ## What deactivation is, and what it is not
 *
 * Deactivation flips `isActive` and nothing else (DoD 4). The name, the price, the
 * duration, the doctors and the site copy are untouched, so:
 *
 * - every past appointment's `serviceName` and `priceAtBooking` still read, because
 *   those columns are snapshots and were never a join;
 * - the service is gone from the booking picker (`lib/queries.loadBookableService`
 *   refuses it, and `_appointments`' option loader filters on `isActive`);
 * - the row is still on the catalogue page, sorted under «غیرفعال», because a clinic
 *   that re-offers a service should not have to re-enter its copy.
 *
 * @ plays no part in this file's writes — `10` §2.3's decision 1 makes the service
 * name the catalogue's identity (`service_tenant_name_key`), so a rename is a write
 * the unique index arbitrates.
 */

import { isMember, Role, ServiceCategory } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { normalizeForSearch } from '@/core/localization'
import { DomainError, NotFoundError, ValidationError, type AppErrorOptions } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { ServicesMessageKey } from '../catalog'

/** The columns the catalogue page renders. */
const SERVICE_SELECT = {
  id: true,
  name: true,
  category: true,
  price: true,
  depositAmount: true,
  durationMinutes: true,
  defaultSessions: true,
  defaultIntervalDays: true,
  isActive: true,
  showPriceOnSite: true,
} as const

/** One service row, as the catalogue page renders it. */
export interface ServiceRow {
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

/** The doctors a service is bookable by, as the catalogue's own column renders them. */
export interface ServiceDoctors {
  /** The `User` ids — the catalogue's checkboxes write these, and the column stores them. */
  readonly doctorIds: readonly string[]
  /** The names, for the column that renders them without a second read. */
  readonly doctorNames: readonly string[]
}

/** One service row plus its doctors, as the catalogue's edit form reads it. */
export interface ServiceDetail extends ServiceRow {
  readonly doctors: ServiceDoctors
}

/**
 * «افزودن خدمت» — the catalogue's one create.
 *
 * The name is the identity (`service_tenant_name_key`), so a duplicate name is a
 * `service.nameTaken` refusal and not a second row. The category is one of the four
 * the constants close; anything else is dropped, because a category the catalogue's
 * own filter chips do not name is a bucket the page cannot render.
 *
 * @throws PermissionError — the caller holds no `manage_services`.
 * @throws ValidationError — the name is empty, or the price is negative.
 * @throws DomainError, as `service.nameTaken` — the name is taken in this tenant.
 */
export async function createService(args: {
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
}): Promise<ServiceRow> {
  requireServices(args.ctx)

  const name = args.name.trim()
  if (name === '') {
    throw serviceValidationError(
      `A service name must not be blank.`,
      'service.nameRequired',
      {},
    )
  }

  const created = await createWithUniqueGuard(args.tx, args.ctx.tenantId, () =>
    args.tx.service.create({
      data: {
        tenantId: args.ctx.tenantId,
        name,
        searchName: normalizeForSearch(name),
        category: categoryOrDefault(args.category),
        price: args.price,
        depositAmount: args.depositAmount ?? 0n,
        durationMinutes: args.durationMinutes,
        defaultSessions: args.defaultSessions ?? 1,
        defaultIntervalDays: args.defaultIntervalDays ?? 0,
        showPriceOnSite: args.showPriceOnSite ?? false,
      },
      select: SERVICE_SELECT,
    }),
  )

  return asServiceRow(created)
}

/**
 * «ویرایش خدمت» — the catalogue's one update.
 *
 * Writes only the fields the caller passed, so a form that edits the price does not
 * have to re-submit the copy. A rename rewrites `searchName`, because the column is
 * the search and not a display field.
 *
 * @throws PermissionError — the caller holds no `manage_services`.
 * @throws NotFoundError — the service is outside the caller's tenant (`09-security.md`
 *   §6.3's 404-not-403 rule).
 * @throws ValidationError — the name is empty.
 * @throws DomainError, as `service.nameTaken` — the new name is taken in this tenant.
 */
export async function updateService(args: {
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
}): Promise<ServiceRow> {
  requireServices(args.ctx)

  const service = await loadService(args.tx, args.ctx, args.serviceId)
  const name = args.name === undefined ? service.name : args.name.trim()
  if (name === '') {
    throw serviceValidationError(`A service name must not be blank.`, 'service.nameRequired', {})
  }

  const updated = await createWithUniqueGuard(args.tx, args.ctx.tenantId, () =>
    args.tx.service.update({
      where: { id: service.id },
      data: {
        name,
        searchName: normalizeForSearch(name),
        category: args.category === undefined ? undefined : categoryOrDefault(args.category),
        price: args.price,
        depositAmount: args.depositAmount,
        durationMinutes: args.durationMinutes,
        defaultSessions: args.defaultSessions,
        defaultIntervalDays: args.defaultIntervalDays,
        showPriceOnSite: args.showPriceOnSite,
      },
      select: SERVICE_SELECT,
    }),
  )

  return asServiceRow(updated)
}

/**
 * «غیرفعال کردن» — the deactivation that replaces deletion (DoD 3, DoD 4).
 *
 * Flips `isActive` to `false` and writes nothing else. The service leaves the booking
 * picker (`lib/queries.loadBookableService` refuses it on the write path) and stays
 * for the history of every appointment that used it.
 *
 * @throws PermissionError — the caller holds no `manage_services`.
 * @throws NotFoundError — the service is outside the caller's tenant.
 */
export async function deactivateService(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly serviceId: string
}): Promise<ServiceRow> {
  requireServices(args.ctx)

  const service = await loadService(args.tx, args.ctx, args.serviceId)
  const updated = await args.tx.service.update({
    where: { id: service.id },
    data: { isActive: false },
    select: SERVICE_SELECT,
  })

  return asServiceRow(updated)
}

/**
 * «فعال کردن» — the deactivation's reverse, and the only way a service returns.
 *
 * A reactivation is ordinary at a clinic: a seasonal service goes away and comes back,
 * and the copy, the price and the doctors are where they were.
 *
 * @throws PermissionError — the caller holds no `manage_services`.
 * @throws NotFoundError — the service is outside the caller's tenant.
 */
export async function activateService(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly serviceId: string
}): Promise<ServiceRow> {
  requireServices(args.ctx)

  const service = await loadService(args.tx, args.ctx, args.serviceId)
  const updated = await args.tx.service.update({
    where: { id: service.id },
    data: { isActive: true },
    select: SERVICE_SELECT,
  })

  return asServiceRow(updated)
}

/**
 * «پزشکان مجاز» — the doctors a service is bookable by.
 *
 * `ServiceDoctor` is the join table §2.3 introduces in place of an array, and it
 * decides which doctors a customer sees on the public site. The write is a full
 * replacement and not a delta, because the form is a checkbox group and the caller
 * already holds the whole set; a delta would force the page to track what was checked
 * before it loaded.
 *
 * Every id must be a DOCTOR membership in this tenant. A non-doctor or another
 * tenant's id is dropped rather than written, because a service bookable by a
 * secretary is a booking page the doctor's calendar cannot show.
 *
 * @throws PermissionError — the caller holds no `manage_services`.
 * @throws NotFoundError — the service is outside the caller's tenant.
 */
export async function assignServiceDoctors(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly serviceId: string
  readonly doctorIds: readonly string[]
}): Promise<ServiceDoctors> {
  requireServices(args.ctx)

  const service = await loadService(args.tx, args.ctx, args.serviceId)

  // The memberships are looked up by the *person*, because the column's own `doctorId`
  // is the user id the surface reads back (`03-data-model.md` §2.3) and the form writes
  // the same value it was handed. The `where` is the gate: a non-doctor, an inactive
  // membership or another tenant's person is dropped rather than written, because a
  // service bookable by a secretary is a booking page the doctor's calendar cannot show.
  const doctors = await args.tx.membership.findMany({
    where: {
      tenantId: args.ctx.tenantId,
      role: Role.Doctor,
      isActive: true,
      userId: { in: [...args.doctorIds] },
    },
    select: {
      userId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  })

  const keep = new Set(doctors.map((row) => row.userId))

  // The rows that are going are deleted first, so a re-add in the same transaction is
  // not a write the composite id refuses.
  await args.tx.serviceDoctor.deleteMany({
    where: { serviceId: service.id, doctorId: { notIn: [...keep] } },
  })
  if (keep.size > 0) {
    await args.tx.serviceDoctor.createMany({
      data: [...keep].map((doctorId) => ({
        tenantId: args.ctx.tenantId,
        serviceId: service.id,
        doctorId,
      })),
    })
  }

  return {
    doctorIds: doctors.map((row) => row.userId),
    doctorNames: doctors.map((row) =>
      [row.user.firstName, row.user.lastName].filter(Boolean).join(' '),
    ),
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

/** The shape Prisma hands back from `SERVICE_SELECT`, named once so the mapper reads. */
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

/**
 * The four categories the constants close, or the catalogue's default.
 *
 * An unknown value is dropped rather than stored, because `SERVICE_CATEGORY_LABELS`
 * has four keys and a fifth value would be a chip the page cannot render.
 */
function categoryOrDefault(category: string | undefined): string {
  if (category === undefined) return ServiceCategory.Skin
  return isMember(ServiceCategory, category) ? category : ServiceCategory.Skin
}

/**
 * Loads one service as the caller's tenant sees it.
 *
 * @throws NotFoundError — the row is outside the caller's tenant, which is
 *   `09-security.md` §6.3's 404-not-403 rule.
 */
async function loadService(
  tx: TransactionClient,
  ctx: TenantContext,
  serviceId: string,
): Promise<{ readonly id: string; readonly name: string }> {
  const row = await tx.service.findFirst({
    where: { id: serviceId, tenantId: ctx.tenantId },
    select: { id: true, name: true },
  })
  if (row === null) {
    throw new NotFoundError(`Service ${serviceId} was not found in this tenant.`, {
      messageKey: 'service.notFound' satisfies ServicesMessageKey,
      detail: { serviceId },
    })
  }
  return row
}

/**
 * Runs a create-or-update, answering a duplicate name with the catalogue's own sentence.
 *
 * `lib/book.ts` established the shape: the unique index is the last guard, and the
 * error it raises is the one the caller renders. A helper rather than a `.catch`
 * chain because the two call sites both need the same `P2002` reading and the same
 * sentence, and a chain on the promise loses the write's own type to `never`.
 */
async function createWithUniqueGuard<T>(
  tx: TransactionClient,
  tenantId: string,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write()
  } catch (cause) {
    if (isUniqueViolation(cause)) {
      throw new DomainError(`A service by this name already exists in tenant ${tenantId}.`, {
        messageKey: 'service.nameTaken' satisfies ServicesMessageKey,
        cause: cause as Error,
      })
    }
    throw cause as Error
  }
}

/** Prisma's code for a unique-index violation — spelled once, as `lib/book.ts` does. */
function isUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause as { code: unknown }).code === 'P2002'
  )
}

/** A `ValidationError` carrying a catalog key, built once for the two raises. */
function serviceValidationError(
  message: string,
  key: ServicesMessageKey,
  params: AppErrorOptions['messageParams'],
): never {
  throw new ValidationError(message, { messageKey: key, messageParams: params })
}
