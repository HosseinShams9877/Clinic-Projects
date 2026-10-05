/**
 * The contact list — `03-data-model.md` §2.4.1 rules 4 and 5, and the product's primary
 * revenue query.
 *
 * The list is the thing that separates this product from a calendar, and the two rules
 * that govern it are the reason it is worth reading:
 *
 * 4. **Enters** when `nextDueDate` has passed **and** no future appointment exists for
 *    that cycle. The second condition is the whole point: without it, anyone who already
 *    booked gets called anyway, which the specification calls "the fastest way to make
 *    the list worthless".
 * 5. **Leaves** when a new appointment is booked for the cycle, or منشی records
 *    «منصرف شد» with a reason, or the cycle completes.
 *
 * ## Why membership is recomputed and not toggled
 *
 * `inContactList` is a column, but the module writes it as a *function of the cycle's
 * own state* — the due date, the future appointment, the no-show streak — and never as a
 * value a caller sets. The recompute is idempotent by construction, which is what lets
 * three different callers run it: the booking path, so a customer who books leaves the
 * list in the request that booked them; the sweep, so a cycle whose day arrives enters
 * the list without a person looking at it; and the page's own read, so a desk that opens
 * the list sees the state the clock has already reached. Three callers, one rule, and a
 * second implementation would be the one that drifts.
 *
 * ## The two-cycle setting that widens the list
 *
 * `04-roles-permissions.md` §5: two consecutive no-shows put the cycle on the list, ON
 * by default. A no-show converted to a rescheduled appointment clears the streak — the
 * closed row is `RESCHEDULED`, which is not a `NO_SHOW`, and the recompute reads the
 * rows rather than a counter for the same reason the session counts are derived.
 */

import { AppointmentStatus, CycleStatus } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { DomainError, NotFoundError } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { CyclesMessageKey } from '../catalog'
import { readCycleSettings } from './settings'
import { asCycleStatus, assertCycleTransition, isCycleClosed } from './status'

/** The statuses a customer is still expected at — the ones that keep them off the list. */
const EXPECTED_STATUSES: readonly string[] = [
  AppointmentStatus.Booked,
  AppointmentStatus.AwaitingArrival,
  AppointmentStatus.Arrived,
  AppointmentStatus.ResultNotRecorded,
]

/** The columns the recompute reads. */
const CYCLE_SELECT = {
  id: true,
  status: true,
  nextDueDate: true,
} as const

/**
 * Re-evaluates one cycle's place on the list, and answers whether it is on it now.
 *
 * The one place `inContactList` is written, so the flag and the two conditions that
 * justify it cannot disagree. Called by the booking path, by the sweep and by the
 * page's read — the three callers named in the file header — and safe to call as often
 * as any of them likes.
 *
 * A closed cycle is off the list, and written as off: the abandonment and the
 * completion are rule 5's other two exits, and this write is what makes them stick
 * rather than relying on the caller to have cleared the flag.
 */
export async function refreshContactListForCycle(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly cycleId: string
  readonly now: Date
}): Promise<boolean> {
  const row = await args.tx.treatmentCycle.findUnique({
    where: { id: args.cycleId, tenantId: args.tenantId },
    select: CYCLE_SELECT,
  })
  if (row === null) return false

  if (isCycleClosed(row.status)) {
    await clearContactListFlag(args.tx, row.id)
    return false
  }

  const settings = await readCycleSettings(args.tx, args.tenantId)
  const hasFuture = await hasFutureAppointment(args.tx, args.tenantId, row.id, args.now)
  const duePassed = row.nextDueDate !== null && row.nextDueDate.getTime() <= args.now.getTime()
  const streak = settings.noShowAddsToContactList
    ? await lastTwoSessionsWereNoShows(args.tx, args.tenantId, row.id)
    : false

  const onList = !hasFuture && (duePassed || streak)
  const nextStatus = cycleStatusFor(row.status, { duePassed, streak })

  await args.tx.treatmentCycle.update({
    where: { id: row.id },
    data: { inContactList: onList, ...(nextStatus === null ? {} : { status: nextStatus }) },
  })

  return onList
}

/**
 * The status the recompute moves the cycle to, or `null` when the row's own is still
 * right.
 *
 * - **`DUE`** when the due day has arrived, which is the sweep's own transition applied
 *   by the same rule that the sweep applies — the desk's page cannot be the one surface
 *   that shows a cycle as `ACTIVE` past its due date.
 * - **`AT_RISK`** when the no-show streak is what put the cycle on the list, and the due
 *   date has not. The two are different questions (see `status.ts`'s header) and the due
 *   one wins precedence, because a cycle that is due is a cycle the desk owes a call
 *   about a specific session.
 *
 * Legal in both cases because the cycle is open when this runs — the closed early return
 * above is what guarantees it, and the guard inside `assertCycleTransition` is the
 * fail-closed answer if that ever changes.
 */
function cycleStatusFor(
  current: string,
  outcome: { readonly duePassed: boolean; readonly streak: boolean },
): CycleStatus | null {
  if (outcome.duePassed) return movedStatus(current, CycleStatus.Due)
  if (outcome.streak) return movedStatus(current, CycleStatus.AtRisk)
  return null
}

/**
 * The status the recompute moves to, or `null` when the row is already on it.
 *
 * The "already there" short-circuit matters here in a way it does not on the appointment
 * sweep: three callers run this recompute and any two can race on the same row, and a
 * transition asserted against a state the row already left would raise where the
 * recompute should have been a no-op.
 */
function movedStatus(current: string, next: CycleStatus): CycleStatus | null {
  if (current === next) return null
  assertCycleTransition(asCycleStatus(current), next)
  return next
}

/**
 * Whether the cycle has an appointment the customer is still expected at.
 *
 * Rule 4's second condition. `gt: now` and not `gte`: a slot in the past is a slot the
 * customer did not come to, and counting it as a future appointment would keep a
 * no-show off the list — which is the exact customer the list exists to surface.
 */
async function hasFutureAppointment(
  tx: TransactionClient,
  tenantId: string,
  cycleId: string,
  now: Date,
): Promise<boolean> {
  const row = await tx.appointment.findFirst({
    where: {
      tenantId,
      cycleId,
      isSlotBlock: false,
      status: { in: [...EXPECTED_STATUSES] },
      scheduledAt: { gt: now },
    },
    select: { id: true },
  })
  return row !== null
}

/**
 * Whether the cycle's two most recent sessions were both no-shows.
 *
 * Read from the rows and not from a counter, so a no-show that the desk converted to a
 * reschedule clears the streak by construction: the closed row is `RESCHEDULED` and not
 * `NO_SHOW`, and the customer who rebooked is not a customer the list should be calling.
 * (`10-testing-strategy.md`'s third scenario is that conversion, end to end.)
 */
async function lastTwoSessionsWereNoShows(
  tx: TransactionClient,
  tenantId: string,
  cycleId: string,
): Promise<boolean> {
  const rows = await tx.appointment.findMany({
    where: { tenantId, cycleId, isSlotBlock: false },
    select: { status: true },
    orderBy: { scheduledAt: 'desc' },
    take: 2,
  })
  return rows.length === 2 && rows.every((row) => row.status === AppointmentStatus.NoShow)
}

/**
 * «رزرو شد» — the booking path's exit from the list, rule 5's first one.
 *
 * Called by the booking action in the same transaction as the appointment it wrote, so a
 * customer who books leaves the list in the request that booked them. The recompute is
 * not needed here because the new appointment *is* the future appointment rule 4's
 * second condition looks for — the flag is the one fact that changed.
 */
export async function noteCycleBooking(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly cycleId: string
}): Promise<void> {
  await clearContactListFlag(args.tx, args.cycleId)
}

/** The one write that takes a cycle off the list, named for the rule it serves. */
async function clearContactListFlag(tx: TransactionClient, cycleId: string): Promise<void> {
  await tx.treatmentCycle.update({
    where: { id: cycleId },
    data: { inContactList: false },
  })
}

/**
 * «نتیجه تماس» — the desk called, and recorded when to try again.
 *
 * `nextContactAt` is the column the list sorts by, and the day the picker hands the
 * action becomes the instant it stores through the library's own conversion, as the
 * follow-up date does in `_customers/actions.ts` — the day the person reads as
 * «۱۴۰۵/۰۳/۰۴» has to land on that day.
 *
 * @throws PermissionError — no `act_on_cycles`.
 * @throws NotFoundError — the cycle is outside the caller's tenant (the 404-not-403
 *   rule, `09-security.md` §6.3).
 * @throws DomainError, as `cycle.closed` — the cycle already ended.
 */
export async function recordContactResult(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly cycleId: string
  /** The instant the next contact is due, built by the action from a `LocalDate`. */
  readonly nextContactAt: Date
  readonly now: Date
}): Promise<void> {
  requirePermission(args.ctx, 'act_on_cycles')

  const row = await loadOwnCycle(args.tx, args.ctx, args.cycleId)
  if (isCycleClosed(row.status)) {
    throw new DomainError(`Cycle ${args.cycleId} is ${row.status} and accepts no contact result.`, {
      messageKey: 'cycle.closed' satisfies CyclesMessageKey,
      detail: { cycleId: args.cycleId, status: row.status },
    })
  }

  await args.tx.treatmentCycle.update({
    where: { id: row.id },
    data: { lastContactAt: args.now, nextContactAt: args.nextContactAt },
  })
}

/**
 * One cycle as the caller's tenant sees it.
 *
 * @throws NotFoundError — the row is outside the caller's tenant. Confirming that
 *   another clinic holds a cycle with this id is a disclosure the refusal must not
 *   make, which is why the guard is a `where` clause and not a post-read check.
 */
export async function loadOwnCycle(
  tx: TransactionClient,
  ctx: TenantContext,
  cycleId: string,
): Promise<{ readonly id: string; readonly status: string }> {
  const row = await tx.treatmentCycle.findFirst({
    where: { id: cycleId, tenantId: ctx.tenantId },
    select: { id: true, status: true },
  })
  if (row === null) {
    throw new NotFoundError(`Cycle ${cycleId} was not found in this tenant.`, {
      messageKey: 'cycle.notFound' satisfies CyclesMessageKey,
      detail: { cycleId },
    })
  }
  return row
}
