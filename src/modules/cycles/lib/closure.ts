/**
 * Closing a course — the abandonment and the completion, `03-data-model.md` §2.4.1
 * rules 5 and 6.
 *
 * The two are one file because they are the two writes that reach a terminal status, and
 * they share the one thing a terminal write has to keep: nothing that follows may move
 * the row. `status.ts`'s relation is what keeps it, and the two functions below are the
 * only callers that reach its two terminal arms.
 *
 * ## Why the abandonment reason is a type and not a check
 *
 * Rule 6: `abandonmentReason` is a closed list — قیمت / نتیجه نگرفت / عوارض / دور بودن
 * مسیر / وقت نداشتن / نامشخص — because "free text is not analysable, and this list is
 * what tells the manager whether the problem is price or outcome". The parameter is the
 * union itself, so a caller that names a reason the list does not hold does not compile;
 * the runtime check is for the string that arrives from a form, which is `unknown`-ish
 * until it is narrowed, and the sentence it raises names the list rather than the
 * invalidity.
 *
 * That is also why the column stores the *key* and the page renders the label: the key
 * is what the drop-off report groups by, and the label is Persian copy that a rename of
 * the catalogue must not rewrite on every historical row.
 *
 * ## Why a completion is a separate write
 *
 * A bounded course reaches `COMPLETED` on its own when its last session lands. An
 * unbounded one — `defaultSessions = 0`, the maintenance treatment with no final
 * session — has no total to reach, and the manager declares it finished from the page.
 * The write is the manager's own authority and not the desk's, which is why it gates on
 * `act_on_cycles` and the cycle's own creation does not.
 */

import { AbandonmentReason, CycleStatus, isMember } from '@/core/constants'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { DomainError, ValidationError } from '@/core/types'
import { requirePermission } from '@/modules/roles-permissions'

import type { CyclesMessageKey } from '../catalog'
import { asCycleStatus, assertCycleTransition, isCycleClosed } from './status'
import { loadOwnCycle } from './contact-list'

/**
 * «منصرف شد» — closes the cycle with a reason from the closed list, and takes it off
 * the desk's list.
 *
 * The row stays. An abandoned cycle is a fact the drop-off report counts, and a delete
 * path would make the clinic's own retention numbers unreadable — the same rule that
 * keeps a lost lead and a deactivated service in place, and for the same reason.
 *
 * @throws PermissionError — no `act_on_cycles`.
 * @throws NotFoundError — the cycle is outside the caller's tenant (`09-security.md`
 *   §6.3's 404-not-403 rule).
 * @throws ValidationError, as `cycle.reasonNotFromList` — the reason is not one of the
 *   six, and no free text reaches the column.
 * @throws DomainError, as `cycle.closed` — the cycle already ended.
 */
export async function abandonCycle(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly cycleId: string
  readonly reason: AbandonmentReason
  readonly now: Date
}): Promise<void> {
  requirePermission(args.ctx, 'act_on_cycles')
  assertReasonFromList(args.reason)

  const row = await loadOwnCycle(args.tx, args.ctx, args.cycleId)
  if (isCycleClosed(row.status)) {
    throw closedCycleError(args.cycleId, row.status)
  }
  assertCycleTransition(asCycleStatus(row.status), CycleStatus.Abandoned)

  await args.tx.treatmentCycle.update({
    where: { id: row.id },
    data: {
      status: CycleStatus.Abandoned,
      abandonmentReason: args.reason,
      inContactList: false,
      nextContactAt: null,
    },
  })
}

/**
 * «تکمیل دوره» — declares a course finished, which an unbounded one needs.
 *
 * The customer enters the «دوره تکمیل شده» audience group by this write: the group is a
 * saved query over the cycle row (`03-data-model.md` §2.7), so a cycle at `COMPLETED`
 * *is* the group's membership, and the predicate and the seed are Phase 7's to write
 * against the status this produces.
 *
 * @throws PermissionError — no `act_on_cycles`.
 * @throws NotFoundError — the cycle is outside the caller's tenant.
 * @throws DomainError, as `cycle.closed` — the cycle already ended.
 */
export async function completeCycle(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly cycleId: string
  readonly now: Date
}): Promise<void> {
  requirePermission(args.ctx, 'act_on_cycles')

  const row = await loadOwnCycle(args.tx, args.ctx, args.cycleId)
  if (isCycleClosed(row.status)) {
    throw closedCycleError(args.cycleId, row.status)
  }
  assertCycleTransition(asCycleStatus(row.status), CycleStatus.Completed)

  await args.tx.treatmentCycle.update({
    where: { id: row.id },
    data: {
      status: CycleStatus.Completed,
      inContactList: false,
      nextContactAt: null,
    },
  })
}

/**
 * Whether a reason is one of the six the closed list holds.
 *
 * The parameter's type is the union, so this is unreachable from a caller that names a
 * member — and reachable from the one that forwards a form's string, which is the caller
 * the closed list exists for. A `ValidationError` and not a `DomainError`: the caller
 * typed something the product does not accept, and the sentence names the fix.
 *
 * @throws ValidationError, as `cycle.reasonNotFromList`.
 */
function assertReasonFromList(reason: string): void {
  if (isMember(AbandonmentReason, reason)) return

  throw new ValidationError(
    `Reason ${JSON.stringify(reason)} is not one of the six abandonment reasons: ` +
      `${Object.keys(AbandonmentReason).join(', ')}.`,
    {
      messageKey: 'cycle.reasonNotFromList' satisfies CyclesMessageKey,
      detail: { reason },
    },
  )
}

/** The sentence and the status for a write a closed cycle refuses, built once. */
function closedCycleError(cycleId: string, status: string): DomainError {
  return new DomainError(`Cycle ${cycleId} is ${status} and cannot be closed again.`, {
    messageKey: 'cycle.closed' satisfies CyclesMessageKey,
    detail: { cycleId, status },
  })
}
