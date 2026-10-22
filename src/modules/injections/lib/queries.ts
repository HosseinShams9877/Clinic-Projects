/**
 * The reads the injection map renders.
 *
 * One customer's injections, in the order the profile's table shows them: newest
 * session first, and the rows of a session in the order they were written. The
 * table's own order is the second half — `createdAt` — because two injections on
 * one day are two facts and the order between them is the order the desk wrote
 * them.
 */

import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { can, requirePermission } from '@/modules/roles-permissions'

import type { InjectionCounts, InjectionRow } from '../types'

/**
 * The customer's injections, newest first.
 *
 * @throws PermissionError — the caller holds neither customer read permission.
 */
export async function customerInjections(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly customerId: string
}): Promise<readonly InjectionRow[]> {
  requireCustomerRead(args.ctx)

  const rows = await args.tx.injectionRecord.findMany({
    where: { tenantId: args.ctx.tenantId, customerId: args.customerId },
    orderBy: [{ sessionAt: 'desc' }, { createdAt: 'asc' }],
    include: { doctor: { select: { firstName: true, lastName: true } } },
  })

  return rows.map(asRow)
}

/**
 * The four counts the KPI band shows: how many rows, how many distinct sessions,
 * how many cubic centimetres, and how many units.
 *
 * The two totals are separate because a hyaluronic-acid filler and a botulinum
 * toxin are not the same quantity and adding them would be a number that means
 * nothing. A row with `amountUnit = 'CC'` adds to `totalCc`; a row with `UNIT`
 * adds to `totalUnits`; a row with neither adds to neither.
 *
 * The amount is a `String` on the row (the schema stores it as text, because
 * Prisma's `Decimal` is not portable across SQLite and PostgreSQL for a value that
 * is a clinical dosage and not money), so the parse here is `Number.parseFloat`.
 * The value it produces is a count for a KPI band, not the record — the exact
 * string is what the table's own cell renders.
 */
export async function injectionCounts(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly customerId: string
}): Promise<InjectionCounts> {
  const rows = await customerInjections(args)

  const sessions = new Set<string>()
  let totalCc = 0
  let totalUnits = 0

  for (const row of rows) {
    sessions.add(row.localDate)
    if (row.amount === null || row.amountUnit === null) continue
    const value = Number.parseFloat(row.amount)
    if (!Number.isFinite(value)) continue
    if (row.amountUnit === 'CC') totalCc += value
    if (row.amountUnit === 'UNIT') totalUnits += value
  }

  return { total: rows.length, sessions: sessions.size, totalCc, totalUnits }
}

/** The customer read permission pair, as the module's other reads hold it. */
function requireCustomerRead(ctx: TenantContext): void {
  if (can(ctx, 'view_all_customers')) return
  requirePermission(ctx, 'view_own_customer_records')
}

/** One row as the module's own shape, with the doctor's name joined. */
function asRow(raw: {
  readonly id: string
  readonly customerId: string
  readonly appointmentId: string | null
  readonly doctorId: string
  readonly doctor: { readonly firstName: string; readonly lastName: string }
  readonly area: string
  readonly material: string
  readonly brand: string | null
  readonly amount: string | null
  readonly amountUnit: string | null
  readonly depth: string | null
  readonly technique: string | null
  readonly batchNumber: string | null
  readonly note: string | null
  readonly sessionAt: Date
  readonly localDate: string
  readonly createdAt: Date
}): InjectionRow {
  return {
    id: raw.id,
    customerId: raw.customerId,
    appointmentId: raw.appointmentId,
    doctorId: raw.doctorId,
    doctorName:
      raw.doctor.lastName === ''
        ? raw.doctor.firstName
        : `${raw.doctor.firstName} ${raw.doctor.lastName}`,
    area: raw.area,
    material: raw.material,
    brand: raw.brand,
    amount: raw.amount,
    amountUnit: raw.amountUnit,
    depth: raw.depth,
    technique: raw.technique,
    batchNumber: raw.batchNumber,
    note: raw.note,
    sessionAt: raw.sessionAt,
    localDate: raw.localDate,
    createdAt: raw.createdAt,
  }
}