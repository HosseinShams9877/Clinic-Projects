/**
 * The rows the worker's suites need, written outside any scope.
 *
 * The worker's contract is that a `JobQueue` row is only ever touched through a
 * tenant scope, so the suites that test it need the opposite: a client that writes
 * the rows a scope is supposed to govern, which is what `createUnscopedClient` is
 * for (`client.ts` documents it as one of the four permitted uses). This file holds
 * that seeding so three suites do not each rebuild it, and so the clock every suite
 * reads is one named constant rather than three near-identical dates.
 *
 * The clock is fixed to a date before any of these tests were written for the same
 * reason `src/modules/auth/tests/login.test.ts` fixes its own: an expiry, a lease
 * and a backoff are facts about an instant the test names, and a test that read the
 * wall clock would be asserting tomorrow's queue against today's.
 */

import type { JobQueue, PrismaClient } from '@/generated/prisma/client'

import { JobStatus } from '../status'

/** The tenants the sweep visits. */
export const TENANT_A = 'tenant-a'
export const TENANT_B = 'tenant-b'
/** A tenant that closed, which a job may still be queued for. */
export const TENANT_CLOSED = 'tenant-closed'

/**
 * The instant every suite sweeps at. Named so a lease boundary is `NOW` minus the
 * lease and a backoff is `NOW` plus the base — arithmetic a reader can check rather
 * than a date that has to be taken on trust.
 */
export const NOW = new Date('2026-10-03T12:00:00Z')

/** The clock the runner measures a duration with, which is always the same instant. */
export const FIXED_CLOCK = (): Date => NOW

/** A lease long enough that a claim made now is not stale now. */
export const LEASE_SECONDS = 300

/**
 * Seeds the tenants the sweep and the runner resolve, including one that closed.
 *
 * `Clinic` rows are not seeded here: a handler that writes one is how a suite proves
 * which tenant it ran under, so the row's absence before the job is the assertion's
 * starting condition.
 */
export async function seedTenants(unscoped: PrismaClient): Promise<void> {
  await unscoped.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 'a', name: 'A', isActive: true },
      { id: TENANT_B, slug: 'b', name: 'B', isActive: true },
      { id: TENANT_CLOSED, slug: 'closed', name: 'Closed', isActive: false },
    ],
  })
}

/** The fields a seeded job may set; everything else is the queue's default. */
export interface SeedJob {
  readonly tenantId: string
  readonly kind?: string
  readonly status?: string
  readonly runAt?: Date
  readonly attempts?: number
  readonly claimedAt?: Date | null
  readonly claimedBy?: string | null
  readonly lastError?: string | null
}

/**
 * Writes one job row the way an enqueuing module's write appears to the worker: on
 * the queue, outside every scope. Returns the row, because a test needs the id it
 * cannot predict and the `attempts` value it did not set.
 */
export async function seedJob(
  unscoped: PrismaClient,
  job: SeedJob,
): Promise<JobQueue> {
  return unscoped.jobQueue.create({
    data: {
      tenantId: job.tenantId,
      kind: job.kind ?? 'fixture.test',
      status: job.status ?? JobStatus.Pending,
      runAt: job.runAt ?? NOW,
      attempts: job.attempts ?? 0,
      claimedAt: job.claimedAt ?? null,
      claimedBy: job.claimedBy ?? null,
      lastError: job.lastError ?? null,
    },
  })
}

/** Reads a job back across every scope, which is how a suite asserts what the worker left. */
export async function jobById(
  unscoped: PrismaClient,
  jobId: string,
): Promise<JobQueue | null> {
  return unscoped.jobQueue.findUnique({ where: { id: jobId } })
}
