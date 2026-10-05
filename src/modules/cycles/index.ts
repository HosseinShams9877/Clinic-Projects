/**
 * The `cycles` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its barrel
 * and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — the specifier
 * that reaches into a module's own files is a banned one — so a file that is not listed
 * below does not exist as far as the rest of the repository is concerned.
 *
 * ## What is public
 *
 * The module owns four things the rest of the product needs:
 *
 * 1. The creation path — `recordCompletedSession`, called from the appointments module's
 *    result-recording action, which is the only place a cycle is ever created.
 * 2. The contact list — `refreshContactListForCycle` and `noteCycleBooking`, the two
 *    writes the booking path and the sweep both reach, plus the four reads the three
 *    pages and the customer profile render.
 * 3. The closures — `abandonCycle` and `completeCycle`, the only two writes that reach a
 *    terminal status.
 * 4. The sweep and its job — `runCycleDueSweep` and the handler the worker registry
 *    builds, plus `ensureCycleDueJob`, the seed a settings write calls.
 *
 * Each is exported beside the guards and the constants it needs, for the same reason
 * `roles-permissions` exports its guards: a function a later phase cannot import is a
 * function that gets reimplemented in the module that needed it, and the second
 * implementation is the one that will be wrong.
 *
 * ## What is deliberately not
 *
 * The next-due arithmetic (`nextDueLocalDate`, `nextDueInstant`) is private. The
 * invariant it keeps — a due date is a day, and the day is the session's local day plus
 * the cycle's own interval — is the one DoD 2 asserts, and it is asserted through
 * `recordCompletedSession`, which is the shape the tests speak. A caller that reached
 * past it would be re-deriving the rule the module exists to keep, and would have to
 * rediscover the timezone the rule is told in.
 *
 * The Prisma client is not re-exported. Functions take a `TransactionClient` because the
 * caller opened the scope; the models are the storage, not the surface.
 */

export type {
  CompletedSessionFacts,
  ContactListEntry,
  CyclesMessageKey,
  CycleRow,
  CycleSettings,
} from './types'
export type { CyclesModule } from './types'

export {
  ABANDONMENT_REASON_LABELS,
  CYCLE_STATUS_LABELS,
  MESSAGES,
} from './catalog'

export { recordCompletedSession } from './lib/creation'

export {
  abandonCycle,
  completeCycle,
} from './lib/closure'

export {
  loadOwnCycle,
  noteCycleBooking,
  recordContactResult,
  refreshContactListForCycle,
} from './lib/contact-list'

export {
  clinicCycles,
  contactList,
  customerCycles,
  CYCLE_STATUS_ORDER,
  doctorCycles,
} from './lib/queries'

export {
  CYCLE_DUE_JOB_KIND,
  cycleDueJobHandler,
  CYCLE_TICK_INTERVAL_MS,
  ensureCycleDueJob,
} from './lib/job'

export { runCycleDueSweep } from './lib/sweep'

export {
  CYCLE_TRANSITIONS,
  assertCycleTransition,
  canTransition,
  isCycleClosed,
  OPEN_CYCLE_STATUSES,
  TERMINAL_CYCLE_STATUSES,
} from './lib/status'

export { DEFAULT_CYCLE_SETTINGS, readCycleSettings, readUtcOffsetMinutes } from './lib/settings'
