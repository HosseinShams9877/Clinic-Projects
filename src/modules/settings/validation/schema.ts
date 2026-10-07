/**
 * The Zod schemas the settings actions parse their payloads with.
 *
 * `03-data-model.md` §5 requires every JSON-shaped column to be parsed through Zod
 * at the boundary, and the settings surface is that boundary for six tabs' worth of
 * form input. Each schema is permissive about *keys* it does not know and strict
 * about the ones it does: a tab added later is not a reason for an earlier tab's
 * save to fail, and a value the schema rejects is a reason for the whole save to.
 */

import { z } from 'zod'

import { AUTOMATIC_MESSAGES_PER_DAY, DUPLICATE_MESSAGE_WINDOW_DAYS } from '@/core/constants'

/** A Jalali day, as the calendar library validates it. */
const LOCAL_DATE = z
  .string()
  .min(1)
  .regex(/^\d{4}-\d{2}-\d{2}$/)

/** A `HH:MM` clinic-local time. */
const LOCAL_TIME = z.string().min(1).regex(/^\d{2}:\d{2}$/)

/** «اطلاعات کلینیک». */
export const identitySchema = z.object({
  tenantName: z.string().trim().min(1),
  clinicName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
})

/** The three lifecycle timings, each a positive whole number. */
export const timingsSchema = z.object({
  slotDurationMinutes: z.number().int().positive(),
  reminderLeadHours: z.number().int().positive(),
  bookingHoldMinutes: z.number().int().positive(),
})

/** «نوبتدهی». */
export const bookingSchema = z.object({
  mode: z.enum(['FIXED_SLOT', 'TIME_RANGE', 'REQUEST']),
  timings: timingsSchema,
  /** Toman, as the form sends it; `null` is no ceiling. */
  secretaryDiscountCap: z.union([z.bigint().nonnegative(), z.null()]),
  depositRefundPolicy: z.union([z.enum(['FULL', 'HALF', 'NONE']), z.null()]),
})

/** One row of the «ساعات کاری» shift table. */
export const shiftSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: LOCAL_TIME,
  endTime: LOCAL_TIME,
})

/** One row of the same tab's holiday table. */
export const holidaySchema = z.object({
  localDate: LOCAL_DATE,
  title: z.string().trim().min(1),
  isOfficial: z.boolean(),
})

export const workingHoursSchema = z.object({
  shifts: z.array(shiftSchema),
  holidays: z.array(holidaySchema),
})

/** «چرخه درمان» — the two booleans §5 names. */
export const cycleSchema = z.object({
  noShowAddsToContactList: z.boolean(),
  rescheduleShiftsDueDates: z.boolean(),
})

/** One editable automatic message. */
export const templateSchema = z.object({
  id: z.string().nullable().optional(),
  kind: z.string().min(1),
  channel: z.enum(['SMS', 'WHATSAPP']),
  text: z.string().trim().min(1),
})

/** «پیام‌ها». */
export const messagesSchema = z.object({
  templates: z.array(templateSchema),
  sendWindowStart: LOCAL_TIME,
  sendWindowEnd: LOCAL_TIME,
  dailyMessageCap: z.number().int().positive().default(AUTOMATIC_MESSAGES_PER_DAY),
  duplicateWindowDays: z.number().int().positive().default(DUPLICATE_MESSAGE_WINDOW_DAYS),
})

/** One toggle's on/off, keyed by the constants' own code. */
export const toggleSchema = z.object({
  toggle: z.string().min(1),
  enabled: z.boolean(),
})

/** «اختیارات» — the eight toggles, as the tab's form sends them. */
export const optionsSchema = z.object({
  toggles: z.array(toggleSchema),
})

/** The override declaration the «اختیارات» tab's form sends. */
export const overrideDeclarationSchema = z.object({
  module: z.string().trim().min(1),
  implementation: z.string().trim().min(1),
})

export type IdentityInput = z.infer<typeof identitySchema>
export type BookingInput = z.infer<typeof bookingSchema>
export type WorkingHoursInput = z.infer<typeof workingHoursSchema>
export type CycleInput = z.infer<typeof cycleSchema>
export type MessagesInput = z.infer<typeof messagesSchema>
export type OptionsInput = z.infer<typeof optionsSchema>
export type OverrideDeclarationInput = z.infer<typeof overrideDeclarationSchema>
