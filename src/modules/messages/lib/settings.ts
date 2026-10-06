/**
 * The tenant's send configuration — the «پیامها» tab's own values.
 *
 * Four of the five values live on `TenantSettings` as columns Phase 1 already
 * defined: the send window, the daily cap and the duplicate window. The fifth is the
 * channel map, held in the `messageSettings` JSON blob for the same reason
 * `cycleSettings` is a blob rather than a column (`03-data-model.md` §5's
 * portability table: JSON in a `String`, parsed through Zod at the boundary).
 *
 * ## Why every absent value is a documented default and not an error
 *
 * The column is JSON in a plain `String`, so a row written by a release this one
 * does not know is a real possibility, and a settings read that threw would take the
 * whole dispatch down for one malformed blob. The fail-safe answer to "does this
 * clinic send at the documented time" is the documented time, which is also what a
 * clinic that never opened the tab gets.
 *
 * ## Why the parse is permissive and the write is not
 *
 * Unknown keys are ignored, because a channel added later is a setting this release
 * does not read. A key that is present and not a channel the constants module holds
 * is the default, for the reason above. What the parse refuses is a column that is
 * not an object at all — that is corruption, and the whole point of reading settings
 * is to answer with something.
 */

import { z } from 'zod'

import {
  AUTOMATIC_MESSAGES_PER_DAY,
  Channel,
  DUPLICATE_MESSAGE_WINDOW_DAYS,
  DEFAULT_CLINIC_UTC_OFFSET_MINUTES,
  type AutomaticMessageKind,
} from '@/core/constants'
import { asLocalTime, type LocalTime } from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'

import type { SendSettings } from '../types'

/** The clinic's default sending hours — ۸ تا ۲۱, the working day a Persian clinic keeps. */
export const DEFAULT_SEND_WINDOW_START = asLocalTime('08:00')
export const DEFAULT_SEND_WINDOW_END = asLocalTime('21:00')

/**
 * The channel every automatic message travels on when a clinic has not chosen.
 *
 * SMS, because a mobile number is the customer's only key (`03` §2.1) and SMS is the
 * one channel that number alone is enough for — WhatsApp needs an account the clinic
 * linked, and defaulting to it would send nothing.
 */
export const DEFAULT_CHANNEL: Channel = Channel.Sms

/** The columns the four scalar settings are read from. */
const SCALAR_SELECT = {
  sendWindowStart: true,
  sendWindowEnd: true,
  dailyMessageCap: true,
  duplicateMessageWindowDays: true,
  utcOffsetMinutes: true,
  messageSettings: true,
} as const

/** The channel map's stored shape: a kind → channel record, anything else ignored. */
const channelMapSchema = z
  .object({
    channels: z.record(z.string(), z.string()).catch({}),
  })
  .catch({ channels: {} })

/** The keys of the constants module's set, to build a default map of the seven. */
const AUTOMATIC_MESSAGE_KIND_KEYS = {
  BOOKING_CONFIRMATION: 'BOOKING_CONFIRMATION',
  APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER',
  AFTERCARE: 'AFTERCARE',
  NEXT_SESSION_REMINDER: 'NEXT_SESSION_REMINDER',
  BALANCE_REMINDER: 'BALANCE_REMINDER',
  NO_SHOW_FOLLOW_UP: 'NO_SHOW_FOLLOW_UP',
  SURVEY: 'SURVEY',
} as const satisfies Record<AutomaticMessageKind, AutomaticMessageKind>

/**
 * The settings a tenant that has never opened «پیامها» gets — the documented window,
 * the documented cap, the documented 90 days, and SMS for every message.
 */
export const DEFAULT_SEND_SETTINGS: SendSettings = Object.freeze({
  sendWindowStart: DEFAULT_SEND_WINDOW_START,
  sendWindowEnd: DEFAULT_SEND_WINDOW_END,
  dailyMessageCap: AUTOMATIC_MESSAGES_PER_DAY,
  duplicateWindowDays: DUPLICATE_MESSAGE_WINDOW_DAYS,
  utcOffsetMinutes: DEFAULT_CLINIC_UTC_OFFSET_MINUTES,
  channels: Object.fromEntries(
    Object.keys(AUTOMATIC_MESSAGE_KIND_KEYS).map((kind) => [kind, DEFAULT_CHANNEL]),
  ) as Readonly<Record<AutomaticMessageKind, Channel>>,
})

/**
 * The tenant's send settings, or the documented defaults where the row is absent,
 * holds no value, or holds one this release does not recognise.
 */
export async function readSendSettings(
  tx: TransactionClient,
  tenantId: string,
): Promise<SendSettings> {
  const row = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: SCALAR_SELECT,
  })
  if (row === null) return DEFAULT_SEND_SETTINGS

  return Object.freeze({
    ...DEFAULT_SEND_SETTINGS,
    sendWindowStart: safeLocalTime(row.sendWindowStart, DEFAULT_SEND_WINDOW_START),
    sendWindowEnd: safeLocalTime(row.sendWindowEnd, DEFAULT_SEND_WINDOW_END),
    dailyMessageCap: row.dailyMessageCap ?? AUTOMATIC_MESSAGES_PER_DAY,
    duplicateWindowDays: row.duplicateMessageWindowDays || DUPLICATE_MESSAGE_WINDOW_DAYS,
    utcOffsetMinutes: row.utcOffsetMinutes,
    channels: channelMap(row.messageSettings),
  })
}

/**
 * A stored window edge as a `LocalTime`, or the documented default for a value that
 * is not a time the calendar accepts.
 *
 * `asLocalTime` validates and throws, and a settings read that threw would silence
 * the whole dispatch for one malformed column — so the corrupt edge is the default
 * and the clinic's sending continues on the documented hours.
 */
function safeLocalTime(stored: string | null, fallback: LocalTime): LocalTime {
  if (stored === null) return fallback
  try {
    return asLocalTime(stored)
  } catch {
    return fallback
  }
}

/**
 * The stored blob as a channel map, with the defaults for every kind the blob does
 * not name. A value that is not one of the two channels is the default rather than an
 * error, because the clinic that wrote it is the clinic that has to answer for the
 * send that did not happen.
 */
function channelMap(stored: string | null): Readonly<Record<AutomaticMessageKind, Channel>> {
  const parsed = stored === null ? { channels: {} } : channelMapSchema.parse(safeJson(stored))
  const storedChannels = parsed.channels
  return Object.fromEntries(
    (Object.keys(AUTOMATIC_MESSAGE_KIND_KEYS) as readonly AutomaticMessageKind[]).map((kind) => [
      kind,
      storedChannels[kind] === Channel.WhatsApp ? Channel.WhatsApp : DEFAULT_CHANNEL,
    ]),
  ) as Readonly<Record<AutomaticMessageKind, Channel>>
}

/** The blob as an object, or `undefined` for a column that is not JSON or not an object. */
function safeJson(stored: string): unknown {
  try {
    const parsed: unknown = JSON.parse(stored)
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}
