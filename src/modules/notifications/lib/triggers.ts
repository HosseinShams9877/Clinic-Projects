/**
 * The seven automatic messages and their triggers — `06-constants.md` §4.10's set,
 * `02-architecture.md` §6's moments.
 *
 * | Kind | Fires when |
 * |---|---|
 * | `BOOKING_CONFIRMATION` | an appointment is booked |
 * | `APPOINTMENT_REMINDER` | the day before the session |
 * | `AFTERCARE` | a session's result is recorded |
 * | `NEXT_SESSION_REMINDER` | the cycle's next session is due |
 * | `BALANCE_REMINDER` | a balance passes its due date |
 * | `NO_SHOW_FOLLOW_UP` | the day after a no-show |
 * | `SURVEY` | a week after a completed session |
 *
 * ## What a trigger is, and what it is not
 *
 * A trigger is a **read of domain state against the clock**: the appointments,
 * cycles and payments that make a message due, evaluated at `now`. It is not a
 * ledger check. Whether the customer already received this message, whether they
 * consented, whether the send window is open and whether the daily cap is left are
 * the dispatcher's questions (`messages/lib/dispatch.ts`), and they are asked there
 * because the answer to all of them is a ledger row — which is what makes a
 * suppressed attempt auditable rather than invisible (`03` §7.6).
 *
 * Keeping the two apart is what makes the seven triggers testable with an injected
 * clock and nothing else: a test seeds the domain state, sets the clock, and the
 * candidates are the answer. A trigger that also read the ledger would need a send
 * row to prove it fired, and a message that needs a send row to fire never fires.
 *
 * ## Why each trigger is bounded by a lookback
 *
 * A trigger with no lower bound would re-report every row the clinic ever held, and
 * the dispatcher would then suppress them all — writing a ledger row per attempt per
 * tick, forever. The lookback is the trigger's own statement of how late a message
 * still makes sense: a booking confirmation sent a month later is not a confirmation,
 * and a survey sent the same day is not a survey. The upper bound is `now`, so a
 * trigger never reports the future.
 *
 * ## Why one candidate per customer per kind
 *
 * A customer with three completed sessions is due one survey, not three, and the
 * daily cap exists precisely because a clinic's day holds more reasons to write to a
 * person than a person wants to hear from the clinic. Each evaluator keeps the first
 * row it reads — earliest by the column the message is about — and the dispatcher's
 * priority order then decides between the kinds that survived.
 */

import {
  AppointmentStatus,
  AutomaticMessageKind,
  CycleStatus,
} from '@/core/constants'
import {
  addLocalDays,
  asLocalDate,
  formatDate,
  formatMoney,
  fromUtcInstant,
  todayLocalDate,
} from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'
import { asBalance } from '@/modules/payments'
import { effectiveDueInstant, readDebtSettings } from '@/modules/debts'

import type { AutomaticCandidate } from '../types'

/** A day, as a millisecond range, so the lookbacks read as days and not as numbers. */
const DAY_MS = 24 * 60 * 60 * 1000

/** How far back each trigger looks — the window a message is still meaningful in. */
const LOOKBACK = {
  /** A booking confirmation is prompt or it is nothing. */
  bookingMs: DAY_MS,
  /** An aftercare message follows the session the desk just closed. */
  aftercareMs: DAY_MS,
  /** A no-show follow-up is a next-day call, not a next-month one. */
  noShowMs: 2 * DAY_MS,
  /** A survey asks about a session the customer still remembers. */
  surveyMinDays: 7 * DAY_MS,
  surveyMaxDays: 14 * DAY_MS,
  /** A cycle's next session is due soon when it is inside this many days. */
  cycleDueSoonDays: 3,
} as const

/** The customer columns every evaluator reads, to fill `{name}` and reach the mobile. */
const CUSTOMER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
} as const

/** The customer's rendered name, which every one of the seven templates opens with. */
export function customerName(row: {
  readonly firstName: string
  readonly lastName: string | null
}): string {
  return row.lastName === null || row.lastName === '' ? row.firstName : `${row.firstName} ${row.lastName}`
}

/**
 * The candidates the seven triggers found at `now`.
 *
 * The kinds are evaluated independently and concatenated; the dispatcher orders them
 * by the priority list. Duplicates within a kind are impossible here — each
 * evaluator keeps one row per customer — so the dispatcher's dedupe is across kinds.
 */
export async function collectAutomaticCandidates(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly AutomaticCandidate[]> {
  const candidates: AutomaticCandidate[] = []
  for (const evaluator of EVALUATORS) {
    candidates.push(...(await evaluator(tx, tenantId, now)))
  }
  return candidates
}

/* ── The seven evaluators ─────────────────────────────────────────────────── */

/** `BOOKING_CONFIRMATION` — a booking the clinic has not yet confirmed in writing. */
async function bookingConfirmations(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly AutomaticCandidate[]> {
  const rows = withCustomer(
    await tx.appointment.findMany({
      where: {
        tenantId,
        isSlotBlock: false,
        status: AppointmentStatus.Booked,
        createdAt: { gte: new Date(now.getTime() - LOOKBACK.bookingMs), lte: now },
      },
      select: { id: true, customerId: true, localDate: true, localTime: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
  )

  return uniqueByCustomer(tx, tenantId, rows, (row) => ({
    kind: AutomaticMessageKind.BookingConfirmation,
    customerId: row.customerId,
    values: {
      date: formatLocalDate(row.localDate),
      time: row.localTime,
    },
  }))
}

/** `APPOINTMENT_REMINDER` — tomorrow's sessions, so a customer can plan the day. */
async function appointmentReminders(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly AutomaticCandidate[]> {
  const tomorrow = addLocalDays(todayLocalDate(now), 1)
  const rows = withCustomer(
    await tx.appointment.findMany({
      where: {
        tenantId,
        isSlotBlock: false,
        localDate: tomorrow,
        status: { in: [AppointmentStatus.Booked, AppointmentStatus.AwaitingArrival] },
      },
      select: { id: true, customerId: true, localDate: true, localTime: true },
      orderBy: { localTime: 'asc' },
      take: 200,
    }),
  )

  return uniqueByCustomer(tx, tenantId, rows, (row) => ({
    kind: AutomaticMessageKind.AppointmentReminder,
    customerId: row.customerId,
    values: { date: formatLocalDate(row.localDate), time: row.localTime },
  }))
}

/** `AFTERCARE` — the session the desk just closed, with the care text that follows. */
async function aftercare(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly AutomaticCandidate[]> {
  const rows = withCustomer(
    await tx.appointment.findMany({
      where: {
        tenantId,
        isSlotBlock: false,
        status: AppointmentStatus.Completed,
        resultRecordedAt: {
          gte: new Date(now.getTime() - LOOKBACK.aftercareMs),
          lte: now,
        },
      },
      select: {
        id: true,
        customerId: true,
        service: { select: { name: true } },
      },
      orderBy: { resultRecordedAt: 'asc' },
      take: 200,
    }),
  )

  return uniqueByCustomer(tx, tenantId, rows, (row) => ({
    kind: AutomaticMessageKind.Aftercare,
    customerId: row.customerId,
    values: { serviceName: row.service?.name ?? '' },
  }))
}

/**
 * `NEXT_SESSION_REMINDER` — the cycle whose next session is due.
 *
 * The highest-priority of the seven (`06-constants.md` §4.10: next-session
 * appointment first), because a missed session is a lost course and a course is the
 * product's reason for existing. Reads `ACTIVE` and `DUE` cycles whose due date has
 * arrived or is within the near window, and the cycle's own `nextDueDate` — not the
 * service's interval — for the same reason `03` §2.4.1 rule 2 gives.
 */
async function nextSessionReminders(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly AutomaticCandidate[]> {
  const dueSoon = new Date(now.getTime() + LOOKBACK.cycleDueSoonDays * DAY_MS)
  const { utcOffsetMinutes } = await readDebtSettings(tx, tenantId)
  const rows = withCustomer(
    await tx.treatmentCycle.findMany({
      where: {
        tenantId,
        status: { in: [CycleStatus.Active, CycleStatus.Due] },
        nextDueDate: { lte: dueSoon },
      },
      select: {
        id: true,
        customerId: true,
        currentSessionNumber: true,
        nextDueDate: true,
      },
      orderBy: { nextDueDate: 'asc' },
      take: 200,
    }),
  )

  return uniqueByCustomer(tx, tenantId, rows, (row) => ({
    kind: AutomaticMessageKind.NextSessionReminder,
    customerId: row.customerId,
    values: {
      sessionNumber: row.currentSessionNumber + 1,
      date:
        row.nextDueDate === null
          ? ''
          : formatDate(fromUtcInstant(row.nextDueDate, utcOffsetMinutes).localDate, 'short'),
    },
  }))
}

/**
 * `BALANCE_REMINDER` — an open balance past its due date.
 *
 * The balance is computed here by the same three terms the `debts` module's list
 * computes it from, because there is no stored balance to read (`03` §4.3) and a
 * reminder that disagreed with the debt list would be two numbers the clinic cannot
 * reconcile. The due date is the effective one — a promise the desk recorded wins
 * over arithmetic, for the reason `debts/lib/buckets.ts` gives.
 */
async function balanceReminders(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly AutomaticCandidate[]> {
  const settings = await readDebtSettings(tx, tenantId)

  const appointments = await tx.appointment.findMany({
    where: { tenantId, status: AppointmentStatus.Completed },
    select: {
      id: true,
      customerId: true,
      scheduledAt: true,
      priceAtBooking: true,
      debtDueDateOverride: true,
    },
    orderBy: { scheduledAt: 'asc' },
    take: 200,
  })

  const ids = appointments.map((row) => row.id)
  const sums = ids.length
    ? await tx.payment.groupBy({
        by: ['appointmentId'],
        where: { tenantId, appointmentId: { in: ids } },
        _sum: { amount: true, discountAmount: true },
      })
    : []

  const byAppointment = new Map(sums.map((sum) => [sum.appointmentId, sum]))

  const rows = []
  for (const row of appointments) {
    if (row.customerId === null) continue
    const sum = byAppointment.get(row.id)
    const balance = asBalance(
      row.priceAtBooking,
      sum?._sum.discountAmount ?? 0n,
      sum?._sum.amount ?? 0n,
    ).balance
    if (balance <= 0n) continue

    const dueAt = effectiveDueInstant({
      scheduledAt: row.scheduledAt,
      override: row.debtDueDateOverride,
      graceDays: settings.debtGraceDays,
    })
    if (dueAt > now) continue

    rows.push({ id: row.id, customerId: row.customerId, balance })
  }

  return uniqueByCustomer(tx, tenantId, rows, (row) => ({
    kind: AutomaticMessageKind.BalanceReminder,
    customerId: row.customerId,
    values: { amount: formatMoney(row.balance, { unit: false }) },
  }))
}

/** `NO_SHOW_FOLLOW_UP` — a session the customer missed, so the desk can rebook it. */
async function noShowFollowUps(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly AutomaticCandidate[]> {
  const rows = withCustomer(
    await tx.appointment.findMany({
      where: {
        tenantId,
        isSlotBlock: false,
        status: AppointmentStatus.NoShow,
        scheduledAt: {
          gte: new Date(now.getTime() - LOOKBACK.noShowMs),
          lte: now,
        },
      },
      select: { id: true, customerId: true, service: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
    }),
  )

  return uniqueByCustomer(tx, tenantId, rows, (row) => ({
    kind: AutomaticMessageKind.NoShowFollowUp,
    customerId: row.customerId,
    values: { serviceName: row.service?.name ?? '' },
  }))
}

/** `SURVEY` — a week after a completed session, when the outcome is visible to them. */
async function surveys(
  tx: TransactionClient,
  tenantId: string,
  now: Date,
): Promise<readonly AutomaticCandidate[]> {
  const rows = withCustomer(
    await tx.appointment.findMany({
      where: {
        tenantId,
        isSlotBlock: false,
        status: AppointmentStatus.Completed,
        scheduledAt: {
          gte: new Date(now.getTime() - LOOKBACK.surveyMaxDays),
          lte: new Date(now.getTime() - LOOKBACK.surveyMinDays),
        },
      },
      select: { id: true, customerId: true, service: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
    }),
  )

  return uniqueByCustomer(tx, tenantId, rows, (row) => ({
    kind: AutomaticMessageKind.Survey,
    customerId: row.customerId,
    values: { serviceName: row.service?.name ?? '' },
  }))
}

/** The seven evaluators, in the constants module's own documented order. */
const EVALUATORS = [
  bookingConfirmations,
  appointmentReminders,
  aftercare,
  nextSessionReminders,
  balanceReminders,
  noShowFollowUps,
  surveys,
] as const

/**
 * A stored Jalali day as the template renders it: «۱۴۰۵/۰۷/۰۴».
 *
 * The stored column is the ISO-shaped `YYYY-MM-DD` string the day grid compares on;
 * the message is a sentence a customer reads, so it goes through the same short
 * format every other date on every other page uses. The renderer's digit conversion
 * is idempotent on the result, so passing the formatted string is the same value the
 * caller would have asked for with the raw one, spelled the way the product spells
 * dates.
 */
function formatLocalDate(stored: string): string {
  return formatDate(asLocalDate(stored), 'short')
}

/* ── Shared shape ─────────────────────────────────────────────────────────── */

/** A row one of the evaluators read, carrying the customer the message is for. */
interface EvaluatedRow {
  readonly id: string
  readonly customerId: string
}

/**
 * Narrows a query's rows to the ones a message can be for.
 *
 * An appointment may hold no customer — a slot the desk blocked, or a row from before
 * the customer field existed — and a message to no one is not a message. The filter
 * proves the narrowing; the cast states what it proved, once, so the seven evaluators
 * read the row as the person it is for.
 */
function withCustomer<R extends { readonly customerId: string | null }>(
  rows: readonly R[],
): readonly (R & { readonly customerId: string })[] {
  return rows.filter((row) => row.customerId !== null) as (R & { readonly customerId: string })[]
}

/**
 * Keeps one candidate per customer, filling the customer's name from the file.
 *
 * The `{name}` placeholder is filled here rather than in the evaluators, because the
 * evaluators read appointment and cycle rows and the name lives on the customer — one
 * read here serves all seven, and a trigger that joined the customer for its own sake
 * would join it seven times. The first row per customer is the one kept, and "first"
 * is the query's own order, which each evaluator sets to the column the message is
 * about.
 */
async function uniqueByCustomer<R extends EvaluatedRow>(
  tx: TransactionClient,
  tenantId: string,
  rows: readonly R[],
  asCandidate: (row: R) => AutomaticCandidate,
): Promise<readonly AutomaticCandidate[]> {
  const seen = new Set<string>()
  const picked: R[] = []
  for (const row of rows) {
    if (seen.has(row.customerId)) continue
    seen.add(row.customerId)
    picked.push(row)
  }

  if (picked.length === 0) return []

  const customers = await tx.customer.findMany({
    where: { tenantId, id: { in: picked.map((row) => row.customerId) } },
    select: CUSTOMER_SELECT,
  })
  const names = new Map(customers.map((customer) => [customer.id, customerName(customer)]))

  return picked.map((row) => {
    const candidate = asCandidate(row)
    return {
      kind: candidate.kind,
      customerId: row.customerId,
      values: { ...candidate.values, name: names.get(row.customerId) ?? '' },
    }
  })
}
