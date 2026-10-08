/**
 * The public site's reads — the clinic's own catalogue and team, as a visitor sees them.
 *
 * Every read here takes a `tenantId` and not a `TenantContext`, because a visitor holds
 * no session and no membership: there is no `userId`, no `role` and no permission to
 * resolve. The tenant id is what the layout resolved from the host, and the tenant
 * scoping the Prisma extension applies is the whole of the isolation — the same Layer 1
 * the panels rely on, with no second code path for the public surface.
 *
 * ## Why these reads take no permission
 *
 * A clinic's services, its doctors and the gallery it published are not secrets; they
 * are the shop front. The permission gate belongs on the *write* the desk makes, and
 * on the customer's own record — which the public site never reads. Nothing here joins
 * onto a customer, a note, a balance or a cycle, and that is the rule that keeps the
 * public reads safe by construction rather than by a check each one remembers.
 *
 * ## Rule 6, and why the gallery is filtered here
 *
 * An immutable rule (`06-constants.md` §1) puts before/after images behind written,
 * revocable consent, and the schema holds that consent on the row: `isVisible` is the
 * clinic's publication flag and `revokedAt` is the withdrawal. The read that feeds the
 * gallery is where the rule bites, because a page rendering `isVisible: false` would be
 * a rule the template enforced and a row the database still had. Filtering here makes
 * "no consent, no image" a property of the read, and the page cannot render what the
 * read did not return.
 */

import type { LocalDate } from '@/core/localization'
import { generateSlots, readBookingSettings } from '@/modules/appointments'
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
  /** The services this doctor performs, for the card's subtitle. */
  readonly specialties: readonly string[]
}

/** One published before/after pair, consent-filtered. */
export interface PublicBeforeAfter {
  readonly id: string
  readonly path: string
  readonly caption: string | null
}

/** The columns a service row is mapped from, named once so the mapper reads. */
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
 *
 * A deactivated service leaves the public list the same way it leaves the booking
 * picker, and for the same reason: the clinic stopped offering it, and a page that
 * still showed it would be a page that took a booking for a service it no longer has.
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
 *
 * `null` and not a throw: a service the host's tenant does not have is a page the
 * clinic never linked to, and a 404 the next layer up renders is the honest answer.
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
 *
 * Read through `ServiceDoctor` and not `Membership`, because the public site's question
 * is "who can do this for me" and not "who works here" — a doctor with no assigned
 * service is a doctor the booking wizard cannot offer, and a card that suggests
 * otherwise is a card that leads to an empty slot list.
 */
export async function publicDoctors(
  tx: TransactionClient,
  tenantId: string,
): Promise<readonly PublicDoctor[]> {
  const rows = await tx.serviceDoctor.findMany({
    // A deactivated service is absent from the catalogue and 404s on its own page, so
    // a card that still named it would advertise something the wizard cannot book.
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
 *
 * `isVisible` is the publication flag the clinic set when it recorded the written
 * consent, and `revokedAt` is the withdrawal that takes the image down the moment the
 * person asks. Both are in the `where` and not in the page, so a template that forgets
 * the rule still cannot render a withdrawn image, and a row that never had consent is
 * a row this read never returns.
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
 *
 * The model has no `serviceId` (`prisma/schema.prisma`), so a service page shows the
 * clinic's gallery and not a filtered slice; the read is the same one the home page
 * uses, and the two pages agree because there is one read.
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
 * The real availability engine, not a reimplementation: `generateSlots` consults the
 * shift, the doctor's hours, the blocks and the holiday, and the holiday answer comes
 * from toggle 7 the same way the desk's grid gets it. The wizard renders what this
 * returns, so a time shown is a time the booking accepts.
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
 *
 * Assembled from the same four reads the desk's grid uses, so a slot the wizard offers
 * and a slot the grid shows come from the same function and cannot disagree.
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
  const [shifts, workingHours, blocks, holiday] = await Promise.all([
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
  ])

  return {
    doctorId: args.doctorId,
    localDate: args.localDate,
    shift: shifts[0] ?? null,
    hours: workingHours[0] ?? null,
    durationMinutes,
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
