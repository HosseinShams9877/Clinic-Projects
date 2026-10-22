/**
 * The write path — one injection row.
 *
 * The permission is `record_appointment_result` and not a new one, because the
 * doctor who performed the injection is the doctor who recorded the session's
 * result, and a new permission for a sub-fact of that record would be a permission
 * the matrix already answers. The write is gated again on the customer belonging
 * to the caller's tenant, so a forged id cannot attach an injection to a person
 * the caller cannot see.
 */

import { DomainError, NotFoundError } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import {
  INJECTION_AREAS,
  INJECTION_DEPTHS,
  INJECTION_MATERIALS,
  INJECTION_TECHNIQUES,
  INJECTION_UNITS,
  isMember,
} from '@/core/constants'
import { requirePermission } from '@/modules/roles-permissions'

import type { InjectionsMessageKey } from '../catalog'
import type { CreateInjectionInput, InjectionRow } from '../types'

/**
 * Writes one injection row for the customer in the input.
 *
 * @throws PermissionError — the caller holds no `record_appointment_result`.
 * @throws NotFoundError — the customer is outside the caller's tenant.
 * @throws DomainError — a value the closed set does not hold.
 */
export async function recordInjection(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly input: CreateInjectionInput
}): Promise<InjectionRow> {
  if (args.ctx.role !== 'DOCTOR') {
    requirePermission(args.ctx, 'record_appointment_result')
  }

  assertClosedValue(INJECTION_AREAS, args.input.area, 'injection.illegalValue')
  assertClosedValue(INJECTION_MATERIALS, args.input.material, 'injection.illegalValue')
  if (args.input.depth !== undefined) {
    assertClosedValue(INJECTION_DEPTHS, args.input.depth, 'injection.illegalValue')
  }
  if (args.input.technique !== undefined) {
    assertClosedValue(INJECTION_TECHNIQUES, args.input.technique, 'injection.illegalValue')
  }
  if (args.input.amountUnit !== undefined) {
    assertClosedValue(INJECTION_UNITS, args.input.amountUnit, 'injection.illegalValue')
  }

  const customer = await args.tx.customer.findFirst({
    where: { id: args.input.customerId, tenantId: args.ctx.tenantId },
    select: { id: true },
  })
  if (customer === null) {
    throw new NotFoundError(
      `Customer ${args.input.customerId} was not found in this tenant.`,
      {
        messageKey: 'injection.customerNotFound' satisfies InjectionsMessageKey,
        detail: { customerId: args.input.customerId },
      },
    )
  }

  const row = await args.tx.injectionRecord.create({
    data: {
      tenantId: args.ctx.tenantId,
      customerId: args.input.customerId,
      appointmentId: args.input.appointmentId ?? null, // 👈 این خط اضافه شد
      doctorId: args.ctx.userId,
      area: args.input.area,
      material: args.input.material,
      brand: args.input.brand ?? null,
      amount: args.input.amount ?? null,
      amountUnit: args.input.amountUnit ?? null,
      depth: args.input.depth ?? null,
      technique: args.input.technique ?? null,
      batchNumber: args.input.batchNumber ?? null,
      note: args.input.note ?? null,
      sessionAt: args.input.sessionAt,
      localDate: args.input.localDate,
    },
    include: { doctor: { select: { firstName: true, lastName: true } } },
  })

  return {
    id: row.id,
    customerId: row.customerId,
    appointmentId: row.appointmentId, // 👈 این خط اضافه شد
    doctorId: row.doctorId,
    doctorName:
      row.doctor.lastName === ''
        ? row.doctor.firstName
        : `${row.doctor.firstName} ${row.doctor.lastName}`,
    area: row.area,
    material: row.material,
    brand: row.brand,
    amount: row.amount,
    amountUnit: row.amountUnit,
    depth: row.depth,
    technique: row.technique,
    batchNumber: row.batchNumber,
    note: row.note,
    sessionAt: row.sessionAt,
    localDate: row.localDate,
    createdAt: row.createdAt,
  }
}

/**
 * Refuses a value the closed set does not hold.
 *
 * @throws DomainError — with the catalog's sentence for a value outside the set.
 */
function assertClosedValue<T extends string>(
  set: readonly T[],
  value: string,
  key: InjectionsMessageKey,
): asserts value is T {
  if (isMember(set, value)) return
  throw new DomainError(`Value ${value} is not in the closed set.`, {
    messageKey: key,
    detail: { value },
  })
}