/**
 * The absence of a deletion — DoD 4.
 *
 * `03-data-model.md` §2.5 and §4.4 forbid a delete path on both halves of the ledger:
 * a payment is corrected by a new `REFUND` row and a debt is settled by a payment, so
 * neither is ever removed. This is the rule that a review could miss and a test cannot,
 * because the violation is a function that does not exist — which is exactly the shape
 * of failure nothing else in the suite would catch.
 *
 * The enumeration is over the two modules' barrels (`02-architecture.md` §10 rule 1: a
 * module is reachable through its barrel and nothing else), because the barrel is the
 * public surface. A private function the module keeps is not a path a caller can take,
 * and a function that is not exported is not one a surface can reach.
 */

import { describe, expect, it } from 'vitest'

import * as debts from '@/modules/debts'
import * as payments from '@/modules/payments'

/**
 * The names a deletion takes, as the vocabulary of the thing the documents forbid.
 *
 * `cancel` is in the list because a payment the clinic cancels is a refund and not a
 * deletion, and a debt the clinic cancels is a payment; a writer with either name would
 * be the delete path wearing the word the domain uses for the reversal.
 */
const DELETION_NAMES = /^(delete|remove|void|cancel|erase|destroy|purge|drop|clear|unset|revert)/i

/** A barrel's own function exports — the runtime surface a caller can reach. */
function exportedFunctions(barrel: object): readonly string[] {
  return Object.entries(barrel)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name)
}

describe('DoD 4 — no module function can delete a payment or a debt', () => {
  it('offers no deletion in either barrel', () => {
    expect(exportedFunctions(payments).filter((name) => DELETION_NAMES.test(name))).toEqual([])
    expect(exportedFunctions(debts).filter((name) => DELETION_NAMES.test(name))).toEqual([])
  })
})
