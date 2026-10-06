/**
 * The `notifications` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel so an override cannot
 * accidentally satisfy it by exporting something adjacent.
 *
 * ## What the contract covers
 *
 * The module's **values**: the seven trigger evaluations, the consent read, the
 * dispatch decision set and the desk's reminder feed. The row shapes this module
 * exports travel with `types/` and are re-exported by an override's own barrel.
 *
 * ## What the contract deliberately omits
 *
 * The Prisma client. Every function takes a `TransactionClient` because the caller
 * already opened the tenant scope (`02-architecture.md` §11) — the dispatcher runs
 * inside the worker's job transaction, and a second client would be a scope the
 * lease does not cover.
 *
 * The send itself. Writing the ledger row and calling the gateway belong to
 * `messages`, because the ledger is the send log and the gateway is the adapter;
 * this module decides *whether* a message is due, and hands the decision to the
 * module that delivers it.
 */

import type { AutomaticMessageKind, Channel } from '@/core/constants'
import type { MessageValue } from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'

import type { NotificationsMessageKey } from '../catalog'

/** Re-exported so an override's barrel names the shapes from one place. */
export type { NotificationsMessageKey }

/** One of the seven automatic messages, due for one customer now. */
export interface AutomaticCandidate {
  /** Which of the seven messages this is. */
  readonly kind: AutomaticMessageKind
  /** The person it is for. */
  readonly customerId: string
  /** The template's placeholder values, as the trigger evaluated them. */
  readonly values: Readonly<Record<string, MessageValue>>
}

/** The reason the dispatcher held a message back, as the ledger stores it. */
export type SuppressedReason = 'NO_CONSENT' | 'DUPLICATE_WINDOW' | 'DAILY_CAP' | 'TEMPLATE_MISSING'

/** The decision the dispatcher made for one candidate. */
export type DispatchOutcome =
  | { readonly result: 'SENT'; readonly sendId: string }
  | { readonly result: 'QUEUED'; readonly sendId: string }
  | { readonly result: 'FAILED'; readonly sendId: string }
  | { readonly result: 'SUPPRESSED'; readonly sendId: string; readonly reason: SuppressedReason }

/** One row of the desk's «یادآوری‌های امروز» feed. */
export interface ReminderRow {
  readonly id: string
  readonly customerId: string
  readonly customerName: string
  readonly mobile: string
  /** The automatic kind, or `null` for a send a campaign produced. */
  readonly kind: AutomaticMessageKind | null
  readonly channel: Channel | string
  readonly renderedText: string
  readonly status: string
  readonly suppressedReason: string | null
  readonly sentAt: Date | null
  readonly createdAt: Date
}

/**
 * This module's public surface, as a contract an override must reproduce.
 *
 * Keeping this in step with the barrel is a review obligation the type checker only
 * half covers, for the reason `cycles/types/index.ts` records.
 */
export interface NotificationsModule {
  /** The seven triggers, evaluated against the injected clock. */
  readonly collectAutomaticCandidates: (
    tx: TransactionClient,
    tenantId: string,
    now: Date,
  ) => Promise<readonly AutomaticCandidate[]>

  /** Whether the customer may be reached on the channel. */
  readonly hasChannelConsent: (
    tx: TransactionClient,
    tenantId: string,
    customerId: string,
    channel: Channel,
  ) => Promise<boolean>

  /** «یادآوری‌های امروز» — the desk's feed of the day's sends and suppressions. */
  readonly todaysReminders: (
    tx: TransactionClient,
    tenantId: string,
    now: Date,
  ) => Promise<readonly ReminderRow[]>

  /** The Persian label for each of the seven automatic messages. */
  readonly AUTOMATIC_KIND_LABELS: Readonly<Record<AutomaticMessageKind, string>>

  /** One sentence per message naming when it fires. */
  readonly AUTOMATIC_KIND_TIMING: Readonly<Record<AutomaticMessageKind, string>>
}
