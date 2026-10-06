/**
 * The `messages` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel so an override cannot
 * accidentally satisfy it by exporting something adjacent.
 *
 * ## What the contract covers
 *
 * The module's **values**: the send settings, the template read and its validation,
 * the gateway, the ledger, and the dispatch that composes the seven triggers from
 * `notifications` into delivered messages.
 *
 * ## What the contract deliberately omits
 *
 * The Prisma client. Every function takes a `TransactionClient` because the caller
 * already opened the tenant scope (`02-architecture.md` §11).
 *
 * The triggers. Which of the seven messages is *due* is `notifications`' question;
 * this module's question is whether the one that is due may be delivered, and it
 * asks it in the order the priority list gives.
 */

import type { AutomaticMessageKind, Channel } from '@/core/constants'
import type { LocalTime } from '@/core/localization'
import type { TransactionClient } from '@/core/db/scope'

import type { MessagesMessageKey } from '../catalog'
import type { DispatchOutcome } from '@/modules/notifications'

/** The tenant's send configuration — the «پیامها» tab's own values. */
export interface SendSettings {
  /** The first minute of the day the clinic sends on, clinic-local. */
  readonly sendWindowStart: LocalTime
  /** The last minute of the day the clinic sends on, clinic-local. */
  readonly sendWindowEnd: LocalTime
  /** `06-constants.md` §14 — at most one automatic message per person per day. */
  readonly dailyMessageCap: number
  /** `06-constants.md` §13 — no repeat message within this many days. */
  readonly duplicateWindowDays: number
  /** The clinic's clock, so a send-window test is arithmetic on a local time. */
  readonly utcOffsetMinutes: number
  /** Which channel each of the seven automatic messages travels on. */
  readonly channels: Readonly<Record<AutomaticMessageKind, Channel>>
}

/**
 * The template row, as the settings tab and the sender read it.
 *
 * `id` is `null` when the read answered with the shipped default rather than a row —
 * the tenant has not opened «پیامها», and a template that was never written has no id
 * to record. The ledger's `templateId` is nullable for exactly this row, and the
 * sender writes the `null` rather than an id that points at nothing.
 */
export interface MessageTemplateRow {
  readonly id: string | null
  readonly automaticKind: AutomaticMessageKind
  readonly channel: Channel
  readonly text: string
  readonly isActive: boolean
}

/** The ledger row, as the customer record and the desk's feed render it. */
export interface MessageSendRow {
  readonly id: string
  readonly customerId: string
  readonly channel: Channel | string
  readonly automaticKind: AutomaticMessageKind | null
  readonly templateId: string | null
  readonly renderedText: string
  readonly status: string
  readonly suppressedReason: string | null
  readonly sentAt: Date | null
  readonly createdAt: Date
}

/** A message handed to the gateway, and everything the adapter needs to send it. */
export interface GatewayMessage {
  readonly tenantId: string
  readonly customerId: string
  readonly mobile: string
  readonly channel: Channel
  readonly renderedText: string
}

/** What the gateway answered, in the two shapes the ledger stores. */
export interface GatewayResult {
  readonly status: 'SENT' | 'FAILED'
  readonly providerMessageId: string | null
  readonly error: string | null
}

/**
 * The adapter the clinic's messaging provider is reached through.
 *
 * One interface, so a tenant's provider is a deployment choice and not a fork: the
 * default adapter logs the send, because a development tenant has no provider, and a
 * production one installs its own before the worker starts.
 */
export interface MessageGateway {
  readonly name: string
  send(message: GatewayMessage): Promise<GatewayResult>
}

/**
 * This module's public surface, as a contract an override must reproduce.
 *
 * Keeping this in step with the barrel is a review obligation the type checker only
 * half covers, for the reason `cycles/types/index.ts` records.
 */
export interface MessagesModule {
  /* ── Settings */
  /** The tenant's send configuration, or the documented defaults. */
  readonly readSendSettings: (tx: TransactionClient, tenantId: string) => Promise<SendSettings>

  /** The shipped defaults, frozen. */
  readonly DEFAULT_SEND_SETTINGS: SendSettings

  /* ── Templates */
  /** One kind's template for a channel, or the shipped default when the row is absent. */
  readonly readTemplate: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly kind: AutomaticMessageKind
    readonly channel: Channel
  }) => Promise<MessageTemplateRow>

  /** The seven templates of a channel, as the «پیامها» tab will render them. */
  readonly templatesForChannel: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly channel: Channel
  }) => Promise<readonly MessageTemplateRow[]>

  /**
   * Seeds the templates a tenant is missing. Idempotent, and never overwrites a row.
   * @returns the kinds a row was created for.
   */
  readonly ensureDefaultTemplates: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly channel?: Channel
  }) => Promise<readonly AutomaticMessageKind[]>

  /* ── The ledger */
  /** The customer's message history, as the profile's message table renders it. */
  readonly customerMessageHistory: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly customerId: string
  }) => Promise<readonly MessageSendRow[]>

  /* ── Dispatch */
  /**
   * The automatic dispatch: evaluates the seven triggers, applies consent, the
   * duplicate window, the daily cap and the send window, and delivers what survives.
   * Idempotent — a repeated run does not double-send.
   */
  readonly runAutomaticDispatch: (
    tx: TransactionClient,
    tenantId: string,
    now: Date,
  ) => Promise<readonly DispatchOutcome[]>

  /** Delivers the ledger's queued rows whose send window has opened. */
  readonly flushSendQueue: (
    tx: TransactionClient,
    tenantId: string,
    now: Date,
  ) => Promise<readonly string[]>

  /** The worker's handler for the dispatch job (`02-architecture.md` §12). */
  readonly messagesDispatchJobHandler: {
    readonly scope?: 'own-tenant' | 'each-tenant'
    run(args: {
      readonly tx: TransactionClient
      readonly job: { readonly tenantId: string; readonly kind: string; readonly attempts: number }
      readonly now: Date
    }): Promise<void>
  }

  /** The job kind the worker registry is keyed on, and the queue stores. */
  readonly MESSAGES_DISPATCH_JOB_KIND: string

  /** Seeds a tenant's recurring dispatch row. Idempotent on the kind. */
  readonly ensureMessagesDispatchJob: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly now: Date
  }) => Promise<boolean>

  /* ── The gateway */
  /** The adapter sends go through, replaceable before the worker starts. */
  readonly defaultMessageGateway: MessageGateway
  readonly setMessageGateway: (gateway: MessageGateway) => void

  /* ── The catalog */
  readonly MESSAGES: Readonly<Record<MessagesMessageKey, string>>
  readonly CHANNEL_LABELS: Readonly<Record<Channel, string>>
  readonly SEND_STATUS_LABELS: Readonly<Record<string, string>>
  readonly SUPPRESSED_REASON_LABELS: Readonly<Record<string, string>>
  readonly TEMPLATE_PLACEHOLDERS: Readonly<Record<AutomaticMessageKind, readonly string[]>>
  readonly DEFAULT_TEMPLATES: Readonly<Record<AutomaticMessageKind, string>>
}

/** Re-exported so an override's barrel names the shapes from one place. */
export type { MessagesMessageKey }
