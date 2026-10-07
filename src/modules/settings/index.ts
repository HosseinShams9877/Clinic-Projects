/**
 * The `settings` module's complete public surface — `02-architecture.md` §10 rule 2:
 * "If something is not in the barrel, it is private."
 *
 * The module owns the six tabs of `admin/settings.html`: the clinic's identity, the
 * booking mode and the appointment lifecycle timings, the working hours and
 * holidays, the cycle engine's two defaults, every automatic message's text and
 * channel, and the eight toggles beside the override declaration.
 *
 * ## Who reads what
 *
 * The five toggles that already gate a write path keep their own readers — each is
 * in the module whose behaviour it shapes, and the settings module does not take
 * them over. What is here is the surface those five's *screen* needs, plus
 * `requireToggle`, the gate the three toggles that had no gate now call.
 *
 * ## What is deliberately not here
 *
 * The `appointments` module's own booking settings, the `messages` module's own send
 * settings and the `cycles` module's own cycle settings are reached through their
 * barrels. A second copy of any of them here would be a copy that disagrees with the
 * module that enforces it.
 */

export type {
  AppointmentTimings,
  BookingSettings,
  CycleTabSettings,
  DeclaredOverrideRow,
  HolidayRow,
  IdentitySettings,
  MessageTemplateEdit,
  MessagesTabSettings,
  OptionsSettings,
  ShiftRow,
  TenantSettingsSurface,
  WorkingHoursSettings,
} from './types'

// `SettingsTab` is both the six codes the page switches on and the union the
// `?tab=` value narrows to, so the value export carries the type with it.
export { SETTINGS_TABS, SettingsTab } from './types'

export {
  AUTOMATIC_KIND_LABELS,
  BOOKING_FIELDS,
  BOOKING_MODE_LABELS,
  CYCLE_FIELDS,
  DEPOSIT_REFUND_LABELS,
  IDENTITY_FIELDS,
  MESSAGES,
  MESSAGES_FIELDS,
  OPTIONS_FIELDS,
  SETTINGS_FIELDS,
  SETTINGS_TAB_LABELS,
  SETTINGS_TAB_LEADS,
  TOGGLE_LABELS,
  WEEKDAY_LABELS,
  WORKING_HOURS_FIELDS,
} from './catalog'
export type { SettingsMessageKey } from './catalog'

export { readToggles, requireToggle, toggleEnabled, writeToggles } from './lib/toggles'

export {
  readBooking,
  readCycleTab,
  readIdentity,
  readMessagesTab,
  readOptions,
  readSettingsSurface,
  readWorkingHours,
} from './lib/read'

export {
  saveBooking,
  saveCycleTab,
  saveIdentity,
  saveMessagesTab,
  saveToggles,
  saveWorkingHours,
} from './lib/write'

export {
  removeOverrideDeclaration,
  setOverrideDeclaration,
} from './lib/overrides'
export type { OverrideAuditDetail } from './lib/overrides'

// The Zod schemas the actions parse their payloads with — `03-data-model.md` §5 makes
// the boundary the place a form's strings become the typed values a write takes.
export {
  bookingSchema,
  cycleSchema,
  holidaySchema,
  identitySchema,
  messagesSchema,
  overrideDeclarationSchema,
  shiftSchema,
  workingHoursSchema,
} from './validation/schema'
