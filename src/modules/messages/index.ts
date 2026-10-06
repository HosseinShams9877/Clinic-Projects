/**
 * The `messages` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its barrel
 * and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — the specifier
 * that reaches into a module's own files is a banned one — so a file that is not listed
 * below does not exist as far as the rest of the repository is concerned.
 *
 * ## What is public
 *
 * The module owns the delivery, and five things the rest of the product needs:
 *
 * 1. **The settings** — `readSendSettings`, the window, cap, duplicate window and
 *    channel map the «پیامها» tab holds, with the documented defaults where the tab
 *    has never been opened.
 * 2. **The templates** — the read, the channel's seven, the idempotent seed, and the
 *    validation that makes an unknown placeholder a settings error (DoD 7).
 * 3. **The ledger** — `MessageSend`'s writes and reads, which are the send log the
 *    customer record and the desk's feed render.
 * 4. **The dispatch** — the job that turns `notifications`' seven triggers into
 *    delivered messages, and the queue the send window holds.
 * 5. **The gateway** — the adapter the provider is reached through, replaceable before
 *    the worker starts.
 *
 * ## What is deliberately not
 *
 * The triggers. Which of the seven messages is *due* is `notifications`' question, and
 * the dependency runs one way: this module reads that one's candidates and consent, and
 * that one never reaches into the ledger. A second module that evaluated the triggers
 * would be a second place the seven moments were known, and the two would disagree
 * about what a clinic sends.
 *
 * The Prisma client is not re-exported. Functions take a `TransactionClient` because the
 * caller opened the scope — the dispatch runs inside the worker's job transaction, and
 * a settings read inside the request's.
 */

export type {
  GatewayMessage,
  GatewayResult,
  MessageSendRow,
  MessageTemplateRow,
  MessagesMessageKey,
  SendSettings,
} from './types'
export type { MessageGateway, MessagesModule } from './types'

export {
  CHANNEL_LABELS,
  DEFAULT_TEMPLATES,
  MESSAGES,
  SEND_STATUS_LABELS,
  SUPPRESSED_REASON_LABELS,
  TEMPLATE_PLACEHOLDERS,
} from './catalog'

export {
  DEFAULT_SEND_SETTINGS,
  readSendSettings,
} from './lib/settings'

export {
  ensureDefaultTemplates,
  readTemplate,
  renderAutomaticTemplate,
  templatesForChannel,
  validateTemplateText,
} from './lib/templates'

export { customerMessageHistory } from './lib/ledger'

export {
  flushSendQueue,
  runAutomaticDispatch,
} from './lib/dispatch'

export {
  DISPATCH_TICK_INTERVAL_MS,
  MESSAGES_DISPATCH_JOB_KIND,
  ensureMessagesDispatchJob,
  messagesDispatchJobHandler,
} from './lib/job'

export {
  consoleGateway,
  currentGateway,
  setMessageGateway,
} from './lib/gateway'
