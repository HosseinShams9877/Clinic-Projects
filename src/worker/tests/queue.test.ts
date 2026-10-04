/**
 * The claim, the lease and the retry (`09-security.md` §8, ADR-0006).
 *
 * The assertions this file exists for are the ones a mock cannot make. Two workers
 * racing a row is a statement about what a conditional `UPDATE` does when it is
 * issued twice, and a lease expiring is a statement about what the queue does with
 * a row nobody is working on — both of which are answers a database returns, and
 * both of which a mocked client would have been told before the test ran
 * (`10-testing-strategy.md` §2 rule 4).
 *
 * Every query in the module under test takes a transaction, because `JobQueue` is a
 * tenant-scoped model; every query in this file therefore opens the scope the
 * function it calls needs, and reads the result back through the unscoped client,
 * which is the only client that can read a row without a tenant to read it in.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createPrismaClient } from '@/core/db/client'
import { runInTenantScope, tenantContextOf } from '@/core/db/scope'
import { ROLES } from '@/core/constants'
import type { JobQueue, PrismaClient } from '@/generated/prisma/client'

import { claimDueJobs, completeJob, failJob, recoverStaleClaims, skipJob } from '../queue'
import { JobStatus, MAX_JOB_ATTEMPTS, RETRY_BACKOFF_BASE_MS } from '../status'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'
import {
  FIXED_CLOCK,
  jobById,
  LEASE_SECONDS,
  NOW,
  seedJob,
  seedTenants,
  TENANT_A,
} from './fixtures'

const TENANT_A_CONTEXT = tenantContextOf({ tenantId: TENANT_A, role: ROLES[0] })

let database: TestDatabase
let client: PrismaClient
let unscoped: PrismaClient

/** A second client, so a second worker has a connection of its own to race with. */
let rival: PrismaClient

beforeAll(async () => {
  database = await createTestDatabase()
  client = database.client
  unscoped = database.unscoped
  rival = createPrismaClient(database.url)
  await seedTenants(unscoped)
})

afterAll(async () => {
  // The file cannot be removed while a connection holds it, and this one is held
  // outside the harness's own pair, so it closes first.
  await rival.$disconnect()
  await deleteTestDatabase(database)
})

describe('claimDueJobs', () => {
  it('claims a due job and marks it running with this worker as its owner', async () => {
    const job = await seedJob(unscoped, { tenantId: TENANT_A })

    const claimed = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      claimDueJobs({ tx, now: NOW, workerId: 'worker-1', batch: 10 }),
    )

    expect(claimed).toHaveLength(1)
    expect(claimed[0]?.id).toBe(job.id)

    const after = await jobById(unscoped, job.id)
    expect(after).toMatchObject({
      status: JobStatus.Running,
      claimedBy: 'worker-1',
      claimedAt: NOW,
      attempts: 0,
    })
  })

  it('leaves a job that is not due yet, and one that is already running', async () => {
    const future = await seedJob(unscoped, { tenantId: TENANT_A, runAt: new Date(NOW.getTime() + 60_000) })
    const running = await seedJob(unscoped, {
      tenantId: TENANT_A,
      status: JobStatus.Running,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })

    const claimed = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      claimDueJobs({ tx, now: NOW, workerId: 'worker-2', batch: 10 }),
    )

    expect(claimed.map((row) => row.id)).not.toContain(future.id)
    expect(claimed.map((row) => row.id)).not.toContain(running.id)
    expect(await jobById(unscoped, future.id)).toMatchObject({ status: JobStatus.Pending })
  })

  it('claims no more than the batch, in due order', async () => {
    const third = await seedJob(unscoped, { tenantId: TENANT_A, runAt: new Date(NOW.getTime() + 30_000) })
    const first = await seedJob(unscoped, { tenantId: TENANT_A, runAt: new Date(NOW.getTime() - 30_000) })
    const second = await seedJob(unscoped, { tenantId: TENANT_A })

    const claimed = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      claimDueJobs({ tx, now: NOW, workerId: 'worker-1', batch: 2 }),
    )

    expect(claimed.map((row) => row.id)).toEqual([first.id, second.id])
    expect(await jobById(unscoped, third.id)).toMatchObject({ status: JobStatus.Pending })
  })

  it('lets only one of two workers take the same row', async () => {
    // The claim the worker makes is a conditional `UPDATE`, and the condition is the
    // whole mechanism: the second statement to run finds the row already `running`
    // and matches nothing, which is the answer "somebody else has this job" rather
    // than an error. Two workers therefore cannot double-run one job.
    //
    // The two claims are issued in sequence rather than in a race because the
    // suite's engine is SQLite and its driver holds a write transaction on one
    // connection, so two concurrent ones deadlock rather than interleave. The
    // property under test is what the *second* statement matches, not the order a
    // scheduler chose — and on PostgreSQL, where the same claim runs under real
    // concurrency, the predicate is still the mechanism and `SKIP LOCKED` the
    // optimisation on top of it.
    const job = await seedJob(unscoped, { tenantId: TENANT_A })

    const first = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      claimDueJobs({ tx, now: NOW, workerId: 'worker-1', batch: 10 }),
    )
    const second = await runInTenantScope(TENANT_A_CONTEXT, rival, (tx) =>
      claimDueJobs({ tx, now: NOW, workerId: 'worker-2', batch: 10 }),
    )

    expect(first).toHaveLength(1)
    expect(first[0]?.id).toBe(job.id)
    // The second worker read the same queue and took nothing from it.
    expect(second).toHaveLength(0)

    const after = await jobById(unscoped, job.id)
    expect(after).toMatchObject({ status: JobStatus.Running, claimedBy: 'worker-1' })
  })
})

describe('recoverStaleClaims', () => {
  /** A claim older than the lease, from a process that never recorded an outcome. */
  const deadClaim = async (attempts: number): Promise<JobQueue> =>
    seedJob(unscoped, {
      tenantId: TENANT_A,
      status: JobStatus.Running,
      attempts,
      claimedAt: new Date(NOW.getTime() - (LEASE_SECONDS + 60) * 1000),
      claimedBy: 'worker-dead',
    })

  it('returns a claim that outlived the lease to the queue and counts it as an attempt', async () => {
    const job = await deadClaim(1)

    const recovered = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      recoverStaleClaims({ tx, now: NOW, leaseSeconds: LEASE_SECONDS }),
    )

    expect(recovered).toBe(1)
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Pending,
      attempts: 2,
      claimedAt: null,
      claimedBy: null,
    })
  })

  it('leaves a claim that is still within its lease alone', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      status: JobStatus.Running,
      attempts: 0,
      claimedAt: new Date(NOW.getTime() - 60 * 1000),
      claimedBy: 'worker-1',
    })

    const recovered = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      recoverStaleClaims({ tx, now: NOW, leaseSeconds: LEASE_SECONDS }),
    )

    expect(recovered).toBe(0)
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Running,
      claimedBy: 'worker-1',
      attempts: 0,
    })
  })

  it('fails a dead claim whose attempt budget is spent, instead of re-queueing it forever', async () => {
    // This is the case that makes "a job that always kills its worker" impossible: a
    // claim that dies does not return for free, and once the budget is exhausted the
    // lease marks the job terminal rather than handing it out again.
    const job = await deadClaim(MAX_JOB_ATTEMPTS)

    const recovered = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      recoverStaleClaims({ tx, now: NOW, leaseSeconds: LEASE_SECONDS }),
    )

    expect(recovered).toBe(1)
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Failed,
      attempts: MAX_JOB_ATTEMPTS,
      finishedAt: NOW,
    })
  })

  it('recovers each stale claim exactly once', async () => {
    await Promise.all([deadClaim(0), deadClaim(2), deadClaim(MAX_JOB_ATTEMPTS)])

    const recovered = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      recoverStaleClaims({ tx, now: NOW, leaseSeconds: LEASE_SECONDS }),
    )

    expect(recovered).toBe(3)
  })
})

describe('completeJob', () => {
  it('records the job done and clears the claim and the previous error', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      status: JobStatus.Running,
      attempts: 1,
      claimedAt: NOW,
      claimedBy: 'worker-1',
      lastError: 'a failure from the attempt before',
    })

    await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      completeJob({ tx, jobId: job.id, now: NOW }),
    )

    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Done,
      finishedAt: NOW,
      claimedAt: null,
      claimedBy: null,
      lastError: null,
    })
  })
})

describe('failJob', () => {
  it('counts the attempt, records the error and re-queues the job with a backoff', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      status: JobStatus.Running,
      attempts: 0,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })

    const outcome = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      failJob({
        tx,
        job,
        now: NOW,
        error: new Error('the handler raised'),
        maxAttempts: MAX_JOB_ATTEMPTS,
      }),
    )

    expect(outcome).toBe('requeued')
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Pending,
      attempts: 1,
      // The first retry waits the base, which is what the backoff's exponent is for.
      runAt: new Date(NOW.getTime() + RETRY_BACKOFF_BASE_MS),
      lastError: 'Error: the handler raised',
      claimedAt: null,
      claimedBy: null,
    })
  })

  it('marks the job failed once the attempt budget is exhausted, and keeps its due time', async () => {
    const runAt = new Date(NOW.getTime() - 60_000)
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      status: JobStatus.Running,
      attempts: MAX_JOB_ATTEMPTS - 1,
      runAt,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })

    const outcome = await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      failJob({
        tx,
        job,
        now: NOW,
        error: new Error('the handler raised again'),
        maxAttempts: MAX_JOB_ATTEMPTS,
      }),
    )

    expect(outcome).toBe('failed')
    // A terminal failure does not move the due time: the row is being inspected, and
    // what it says it was supposed to run is still what it was supposed to run.
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Failed,
      attempts: MAX_JOB_ATTEMPTS,
      finishedAt: NOW,
      runAt,
    })
  })
})

describe('skipJob', () => {
  it('records a job the worker cannot run without counting an attempt', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      status: JobStatus.Running,
      attempts: 0,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })

    await runInTenantScope(TENANT_A_CONTEXT, client, (tx) =>
      skipJob({ tx, jobId: job.id, kind: 'fixture.unknown', now: FIXED_CLOCK() }),
    )

    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Skipped,
      finishedAt: NOW,
      attempts: 0,
    })
    // The `kind` is in the reason, because "no handler for this" is a deployment
    // fact and the reason is what an operator reading the queue needs.
    expect((await jobById(unscoped, job.id))?.lastError).toContain('fixture.unknown')
  })
})
