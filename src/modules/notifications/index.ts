/**
 * The `notifications` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its barrel
 * and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — the specifier
 * that reaches into a module's own files is a banned one — so a file that is not listed
 * below does not exist as far as the rest of the repository is concerned.
 *
 * ## What is public
 *
 * The module owns the seven automatic messages, and four things the rest of the product
 * needs:
 *
 * 1. **The triggers** — `collectAutomaticCandidates`, the seven evaluations the
 *    dispatcher runs. Each is a read of domain state against the clock, and none of
 *    them reads the ledger.
 * 2. **Consent** — `hasChannelConsent`, the hard filter a send is checked against
 *    before anything is written.
 * 3. **The desk's feed** — `todaysReminders`, the day's sends and suppressions.
 * 4. **The catalog** — the seven labels and their timings, which the desk renders and
 *    the «پیامها» settings tab will render from when Phase 10 gives it an editing
 *    surface.
 *
 * ## What is deliberately not
 *
 * The send. Writing the ledger row and calling the gateway belong to `messages`,
 * because the ledger is the send log and the gateway is the adapter it talks through.
 * This module decides whether a message is due and whether the customer may receive
 * it; the other one delivers it. A second module that delivered would be a second
 * place the duplicate window was enforced, and the two would disagree about who was
 * notified.
 *
 * The Prisma client is not re-exported. Functions take a `TransactionClient` because
 * the caller opened the scope — the dispatcher runs inside the worker's job
 * transaction, and the desk's read inside the request's.
 */

export type {
  AutomaticCandidate,
  DispatchOutcome,
  NotificationsMessageKey,
  ReminderRow,
  SuppressedReason,
} from './types'
export type { NotificationsModule } from './types'

export {
  AUTOMATIC_KIND_LABELS,
  AUTOMATIC_KIND_TIMING,
  HELD_LABELS,
  MESSAGES,
} from './catalog'

export { collectAutomaticCandidates, customerName } from './lib/triggers'

export { hasChannelConsent } from './lib/consent'

export { todaysReminders } from './lib/today'
