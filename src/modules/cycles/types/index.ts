/**
 * The `cycles` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel so an override cannot
 * accidentally satisfy it by exporting something adjacent.
 *
 * ## What the contract covers
 *
 * The module's **values**, because those are what the registry loads and a caller
 * calls. The row shapes this module exports (`CycleRow`, `ContactListEntry`,
 * `CycleSettings`) travel with `types/` and are re-exported by an override's own
 * barrel; they are not members of a value interface.
 *
 * ## What the contract deliberately omits
 *
 * The Prisma client. Every function takes a `TransactionClient` because the caller
 * already opened the tenant scope (`02-architecture.md` §11). The model names are not
 * in the contract, so an override that stores its rows differently still conforms as
 * long as it answers the same questions — which is the whole point of the cycle
 * engine being a module and not a set of join queries.
 */

import type { AbandonmentReason, CycleStatus } from '@/core/constants'
import type { TenantContext, TransactionClient } from '@/core/db/scope'
import type { LocalDate } from '@/core/localization'

import type { CyclesMessageKey } from '../catalog'

/**
 * The facts of one completed session, as the module that owns the lifecycle hands
 * them over.
 *
 * `appointments` records the transition and returns the row; this module takes the
 * facts and builds the cycle from them. The two modules never reach into each other's
 * tables, and this shape is the seam — a completed appointment is the *only* thing
 * that creates a cycle (`03-data-model.md` §2.4.1 rule 1), so it is the only seam
 * there is.
 *
 * `scheduledAt` is both `startedAt` and `lastSessionAt` on the row the first session
 * creates, which is what makes a retried completion land on the same unique key and
 * therefore on the same row.
 */
export interface CompletedSessionFacts {
  /** The appointment the completion was recorded on. */
  readonly appointmentId: string
  readonly customerId: string
  readonly serviceId: string
  /** The `User` id, as every `doctorId` in the schema holds (`03-data-model.md` §2.3). */
  readonly doctorId: string
  /** The slot the session occupied — the cycle's `startedAt`. */
  readonly scheduledAt: Date
}

/**
 * The cycle the contact list and the oversight tables render.
 *
 * The service and doctor names are read through the **live** relations and not from a
 * snapshot, because `Appointment` holds no `serviceName` and neither does
 * `TreatmentCycle` — Phase 3 established that the catalogue's name is a value the
 * catalogue may change, and the cycle UI renders what the row points at. See
 * `reports/phase-03-report.md` §5 for the issue this records.
 */
export interface CycleRow {
  readonly id: string
  readonly customerId: string
  readonly customerName: string
  readonly serviceId: string
  readonly serviceName: string
  readonly doctorId: string
  readonly doctorName: string
  readonly intervalDays: number
  readonly totalSessions: number
  readonly completedSessions: number
  readonly currentSessionNumber: number
  readonly startedAt: Date
  readonly lastSessionAt: Date | null
  readonly nextDueDate: Date | null
  readonly status: CycleStatus | string
  readonly abandonmentReason: AbandonmentReason | string | null
  readonly inContactList: boolean
  readonly lastContactAt: Date | null
  readonly nextContactAt: Date | null
}

/**
 * One row of the desk's contact list — «دوره‌های فعال با موعد رسیده».
 *
 * The list is the product's primary revenue query (`03-data-model.md` §2.4's index
 * table), and the entry carries the two things the desk needs to act: the session the
 * customer is due for, and the day they are due on.
 */
export interface ContactListEntry extends CycleRow {
  /** The number of the session the cycle is waiting for. */
  readonly dueSessionNumber: number
  /** The due day, as the Jalali `LocalDate` the desk reads it as. */
  readonly dueLocalDate: LocalDate | null
  /** The mobile the desk dials, from the live customer relation. */
  readonly mobile: string
}

/** Re-exported so an override's barrel names the shapes from one place. */
export type { CyclesMessageKey }

/**
 * The two cycle settings `04-roles-permissions.md` §5 names.
 *
 * They sit in تنظیمات › چرخه درمان and are enforced here, and **not** among the
 * eight behavioural toggles of §4 — the document is explicit that they "read like
 * behavioural toggles but sit with the cycle engine", which is why they are not read
 * out of the `toggles` blob the permission module owns. A ninth toggle would be a
 * second place the matrix's closed eight could drift.
 *
 * Both default to **ON**, which is §5's own table.
 */
export interface CycleSettings {
  /**
   * «اگر مشتری دو جلسه پشت‌سرهم نیامد، به فهرست تماس منشی اضافه شود» — two
   * consecutive no-shows put the cycle on the desk's list.
   */
  readonly noShowAddsToContactList: boolean
  /**
   * «جابه‌جایی جلسه، موعد جلسات بعدی را هم جلو/عقب ببرد» — a session that moves
   * moves every due date after it.
   *
   * §5's own reason: "without it, moving one session forward silently compresses
   * every remaining interval", which is `03-data-model.md` §2.4.1 rule 2 stated as a
   * setting.
   */
  readonly rescheduleShiftsDueDates: boolean
}

/**
 * This module's public surface, as a contract an override must reproduce.
 *
 * Keeping this in step with the barrel is a review obligation the type checker only
 * half covers: an interface wider than the barrel fails to compile against the
 * fixture, an interface narrower than the barrel does not. See the note in
 * `appointments/types/index.ts` for the same asymmetry.
 */
export interface CyclesModule {
  /* ── Settings */
  /** The tenant's two cycle settings, or the documented ON defaults. */
  readonly readCycleSettings: (tx: TransactionClient, tenantId: string) => Promise<CycleSettings>

  /** The shipped defaults, frozen. */
  readonly DEFAULT_CYCLE_SETTINGS: CycleSettings

  /* ── Creation and progression */
  /**
   * Records a completed session, creating the cycle on the first one and advancing it
   * on every one after. Idempotent on the appointment — a completion recorded twice
   * is one session, not two.
   * @throws DomainError, as `cycle.noInterval` — the service anchors no spacing.
   */
  readonly recordCompletedSession: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly facts: CompletedSessionFacts
    readonly now: Date
  }) => Promise<CycleRow>

  /* ── The contact list */
  /** «دوره‌های فعال با موعد رسیده» — the desk's list, permission-scoped. */
  readonly contactList: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly now: Date
  }) => Promise<readonly ContactListEntry[]>

  /**
   * Re-evaluates one cycle's list membership. Called on the booking path, so a
   * customer who books leaves the list in the same request that booked them.
   */
  readonly refreshContactListForCycle: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly cycleId: string
    readonly now: Date
  }) => Promise<boolean>

  /** «نتیجه تماس» — the desk recorded a contact and when to try again. */
  readonly recordContactResult: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly cycleId: string
    readonly nextContactAt: Date
    readonly now: Date
  }) => Promise<void>

  /* ── Closing a course */

  /**
   * «منصرف شد» — closes the cycle with a reason from the closed list.
   * @throws PermissionError — no `act_on_cycles`.
   * @throws ValidationError, as `cycle.reasonNotFromList` — the reason is not one of the six.
   * @throws DomainError, as `cycle.closed` — the cycle already ended.
   */
  readonly abandonCycle: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly cycleId: string
    readonly reason: AbandonmentReason
    readonly now: Date
  }) => Promise<void>

  /**
   * «تکمیل دوره» — closes a course the clinic declares finished, which an unbounded
   * course needs because it has no total of its own.
   * @throws PermissionError — no `act_on_cycles`.
   * @throws DomainError, as `cycle.closed` — the cycle already ended.
   */
  readonly completeCycle: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly cycleId: string
    readonly now: Date
  }) => Promise<void>

  /* ── The sweep */
  /** The hourly pass that moves an `ACTIVE` cycle past its due date to `DUE`. */
  readonly runCycleDueSweep: (
    tx: TransactionClient,
    tenantId: string,
    now: Date
  ) => Promise<readonly string[]>

  /** The job kind the worker registry is keyed on, and the queue stores. */
  readonly CYCLE_DUE_JOB_KIND: string

  /** The worker's handler for the next-due job (`02-architecture.md` §12). */
  readonly cycleDueJobHandler: {
    readonly scope?: 'own-tenant' | 'each-tenant'
    run(args: {
      readonly tx: TransactionClient
      readonly job: { readonly tenantId: string; readonly kind: string; readonly attempts: number }
      readonly now: Date
    }): Promise<void>
  }

  /** Seeds a tenant's recurring next-due row. Idempotent on the kind. */
  readonly ensureCycleDueJob: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly now: Date
  }) => Promise<boolean>

  /* ── Queries */
  /** The clinic's cycles, as the manager's oversight table reads them. */
  readonly clinicCycles: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
  }) => Promise<readonly CycleRow[]>

  /** «چرخه درمان» — one doctor's own cycles. */
  readonly doctorCycles: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
  }) => Promise<readonly CycleRow[]>

  /** One customer's cycles, as the profile's cycle table reads them. */
  readonly customerCycles: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly customerId: string
  }) => Promise<readonly CycleRow[]>

  /* ── The catalog */
  /** The Persian sentence for each key this module raises. */
  readonly MESSAGES: Readonly<Record<CyclesMessageKey, string>>

  /** The five status labels, keyed by the stored value. */
  readonly CYCLE_STATUS_LABELS: Readonly<Record<CycleStatus, string>>

  /** The six abandonment reasons, keyed by the stored value. */
  readonly ABANDONMENT_REASON_LABELS: Readonly<Record<AbandonmentReason, string>>
}
