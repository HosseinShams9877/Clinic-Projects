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
  /** The service's own picture, as the storage module recorded it. */
  readonly imageUrl: string | null
  readonly imageBackend: string | null
  readonly imageKey: string | null
}

/** One doctor card, as the public pages render it. */
export interface PublicDoctor {
  readonly id: string
  readonly name: string
  readonly specialties: readonly string[]
  /** The doctor's own picture, as the storage module recorded it. */
  readonly avatarUrl: string | null
  readonly avatarBackend: string | null
  readonly avatarKey: string | null
}

/** One published before/after pair, consent-filtered. */
export interface PublicBeforeAfter {
  readonly id: string
  readonly path: string
  readonly caption: string | null
}

/** The site's own pictures, as the clinic row holds them. */
export interface PublicClinicImages {
  readonly logoUrl: string | null
  readonly heroImageUrl: string | null
  readonly aboutImageUrl: string | null
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
  readonly imageUrl: string | null
  readonly imageBackend: string | null
  readonly imageKey: string | null
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
  imageUrl: true,
  imageBackend: true,
  imageKey: true,
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
    imageUrl: row.imageUrl,
    imageBackend: row.imageBackend,
    imageKey: row.imageKey,
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
      doctor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          avatarBackend: true,
          avatarKey: true,
        },
      },
      service: { select: { name: true } },
    },
    orderBy: { doctor: { firstName: 'asc' } },
  })

  const byDoctor = new Map<string, PublicDoctor>()
  for (const row of rows) {
    const name = [row.doctor.firstName, row.doctor.lastName].filter(Boolean).join(' ')
    const existing = byDoctor.get(row.doctorId)
    if (existing === undefined) {
      byDoctor.set(row.doctorId, {
        id: row.doctorId,
        name,
        specialties: [row.service.name],
        avatarUrl: row.doctor.avatarUrl,
        avatarBackend: row.doctor.avatarBackend,
        avatarKey: row.doctor.avatarKey,
      })
    } else if (!existing.specialties.includes(row.service.name)) {
      byDoctor.set(row.doctorId, {
        ...existing,
        specialties: [...existing.specialties, row.service.name],
      })
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
 * The primary clinic's own pictures.
 *
 * The three are read together because the home page and the about page are the two
 * surfaces that render them, and a page that read one would still need the clinic's
 * row for its name. NULL on any of the three is a clinic that has not uploaded that
 * picture, and the page renders its own placeholder.
 */
export async function publicClinicImages(
  tx: TransactionClient,
  tenantId: string,
): Promise<PublicClinicImages> {
  const clinic = await tx.clinic.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { logoUrl: true, heroImageUrl: true, aboutImageUrl: true },
  })

  return {
    logoUrl: clinic?.logoUrl ?? null,
    heroImageUrl: clinic?.heroImageUrl ?? null,
    aboutImageUrl: clinic?.aboutImageUrl ?? null,
  }
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
      doctor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          avatarBackend: true,
          avatarKey: true,
        },
      },
    },
    orderBy: { doctor: { firstName: 'asc' } },
  })

  return rows.map((row) => ({
    id: row.doctor.id,
    name: [row.doctor.firstName, row.doctor.lastName].filter(Boolean).join(' '),
    specialties: [],
    avatarUrl: row.doctor.avatarUrl,
    avatarBackend: row.doctor.avatarBackend,
    avatarKey: row.doctor.avatarKey,
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