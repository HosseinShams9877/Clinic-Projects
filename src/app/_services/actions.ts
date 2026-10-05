/**
 * The services catalogue's five writers, as the manager panel renders them.
 *
 * The catalogue is a read and five writes — a service is created, edited, reactivated,
 * deactivated, and assigned its doctors — and the five are one server-action file
 * because they are one row's own affordances and one row is what the manager acts on.
 * A failure the module raised lands on the form that raised it, as
 * `moduleFailureMessage`'s Persian sentence, which is the same answer the customer
 * surfaces give and for the same reason (`05-conventions.md` §7).
 *
 * ## Why there is no delete action here (DoD 3)
 *
 * The module has no `deleteService`, so this file has no `deleteServiceAction`, no
 * name a page could call, and no sentence a button could render. The deactivation is
 * the only removal the catalogue has, and the row stays.
 *
 * ## Why the money arrives as a string
 *
 * The form field is text and the column is `BigInt`, so the string the field holds is
 * parsed here and not in the module: the module's own contract is a `bigint`, and a
 * caller that could not parse one is a caller the module would have to explain a
 * `null` to. A string that is not a number is a `ValidationError`, which is the
 * catalogue's own sentence about a name the form did not send.
 *
 * ## Why every action ends in `revalidatePath`
 *
 * The catalogue is the booking picker's source and the public site's price list, and
 * both read at request time; a write the page did not re-read is a price the next
 * customer sees as the old one. The paths are the catalogue and the desk's own grid,
 * because those are the two surfaces that name a service.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import type { TransactionClient } from '@/core/db/scope'
import type { TenantContext } from '@/core/tenant'
import {
  activateService,
  assignServiceDoctors,
  createService,
  deactivateService,
  updateService,
} from '@/modules/services'

import { moduleFailureMessage } from '@/app/_shared/module-failure'
import { SERVICES_PAGE } from '@/app/catalog'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'

/** The catalogue's own panel, which the manager column holds. */
const SERVICES_PANEL: Panel = 'admin'

/** The answer every form reads: a done, or a sentence about why it was not done. */
export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** The fields the new-service form sends, as the form holds them. */
export interface ServiceInput {
  readonly name: string
  readonly category?: string
  /** The price, as the text field holds it — parsed to `bigint` before the module. */
  readonly price: string
  readonly depositAmount?: string
  readonly durationMinutes: string
  readonly defaultSessions?: string
  readonly defaultIntervalDays?: string
  readonly showPriceOnSite?: boolean
}

/** The fields the edit form may send; the ones it omits are the ones it did not change. */
export type ServiceUpdateInput = Partial<ServiceInput>

/** The fields the doctor-assignment checkbox group sends. */
export interface ServiceDoctorsInput {
  /** The `User` ids the checked boxes hold, which is the column's own value. */
  readonly doctorIds: readonly string[]
}

/**
 * One action's own scope: the transaction and the caller's own context.
 */
interface ScopeArgs {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
}

/** One action's pre-scope outcome: either the parsed input or the sentence the form reads. */
type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }

/* ── The five writes ───────────────────────────────────────────────────────── */

/**
 * «افزودن خدمت» — the catalogue's one create.
 *
 * A duplicate name comes back onto the form as the catalogue's own sentence, because
 * the manager reads "choose another name" as information rather than as a refusal.
 */
export async function createServiceAction(input: ServiceInput): Promise<ActionResult> {
  const parsed = parseServiceInput(input)
  if (!parsed.ok) return parsed
  const result = await inTenantScope(({ tx, ctx }) =>
    createService({
      tx,
      ctx,
      name: input.name,
      category: input.category,
      price: parsed.value.price,
      depositAmount: parsed.value.depositAmount,
      durationMinutes: parsed.value.durationMinutes,
      defaultSessions: parsed.value.defaultSessions,
      defaultIntervalDays: parsed.value.defaultIntervalDays,
      showPriceOnSite: input.showPriceOnSite,
    }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCatalogue()
  return { ok: true }
}

/**
 * «ویرایش خدمت» — the catalogue's one update, on the fields the form sent.
 *
 * The service is resolved by the module, which raises `NotFoundError` for a row outside
 * the tenant; the form reads that as «این خدمت پیدا نشد.» and the row is gone for a
 * reason the catalogue does not need to explain.
 */
export async function updateServiceAction(
  serviceId: string,
  input: ServiceUpdateInput,
): Promise<ActionResult> {
  const parsed = parseServiceUpdate(input)
  if (!parsed.ok) return parsed
  const result = await inTenantScope(({ tx, ctx }) =>
    updateService({
      tx,
      ctx,
      serviceId,
      name: input.name,
      category: input.category,
      price: parsed.value.price,
      depositAmount: parsed.value.depositAmount,
      durationMinutes: parsed.value.durationMinutes,
      defaultSessions: parsed.value.defaultSessions,
      defaultIntervalDays: parsed.value.defaultIntervalDays,
      showPriceOnSite: input.showPriceOnSite,
    }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCatalogue()
  return { ok: true }
}

/**
 * «فعال کردن» — the only way a service returns to the picker and the public site.
 */
export async function activateServiceAction(serviceId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    activateService({ tx, ctx, serviceId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCatalogue()
  return { ok: true }
}

/**
 * «غیرفعال کردن» — the deactivation that replaces deletion (DoD 3, DoD 4).
 *
 * The row stays, every past appointment keeps its snapshot, and the service leaves the
 * booking picker. The page asks first, because the picker is empty the moment the
 * action lands and a manager who tapped by mistake is looking at a catalogue that no
 * longer offers the service.
 */
export async function deactivateServiceAction(serviceId: string): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    deactivateService({ tx, ctx, serviceId }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCatalogue()
  return { ok: true }
}

/**
 * «پزشکان مجاز» — the doctors a service is bookable by.
 *
 * The ids are the `User` ids the column stores, so the checked boxes round-trip: the
 * form reads them from `serviceDoctors` and writes the same values back. An id the
 * module does not keep — a non-doctor, an inactive membership, another tenant's person
 * — is dropped by the module and not refused here, because the catalogue's own column
 * is the record of who the service is bookable by.
 */
export async function assignServiceDoctorsAction(
  serviceId: string,
  input: ServiceDoctorsInput,
): Promise<ActionResult> {
  const result = await inTenantScope(({ tx, ctx }) =>
    assignServiceDoctors({ tx, ctx, serviceId, doctorIds: input.doctorIds }).then(() => SUCCESS),
  )
  if (!('succeeded' in result)) return result
  revalidateCatalogue()
  return { ok: true }
}

/* ── The scope every action runs in ────────────────────────────────────────── */

/**
 * One action's write, inside the tenant scope the shell resolved.
 *
 * The catch is the one place the file speaks Persian: a module's `AppError` carries an
 * English message and a catalog key, and the form reads the key's own sentence. A
 * throw that is not an `AppError` is the platform's, and the fallback sentence is the
 * catalog's apology for it.
 */
async function inTenantScope<T>(
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(SERVICES_PANEL)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({ tx, ctx: session.permissions }),
  ).catch((error: unknown) => ({ ok: false, message: moduleFailureMessage(error) }) as const)
}

/**
 * The sentinel a block returns when it has nothing but a success to report.
 *
 * The module functions all answer the row they wrote, and the action does not render
 * the row — it revalidates the page and the form closes — so the sentinel is what the
 * two arms of the union are told apart with.
 */
const SUCCESS = { succeeded: true } as const

/**
 * The catalogue and the desk's own grid — the two surfaces that name a service.
 *
 * The public site reads the same columns, and its pages revalidate on their own
 * request; the two paths here are the two the manager and the desk are looking at.
 */
function revalidateCatalogue(): void {
  revalidatePath('/admin/services')
  revalidatePath('/reception/appointments')
}

/* ── The form's own four parses ────────────────────────────────────────────── */

/**
 * The new-service form's fields, parsed to the shapes the module takes.
 *
 * The parse runs before the scope, because a field that is not a number is the form's
 * own mistake and the sentence for it is the page's — the module's contract is a
 * `bigint`, and an error raised inside the scope would arrive as a key the catalogue
 * does not own.
 */
function parseServiceInput(input: ServiceInput): Parsed<ServiceNumbers> {
  const price = parseMoney(input.price)
  if (!price.ok) return price
  const depositAmount = parseOptionalMoney(input.depositAmount)
  if (!depositAmount.ok) return depositAmount
  const durationMinutes = parseCount(input.durationMinutes)
  if (!durationMinutes.ok) return durationMinutes
  const defaultSessions = parseOptionalCount(input.defaultSessions)
  if (!defaultSessions.ok) return defaultSessions
  const defaultIntervalDays = parseOptionalCount(input.defaultIntervalDays)
  if (!defaultIntervalDays.ok) return defaultIntervalDays
  return {
    ok: true,
    value: {
      price: price.value,
      depositAmount: depositAmount.value,
      durationMinutes: durationMinutes.value,
      defaultSessions: defaultSessions.value,
      defaultIntervalDays: defaultIntervalDays.value,
    },
  }
}

/** The edit form's fields, parsed on the ones it sent. */
function parseServiceUpdate(input: ServiceUpdateInput): Parsed<Partial<ServiceNumbers>> {
  const price = input.price === undefined ? skip() : parseMoney(input.price)
  if (!price.ok) return price
  const depositAmount =
    input.depositAmount === undefined ? skip() : parseOptionalMoney(input.depositAmount)
  if (!depositAmount.ok) return depositAmount
  const durationMinutes =
    input.durationMinutes === undefined ? skip() : parseCount(input.durationMinutes)
  if (!durationMinutes.ok) return durationMinutes
  const defaultSessions =
    input.defaultSessions === undefined ? skip() : parseOptionalCount(input.defaultSessions)
  if (!defaultSessions.ok) return defaultSessions
  const defaultIntervalDays =
    input.defaultIntervalDays === undefined ? skip() : parseOptionalCount(input.defaultIntervalDays)
  if (!defaultIntervalDays.ok) return defaultIntervalDays
  return {
    ok: true,
    value: {
      price: price.value,
      depositAmount: depositAmount.value,
      durationMinutes: durationMinutes.value,
      defaultSessions: defaultSessions.value,
      defaultIntervalDays: defaultIntervalDays.value,
    },
  }
}

/** The five numeric fields the module takes, parsed once. */
interface ServiceNumbers {
  readonly price: bigint
  readonly depositAmount: bigint | undefined
  readonly durationMinutes: number
  readonly defaultSessions: number | undefined
  readonly defaultIntervalDays: number | undefined
}

/** A field the form did not send, which the module reads as "leave it". */
function skip(): { readonly ok: true; readonly value: undefined } {
  return { ok: true, value: undefined }
}

/** One required money field, as the column's `bigint`. */
function parseMoney(value: string): Parsed<bigint> {
  const parsed = parseBigInt(value)
  if (parsed === null) return { ok: false, message: SERVICES_PAGE.validation.money }
  return { ok: true, value: parsed }
}

/** One optional money field, as the column's `bigint` or the nothing the form sent. */
function parseOptionalMoney(value: string | undefined): Parsed<bigint | undefined> {
  if (value === undefined || value.trim() === '') return skip()
  const parsed = parseBigInt(value)
  if (parsed === null) return { ok: false, message: SERVICES_PAGE.validation.money }
  return { ok: true, value: parsed }
}

/** One required count field, as the column's number. */
function parseCount(value: string): Parsed<number> {
  const parsed = Number.parseInt(value.trim(), 10)
  if (Number.isNaN(parsed)) return { ok: false, message: SERVICES_PAGE.validation.count }
  return { ok: true, value: parsed }
}

/** One optional count field, or the nothing the form sent. */
function parseOptionalCount(value: string | undefined): Parsed<number | undefined> {
  if (value === undefined || value.trim() === '') return skip()
  const parsed = Number.parseInt(value.trim(), 10)
  if (Number.isNaN(parsed)) return { ok: false, message: SERVICES_PAGE.validation.count }
  return { ok: true, value: parsed }
}

/**
 * One money or count field, as a `bigint` the column takes or `null` for a string that
 * is not a non-negative integer.
 *
 * The catalogue's own fields are whole rials and whole minutes — a decimal is a price
 * the clinic cannot charge — so the parse is an integer parse and not a float one.
 */
function parseBigInt(value: string): bigint | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return BigInt(trimmed)
}
