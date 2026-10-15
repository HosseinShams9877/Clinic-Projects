/**
 * The six tabs' writes.
 *
 * Each tab is one write against the tenant's own row, and the six never touch
 * another tenant's — the scope the caller opened already keeps them out, and the
 * `where` names `tenantId` for the same reason every other write in the product
 * does. A write takes the transaction rather than opening one, so a tab that
 * validates and writes does both inside one scope and a reader cannot see a
 * half-written row.
 *
 * What is deliberately not here: the overrides write. It carries an audit entry and
 * a registry validation the other five do not, so it lives in `./overrides.ts`.
 *
 * ## Why the images are a separate `saveClinicImages`
 *
 * The identity write's fields are the tenant's own name and its clinic's contact
 * details; the pictures are three separate facts whose bytes are stored by the
 * storage module and whose URLs are recorded on the same clinic row. Folding them
 * into `saveIdentity` would make a name change that did not touch a picture carry
 * the pictures' own values — which the form does not send — and would put the
 * storage module's path policy behind a write that has nothing to do with it.
 */

import { DepositRefundPolicy, Permission, isMember } from '@/core/constants'
import { asLocalTime, isValidLocalDate } from '@/core/localization'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { DEFAULT_CYCLE_SETTINGS } from '@/modules/cycles'
import { requirePermission, type Toggle } from '@/modules/roles-permissions'
import { DomainError } from '@/core/types'

import type {
  AppointmentTimings,
  BookingSettings,
  ClinicImagesSettings,
  CycleTabSettings,
  IdentitySettings,
  MessageTemplateEdit,
  MessagesTabSettings,
} from '../types'
import { writeToggles } from './toggles'

/** «اطلاعات کلینیک» — the tenant's name and its primary clinic's own facts. */
export async function saveIdentity(
  tx: TransactionClient,
  ctx: TenantContext,
  values: IdentitySettings,
): Promise<IdentitySettings> {
  requirePermission(ctx, Permission.ManageClinicSettings)

  const tenantName = values.tenantName.trim()
  if (tenantName === '') {
    throw new DomainError('The clinic name must not be blank.', {
      messageKey: 'settings.invalidValue',
      detail: { field: 'tenantName' },
    })
  }

  await tx.tenant.update({ where: { id: ctx.tenantId }, data: { name: tenantName } })

  const clinic = await tx.clinic.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (clinic !== null) {
    await tx.clinic.update({
      where: { id: clinic.id },
      data: {
        name: values.clinicName.trim() || tenantName,
        phone: trimOrNull(values.phone),
        address: trimOrNull(values.address),
      },
    })
  }

  const clinicRow = await tx.clinic.findFirstOrThrow({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: 'asc' },
    select: { name: true, phone: true, address: true },
  })

  return Object.freeze({
    tenantName,
    clinicName: clinicRow.name,
    phone: clinicRow.phone,
    address: clinicRow.address,
  })
}

/**
 * «تصاویر سایت» — the clinic's hero image and about picture.
 *
 * The three columns per picture are written together — URL, backend and key — so a
 * row can never name a URL without the pair a delete or a fallback needs. The
 * `null` values the form sends for an unset picture are written as `null`, which
 * is what the read resolves to a placeholder.
 */
export async function saveClinicImages(
  tx: TransactionClient,
  ctx: TenantContext,
  values: ClinicImagesSettings,
): Promise<ClinicImagesSettings> {
  requirePermission(ctx, Permission.ManageClinicSettings)

  if (values.clinicId === null) {
    throw new DomainError('No clinic exists for this tenant to attach the pictures to.', {
      messageKey: 'settings.invalidValue',
      detail: { field: 'clinicId' },
    })
  }

  const updated = await tx.clinic.update({
    where: { id: values.clinicId },
    data: {
      heroImageUrl: values.heroImageUrl,
      heroImageBackend: values.heroImageBackend,
      heroImageKey: values.heroImageKey,
      aboutImageUrl: values.aboutImageUrl,
      aboutImageBackend: values.aboutImageBackend,
      aboutImageKey: values.aboutImageKey,
    },
    select: {
      id: true,
      heroImageUrl: true,
      heroImageBackend: true,
      heroImageKey: true,
      aboutImageUrl: true,
      aboutImageBackend: true,
      aboutImageKey: true,
    },
  })

  return Object.freeze({
    clinicId: updated.id,
    heroImageUrl: updated.heroImageUrl,
    heroImageBackend: updated.heroImageBackend,
    heroImageKey: updated.heroImageKey,
    aboutImageUrl: updated.aboutImageUrl,
    aboutImageBackend: updated.aboutImageBackend,
    aboutImageKey: updated.aboutImageKey,
  })
}

/** «نوبتدهی» — the mode, the lifecycle timings, and the two payment policy values. */
export async function saveBooking(
  tx: TransactionClient,
  ctx: TenantContext,
  values: BookingSettings,
): Promise<BookingSettings> {
  requirePermission(ctx, Permission.ManageClinicSettings)

  const row = await tx.tenantSettings.upsert({
    where: { tenantId: ctx.tenantId },
    create: {
      tenantId: ctx.tenantId,
      bookingMode: values.mode,
      appointmentSettings: JSON.stringify(values.timings),
      secretaryDiscountCap: values.secretaryDiscountCap,
      depositRefundPolicy: values.depositRefundPolicy,
      debtGraceDays: values.debtGraceDays,
    },
    update: {
      bookingMode: values.mode,
      appointmentSettings: JSON.stringify(values.timings),
      secretaryDiscountCap: values.secretaryDiscountCap,
      depositRefundPolicy: values.depositRefundPolicy,
      debtGraceDays: values.debtGraceDays,
    },
    select: {
      bookingMode: true,
      appointmentSettings: true,
      secretaryDiscountCap: true,
      depositRefundPolicy: true,
      debtGraceDays: true,
    },
  })

  return Object.freeze({
    mode: values.mode,
    timings: JSON.parse(row.appointmentSettings ?? '{}') as AppointmentTimings,
    secretaryDiscountCap: row.secretaryDiscountCap,
    depositRefundPolicy: policyOf(row.depositRefundPolicy),
    debtGraceDays: row.debtGraceDays,
  })
}

/** The policy the row holds, or none when it holds a value the matrix does not name. */
function policyOf(stored: string | null): DepositRefundPolicy | null {
  return stored !== null && isMember(DepositRefundPolicy, stored) ? stored : null
}

/** «ساعات کاری» — the clinic's weekly shifts and its holidays, replaced wholesale. */
export async function saveWorkingHours(
  tx: TransactionClient,
  ctx: TenantContext,
  values: {
    readonly shifts: ReadonlyArray<{ readonly weekday: number; readonly startTime: string; readonly endTime: string }>
    readonly holidays: ReadonlyArray<{ readonly localDate: string; readonly title: string; readonly isOfficial: boolean }>
  },
): Promise<void> {
  requirePermission(ctx, Permission.ManageClinicSettings)

  for (const shift of values.shifts) {
    if (shift.weekday < 0 || shift.weekday > 6) {
      throw new DomainError(`The weekday ${shift.weekday} is not a day of the week.`, {
        messageKey: 'settings.invalidValue',
        detail: { field: 'weekday' },
      })
    }
    if (shift.startTime >= shift.endTime) {
      throw new DomainError('A shift must end after it starts.', {
        messageKey: 'settings.invalidValue',
        detail: { field: 'endTime' },
      })
    }
    asLocalTime(shift.startTime)
    asLocalTime(shift.endTime)
  }

  for (const holiday of values.holidays) {
    if (!isValidLocalDate(holiday.localDate) || holiday.title.trim() === '') {
      throw new DomainError('A holiday needs a valid date and a title.', {
        messageKey: 'settings.invalidValue',
        detail: { field: 'holiday' },
      })
    }
  }

  const clinics = await tx.clinic.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true },
  })

  await tx.clinicShift.deleteMany({ where: { tenantId: ctx.tenantId } })
  for (const clinic of clinics) {
    await tx.clinicShift.createMany({
      data: values.shifts.map((shift) => ({
        tenantId: ctx.tenantId,
        clinicId: clinic.id,
        weekday: shift.weekday,
        startTime: shift.startTime,
        endTime: shift.endTime,
      })),
    })
  }

  await tx.holiday.deleteMany({ where: { tenantId: ctx.tenantId } })
  if (values.holidays.length > 0) {
    await tx.holiday.createMany({
      data: values.holidays.map((holiday) => ({
        tenantId: ctx.tenantId,
        localDate: holiday.localDate,
        title: holiday.title.trim(),
        isOfficial: holiday.isOfficial,
      })),
    })
  }
}

/** «چرخه درمان» — the two settings §5 keeps with the cycle engine. */
export async function saveCycleTab(
  tx: TransactionClient,
  ctx: TenantContext,
  values: CycleTabSettings,
): Promise<CycleTabSettings> {
  requirePermission(ctx, Permission.ManageClinicSettings)

  await tx.tenantSettings.upsert({
    where: { tenantId: ctx.tenantId },
    create: { tenantId: ctx.tenantId, cycleSettings: JSON.stringify(values) },
    update: { cycleSettings: JSON.stringify(values) },
  })
  return Object.freeze({ ...DEFAULT_CYCLE_SETTINGS, ...values })
}

/** «پیام‌ها» — every automatic message's text on both channels, and the send policy. */
export async function saveMessagesTab(
  tx: TransactionClient,
  ctx: TenantContext,
  values: MessagesTabSettings & { readonly templates: readonly MessageTemplateEdit[] },
): Promise<void> {
  requirePermission(ctx, Permission.ManageClinicSettings)

  for (const template of values.templates) {
    const text = template.text.trim()
    if (text === '') {
      throw new DomainError(`The ${template.kind} template must not be blank.`, {
        messageKey: 'settings.invalidValue',
        detail: { field: 'template', kind: template.kind, channel: template.channel },
      })
    }

    await tx.messageTemplate.upsert({
      where: {
        tenantId_automaticKind_channel: {
          tenantId: ctx.tenantId,
          automaticKind: template.kind,
          channel: template.channel,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        automaticKind: template.kind,
        channel: template.channel,
        text,
        isActive: true,
      },
      update: { text },
    })
  }

  await tx.tenantSettings.upsert({
    where: { tenantId: ctx.tenantId },
    create: {
      tenantId: ctx.tenantId,
      sendWindowStart: values.sendWindowStart,
      sendWindowEnd: values.sendWindowEnd,
      dailyMessageCap: values.dailyMessageCap,
      duplicateMessageWindowDays: values.duplicateWindowDays,
    },
    update: {
      sendWindowStart: values.sendWindowStart,
      sendWindowEnd: values.sendWindowEnd,
      dailyMessageCap: values.dailyMessageCap,
      duplicateMessageWindowDays: values.duplicateWindowDays,
    },
  })
}

/** «اختیارات» — the eight toggles, written as one blob so the eight stay in step. */
export async function saveToggles(
  tx: TransactionClient,
  ctx: TenantContext,
  changes: Readonly<Partial<Record<Toggle, boolean>>>,
) {
  requirePermission(ctx, Permission.ManageClinicSettings)
  return writeToggles(tx, ctx.tenantId, changes)
}

/** A trimmed value, or `null` for the empty string the form's empty field sends. */
function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}