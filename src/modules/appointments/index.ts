/**
 * The `appointments` module's complete public surface.
 */

export type {
  BookArgs,
  BookingSettings,
  CreatedAppointment,
  DoctorShiftRangeInput,
  DoctorShiftRangeRow,
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
  updateAppointment,
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

export {
  clinicDay,
  doctorDay,
  doctorsOnDay,
  doctorsForService,
  doctorWindowsOnDay,
  unrecordedCartable,
  unrecordedOnDay,
  weekDays,
  workingWeekdaysForDoctor,
} from './lib/queries'

export {
  readDoctorWorkingHours,
  setDoctorWorkingHours,
  type DoctorHoursRow,
} from './lib/working-hours'

export {
  readDoctorShiftRanges,
  setDoctorShiftRanges,
  slotMinutesForDoctor,
  DEFAULT_SLOT_MINUTES,
} from './lib/shift-ranges'

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