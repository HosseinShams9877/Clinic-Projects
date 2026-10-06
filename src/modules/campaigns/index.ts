/**
 * The `campaigns` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its barrel
 * and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — the specifier
 * that reaches into a module's own files is a banned one — so a file that is not listed
 * below does not exist as far as the rest of the repository is concerned.
 *
 * ## What is public
 *
 * The module owns the campaign, and five things the rest of the product needs:
 *
 * 1. **The writes** — the CRUD and the status machine, whose one edge is the approval
 *    gate `03-data-model.md` §2.6's invariant keeps (`manage.ts`'s header gives the
 *    three gates and the reason each is a separate one).
 * 2. **The reads** — the list the results table renders, the row the builder edits, the
 *    live audience count the preview names, and the results counted from the ledger.
 * 3. **The dispatch** — the orchestration a scheduled campaign becomes sends through,
 *    and the job that runs it every fifteen minutes.
 * 4. **The attribution** — the link a booking writes to the campaign that reached its
 *    customer, and the count the results table renders from it.
 * 5. **The catalog** — the eight types' labels, descriptions, preselected groups and
 *    proposed texts, the six statuses' labels and hints, and the sentences the module
 *    raises.
 *
 * ## What is deliberately not
 *
 * The audience. Which customers a campaign reaches is `audience-groups`' question, and
 * the dependency runs one way: this module reads a group's predicate and evaluates it
 * through that module's own evaluation. A second module that evaluated a predicate would
 * be a second answer to "who is in this group", and the count the manager approved would
 * not be the count the campaign sent to.
 *
 * The ledger. A campaign's sends are rows in `messages`'s own table, written through that
 * module's campaign delivery, because a second module that wrote `MessageSend` would be a
 * second place the send log's shape was known.
 *
 * The Prisma client is not re-exported. Functions take a `TransactionClient` because the
 * caller opened the scope — the dispatch runs inside the worker's job transaction, and a
 * campaign write inside the request's.
 */

export type {
  CampaignInput,
  CampaignResults,
  CampaignRow,
  CampaignsMessageKey,
  CampaignsModule,
  DispatchOutcome,
  DispatchSkipReason,
} from './types'

export {
  CAMPAIGN_SCHEDULE_LABELS,
  CAMPAIGN_STATUS_HINTS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_DEFAULT_GROUP,
  CAMPAIGN_TYPE_DEFAULT_TEXT,
  CAMPAIGN_TYPE_DESCRIPTIONS,
  CAMPAIGN_TYPE_LABELS,
  CHANNEL_LABELS,
  MESSAGES,
  STATUS_TRANSITIONS,
} from './catalog'

export {
  activateCampaign,
  advanceSchedule,
  approveCampaign,
  assertApprovalFacts,
  createCampaign,
  finishCampaign,
  loadOwnCampaign,
  pauseCampaign,
  resumeCampaign,
  submitCampaignForApproval,
  updateCampaign,
  validateCampaignInput,
} from './lib/manage'

export {
  campaignDetail,
  campaignResults,
  listCampaigns,
  previewCampaignAudience,
} from './lib/queries'

export { dispatchDueCampaigns } from './lib/dispatch'

export {
  attributeAppointmentToCampaign,
  countCampaignAppointments,
  recountCampaignAppointments,
} from './lib/attribution'

export {
  CAMPAIGN_DISPATCH_TICK_INTERVAL_MS,
  CAMPAIGNS_DISPATCH_JOB_KIND,
  campaignsDispatchJobHandler,
  ensureCampaignsDispatchJob,
} from './lib/job'
