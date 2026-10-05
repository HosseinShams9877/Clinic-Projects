/**
 * The five-status cycle state machine — `03-data-model.md` §2.4.
 *
 * The specification states the five statuses and the rules that move between them
 * (`03-data-model.md` §2.4.1); it does not spell out the full transition relation,
 * and this file is that relation. Every status write in the module goes through
 * `assertCycleTransition`, so a move this table does not name is a move nobody can
 * make.
 *
 * ## The relation
 *
 * | From | To | Who |
 * |---|---|---|
 * | — | `ACTIVE` | the first completed session (rule 1) |
 * | `ACTIVE` | `DUE` | the hourly sweep, when the due day arrives |
 * | `ACTIVE` \| `DUE` | `AT_RISK` | two consecutive no-shows (`04-roles-permissions.md` §5) |
 * | `ACTIVE` \| `DUE` \| `AT_RISK` | `COMPLETED` | the last session, or the manager |
 * | `ACTIVE` \| `DUE` \| `AT_RISK` | `ABANDONED` | منشی, with a reason from the closed list |
 *
 * ## What the table deliberately does not permit
 *
 * `COMPLETED` and `ABANDONED` are **terminal**. Nothing leaves them, which is what
 * makes a completed course a fact the «دوره تکمیل شده» group can be defined on and
 * an abandoned one a fact the drop-off report counts. A completed cycle that could be
 * reopened would be a course the retention reports cannot close.
 *
 * `DUE` never goes back to `ACTIVE`: a cycle whose day has arrived is a cycle the desk
 * owes a call, and the only honest way off the list is the booking, the abandonment or
 * the completion. The next completed session sets `ACTIVE` again — but through the
 * *session*, not through a transition on the status column, because the session is the
 * event and the status is its shadow.
 *
 * ## Why `AT_RISK` is a status and not a flag
 *
 * The two states answer different questions. `inContactList` is "is this row on the
 * desk's list right now"; `AT_RISK` is "has this customer stopped coming", and it is
 * the state the drop-off analysis groups by. Keeping them separate is what lets a
 * cycle leave the list on a booking and still be counted as at-risk afterwards.
 */

import { CycleStatus, type CycleStatus as Status } from '@/core/constants'
import { DomainError } from '@/core/types'

import type { CyclesMessageKey } from '../catalog'

/**
 * Every transition the cycle permits.
 *
 * The keys are read from `CycleStatus` rather than listed, so a status added to the
 * constants without a row here is a status nothing can reach — and the record is
 * `Record<Status, readonly Status[]>`, which makes a missing *from*-state a compile
 * error.
 */
export const CYCLE_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = Object.freeze({
  ACTIVE: [CycleStatus.Due, CycleStatus.AtRisk, CycleStatus.Completed, CycleStatus.Abandoned],
  DUE: [CycleStatus.AtRisk, CycleStatus.Completed, CycleStatus.Abandoned],
  AT_RISK: [CycleStatus.Completed, CycleStatus.Abandoned],
  COMPLETED: [],
  ABANDONED: [],
})

/**
 * The states a cycle is still in play from — the three that can reach a terminal one.
 *
 * A cycle in any of these is a course the clinic is still working, and the one a new
 * completed session extends.
 */
export const OPEN_CYCLE_STATUSES: readonly Status[] = Object.freeze([
  CycleStatus.Active,
  CycleStatus.Due,
  CycleStatus.AtRisk,
])

/** The two states no transition leaves. */
export const TERMINAL_CYCLE_STATUSES: readonly Status[] = Object.freeze([
  CycleStatus.Completed,
  CycleStatus.Abandoned,
])

/**
 * Whether the transition from `current` to `next` is legal.
 *
 * Falls through to `false` for a `current` the table has no row for. The column is a
 * plain `String` (`03-data-model.md` §5), so a status written by a release this one
 * does not know can reach this function, and the fail-closed answer is the refusal.
 */
export function canTransition(current: Status, next: Status): boolean {
  return (CYCLE_TRANSITIONS[current] ?? []).includes(next)
}

/** Whether `status` is one no transition leaves. */
export function isCycleClosed(status: string): boolean {
  return (TERMINAL_CYCLE_STATUSES as readonly string[]).includes(status)
}

/**
 * The transition guard every status write goes through.
 *
 * @throws DomainError, as `cycle.closed` — the cycle already ended, and the sentence
 *   names the reload because the list underneath the form moved while the person was
 *   filling it in.
 */
export function assertCycleTransition(current: Status, next: Status): void {
  if (canTransition(current, next)) return

  throw new DomainError(
    `A cycle in ${current} cannot move to ${next}. The legal targets from ${current} are ` +
      `${CYCLE_TRANSITIONS[current].join(', ') || 'none — the cycle is closed'}.`,
    {
      messageKey: 'cycle.closed' satisfies CyclesMessageKey,
      messageParams: { current, next },
      detail: { current, next, legal: CYCLE_TRANSITIONS[current] },
    },
  )
}

/**
 * The status column's value as the state machine's own union.
 *
 * The column is a plain `String` on both engines (`03-data-model.md` §5), so the
 * database cannot narrow it. The value came from `CycleStatus` when it was written and
 * this module is the only writer, but a row written by a release this one does not know
 * is still a possibility — and `canTransition`'s fall-through is the fail-closed answer
 * to it.
 */
export function asCycleStatus(value: string): Status {
  return value as Status
}
