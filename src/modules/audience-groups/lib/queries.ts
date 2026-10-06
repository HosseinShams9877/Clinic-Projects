/**
 * The group reads and writes — the builder's own surface, and the campaign's
 * audience selector.
 *
 * The list is what `admin/campaigns.html` renders as the audience dropdown, and the
 * preview is the live count the builder shows before the manager commits to a group.
 * Both go through `evaluateGroup`, which is the one place a predicate becomes a set
 * of customers — a second path would be a second answer to "who is in this group",
 * and the count the preview showed would not be the count the campaign sent to.
 *
 * ## Why the preview takes a predicate and not an id
 *
 * The builder's preview is of a group the manager has not saved yet: conditions are
 * added, the count moves, and the group is named when the manager is satisfied with
 * it. A preview that required a saved row would require a save per keystroke, and a
 * row per abandoned draft. The predicate is the question; the row is the saved
 * answer, and the preview answers the question the manager is still shaping.
 *
 * ## Why the built-ins are seeded and never created by a manager
 *
 * `ensureBuiltInGroups` writes the eight a tenant is missing and leaves the ones it
 * has alone — a seed that overwrote a group a clinic deactivated would be a seed
 * nobody can trust. The `key` column's UNIQUE pair with the tenant is what makes the
 * seed idempotent, and `createdByUserId` stays `null` for the eight, which is how a
 * group the product owns is told apart from one a manager built.
 */

import type { AudienceGroupKey } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'
import { DomainError, NotFoundError, ValidationError } from '@/core/types'

import { AUDIENCE_GROUP_LABELS } from '../catalog'
import type { AudienceEvaluation, AudienceGroupRow, GroupPredicate } from '../types'
import { evaluateBuiltIn } from './evaluators'
import {
  conditionsToFilters,
  isAdHocPredicate,
  parsePredicate,
  serializePredicate,
  validateGroupName,
} from './predicate'

/** The columns the reads carry, and nothing more. */
const GROUP_SELECT = {
  id: true,
  tenantId: true,
  key: true,
  name: true,
  isBuiltIn: true,
  predicate: true,
  predicateVersion: true,
  lastRefreshedAt: true,
  lastCount: true,
  isActive: true,
} as const

/**
 * The tenant's groups, built-ins first and then the ad-hoc ones, newest first.
 *
 * Built-ins first because the eight are the ones a manager reaches for, and the
 * ad-hoc ones after because they are the ones a manager has to recognise by name.
 */
export async function listAudienceGroups(
  tx: TransactionClient,
  tenantId: string,
): Promise<readonly AudienceGroupRow[]> {
  const rows = await tx.audienceGroup.findMany({
    where: { tenantId },
    orderBy: [{ isBuiltIn: 'desc' }, { createdAt: 'desc' }],
    select: GROUP_SELECT,
  })
  return rows.map(asRow)
}

/**
 * One group as the caller's tenant sees it.
 *
 * @throws NotFoundError — the row is outside the caller's tenant, and confirming that
 *   another clinic holds a group with this id is a disclosure the refusal must not
 *   make, which is why the guard is a `where` clause and not a post-read check.
 */
export async function loadAudienceGroup(
  tx: TransactionClient,
  tenantId: string,
  groupId: string,
): Promise<AudienceGroupRow> {
  const row = await tx.audienceGroup.findFirst({
    where: { id: groupId, tenantId },
    select: GROUP_SELECT,
  })
  if (row === null) {
    throw new NotFoundError(`Audience group ${groupId} was not found in this tenant.`, {
      messageKey: 'audienceGroups.groupNotFound',
      detail: { groupId },
    })
  }
  return asRow(row)
}

/**
 * Evaluates a predicate to the customers it holds at `now`.
 *
 * The one place a predicate becomes a set: a built-in dispatches to its index-backed
 * evaluator, and an ad-hoc one compiles to a customer query inside the base the
 * built-ins share. A predicate that is neither — a shape the schema rejected at read
 * — does not reach this function.
 */
export async function evaluateGroup(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly predicate: GroupPredicate
  readonly now: Date
}): Promise<readonly string[]> {
  if (args.predicate.kind === 'BUILT_IN') {
    return evaluateBuiltIn(args.predicate.key, {
      tx: args.tx,
      tenantId: args.tenantId,
      now: args.now,
    })
  }

  const filters = conditionsToFilters(args.predicate, args.now)
  if (filters.length === 0) return []

  const rows = await args.tx.customer.findMany({
    where: {
      tenantId: args.tenantId,
      isActive: true,
      AND: filters as never[],
    },
    select: { id: true },
    take: 500,
  })
  return rows.map((row) => row.id)
}

/**
 * The live preview — the predicate evaluated now, with the count the builder renders.
 *
 * `count` is `customerIds.length` and not a separate `count` query, because a count
 * that disagreed with the list is the exact failure the preview exists to prevent:
 * the manager reads a count, approves a campaign, and the campaign sends to a
 * different set. One read, one number.
 */
export async function previewAudienceGroup(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly predicate: GroupPredicate
  readonly now: Date
}): Promise<AudienceEvaluation> {
  const customerIds = await evaluateGroup(args)
  return {
    group: Object.freeze({
      id: 'preview',
      tenantId: args.tenantId,
      key: args.predicate.kind === 'BUILT_IN' ? args.predicate.key : null,
      name:
        args.predicate.kind === 'BUILT_IN' ? AUDIENCE_GROUP_LABELS[args.predicate.key] : '',
      isBuiltIn: args.predicate.kind === 'BUILT_IN',
      predicate: args.predicate,
      predicateVersion: 1,
      lastRefreshedAt: null,
      lastCount: customerIds.length,
      isActive: true,
    }),
    customerIds,
    count: customerIds.length,
  }
}

/**
 * Saves an ad-hoc group the manager built.
 *
 * @throws ValidationError — no name, or no condition the schema accepts.
 */
export async function createAdHocGroup(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly name: string
  readonly predicate: GroupPredicate
  readonly now: Date
}): Promise<AudienceGroupRow> {
  validateGroupName(args.name)
  if (!isAdHocPredicate(args.predicate)) {
    throw new ValidationError('An ad-hoc group holds a conditions predicate.', {
      messageKey: 'audienceGroups.conditionsRequired',
    })
  }
  if (args.predicate.conditions.length === 0) {
    throw new ValidationError('An ad-hoc group holds at least one condition.', {
      messageKey: 'audienceGroups.conditionsRequired',
    })
  }

  const evaluated = await evaluateGroup({
    tx: args.tx,
    tenantId: args.tenantId,
    predicate: args.predicate,
    now: args.now,
  })

  const row = await args.tx.audienceGroup.create({
    data: {
      tenantId: args.tenantId,
      key: `adhoc-${randomSlug()}`,
      name: args.name.trim(),
      isBuiltIn: false,
      predicate: serializePredicate(args.predicate),
      lastRefreshedAt: args.now,
      lastCount: evaluated.length,
      isActive: true,
    },
    select: GROUP_SELECT,
  })
  return asRow(row)
}

/**
 * Seeds the eight built-ins a tenant is missing.
 *
 * Idempotent on the `(tenantId, key)` pair, so a caller that runs it on every campaign
 * page does not create a ninth row. The eight are inactive-by-default is *not* the
 * choice — they are active, because a group that exists is a group the clinic may
 * target, and a manager who wants one gone deactivates it and the count stops.
 *
 * @returns the eight, as the builder's own read does.
 */
export async function ensureBuiltInGroups(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
}): Promise<readonly AudienceGroupRow[]> {
  const existing = await args.tx.audienceGroup.findMany({
    where: { tenantId: args.tenantId, isBuiltIn: true },
    select: { key: true },
  })
  const held = new Set(existing.map((row) => row.key))

  const missing = Object.values(AUDIENCE_GROUP_KEYS).filter((key) => !held.has(key))
  if (missing.length > 0) {
    await args.tx.audienceGroup.createMany({
      data: missing.map((key) => ({
        tenantId: args.tenantId,
        key,
        name: AUDIENCE_GROUP_LABELS[key],
        isBuiltIn: true,
        predicate: serializePredicate({ kind: 'BUILT_IN', key }),
        isActive: true,
      })),
    })
  }

  return listAudienceGroups(args.tx, args.tenantId)
}

/**
 * Toggles a group off and on.
 *
 * An inactive group is one a campaign may not select, and the dispatch checks
 * `isActive` rather than the row's existence — a manager who retired a group the
 * campaigns of the moment still point at has those campaigns fail at the approval
 * step rather than silently sending to nobody.
 *
 * @throws NotFoundError — the group is another tenant's.
 * @throws DomainError — a built-in cannot be retired, because the eight are the
 *   product's own vocabulary and a clinic that retired one would have no way to ask
 *   for it back except by rebuilding it.
 */
export async function setGroupActive(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly groupId: string
  readonly isActive: boolean
}): Promise<void> {
  const group = await loadAudienceGroup(args.tx, args.tenantId, args.groupId)
  if (group.isBuiltIn && !args.isActive) {
    throw new DomainError(`The built-in group ${group.key} cannot be deactivated.`, {
      messageKey: 'audienceGroups.groupNotFound',
      detail: { groupId: args.groupId, key: group.key },
    })
  }

  await args.tx.audienceGroup.update({
    where: { id: args.groupId },
    data: { isActive: args.isActive },
  })
}

/** The eight as the seed writes them, in the constants module's own order. */
const AUDIENCE_GROUP_KEYS = [
  'BIRTHDAY',
  'DORMANT',
  'CYCLE_DUE',
  'LOYAL',
  'DEBTORS',
  'NEW',
  'COMPLETED_COURSE',
  'ONE_TIMERS',
] as const satisfies readonly AudienceGroupKey[]

/**
 * A unique slug for an ad-hoc group, which the UNIQUE `(tenantId, key)` pair requires
 * and which nothing else reads.
 */
function randomSlug(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** The row as the module's own shape, with the predicate parsed. */
function asRow(row: {
  readonly id: string
  readonly tenantId: string
  readonly key: string
  readonly name: string
  readonly isBuiltIn: boolean
  readonly predicate: string
  readonly predicateVersion: number
  readonly lastRefreshedAt: Date | null
  readonly lastCount: number
  readonly isActive: boolean
}): AudienceGroupRow {
  return Object.freeze({
    id: row.id,
    tenantId: row.tenantId,
    key: row.isBuiltIn ? (row.key as AudienceGroupKey) : null,
    name: row.name,
    isBuiltIn: row.isBuiltIn,
    predicate: parsePredicate(row.predicate),
    predicateVersion: row.predicateVersion,
    lastRefreshedAt: row.lastRefreshedAt,
    lastCount: row.lastCount,
    isActive: row.isActive,
  })
}
