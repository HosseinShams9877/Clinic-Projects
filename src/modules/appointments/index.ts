/**
 * The `appointments` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its
 * barrel and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — `@/modules/*​/*`
 * is a banned specifier — so a file that is not listed below does not exist as far as
 * the rest of the repository is concerned.
 *
 * ## What is public
 *
 * The module owns the eight-state lifecycle, the slot generator, the booking path and
 * the three grid queries — the surface every scheduling page and the worker's
 * lifecycle job are built on. Each is exported beside the guards it needs, for the
 * same reason `roles-permissions` exports its guards: a function a later phase cannot
 * import is a function that gets reimplemented in the module that needed it, and the
 * second implementation is the one that will be wrong.
 *
 * ## What is deliberately not
 *
 * The slot generator's internals (`slotsInRange`, `isCovered`) are private. The
 * invariant they keep — a slot is removed when a block covers its whole duration —
 * is the one DoD 6 asserts, and it is asserted through `generateSlots` and
 * `blockRanges`, which are the shape the tests speak. A caller that reached past them
 * would be re-deriving the rule the module exists to keep.
 *
 * The Prisma client is not re-exported. Functions take a `TransactionClient` because
 * the caller opened the scope; the models are the storage, not the surface.
 */

export type {
  BookArgs,
  BookingSettings,
  CreatedAppointment,
  TransitionRow,
} from './types'
export type { AppointmentsModule } from './types'
export type {
  AppointmentRow,
  AppointmentsMessageKey,
  DoctorColumn,
  Range,
  Slot,
  SlotDay,
} from './types'
export type { DoctorDayWindow } from './lib/queries'

export {
  APPOINTMENT_STATUS_LABELS,
  BOOKING_MODE_LABELS,
  CUSTOMER_APPOINTMENTS_PAGE,
  MESSAGES,
  TIME_RANGE_EVENING,
  TIME_RANGE_MORNING,
} from './catalog'

export {
  blockHours,
  bookAppointment,
  bookOwnAppointment,
  bookPublicAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from './lib/book'

export type { PublicBookArgs, PublicBookingContext } from './lib/book'

export { readBookingSettings, DEFAULT_BOOKING_SETTINGS } from './lib/settings'

export { blockRanges, generateSlots, workingRange } from './lib/slots'

export {
  APPOINTMENT_TRANSITIONS,
  assertTransition,
  canTransition,
  CARTABLE_STATUSES,
  isSweepTransition,
  isTerminal,
  SWEEP_TRANSITIONS,
  TERMINAL_STATUSES,
} from './lib/status'

export { recordArrival, recordNoShow, recordResult } from './lib/transition'

export { flagUnrecordedResults, promoteToAwaitingArrival, runLifecycleSweep } from './lib/lifecycle'

export {
  APPOINTMENT_LIFECYCLE_JOB_KIND,
  ensureLifecycleJob,
  lifecycleJobHandler,
  LIFECYCLE_TICK_INTERVAL_MS,
} from './lib/job'

export { clinicDay, doctorDay, doctorsOnDay, doctorWindowsOnDay, unrecordedCartable, unrecordedOnDay, weekDays } from './lib/queries'

export {
  CUSTOMER_CANCEL_WINDOW_MS,
  cancelOwnAppointment,
  customerAppointments,
  rescheduleOwnAppointment,
} from './lib/own-panel'
export type {
  CustomerCancellation,
  OwnAppointmentHistory,
  OwnAppointmentRow,
} from './lib/own-panel'
