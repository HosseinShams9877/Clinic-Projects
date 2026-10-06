/**
 * The `campaign-assistant` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its barrel
 * and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — the specifier
 * that reaches into a module's own files is a banned one — so a file that is not listed
 * below does not exist as far as the rest of the repository is concerned.
 *
 * ## What is public
 *
 * The module owns one thing: the reading of a Persian brief into a proposal. Its
 * surface is the interpreter, the types the proposal is, and the catalog the
 * interpreter reads — the last because the catalog's keyword rows are the module's own
 * vocabulary and the one place a phrase the assistant knows is added.
 *
 * ## What is deliberately not
 *
 * Everything else. The module holds no database client, no audience evaluation, no
 * campaign write and no send: the signature of `interpretCampaignBrief` is the guarantee
 * (`types/index.ts`), and a barrel that re-exported a write would be a barrel that made
 * the guarantee uncheckable. The proposal's `audienceGroupKey` is a *name* of a group,
 * resolved by `campaigns` against rows `audience-groups` own.
 */

export type {
  CampaignAssistantMessageKey,
  CampaignBrief,
  CampaignProposal,
} from './types'
export type { CampaignAssistantModule } from './types'

export {
  ASSISTANT_FALLBACK_TEXT,
  ASSISTANT_LOW_CONFIDENCE_HINT,
  CAMPAIGN_TYPE_PHRASES,
  JALALI_MONTH_PHRASES,
  MESSAGES,
  ONE_TIME_PHRASES,
  RECURRING_PHRASES,
} from './catalog'

export { interpretCampaignBrief } from './lib/interpreter'
