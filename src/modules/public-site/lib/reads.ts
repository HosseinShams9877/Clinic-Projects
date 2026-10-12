/**
 * The public site's reads — the clinic's own catalogue and team, as a visitor sees them.
 */

import type { LocalDate } from '@/core/localization'
import { generateSlots, readBookingSettings, slotMinutesForDoctor } from '@/modules/appointments'
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
  const service = await args.tx.service.findFirst({
    where: { id: args.serviceId, tenantId: args.tenantId, isActive: true },
    select: { durationMinutes: true },
  })
  if (service === null) return []

  const day = await asSlotDay(args, service.durationMinutes)
  const slots = generateSlots(day, settings)
  return slots.filter((slot) => slot.available).map((slot) => ({
    time: slot.time,
    durationMinutes: slot.durationMinutes,
  }))
}

/**
 * One day's facts, in the shape `generateSlots` takes.
 */
async function asSlotDay(
  args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly clinicId: string | null
    readonly doctorId: string
    readonly localDate: LocalDate
  },
  durationMinutes: number,
) {
  const weekday = jalaliWeekday(args.localDate)
  const [shifts, workingHours, blocks, holiday, slotMinutes] = await Promise.all([
    args.tx.clinicShift.findMany({
      where: { tenantId: args.tenantId, clinicId: args.clinicId ?? undefined, weekday },
      select: { startTime: true, endTime: true },
    }),
    args.tx.doctorWorkingHours.findMany({
      where: { tenantId: args.tenantId, doctorId: args.doctorId, weekday },
      select: { startTime: true, endTime: true },
    }),
    args.tx.appointment.findMany({
      where: {
        tenantId: args.tenantId,
        doctorId: args.doctorId,
        localDate: args.localDate,
        isSlotBlock: true,
      },
      select: { localTime: true, durationMinutes: true },
    }),
    args.tx.holiday.findFirst({
      where: { tenantId: args.tenantId, localDate: args.localDate },
      select: { id: true },
    }),
    slotMinutesForDoctor({
      tx: args.tx,
      tenantId: args.tenantId,
      doctorId: args.doctorId,
      weekday,
    }),
  ])

  return {
    doctorId: args.doctorId,
    localDate: args.localDate,
    shift: shifts[0] ?? null,
    hours: workingHours[0] ?? null,
    durationMinutes,
    slotMinutes,
    blocks: blocks.map((row) => ({
      start: toMinutes(row.localTime),
      end: toMinutes(row.localTime) + row.durationMinutes,
    })),
    isHoliday: holiday !== null,
  }
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}