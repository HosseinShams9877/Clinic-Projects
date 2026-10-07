/**
 * The six tabs' reads, in one place.
 *
 * Each tab is a read of the tenant's own row and the tables that hang off it, and
 * every absent value resolves to the documented default rather than raising — the
 * contract every settings blob in the product keeps, and the reason a clinic that
 * never opened a tab still renders the shipped values. The reads never return the
 * caller's own snapshot; they read the row, because a setting takes effect on the
 * next request (`02-architecture.md` §11) and a cached value would serve the
 * previous one.
 */

import {
  BookingMode,
  Channel,
  DEFAULT_BOOKING_HOLD_MINUTES,
  DEFAULT_REMINDER_LEAD_HOURS,
  DEFAULT_SLOT_DURATION_MINUTES,
  DepositRefundPolicy,
  isMember,
} from '@/core/constants'
import {
  asLocalDate,
  asLocalTime,
  isValidLocalDate,
} from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'
import { DEFAULT_CYCLE_SETTINGS } from '@/modules/cycles'
import { readSendSettings, templatesForChannel } from '@/modules/messages'
import { parseModuleOverrides } from '@/modules/registry'

import type {
  BookingSettings,
  CycleTabSettings,
  DeclaredOverrideRow,
  HolidayRow,
  IdentitySettings,
  MessagesTabSettings,
  MessageTemplateEdit,
  OptionsSettings,
  ShiftRow,
  TenantSettingsSurface,
  WorkingHoursSettings,
} from '../types'
import { readToggles } from './toggles'

/** The columns the booking tab reads, named once so a rename touches one select. */
const BOOKING_SELECT = {
  bookingMode: true,
  appointmentSettings: true,
  secretaryDiscountCap: true,
  depositRefundPolicy: true,
} as const

const IDENTITY_SELECT = {
  name: true,
} as const

const CLINIC_SELECT = {
  id: true,
  name: true,
  phone: true,
  address: true,
} as const

const SHIFT_SELECT = {
  id: true,
  weekday: true,
  startTime: true,
  endTime: true,
} as const

const HOLIDAY_SELECT = {
  id: true,
  localDate: true,
  title: true,
  isOfficial: true,
} as const

const OVERRIDES_SELECT = {
  overrides: true,
} as const

/** The six tabs in one read, for the page that renders the tab it was asked for. */
export async function readSettingsSurface(
  tx: TransactionClient,
  tenantId: string,
): Promise<TenantSettingsSurface> {
  const [identity, booking, workingHours, cycle, messages, options] = await Promise.all([
    readIdentity(tx, tenantId),
    readBooking(tx, tenantId),
    readWorkingHours(tx, tenantId),
    readCycleTab(tx, tenantId),
    readMessagesTab(tx, tenantId),
    readOptions(tx, tenantId),
  ])

  return Object.freeze({
    identity,
    booking,
    workingHours,
    cycle,
    messages,
    options,
  })
}

/** «اطلاعات کلینیک» — the tenant's name and its primary clinic's own facts. */
export async function readIdentity(
  tx: TransactionClient,
  tenantId: string,
): Promise<IdentitySettings> {
  const [tenant, clinic] = await Promise.all([
    tx.tenant.findUnique({ where: { id: tenantId }, select: IDENTITY_SELECT }),
    tx.clinic.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: CLINIC_SELECT,
    }),
  ])

  return Object.freeze({
    tenantName: tenant?.name ?? '',
    clinicName: clinic?.name ?? tenant?.name ?? '',
    phone: clinic?.phone ?? null,
    address: clinic?.address ?? null,
  })
}

/** «نوبتدهی» — the mode, the lifecycle timings, and the two payment policy values. */
export async function readBooking(
  tx: TransactionClient,
  tenantId: string,
): Promise<BookingSettings> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: BOOKING_SELECT,
  })

  return Object.freeze({
    mode: modeOrDefault(row?.bookingMode ?? null),
    timings: timingsOrDefault(row?.appointmentSettings ?? null),
    secretaryDiscountCap: row?.secretaryDiscountCap ?? null,
    depositRefundPolicy: policyOrDefault(row?.depositRefundPolicy ?? null),
  })
}

/** «ساعات کاری» — the clinic's weekly shifts and its holidays, both in Jalali form. */
export async function readWorkingHours(
  tx: TransactionClient,
  tenantId: string,
): Promise<WorkingHoursSettings> {
  const [shifts, holidays] = await Promise.all([
    tx.clinicShift.findMany({
      where: { tenantId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      select: SHIFT_SELECT,
    }),
    tx.holiday.findMany({
      where: { tenantId },
      orderBy: { localDate: 'asc' },
      select: HOLIDAY_SELECT,
    }),
  ])

  return Object.freeze({
    shifts: shifts.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startTime: asLocalTime(row.startTime),
      endTime: asLocalTime(row.endTime),
    })) satisfies readonly ShiftRow[],
    holidays: holidays
      .filter((row) => isValidLocalDate(row.localDate))
      .map((row) => ({
        id: row.id,
        localDate: asLocalDate(row.localDate),
        title: row.title,
        isOfficial: row.isOfficial,
      })) satisfies readonly HolidayRow[],
  })
}

/** «چرخه درمان» — the two settings §5 keeps with the cycle engine. */
export async function readCycleTab(
  tx: TransactionClient,
  tenantId: string,
): Promise<CycleTabSettings> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: { cycleSettings: true },
  })
  if (row === null || row.cycleSettings === null) return DEFAULT_CYCLE_SETTINGS

  return Object.freeze({
    ...DEFAULT_CYCLE_SETTINGS,
    ...safeObject(row.cycleSettings),
  })
}

/** «پیام‌ها» — every automatic message's text on both channels, and the send policy. */
export async function readMessagesTab(
  tx: TransactionClient,
  tenantId: string,
): Promise<MessagesTabSettings> {
  const send = await readSendSettings(tx, tenantId)
  const [sms, whatsApp] = await Promise.all([
    templatesForChannel({ tx, tenantId, channel: Channel.Sms }),
    templatesForChannel({ tx, tenantId, channel: Channel.WhatsApp }),
  ])

  const templates: MessageTemplateEdit[] = [...sms, ...whatsApp].map((row) => ({
    id: row.id,
    kind: row.automaticKind,
    channel: row.channel,
    text: row.text,
  }))

  return Object.freeze({
    templates,
    sendWindowStart: send.sendWindowStart,
    sendWindowEnd: send.sendWindowEnd,
    dailyMessageCap: send.dailyMessageCap,
    duplicateWindowDays: send.duplicateWindowDays,
  })
}

/** «اختیارات» — the eight toggles and the overrides this tenant has declared. */
export async function readOptions(
  tx: TransactionClient,
  tenantId: string,
): Promise<OptionsSettings> {
  const [toggles, row] = await Promise.all([
    readToggles(tx, tenantId),
    tx.tenantSettings.findUnique({ where: { tenantId }, select: OVERRIDES_SELECT }),
  ])

  const parsed = parseModuleOverrides(row?.overrides ?? null)

  return Object.freeze({
    toggles,
    overrides: parsed.selections.map((selection) => ({
      module: selection.module,
      implementation: selection.implementation,
      version: selection.version ?? null,
    })) satisfies readonly DeclaredOverrideRow[],
  })
}

/** The stored mode when it is one of the three, else the documented default. */
function modeOrDefault(stored: string | null): BookingMode {
  if (stored !== null && isMember(BookingMode, stored)) return stored
  return BookingMode.FixedSlot
}

/** The timings blob, or the three shipped defaults when the column cannot answer. */
function timingsOrDefault(stored: string | null): {
  readonly slotDurationMinutes: number
  readonly reminderLeadHours: number
  readonly bookingHoldMinutes: number
} {
  const parsed = safeObject(stored)
  return Object.freeze({
    slotDurationMinutes: positiveInteger(
      parsed.slotDurationMinutes,
      DEFAULT_SLOT_DURATION_MINUTES,
    ),
    reminderLeadHours: positiveInteger(parsed.reminderLeadHours, DEFAULT_REMINDER_LEAD_HOURS),
    bookingHoldMinutes: positiveInteger(parsed.bookingHoldMinutes, DEFAULT_BOOKING_HOLD_MINUTES),
  })
}

/** The stored policy when it is one of the three, else `null` — no policy, no refund. */
function policyOrDefault(stored: string | null): DepositRefundPolicy | null {
  if (stored !== null && isMember(DepositRefundPolicy, stored)) return stored
  return null
}

/** A column as an object, or `{}` for anything that is not a JSON object. */
function safeObject(stored: string | null): Record<string, unknown> {
  if (stored === null) return {}
  try {
    const parsed: unknown = JSON.parse(stored)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** A positive whole number, or the default for anything that is not one. */
function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}
