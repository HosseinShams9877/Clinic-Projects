/**
 * The cycles Server Actions — the write half of the three cycle surfaces.
 *
 * `02-architecture.md` §6 puts composition in `src/app/`, and an action is composition of
 * a specific kind: it resolves the person from the session, opens the tenant scope, calls
 * the module's barrel and hands back a sentence. It runs no business rule of its own —
 * not one reason check, not one status transition — because the module is where those
 * live and an action that re-implemented a rule would be the second implementation that
 * drifts.
 *
 * ## The three writes a row carries, and the one it composes
 *
 * A cycle on the desk's list is acted on in three ways that this file owns: «نتیجه تماس»
 * records when to try again, «منصرف شد» closes the course with a reason, and «تکمیل دوره»
 * declares an unbounded course finished. The last is the manager's own authority and not
 * the desk's, which is a permission the module checks and not a button the page hides —
 * and the panel's shell is what put the right person in front of the surface that offers
 * it.
 *
 * «رزرو جلسه بعدی» is the fourth and it is not here, because it is two modules' work in
 * one transaction: `appointments` writes the slot and `cycles` takes the course off the
 * list, and the appointments action the popup already uses does both when it is handed
 * the `cycleId`. A wrapper here would be a second scope for the same write, and the two
 * writes would be two requests rather than one — so the cycles form calls the booking
 * action directly and this file does not re-scope it.
 *
 * ## Why failures are sentences and never exceptions
 *
 * An action's contract is a result a component renders. A thrown error surfaces as the
 * framework's own error page, which is English and unhelpful and loses the sentence the
 * module raised on purpose — so every call is wrapped and the key becomes Persian
 * through `moduleFailureMessage`. The one thing that is not caught is a bug the product
 * wants to see.
 */

'use server'

import { revalidatePath } from 'next/cache'

import { prisma, runInTenantScope } from '@/core/db'
import { asLocalDate, fromClockParts, toUtcInstant } from '@/core/localization'
import { realClock } from '@/core/lib/clock'
import type { TenantContext } from '@/core/tenant'
import { AbandonmentReason } from '@/core/constants'
import {
  abandonCycle,
  completeCycle,
  recordContactResult,
  readUtcOffsetMinutes,
} from '@/modules/cycles'
import type { Panel } from '@/app/_shell/navigation'
import { resolveStaffPanel } from '@/app/_shell/session'

import { moduleFailureMessage } from '../_shared/module-failure'

/** The answer every action gives: nothing to render on success, or the sentence. */
export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** The fields the contact-result form collects. */
export interface ContactResultInput {
  /** A `LocalDate` string the action converts to the instant the column stores. */
  readonly nextContactAt: string
}

/** The fields the abandonment form collects; the reason is the closed list's own key. */
export interface AbandonCycleInput {
  readonly reason: AbandonmentReason
}

/**
 * The arguments a block runs with: the scoped transaction, the permission context the
 * module functions take, and the membership's own facts.
 */
interface ScopeArgs {
  readonly tx: Parameters<Parameters<typeof runInTenantScope<unknown>>[2]>[0]
  /** Hand this to a module function as its `ctx`; it is what `requirePermission` reads. */
  readonly ctx: TenantContext
  readonly tenantId: string
  readonly userId: string
}

/**
 * Runs a block in the caller's tenant scope and answers with a sentence on failure.
 *
 * One helper because the shape is every action's: resolve, scope, call, revalidate.
 * The `panel` is the caller's own and reaches the resolution, which is what keeps the
 * desk's contact-result form from being callable with a doctor's token.
 */
async function inTenantScope<T>(
  panel: Panel,
  block: (args: ScopeArgs) => Promise<T>,
): Promise<T | { readonly ok: false; readonly message: string }> {
  const session = await resolveStaffPanel(panel)
  return runInTenantScope(session.permissions, prisma(), (tx) =>
    block({ tx, ctx: session.permissions, tenantId: session.tenantId, userId: session.permissions.userId }),
  ).catch((error: unknown) => ({ ok: false, message: moduleFailureMessage(error) } as const))
}

/**
 * The sentinel a block returns when it has nothing but a success to report.
 *
 * The module functions below all answer `void`, so the action needs an object to tell
 * the two arms of the union apart (the same reason `_customers/actions.ts` carries one).
 */
const SUCCESS = { succeeded: true } as const

/**
 * Re-renders the three cycle pages an action moved, so the row the person just wrote is
 * off the list when the popup closes.
 */
function revalidateCycles(): void {
  revalidatePath('/reception/cycles')
  revalidatePath('/admin/cycles')
  revalidatePath('/doctor/cycles')
}

/**
 * «نتیجه تماس» — the desk called, and recorded when to try again.
 *
 * The day the picker hands the action is a `LocalDate` and the column stores an instant;
 * the conversion is the library's own and reads the tenant's offset, for the same reason
 * the follow-up date's does (`07-localization.md` §6.1) — a day the desk reads as
 * «۱۴۰۵/۰۳/۰۴» has to land on that day in the clinic's own clock.
 */
export async function recordContactResultAction(
  panel: Panel,
  cycleId: string,
  input: ContactResultInput,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx, tenantId }) => {
    await recordContactResult({
      tx,
      ctx,
      cycleId,
      nextContactAt: await asNextContactAt(tx, tenantId, input.nextContactAt),
      now: realClock(),
    })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCycles()
  return { ok: true }
}

/**
 * «منصرف شد» — closes the course with a reason from the closed list.
 *
 * The row stays, because the drop-off report counts it (`03-data-model.md` §2.4.1 rule
 * 6), and an action that removed the row would make the clinic's own retention numbers
 * unreadable. The reason's key is what the module takes, and the label the page renders
 * comes from the module's own catalog — a rename of the list is a release, and the
 * historical rows keep the key they were closed with.
 */
export async function abandonCycleAction(
  panel: Panel,
  cycleId: string,
  input: AbandonCycleInput,
): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await abandonCycle({ tx, ctx, cycleId, reason: input.reason, now: realClock() })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCycles()
  return { ok: true }
}

/**
 * «تکمیل دوره» — declares an unbounded course finished, which the manager does.
 *
 * A bounded course reaches `COMPLETED` on its own when its last session lands; the
 * course with no total has no session to reach, and this write is the manager's own
 * authority over it. The customer enters the «دوره تکمیل شده» audience group by this
 * write, because the group's membership is the predicate over the status.
 */
export async function completeCycleAction(panel: Panel, cycleId: string): Promise<ActionResult> {
  const result = await inTenantScope(panel, async ({ tx, ctx }) => {
    await completeCycle({ tx, ctx, cycleId, now: realClock() })
    return SUCCESS
  })

  if (!('succeeded' in result)) return result
  revalidateCycles()
  return { ok: true }
}

/* ── The conversions and lists the actions and the form share ──────────────── */

/** The day's own start, which is the time a next-contact date carries. */
const MIDNIGHT = fromClockParts({ hour: 0, minute: 0 })

/**
 * The next-contact date the module stores, as the instant the column holds.
 *
 * `recordContactResult` takes a `Date` because the column is an instant, and the date the
 * picker hands the action is a `LocalDate` string. The offset is the cycles module's own
 * read, because that module is the one that owns the setting and the one that computes
 * the due dates this column sits beside.
 */
async function asNextContactAt(
  tx: ScopeArgs['tx'],
  tenantId: string,
  localDate: string,
): Promise<Date> {
  const offset = await readUtcOffsetMinutes(tx, tenantId)
  return toUtcInstant(asLocalDate(localDate), MIDNIGHT, offset)
}

/**
 * The closed list's keys, for the form's own select.
 *
 * The module's `AbandonmentReason` is the union the column stores, and the labels the
 * select renders come from the module's catalog — this is the one place the keys are
 * listed for a client component, because the list is the module's and not the page's.
 */
export const ABANDONMENT_REASONS: readonly AbandonmentReason[] = Object.keys(
  AbandonmentReason,
) as readonly AbandonmentReason[]
