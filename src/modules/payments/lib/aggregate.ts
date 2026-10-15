/**
 * Tenant-wide payment aggregates for the desk's KPI tiles.
 */

import type { TransactionClient } from '@/core/db/scope'
import {
  asLocalTime,
  fromJalaliParts,
  fromUtcInstant,
  jalaliParts,
  toUtcInstant,
} from '@/core/localization'

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