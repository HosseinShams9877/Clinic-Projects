/**
 * The campaign dispatch job — `02-architecture.md` §12's "Campaign dispatch | every 15
 * minutes | `campaigns`", and the only thing that turns a scheduled campaign into sends.
 *
 * The cadence is the architecture document's own and the interval is a property of the
 * job, for the same reason `messages`'s job header gives: the queue that knew every job's
 * interval would be a queue that had to be told. Fifteen minutes is also the width of a
 * send window's edge, so a campaign scheduled for «۱۰:۰۰» is dispatched in the same tick
 * the automatic messages are.
 *
 * ## Why the job is `own-tenant` and the scan is the tenant's own
 *
 * A campaign row is a tenant's, and the dispatch is over that tenant's own campaigns and
 * that tenant's own audience, so there is no tenant to loop over and the job's row is the
 * tenant's. A multi-tenant runner that picked this row up would still run the scan once,
 * against the one tenant the row names.
 *
 * ## Seeding
 *
 * The job reschedules itself once it exists, and the row is seeded by
 * `ensureCampaignsDispatchJob` — called where a tenant's campaigns are already being
 * written, and idempotent on the kind for the reason `messages`'s seed is: a second
 * pending row would be a second dispatch on the same clock.
 */

import type { TransactionClient } from '@/core/db/scope'
import { JobStatus } from '@/worker/status'
import { enqueueJob } from '@/worker/queue'
import type { JobHandler } from '@/worker/registry'

import { dispatchDueCampaigns } from './dispatch'

/** The job kind, as the registry is keyed and the queue stores it. */
export const CAMPAIGNS_DISPATCH_JOB_KIND = 'campaigns.dispatch'

/** How often the dispatch runs — fifteen minutes, §12's cadence made concrete. */
export const CAMPAIGN_DISPATCH_TICK_INTERVAL_MS = 15 * 60 * 1000

/**
 * The dispatch job — sends every campaign the clock has reached, then books its own tick.
 *
 * `scope` is the default `own-tenant` and is stated anyway, for the reason the header
 * gives: the scan is the tenant's own, and there is no tenant to loop over.
 */
export const campaignsDispatchJobHandler: JobHandler = {
  scope: 'own-tenant',
  async run({ tx, job, now }) {
    const outcomes = await dispatchDueCampaigns({ tx, tenantId: job.tenantId, now })

    await enqueueJob({
      tx,
      tenantId: job.tenantId,
      kind: CAMPAIGNS_DISPATCH_JOB_KIND,
      runAt: new Date(now.getTime() + CAMPAIGN_DISPATCH_TICK_INTERVAL_MS),
    })

    const sent = outcomes.reduce((total, outcome) => total + outcome.sent, 0)
    const suppressed = outcomes.reduce((total, outcome) => total + outcome.suppressed, 0)
    // The structured log is where a tick's detail lives; the job row carries one
    // `lastError` and this tick had none. `info` because a dispatch that sent is the
    // dispatch working, and one that skipped every campaign is a fact the outcomes name.
    console.info(
      `[campaigns] dispatch at ${now.toISOString()} tenant=${job.tenantId} ` +
        `campaigns=${outcomes.length} sent=${sent} suppressed=${suppressed}`,
    )
  },
}

/**
 * Ensures a tenant has a pending dispatch row, seeding the recurring schedule.
 *
 * Idempotent on the kind within the tenant, so a caller that runs it on every campaign
 * write does not create a second dispatch. A row in any other state is left alone, for
 * the reason `messages`'s seed gives.
 *
 * @returns whether a row was created, for the caller's own accounting.
 */
export async function ensureCampaignsDispatchJob(args: {
  readonly tx: TransactionClient
  readonly tenantId: string
  readonly now: Date
}): Promise<boolean> {
  const existing = await args.tx.jobQueue.findFirst({
    where: {
      tenantId: args.tenantId,
      kind: CAMPAIGNS_DISPATCH_JOB_KIND,
      status: { in: [JobStatus.Pending, JobStatus.Running] },
    },
    select: { id: true },
  })
  if (existing !== null) return false

  await enqueueJob({
    tx: args.tx,
    tenantId: args.tenantId,
    kind: CAMPAIGNS_DISPATCH_JOB_KIND,
    runAt: args.now,
  })
  return true
}
