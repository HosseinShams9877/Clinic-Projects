/**
 * The hourly next-due sweep — `03-data-model.md` §2.4's index table names
 * `cycle_tenant_due_idx` as "the hourly next-due sweep that flips `ACTIVE` → `DUE`",
 * and this is that sweep.
 *
 * A cycle's due date is a fact about the clock, and the clock moves whether or not a
 * person has a page open. The recompute in `contact-list.ts` is the mechanism; this file
 * is the thing that keeps it running, and the job in `job.ts` is what books the next
 * tick.
 *
 * ## What the sweep may not do
 *
 * Complete an appointment, abandon a cycle, or write anything but the two statuses the
 * recompute can reach. `09-security.md` §8: the worker does not go through
 * `requirePermission` because there is no user and no role to check, and the constraint
 * is kept by the state machine — `refreshContactListForCycle` asks
 * `assertCycleTransition`, and a status the relation does not permit is a status this
 * sweep cannot write. That is what keeps the worker from closing a course a person never
 * closed.
 *
 * ## Why the sweep is also called from the request path
 *
 * The list is read on the request path too (`queries.contactList` calls the recompute for
 * every cycle it reads), so a receptionist who opens the desk sees a due cycle whether
 * or not the worker's tick has landed. That is not a second implementation; it is the
 * same function, and it is idempotent — a cycle already at `DUE` is not moved again,
 * because the query below reads `ACTIVE` rows only.
 *
 * ## Why the sweep is idempotent
 *
 * The `where` clause is the idempotency: the sweep reads `ACTIVE` cycles past their due
 * date, and a cycle it has already moved is a `DUE` one the next run does not read. A
 * repeated run moves nothing, which is DoD 7, and a run that crashed halfway moves the
 * remainder on the next tick rather than double-listing the ones it finished.
 */

import { CycleStatus } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

import { refreshContactListForCycle } from './contact-list'

/** One hour of cycles is a bounded set; a tenant's due courses are not thousands. */
const SWEEP_BATCH = 200

/**
 * Moves every `ACTIVE` cycle past its due date onto the contact list.
 *
 * @returns the ids that entered the list, for the job's own accounting. A cycle that was
 *   already on the list is not among them, because it is not among the rows read.
 */
export async function runCycleDueSweep(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly string[]> {
  const rows = await tx.treatmentCycle.findMany({
    where: {
      tenantId,
      status: CycleStatus.Active,
      nextDueDate: { lte: now },
    },
    select: { id: true },
    take: SWEEP_BATCH,
    orderBy: { nextDueDate: 'asc' },
  })

  const entered: string[] = []
  for (const row of rows) {
    const onList = await refreshContactListForCycle({ tx, tenantId, cycleId: row.id, now })
    if (onList) entered.push(row.id)
  }
  return entered
}
