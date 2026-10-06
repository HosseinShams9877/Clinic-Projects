/**
 * The nightly refresh — `02-architecture.md` §12's "Audience group refresh | nightly |
 * `audience-groups`", and the job that keeps `lastCount` honest.
 *
 * The count is a cache, and a cache is only worth showing while it is fresh. A group's
 * membership is computed at evaluation, so the cache being wrong never sends a
 * message to the wrong person — the campaign re-evaluates the predicate at dispatch.
 * What a stale count does wrong is the *preview*: a manager reads a number, approves a
 * campaign against it, and the campaign sends to a different set. The refresh is the
 * nightly answer to that, and `group_tenant_refresh_idx` is the scan it uses.
 *
 * ## Why the refresh re-evaluates instead of trusting the cache
 *
 * The count is written from the same `evaluateGroup` the preview and the dispatch
 * call, so the three are one answer and cannot disagree. A refresh that incremented a
 * counter would be a refresh that drifts, and the number on the page would describe
 * the day it was last true rather than the night it was refreshed.
 *
 * ## Why an inactive group is refreshed too
 *
 * An inactive group's count is still shown — it is how a manager decides whether to
 * switch one back on. The scan filters on `isActive` for the *campaign's* question and
 * the refresh keeps the count current for the manager's, so the two read the column
 * for different reasons and the refresh is not the one that decides which groups are
 * targetable.
 */

import type { TransactionClient } from '@/core/db/scope'

import { evaluateGroup } from './queries'
import { parsePredicate } from './predicate'

/** One refreshed group, as the job's own log line reports it. */
export interface RefreshedGroup {
  readonly id: string
  readonly name: string
  readonly count: number
}

/**
 * Re-evaluates the tenant's groups and writes the counts the pages render.
 *
 * @returns the groups refreshed, with the count each landed on, for the job's log.
 */
export async function refreshAudienceGroupCounts(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
}): Promise<readonly RefreshedGroup[]> {
  const rows = await args.tx.audienceGroup.findMany({
    where: { tenantId: args.tenantId },
    select: { id: true, name: true, predicate: true },
    take: 200,
  })

  const refreshed: RefreshedGroup[] = []
  for (const row of rows) {
    const customerIds = await evaluateGroup({
      tx: args.tx,
      tenantId: args.tenantId,
      predicate: parsePredicate(row.predicate),
      now: args.now,
    })

    await args.tx.audienceGroup.update({
      where: { id: row.id },
      data: { lastRefreshedAt: args.now, lastCount: customerIds.length },
    })

    refreshed.push({ id: row.id, name: row.name, count: customerIds.length })
  }

  return refreshed
}
