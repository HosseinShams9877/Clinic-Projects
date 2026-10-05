/**
 * The closed sets of `docs/knowledge/06-constants.md` §4.
 *
 * Every value here is defined **once**, in this module, and imported everywhere
 * (§7 rule 1). A repeated literal anywhere else in the codebase is a defect.
 *
 * The shape is `as const` object plus a derived union — never a native `enum`
 * (`05-conventions.md` §2). Native enums emit runtime code, do not map to a
 * portable database column, and interact badly with `isolatedModules`. These
 * sets are stored as `String` columns because native database enums are not
 * portable across SQLite and PostgreSQL (`03-data-model.md` §5).
 *
 * Persian labels do **not** live here. They live in the localization catalog,
 * keyed by these codes (`07-localization.md` §7.2, `06-constants.md` §7 rule 3),
 * so that a missing label is a compile error rather than a blank on a screen.
 */

/* ── 4.1 Roles ────────────────────────────────────────────────────────────── */

export const Role = {
  Manager: 'MANAGER',
  Doctor: 'DOCTOR',
  Secretary: 'SECRETARY',
} as const
export type Role = (typeof Role)[keyof typeof Role]

/** Document order of §4.1 — used by the permission matrix and its tests. */
export const ROLES = [Role.Manager, Role.Doctor, Role.Secretary] as const

/* ── 4.2 Permissions ──────────────────────────────────────────────────────── */

export const Permission = {
  ViewOwnSchedule: 'view_own_schedule',
  ViewAllSchedules: 'view_all_schedules',
  ManageAppointments: 'manage_appointments',
  RecordAppointmentResult: 'record_appointment_result',
  ViewOwnCustomerRecords: 'view_own_customer_records',
  ViewAllCustomers: 'view_all_customers',
  ViewDebts: 'view_debts',
  RecordPayment: 'record_payment',
  FollowUpDebt: 'follow_up_debt',
  ViewOwnCycles: 'view_own_cycles',
  ActOnCycles: 'act_on_cycles',
  ManageLeads: 'manage_leads',
  ManageCampaigns: 'manage_campaigns',
  ManageServices: 'manage_services',
  ManageClinicSettings: 'manage_clinic_settings',
  ManageUsers: 'manage_users',
} as const
export type Permission = (typeof Permission)[keyof typeof Permission]

/**
 * The 16 permissions in their documented order 1–16.
 *
 * The order is load-bearing: `03` numbers the matrix by it, the role defaults in
 * §2.1 are stated as ranges over it («SECRETARY = 1–12»), and the test suite
 * identifies each of the 96 cases by it. A set is not enough; the sequence is
 * part of the specification.
 */
export const PERMISSIONS = [
  Permission.ViewOwnSchedule,
  Permission.ViewAllSchedules,
  Permission.ManageAppointments,
  Permission.RecordAppointmentResult,
  Permission.ViewOwnCustomerRecords,
  Permission.ViewAllCustomers,
  Permission.ViewDebts,
  Permission.RecordPayment,
  Permission.FollowUpDebt,
  Permission.ViewOwnCycles,
  Permission.ActOnCycles,
  Permission.ManageLeads,
  Permission.ManageCampaigns,
  Permission.ManageServices,
  Permission.ManageClinicSettings,
  Permission.ManageUsers,
] as const satisfies readonly Permission[]

/* ── 4.3 Appointment status ───────────────────────────────────────────────── */

export const AppointmentStatus = {
  Booked: 'BOOKED',
  AwaitingArrival: 'AWAITING_ARRIVAL',
  Arrived: 'ARRIVED',
  Completed: 'COMPLETED',
  NoShow: 'NO_SHOW',
  Cancelled: 'CANCELLED',
  Rescheduled: 'RESCHEDULED',
  ResultNotRecorded: 'RESULT_NOT_RECORDED',
} as const
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus]

/** §4.3 — four statuses the system sets, four a person records. */
export const AUTOMATIC_APPOINTMENT_STATUSES = [
  AppointmentStatus.Booked,
  AppointmentStatus.AwaitingArrival,
  AppointmentStatus.ResultNotRecorded,
  AppointmentStatus.Cancelled,
] as const satisfies readonly AppointmentStatus[]

export const MANUAL_APPOINTMENT_STATUSES = [
  AppointmentStatus.Arrived,
  AppointmentStatus.Completed,
  AppointmentStatus.NoShow,
  AppointmentStatus.Rescheduled,
] as const satisfies readonly AppointmentStatus[]

/* ── 4.4 Booking modes ────────────────────────────────────────────────────── */

export const BookingMode = {
  FixedSlot: 'FIXED_SLOT',
  TimeRange: 'TIME_RANGE',
  Request: 'REQUEST',
} as const
export type BookingMode = (typeof BookingMode)[keyof typeof BookingMode]

/* ── 4.5 Cycle status ─────────────────────────────────────────────────────── */

export const CycleStatus = {
  Active: 'ACTIVE',
  Due: 'DUE',
  AtRisk: 'AT_RISK',
  Completed: 'COMPLETED',
  Abandoned: 'ABANDONED',
} as const
export type CycleStatus = (typeof CycleStatus)[keyof typeof CycleStatus]

/* ── 4.6 Abandonment reasons ──────────────────────────────────────────────── */

export const AbandonmentReason = {
  Price: 'PRICE',
  NoResult: 'NO_RESULT',
  SideEffects: 'SIDE_EFFECTS',
  Distance: 'DISTANCE',
  NoTime: 'NO_TIME',
  Unknown: 'UNKNOWN',
} as const
export type AbandonmentReason = (typeof AbandonmentReason)[keyof typeof AbandonmentReason]

/* ── 4.7 Acquisition sources ──────────────────────────────────────────────── */

export const AcquisitionSource = {
  Instagram: 'INSTAGRAM',
  WhatsApp: 'WHATSAPP',
  Website: 'WEBSITE',
  Phone: 'PHONE',
  Referral: 'REFERRAL',
} as const
export type AcquisitionSource = (typeof AcquisitionSource)[keyof typeof AcquisitionSource]

/* ── 4.8 Campaign types ───────────────────────────────────────────────────── */

export const CampaignType = {
  Birthday: 'BIRTHDAY',
  Winback: 'WINBACK',
  NextSession: 'NEXT_SESSION',
  Occasion: 'OCCASION',
  NewService: 'NEW_SERVICE',
  DebtReminder: 'DEBT_REMINDER',
  Survey: 'SURVEY',
  Loyalty: 'LOYALTY',
} as const
export type CampaignType = (typeof CampaignType)[keyof typeof CampaignType]

/* ── 4.9 Audience groups — the built-in set ───────────────────────────────── */

export const AudienceGroupKey = {
  Birthday: 'BIRTHDAY',
  Dormant: 'DORMANT',
  CycleDue: 'CYCLE_DUE',
  Loyal: 'LOYAL',
  Debtors: 'DEBTORS',
  New: 'NEW',
  CompletedCourse: 'COMPLETED_COURSE',
  OneTimers: 'ONE_TIMERS',
} as const
export type AudienceGroupKey = (typeof AudienceGroupKey)[keyof typeof AudienceGroupKey]

/** §4.9 — the eight built-ins, in documented order. */
export const BUILT_IN_AUDIENCE_GROUPS = [
  AudienceGroupKey.Birthday,
  AudienceGroupKey.Dormant,
  AudienceGroupKey.CycleDue,
  AudienceGroupKey.Loyal,
  AudienceGroupKey.Debtors,
  AudienceGroupKey.New,
  AudienceGroupKey.CompletedCourse,
  AudienceGroupKey.OneTimers,
] as const satisfies readonly AudienceGroupKey[]

/* ── 4.10 Automatic messages ──────────────────────────────────────────────── */

export const AutomaticMessageKind = {
  BookingConfirmation: 'BOOKING_CONFIRMATION',
  AppointmentReminder: 'APPOINTMENT_REMINDER',
  Aftercare: 'AFTERCARE',
  NextSessionReminder: 'NEXT_SESSION_REMINDER',
  BalanceReminder: 'BALANCE_REMINDER',
  NoShowFollowUp: 'NO_SHOW_FOLLOW_UP',
  Survey: 'SURVEY',
} as const
export type AutomaticMessageKind =
  (typeof AutomaticMessageKind)[keyof typeof AutomaticMessageKind]

/**
 * §4.10 send rules — "at most one automatic message per person per day", by
 * priority: next-session appointment → financial → survey.
 *
 * The order of this list *is* the priority. It is a constant rather than a
 * comment because the dispatch rule in `notifications` reads it, and a
 * reordering that silently changed which message a customer receives would be
 * invisible in review.
 */
export const AUTOMATIC_MESSAGE_PRIORITY = [
  AutomaticMessageKind.NextSessionReminder,
  AutomaticMessageKind.BookingConfirmation,
  AutomaticMessageKind.AppointmentReminder,
  AutomaticMessageKind.Aftercare,
  AutomaticMessageKind.NoShowFollowUp,
  AutomaticMessageKind.BalanceReminder,
  AutomaticMessageKind.Survey,
] as const satisfies readonly AutomaticMessageKind[]

/* ── 4.11 Debt buckets ────────────────────────────────────────────────────── */

export const DebtBucket = {
  Over30Days: 'OVER_30_DAYS',
  Over7Days: 'OVER_7_DAYS',
  PastDue: 'PAST_DUE',
  DueSoon: 'DUE_SOON',
} as const
export type DebtBucket = (typeof DebtBucket)[keyof typeof DebtBucket]

/* ── 4.12 Channels ────────────────────────────────────────────────────────── */

export const Channel = {
  Sms: 'SMS',
  WhatsApp: 'WHATSAPP',
} as const
export type Channel = (typeof Channel)[keyof typeof Channel]

/* ── Sets `03-data-model.md` enumerates inline ────────────────────────────────
 *
 * These are not in `06-constants.md` §4, but §4 is not the only place the
 * specification closes a set: `03` states each of these as a parenthesised list
 * of values on the column that holds it. They belong here for the same reason —
 * defined once, imported everywhere — and they are listed separately so that the
 * difference is visible rather than implied.
 * ------------------------------------------------------------------------- */

/** `03-data-model.md` §2.2 — `Appointment.source`. */
export const AppointmentSource = {
  Website: 'WEBSITE',
  Reception: 'RECEPTION',
  Phone: 'PHONE',
  Instagram: 'INSTAGRAM',
  Campaign: 'CAMPAIGN',
} as const
export type AppointmentSource = (typeof AppointmentSource)[keyof typeof AppointmentSource]

/** `03-data-model.md` §2.5 — `Payment.method`. */
export const PaymentMethod = {
  Cash: 'CASH',
  Card: 'CARD',
  Online: 'ONLINE',
} as const
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

/** `03-data-model.md` §2.5 — `Payment.kind`. */
export const PaymentKind = {
  Deposit: 'DEPOSIT',
  Partial: 'PARTIAL',
  Final: 'FINAL',
  Refund: 'REFUND',
} as const
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind]

/** `03-data-model.md` §2.6 — `Campaign.scheduleKind`. */
export const CampaignScheduleKind = {
  OneTime: 'ONE_TIME',
  DailyAt: 'DAILY_AT',
  MonthlyDay: 'MONTHLY_DAY',
} as const
export type CampaignScheduleKind =
  (typeof CampaignScheduleKind)[keyof typeof CampaignScheduleKind]

/** `03-data-model.md` §2.6 — `Campaign.status`. */
export const CampaignStatus = {
  Draft: 'DRAFT',
  AwaitingApproval: 'AWAITING_APPROVAL',
  Approved: 'APPROVED',
  Active: 'ACTIVE',
  Paused: 'PAUSED',
  Finished: 'FINISHED',
} as const
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus]

/** `03-data-model.md` §2.6 — `MessageSend.status`. */
export const MessageSendStatus = {
  Queued: 'QUEUED',
  Sent: 'SENT',
  Delivered: 'DELIVERED',
  Failed: 'FAILED',
  Suppressed: 'SUPPRESSED',
} as const
export type MessageSendStatus = (typeof MessageSendStatus)[keyof typeof MessageSendStatus]

/** `03-data-model.md` §2.1 — `Customer.leadStatus`, the lead cartable's four states. */
export const LeadStatus = {
  New: 'NEW',
  Following: 'FOLLOWING',
  Converted: 'CONVERTED',
  Lost: 'LOST',
} as const
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus]

/** `03-data-model.md` §6 — `LeaveRequest.status`, the approval path a leave takes. */
export const LeaveRequestStatus = {
  Pending: 'PENDING',
  Approved: 'APPROVED',
  Rejected: 'REJECTED',
} as const
export type LeaveRequestStatus =
  (typeof LeaveRequestStatus)[keyof typeof LeaveRequestStatus]

/** `03-data-model.md` §2.1 — `Customer.lifecycle`. */
export const CustomerLifecycle = {
  Lead: 'LEAD',
  Customer: 'CUSTOMER',
} as const
export type CustomerLifecycle = (typeof CustomerLifecycle)[keyof typeof CustomerLifecycle]

/** `03-data-model.md` §2.3 — `Service.category`. */
export const ServiceCategory = {
  Skin: 'SKIN',
  Laser: 'LASER',
  Injection: 'INJECTION',
  Hair: 'HAIR',
} as const
export type ServiceCategory = (typeof ServiceCategory)[keyof typeof ServiceCategory]

/* ── Run-time validators ──────────────────────────────────────────────────────
 *
 * The database does not enforce these sets (`03-data-model.md` §5), so every
 * boundary does — `05-conventions.md` §5. A module function receives an already
 * validated value and never re-parses.
 * ------------------------------------------------------------------------- */

/**
 * True when `value` is a member of a closed set, narrowing the type.
 *
 * The set may be spelled either way the constants declare one — an object enum like
 * `CustomerLifecycle`, or a `readonly` array like `MODULES` — because both are the
 * same closed set and a caller should not have to re-spell one to test membership.
 */
export function isMember<T extends string>(
  set: Readonly<Record<string, T>> | readonly T[],
  value: unknown,
): value is T {
  const members: readonly T[] = Array.isArray(set) ? set : (Object.values<string>(set) as T[])
  return typeof value === 'string' && (members as readonly string[]).includes(value)
}
