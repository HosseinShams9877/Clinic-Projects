/**
 * The receipt writer — `payments` is the only module that writes a financial fact.
 *
 * `03-data-model.md` §2.5's invariants are the rules this file keeps, and each one is
 * a check the row is not written without:
 *
 * - **Every payment attaches to one appointment, never to the customer.** The
 *   appointment is looked up in the caller's tenant, and a row that is not there is
 *   `payment.notFound` — the 404-not-403 rule, so another clinic's appointment is
 *   absent rather than disclosed.
 * - **A discount records who applied it** (immutable rule 7). The row carries
 *   `discountByUserId`, and a discount that passes the guard also writes an audit row
 *   naming the person.
 * - **There is no delete path.** A correction is a new `REFUND` row, and neither this
 *   file nor any other offers a deletion.
 *
 * The cache is recomputed inside the same transaction as the row, which is §4.3's
 * "updated in the same transaction as the fact".
 */

import { DomainError, NotFoundError } from '@/core/types'
import { Permission, PaymentKind, PaymentMethod, DepositRefundPolicy } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { requirePermission } from '@/modules/roles-permissions'
import { AuditAction, AuditEntity, recordAudit } from '@/modules/staff'

import type { PaymentRow, RecordPaymentInput } from '../types'
import { assertDiscountAllowed } from './discount'
import { recomputeCustomerTotals } from './cache'
import { readPaymentSettings } from './settings'

/** The columns the writer reads off the appointment, and nothing more. */
const APPOINTMENT_SELECT = {
  id: true,
  customerId: true,
  depositAmount: true,
} as const

/** The columns the writer stores, in the shape the type declares. */
const PAYMENT_SELECT = {
  id: true,
  appointmentId: true,
  amount: true,
  discountAmount: true,
  discountReason: true,
  discountByUserId: true,
  method: true,
  kind: true,
  note: true,
  paidAt: true,
} as const

/** The row back as the module's own type — the two closed sets are strings in storage. */
function asPaymentRow(row: PaymentSelectRow): PaymentRow {
  return { ...row, method: row.method as PaymentMethod, kind: row.kind as PaymentKind }
}

/** The shape Prisma hands back from the writer's own select. */
type PaymentSelectRow = {
  readonly id: string
  readonly appointmentId: string
  readonly amount: bigint
  readonly discountAmount: bigint
  readonly discountReason: string | null
  readonly discountByUserId: string | null
  readonly method: string
  readonly kind: string
  readonly note: string | null
  readonly paidAt: Date
}

/**
 * «ثبت پرداخت» — the one writer of a receipt.
 *
 * @throws PermissionError — no `record_payment`.
 * @throws NotFoundError — the appointment is not in this tenant.
 * @throws DomainError — a non-positive amount, or a discount the tenant refuses.
 */
export async function recordPayment(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly input: RecordPaymentInput
  readonly now: Date
}): Promise<PaymentRow> {
  requirePermission(args.ctx, Permission.RecordPayment)

  if (args.input.amount <= 0n) {
    throw new DomainError('A payment amount must be positive', {
      messageKey: 'payment.amountNotPositive',
    })
  }

  const appointment = await args.tx.appointment.findUnique({
    where: { tenantId: args.ctx.tenantId, id: args.input.appointmentId },
    select: APPOINTMENT_SELECT,
  })
  if (appointment === null) {
    throw new NotFoundError('The appointment is not in this tenant', {
      messageKey: 'payment.notFound',
    })
  }

  const settings = await readPaymentSettings(args.tx, args.ctx.tenantId)
  if (args.input.discountAmount > 0n) {
    // A discount the tenant does not allow is refused before the row exists, and a
    // discount without a reason is a fact the clinic cannot analyse.
    assertDiscountAllowed({
      settings,
      role: args.ctx.role,
      amount: args.input.discountAmount,
    })
    if (args.input.discountReason === null || args.input.discountReason.trim() === '') {
      throw new DomainError('A discount requires a reason', {
        messageKey: 'payment.discountNeedsReason',
      })
    }
  }

  const created = await args.tx.payment.create({
    data: {
      tenantId: args.ctx.tenantId,
      appointmentId: appointment.id,
      customerId: appointment.customerId as string,
      recordedByUserId: args.ctx.userId,
      discountByUserId: args.input.discountAmount > 0n ? args.ctx.userId : null,
      amount: args.input.amount,
      discountAmount: args.input.discountAmount,
      discountReason: args.input.discountReason,
      method: args.input.method,
      kind: args.input.kind,
      note: args.input.note,
      paidAt: args.now,
    },
    select: PAYMENT_SELECT,
  })
  const row = asPaymentRow(created)

  if (args.input.discountAmount > 0n) {
    // Immutable rule 7 — the audit names the person who granted it, inside the
    // transaction so a receipt that rolls back leaves no audit row about it.
    await recordAudit({
      tx: args.tx,
      ctx: args.ctx,
      action: AuditAction.PaymentDiscountGranted,
      entity: AuditEntity.Payment,
      entityId: row.id,
      detail: {
        appointmentId: appointment.id,
        discountAmount: args.input.discountAmount.toString(),
        reason: args.input.discountReason,
      },
    })
  }

  await recomputeCustomerTotals({
    tx: args.tx,
    tenantId: args.ctx.tenantId,
    customerId: appointment.customerId as string,
  })

  return row
}

/**
 * «بازگشت بیعانه» — the refund a cancellation composes, and the ledger's only
 * reversal.
 *
 * The amount is the policy's share of the deposit actually received, computed here
 * and not by the caller: the policy is the clinic's own setting and the module is the
 * only writer of financial facts, so a caller that derived the amount would be a
 * second place the policy is read. `REFUND` rows store a negative `amount`, which is
 * what makes `Σ amount` the paid side of the balance in both directions.
 *
 * @throws PermissionError — no `record_payment`.
 * @throws NotFoundError — the appointment is not in this tenant.
 * @throws DomainError — no policy is set, the policy is `NONE`, or nothing was paid.
 */
export async function recordRefund(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly appointmentId: string
  readonly method: PaymentMethod
  readonly note: string | null
  readonly now: Date
}): Promise<PaymentRow> {
  requirePermission(args.ctx, Permission.RecordPayment)

  const appointment = await args.tx.appointment.findUnique({
    where: { tenantId: args.ctx.tenantId, id: args.appointmentId },
    select: APPOINTMENT_SELECT,
  })
  if (appointment === null) {
    throw new NotFoundError('The appointment is not in this tenant', {
      messageKey: 'payment.notFound',
    })
  }

  const settings = await readPaymentSettings(args.tx, args.ctx.tenantId)
  const received = await depositReceived(args.tx, args.ctx.tenantId, appointment.id)
  const amount = refundAmountFor(settings.depositRefundPolicy, received)

  if (amount <= 0n) {
    // A clinic with no policy may not refund, and a `NONE` policy is the same answer
    // stated as a decision; a zero deposit is simply nothing to hand back.
    throw new DomainError('Nothing on this appointment may be refunded', {
      messageKey: received > 0n ? 'payment.noRefundPolicy' : 'payment.nothingToRefund',
    })
  }

  const created = await args.tx.payment.create({
    data: {
      tenantId: args.ctx.tenantId,
      appointmentId: appointment.id,
      customerId: appointment.customerId as string,
      recordedByUserId: args.ctx.userId,
      discountByUserId: null,
      amount: -amount,
      discountAmount: 0n,
      discountReason: null,
      method: args.method,
      kind: PaymentKind.Refund,
      note: args.note,
      paidAt: args.now,
    },
    select: PAYMENT_SELECT,
  })
  const row = asPaymentRow(created)

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.PaymentRefunded,
    entity: AuditEntity.Payment,
    entityId: row.id,
    detail: { appointmentId: appointment.id, refunded: amount.toString() },
  })

  await recomputeCustomerTotals({
    tx: args.tx,
    tenantId: args.ctx.tenantId,
    customerId: appointment.customerId as string,
  })

  return row
}

/** The deposit the desk actually received, which is the amount a refund hands back. */
async function depositReceived(
  tx: TransactionClient,
  tenantId: string,
  appointmentId: string,
): Promise<bigint> {
  const received = await tx.payment.aggregate({
    where: { tenantId, appointmentId, kind: PaymentKind.Deposit },
    _sum: { amount: true },
  })
  return received._sum.amount ?? 0n
}

/**
 * §4.4's policy as an amount — full, half, or nothing.
 *
 * `HALF` divides by `10n` and multiplies by `5n` rather than dividing by `2n`, because
 * a Rial amount is a `BigInt` and `5n` is the whole remainder; `100000n / 2n` happens
 * to be exact, but `BigInt` division truncates and the multiply-first order is the one
 * that never loses a Rial.
 */
export function refundAmountFor(policy: DepositRefundPolicy | null, deposit: bigint): bigint {
  if (policy === DepositRefundPolicy.Full) return deposit
  if (policy === DepositRefundPolicy.Half) return (deposit / 10n) * 5n
  return 0n
}
