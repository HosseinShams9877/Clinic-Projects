/**
 * The `settings` module's complete public surface.
 */

export type {
  AppointmentTimings,
  BookingSettings,
  ClinicImagesSettings,
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

export { SETTINGS_TABS, SettingsTab } from './types'

export {
  AUTOMATIC_KIND_LABELS,
  BOOKING_FIELDS,
  BOOKING_MODE_LABELS,
  CYCLE_FIELDS,
  DEPOSIT_REFUND_LABELS,
  IDENTITY_FIELDS,
  IDENTITY_IMAGES_FIELDS,
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
  readClinicImages,
  readCycleTab,
  readIdentity,
  readMessagesTab,
  readOptions,
  readSettingsSurface,
  readWorkingHours,
} from './lib/read'

export {
  saveBooking,
  saveClinicImages,
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