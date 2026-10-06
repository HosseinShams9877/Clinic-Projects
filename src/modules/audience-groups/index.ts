/**
 * The `audience-groups` module's complete public surface.
 *
 * `02-architecture.md` §10 rule 1 and rule 2: a module is reachable through its barrel
 * and nothing else, and "if something is not in the barrel, it is private".
 * `eslint.config.mjs` enforces the first half from the importing side — the specifier
 * that reaches into a module's own files is a banned one — so a file that is not listed
 * below does not exist as far as the rest of the repository is concerned.
 *
 * ## What is public
 *
 * The module owns the saved query, and four things the rest of the product needs:
 *
 * 1. **The eight built-ins** — `ensureBuiltInGroups`, the idempotent seed, and
 *    `listAudienceGroups`, the read the builder's dropdown and the campaign's audience
 *    selector share.
 * 2. **The evaluation** — `evaluateGroup` and `previewAudienceGroup`, the one place a
 *    predicate becomes a set of customers. The campaign's dispatch and the builder's
 *    live count both go through it, so the count the manager approved is the count the
 *    campaign sent to.
 * 3. **The allow-list** — `audienceCondition` and the `AudienceField` set it takes, which
 *    is the mechanism that makes a clinical field structurally inexpressible in a
 *    predicate. A group that cannot spell a medical fact cannot select on one.
 * 4. **The nightly job** — the refresh that keeps `lastCount` honest, and the seed that
 *    books the first night.
 *
 * ## What is deliberately not
 *
 * The send. A group is a set of people, and what the clinic says to them is
 * `campaigns`' question. A module that both evaluated an audience and delivered to it
 * would be a module that held both halves of "who" and "what", and the two would be
 * one decision a review could not separate.
 *
 * The member list. `03-data-model.md` Decision 3 is a group is a query and not a stored
 * list, so no function here writes or reads a membership row — the count is a cache,
 * and the cache is written by the refresh from the same evaluation the dispatch runs.
 *
 * The Prisma client is not re-exported. Functions take a `TransactionClient` because the
 * caller opened the scope — the refresh runs inside the worker's job transaction, and
 * the preview inside the request's.
 */

export type {
  AudienceCondition,
  AudienceEvaluation,
  AudienceField,
  AudienceFields,
  AudienceGroupRow,
  AudienceOperator,
  AudienceValue,
  BuiltInPredicate,
  ConditionsPredicate,
  GroupPredicate,
} from './types'
export type { AudienceGroupsModule } from './types'

export { AUDIENCE_GROUP_DESCRIPTIONS, AUDIENCE_GROUP_LABELS, MESSAGES } from './catalog'

export {
  AUDIENCE_FIELDS,
  audienceCondition,
  conditionsToFilters,
  parsePredicate,
  serializePredicate,
  validateGroupName,
} from './lib/predicate'

export {
  createAdHocGroup,
  ensureBuiltInGroups,
  evaluateGroup,
  listAudienceGroups,
  loadAudienceGroup,
  previewAudienceGroup,
  setGroupActive,
} from './lib/queries'

export { refreshAudienceGroupCounts } from './lib/refresh'

export {
  AUDIENCE_REFRESH_JOB_KIND,
  REFRESH_INTERVAL_MS,
  audienceRefreshJobHandler,
  ensureAudienceRefreshJob,
} from './lib/job'
