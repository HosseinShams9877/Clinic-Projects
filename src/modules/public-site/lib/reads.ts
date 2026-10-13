/**
 * The public site's reads — the clinic's own catalogue and team, as a visitor sees them.
 */

import type { LocalDate } from '@/core/localization'
import { readBookingSettings } from '@/modules/appointments'
import type { TransactionClient } from '@/core/db/scope'
import { jalaliWeekday } from '@/core/localization'

/** One service card, as the public pages render it. */
export interface PublicService {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly price: bigint
  readonly depositAmount: bigint
  readonly durationMinutes: number
  readonly defaultSessions: number
  readonly showPriceOnSite: boolean
  readonly siteDescription: string | null
  readonly beforeCare: string | null
  readonly afterCare: string | null
  readonly notSuitableFor: string | null
}

/** One doctor card, as the public pages render it. */
export interface PublicDoctor {
  readonly id: string
  readonly name: string
  readonly specialties: readonly string[]
}

/** One published before/after pair, consent-filtered. */
export interface PublicBeforeAfter {
  readonly id: string
  readonly path: string
  readonly caption: string | null
}

/** The columns a service row is mapped from. */
type ServiceRow = {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly price: bigint
  readonly depositAmount: bigint
  readonly durationMinutes: number
  readonly defaultSessions: number
  readonly showPriceOnSite: boolean
  readonly siteDescription: string | null
  readonly beforeCare: string | null
  readonly afterCare: string | null
  readonly notSuitableFor: string | null
  readonly isActive: boolean
}

const SERVICE_SELECT = {
  id: true,
  name: true,
  category: true,
  price: true,
  depositAmount: true,
  durationMinutes: true,
  defaultSessions: true,
  showPriceOnSite: true,
  siteDescription: true,
  beforeCare: true,
  afterCare: true,
  notSuitableFor: true,
  isActive: true,
} as const

/**
 * The clinic's public catalogue — active services only, cheapest first.
 */
export async function publicServices(
  tx: TransactionClient,
  tenantId: string,
): Promise<readonly PublicService[]> {
  const rows = await tx.service.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ price: 'asc' }, { name: 'asc' }],
    select: SERVICE_SELECT,
  })
  return rows.map((row) => asPublicService(row))
}

function asPublicService(row: ServiceRow): PublicService {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    depositAmount: row.depositAmount,
    durationMinutes: row.durationMinutes,
    defaultSessions: row.defaultSessions,
    showPriceOnSite: row.showPriceOnSite,
    siteDescription: row.siteDescription,
    beforeCare: row.beforeCare,
    afterCare: row.afterCare,
    notSuitableFor: row.notSuitableFor,
  }
}

/**
 * One service, as its own page reads it.
 */
export async function publicService(
  tx: TransactionClient,
  tenantId: string,
  serviceId: string,
): Promise<PublicService | null> {
  const row = await tx.service.findFirst({
    where: { id: serviceId, tenantId, isActive: true },
    select: SERVICE_SELECT,
  })
  return row === null ? null : asPublicService(row)
}

/**
 * The clinic's doctors, with the services each performs.
 */
export async function publicDoctors(
  tx: TransactionClient,
  tenantId: string,
): Promise<readonly PublicDoctor[]> {
  const rows = await tx.serviceDoctor.findMany({
    where: { tenantId, service: { isActive: true } },
    select: {
      doctorId: true,
      doctor: { select: { id: true, firstName: true, lastName: true } },
      service: { select: { name: true } },
    },
    orderBy: { doctor: { firstName: 'asc' } },
  })

  const byDoctor = new Map<string, PublicDoctor>()
  for (const row of rows) {
    const name = [row.doctor.firstName, row.doctor.lastName].filter(Boolean).join(' ')
    const existing = byDoctor.get(row.doctorId)
    if (existing === undefined) {
      byDoctor.set(row.doctorId, { id: row.doctorId, name, specialties: [row.service.name] })
    } else if (!existing.specialties.includes(row.service.name)) {
      byDoctor.set(row.doctorId, { ...existing, specialties: [...existing.specialties, row.service.name] })
    }
  }
  return [...byDoctor.values()]
}

/**
 * The gallery the clinic published — **consent-filtered, here and nowhere else.**
 */
export async function publicBeforeAfter(
  tx: TransactionClient,
  tenantId: string,
): Promise<readonly PublicBeforeAfter[]> {
  const rows = await tx.beforeAfterImage.findMany({
    where: { tenantId, isVisible: true, revokedAt: null },
    orderBy: { grantedAt: 'desc' },
    select: { id: true, path: true, caption: true },
  })
  return rows.map((row) => ({ id: row.id, path: row.path, caption: row.caption }))
}

/**
 * The gallery for one service's own page.
 */
export async function publicServiceBeforeAfter(
  tx: TransactionClient,
  tenantId: string,
): Promise<readonly PublicBeforeAfter[]> {
  return publicBeforeAfter(tx, tenantId)
}

/**
 * The slots the booking wizard offers for one service on one day.
 *
 * ## Why the walk is per range and not per doctor
 *
 * A doctor's weekday is a set of ranges, and each range carries its own
 * `slotMinutes`. A 10–12 range at 120 minutes offers a single slot (10:00); a
 * 14–17 range at 45 minutes offers 14:00, 14:45, 15:30, 16:15. The public wizard
 * must offer the same slots the desk's grid draws, so the walk here is the
 * per-range walk the grid's own `doctorWindowsOnDay` performs — the same query,
 * the same `workingRange` intersection, the same step.
 *
 * ## Why the service's duration is not the step
 *
 * The step is the range's own `slotMinutes`, not the service's `durationMinutes`.
 * A service whose duration is longer than the step is a booking the desk confirms
 * as shorter (`SHORTEN_POPUP`); on the public site, the step is what the visitor
 * picks from, and the service's duration is the row the booking snapshots.
 */
export async function publicSlotsForDay(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly clinicId: string | null
  readonly doctorId: string
  readonly serviceId: string
  readonly localDate: LocalDate
}): Promise<readonly { readonly time: string; readonly durationMinutes: number }[]> {
  const settings = await readBookingSettings(args.tx, args.tenantId)
  const weekday = jalaliWeekday(args.localDate)

  const [shift, workingHours, shiftRanges, rows, holiday] = await Promise.all([
    args.tx.clinicShift.findFirst({
      where: { tenantId: args.tenantId, clinicId: args.clinicId ?? undefined, weekday },
      select: { startTime: true, endTime: true },
    }),
    args.tx.doctorWorkingHours.findMany({
      where: { tenantId: args.tenantId, doctorId: args.doctorId, weekday },
      select: { startTime: true, endTime: true },
    }),
    args.tx.doctorShiftRange.findMany({
      where: { tenantId: args.tenantId, doctorId: args.doctorId, weekday },
      select: { startTime: true, endTime: true, slotMinutes: true },
      orderBy: { startTime: 'asc' },
    }),
    args.tx.appointment.findMany({
      where: {
        tenantId: args.tenantId,
        doctorId: args.doctorId,
        localDate: args.localDate,
      },
      select: { localTime: true, durationMinutes: true, isSlotBlock: true, status: true },
    }),
    args.tx.holiday.findFirst({
      where: { tenantId: args.tenantId, localDate: args.localDate },
      select: { id: true },
    }),
  ])

  if (shift === null) return []
  if (holiday !== null && !settings.bookingOnHolidays) return []

  const shiftStart = toMinutes(shift.startTime)
  const shiftEnd = toMinutes(shift.endTime)

  const occupied = rows
    .filter((row) => row.isSlotBlock || (row.status !== 'CANCELLED' && row.status !== 'RESCHEDULED'))
    .map((row) => {
      const start = toMinutes(row.localTime)
      return { start, end: start + row.durationMinutes }
    })

  const ranges: { start: number; end: number; step: number }[] =
    shiftRanges.length > 0
      ? shiftRanges.map((row) => ({
          start: Math.max(shiftStart, toMinutes(row.startTime)),
          end: Math.min(shiftEnd, toMinutes(row.endTime)),
          step: row.slotMinutes,
        }))
      : workingHours.map((row) => ({
          start: Math.max(shiftStart, toMinutes(row.startTime)),
          end: Math.min(shiftEnd, toMinutes(row.endTime)),
          step: 30,
        }))

  const free: { time: string; durationMinutes: number }[] = []
  for (const range of ranges) {
    if (range.end <= range.start) continue
    let cursor = range.start
    while (cursor + range.step <= range.end) {
      const candidate = { start: cursor, end: cursor + range.step }
      const taken = occupied.some(
        (busy) => busy.start < candidate.end && busy.end > candidate.start,
      )
      if (!taken) {
        const hours = Math.floor(cursor / 60)
        const minutes = cursor % 60
        free.push({
          time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
          durationMinutes: range.step,
        })
      }
      cursor += range.step
    }
  }

  return free.sort((a, b) => a.time.localeCompare(b.time))
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

/**
 * The doctors who perform one service, as the public booking wizard offers them.
 */
export async function publicDoctorsForService(
  tx: TransactionClient,
  tenantId: string,
  serviceId: string,
): Promise<readonly PublicDoctor[]> {
  const rows = await tx.serviceDoctor.findMany({
    where: { tenantId, serviceId, doctor: { memberships: { some: { tenantId, isActive: true } } } },
    select: {
      doctor: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { doctor: { firstName: 'asc' } },
  })

  return rows.map((row) => ({
    id: row.doctor.id,
    name: [row.doctor.firstName, row.doctor.lastName].filter(Boolean).join(' '),
    specialties: [],
  }))
}

/**
 * One service's deposit amount, for the public booking wizard's deposit notice.
 */
export async function publicServiceDeposit(
  tx: TransactionClient,
  tenantId: string,
  serviceId: string,
): Promise<bigint | null> {
  const row = await tx.service.findFirst({
    where: { id: serviceId, tenantId, isActive: true },
    select: { depositAmount: true },
  })
  return row === null ? null : row.depositAmount
}