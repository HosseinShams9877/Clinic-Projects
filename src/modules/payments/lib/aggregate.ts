/**
 * Tenant-wide payment aggregates for the desk's KPI tiles.
 *
 * Additive to the module: the existing per-customer reads answer "what does this person
 * owe"; this answers "what did the clinic take in", which the reception «مانده حساب»
 * page's «وصول‌شده این ماه» tile needs. The caller opens the tenant scope (the module's
 * usual contract — functions take a `TransactionClient` and filter by `tenantId`), so
 * this adds no new scope mechanism.
 */

import type { TransactionClient } from '@/core/db/scope'
import {
  asLocalTime,
  fromJalaliParts,
  fromUtcInstant,
  jalaliParts,
  toUtcInstant,
} from '@/core/localization'

/**
 * The sum of every payment received in the current clinic-local (Jalali) month, in rial.
 *
 * The month boundary is the first day of the Jalali month `now` falls in, converted to
 * the clinic's own instant through the tenant offset — the same conversion every stored
 * instant passes. Returns `0n` when nothing was taken in, never a fabricated figure.
 */
export async function paymentsThisMonth(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
  utcOffsetMinutes: number,
): Promise<bigint> {
  const today = fromUtcInstant(now, utcOffsetMinutes).localDate
  const parts = jalaliParts(today)
  const monthStart = fromJalaliParts({ year: parts.year, month: parts.month, day: 1 })
  const startInstant = toUtcInstant(monthStart, asLocalTime('00:00'), utcOffsetMinutes)

  const rows = await tx.payment.findMany({
    where: { tenantId, createdAt: { gte: startInstant, lte: now } },
    select: { amount: true },
  })
  return rows.reduce((sum, row) => sum + row.amount, 0n)
}
