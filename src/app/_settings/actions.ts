/**
 * The settings page's writers, as the manager panel renders them.
 *
 * Each tab is one read and one write against the tenant's own row and the tables that
 * hang off it. The actions take the form the browser sent and parse it through the
 * module's own Zod schemas, because `03-data-model.md` §5 makes the boundary the place
 * a form's strings become the typed values a write takes — and a schema the module
 * owns is the one definition, shared with the page, rather than a second parse here.
 *
 * ## Why the toggles are one action and not eight
 *
 * The eight are one blob on one row, and a write that set one and unsent the other
 * seven would unset them. The action takes the map the form's checkboxes produced and
 * hands it to `saveToggles`, which merges it onto the row's own values.
 *
 * ## Why the working-hours tab adds and removes instead of replacing
 *
 * `saveWorkingHours` replaces the two lists wholesale, which is the contract a whole
 * tab edit needs. The tab renders rows a person adds and removes one at a time, so
 * the add and the remove read the current lists, apply the one change, and hand the
 * result to the same function — one writer, two surfaces, no second module entry.
 *
 * ## Why every action ends in `revalidatePath`
 *
 * The public site reads the clinic's name and the booking picker reads the mode and
 * the hours at request time; a write the page did not re-read is a holiday the next
 * customer's grid still offers a slot on.
 */

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma, runInTenantScope } from '@/core/db'
import type { TransactionClient } from '@/core/db/scope'
import { AutomaticMessageKind, isMember } from '@/core/constants'
import { DomainError } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import { normalizeDigits, asLocalTime } from '@/core/localization'

import { moduleFailureMessage } from '@/app/_shared/module-failure'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'
import {
  bookingSchema,
  cycleSchema,
  holidaySchema,
  identitySchema,
  messagesSchema,
  overrideDeclarationSchema,
  readWorkingHours,
  removeOverrideDeclaration,
  saveBooking,
  saveCycleTab,
  saveIdentity,
  saveMessagesTab,
  saveToggles,
  saveWorkingHours,
  setOverrideDeclaration,
  shiftSchema,
} from '@/modules/settings'
import type { Toggle } from '@/modules/roles-permissions'

/** The page the six tabs render on, re-read after a write changes any of them. */
const SETTINGS_PATH = '/admin/settings'

/** The settings page's own panel, which the manager column holds. */
const SETTINGS_PANEL: Panel = 'admin'

/**
 * The answer every form reads: a done, or a sentence about why it was not done.
 *
 * `message` is `null` on the done, because the tabs re-render from the row the write
 * left and not from the answer; a failure's sentence is the one thing the row cannot
 * say for itself.
 */
export type ActionResult =
  | { readonly ok: true; readonly message: null }
  | { readonly ok: false; readonly message: string }

export async function saveIdentityAction(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    const values = parse(identitySchema, form, {
      tenantName: stringOf(form, 'tenantName'),
      clinicName: stringOf(form, 'clinicName'),
      phone: optionalOf(form, 'phone'),
      address: optionalOf(form, 'address'),
    })

    await saveIdentity(tx, ctx, {
      tenantName: values.tenantName,
      clinicName: values.clinicName,
      phone: values.phone ?? null,
      address: values.address ?? null,
    })
  })
}

export async function saveBookingAction(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    const values = parse(bookingSchema, form, {
      mode: stringOf(form, 'mode'),
      timings: {
        slotDurationMinutes: wholeNumber(form, 'slotDurationMinutes'),
        reminderLeadHours: wholeNumber(form, 'reminderLeadHours'),
        bookingHoldMinutes: wholeNumber(form, 'bookingHoldMinutes'),
      },
      secretaryDiscountCap: moneyOrNone(form, 'secretaryDiscountCap'),
      depositRefundPolicy: stringOf(form, 'depositRefundPolicy') || null,
    })

    await saveBooking(tx, ctx, values)
  })
}

export async function addShiftAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    const shift = parse(shiftSchema, form, {
      weekday: wholeNumber(form, 'weekday'),
      startTime: stringOf(form, 'startTime'),
      endTime: stringOf(form, 'endTime'),
    })

    const current = await readWorkingHours(tx, ctx.tenantId)
    await saveWorkingHours(tx, ctx, {
      shifts: [...current.shifts.map(toShiftInput), shift],
      holidays: current.holidays.map(toHolidayInput),
    })
  })
}

export async function removeShiftAction(id: string): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    const current = await readWorkingHours(tx, ctx.tenantId)
    await saveWorkingHours(tx, ctx, {
      shifts: current.shifts.filter((row) => row.id !== id).map(toShiftInput),
      holidays: current.holidays.map(toHolidayInput),
    })
  })
}

export async function addHolidayAction(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    const holiday = parse(holidaySchema, form, {
      localDate: stringOf(form, 'localDate'),
      title: stringOf(form, 'title'),
      isOfficial: form.get('isOfficial') === 'on',
    })

    const current = await readWorkingHours(tx, ctx.tenantId)
    await saveWorkingHours(tx, ctx, {
      shifts: current.shifts.map(toShiftInput),
      holidays: [...current.holidays.map(toHolidayInput), holiday],
    })
  })
}

export async function removeHolidayAction(id: string): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    const current = await readWorkingHours(tx, ctx.tenantId)
    await saveWorkingHours(tx, ctx, {
      shifts: current.shifts.map(toShiftInput),
      holidays: current.holidays.filter((row) => row.id !== id).map(toHolidayInput),
    })
  })
}

export async function saveCycleTabAction(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    const values = parse(cycleSchema, form, {
      noShowAddsToContactList: form.get('noShowAddsToContactList') === 'on',
      rescheduleShiftsDueDates: form.get('rescheduleShiftsDueDates') === 'on',
    })

    await saveCycleTab(tx, ctx, values)
  })
}

export async function saveMessagesAction(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    const templates = [...form.entries()].flatMap(([name, value]) => {
      const key = TEMPLATE_KEY.exec(name)
      if (key === null || typeof value !== 'string') return []
      return [{ id: null as string | null, kind: key[1], channel: key[2], text: value }]
    })

    const values = parse(messagesSchema, form, {
      templates,
      sendWindowStart: stringOf(form, 'sendWindowStart'),
      sendWindowEnd: stringOf(form, 'sendWindowEnd'),
      dailyMessageCap: wholeNumber(form, 'dailyMessageCap'),
      duplicateWindowDays: wholeNumber(form, 'duplicateWindowDays'),
    })

    await saveMessagesTab(tx, ctx, {
      templates: values.templates.flatMap((template) =>
        // The schema is permissive about the kind a form sent; the module's own
        // contract is the seven the constants close, and one outside them is a
        // template the tab did not render.
        isMember(AutomaticMessageKind, template.kind)
          ? [{
              id: template.id ?? null,
              kind: template.kind,
              channel: template.channel,
              text: template.text,
            }]
          : [],
      ),
      sendWindowStart: asLocalTime(values.sendWindowStart),
      sendWindowEnd: asLocalTime(values.sendWindowEnd),
      dailyMessageCap: values.dailyMessageCap,
      duplicateWindowDays: values.duplicateWindowDays,
    })
  })
}

export async function saveTogglesAction(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    // A checkbox the person left off sends nothing, and the form's keys are the names
    // that came back — so the eight are the names, and their values are the `on` the
    // checked ones carry.
    const changes = Object.fromEntries(
      [...form.keys()].map((toggle) => [toggle, form.get(toggle) === 'on']),
    ) as Readonly<Partial<Record<Toggle, boolean>>>

    await saveToggles(tx, ctx, changes)
  })
}

export async function addOverrideAction(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    const values = parse(overrideDeclarationSchema, form, {
      module: stringOf(form, 'module'),
      implementation: stringOf(form, 'implementation'),
    })

    await setOverrideDeclaration({ tx, ctx, module: values.module, implementation: values.implementation })
  })
}

export async function removeOverrideAction(module: string): Promise<ActionResult> {
  return run(async (ctx, tx) => {
    await removeOverrideDeclaration({ tx, ctx, module })
  })
}

/** A `template:<kind>:<channel>` field's two names, as the messages tab sends them. */
const TEMPLATE_KEY = /^template:(.+):(.+)$/

/** One shift row, as the wholesale write takes it. */
function toShiftInput(row: {
  readonly weekday: number
  readonly startTime: string
  readonly endTime: string
}) {
  return { weekday: row.weekday, startTime: row.startTime, endTime: row.endTime }
}

/** One holiday row, as the same write takes it. */
function toHolidayInput(row: {
  readonly localDate: string
  readonly title: string
  readonly isOfficial: boolean
}) {
  return { localDate: row.localDate, title: row.title, isOfficial: row.isOfficial }
}

/**
 * One action's resolution: the panel's session, a tenant-scoped transaction, and the
 * one answer every form reads back.
 *
 * `resolveStaffPanel` raises rather than redirecting, because an action answers a
 * form and not a page; the raise becomes the failure sentence the form renders.
 */
async function run(
  block: (ctx: TenantContext, tx: TransactionClient) => Promise<void>,
): Promise<ActionResult> {
  try {
    const session = await resolveStaffPanel(SETTINGS_PANEL)
    await runInTenantScope(session.permissions, prisma(), (tx) => block(session.permissions, tx))
    revalidatePath(SETTINGS_PATH)
    return { ok: true, message: null }
  } catch (error) {
    return { ok: false, message: moduleFailureMessage(error) }
  }
}

/**
 * One payload against its schema, or the sentence about the field that failed.
 *
 * The schema is the module's, so a field the form no longer sends is a compile error
 * here and a value the schema refuses is the one Persian sentence the catalog holds.
 */
function parse<TSchema extends z.ZodType>(
  schema: TSchema,
  form: FormData,
  values: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(values)
  if (!result.success) {
    const field = Object.keys(result.error.flatten().fieldErrors)[0] ?? 'unknown'
    throw new DomainError(`The ${field} field the settings form sent is not valid.`, {
      messageKey: 'settings.invalidValue',
      detail: { field, tab: form.get('tab') },
    })
  }
  return result.data
}

/** One field's string, as the module's own trimmed value. */
function stringOf(form: FormData, name: string): string {
  const value = form.get(name)
  if (typeof value !== 'string') {
    throw new DomainError(`The ${name} field is missing.`, {
      messageKey: 'settings.invalidValue',
      detail: { field: name },
    })
  }
  return value.trim()
}

/** One optional field, as `null` for the empty string the empty field sends. */
function optionalOf(form: FormData, name: string): string | undefined {
  const value = form.get(name)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** A whole number a text field sent, or `0` when the field was empty. */
function wholeNumber(form: FormData, name: string): number {
  const normalized = normalizeDigits(stringOf(form, name))
  if (normalized === '') return 0
  const parsed = Number.parseInt(normalized, 10)
  if (Number.isNaN(parsed)) {
    throw new DomainError(`The ${name} field must be a whole number.`, {
      messageKey: 'settings.invalidValue',
      detail: { field: name },
    })
  }
  return parsed
}

/** A money amount a text field sent, or `null` when the manager left it empty. */
function moneyOrNone(form: FormData, name: string): bigint | null {
  const value = form.get(name)
  if (typeof value !== 'string' || value.trim() === '') return null

  const normalized = normalizeDigits(value)
  if (!/^\d+$/.test(normalized)) {
    throw new DomainError(`The ${name} field must be an amount in tomans.`, {
      messageKey: 'settings.invalidValue',
      detail: { field: name },
    })
  }
  return BigInt(normalized)
}
