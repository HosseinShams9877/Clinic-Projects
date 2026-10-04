/**
 * One sweep of the queue, end to end (`01-tech-stack.md` §4, `02-architecture.md`
 * §12).
 *
 * `queue.test.ts` covers a statement and `runner.test.ts` a job; this file covers the
 * composition: a sweep reads the registry, recovers the dead, claims the due and
 * runs each one, and the failure of one tenant's sweep is the next tenant's problem
 * rather than the tick's. That last property is the one the per-tenant structure
 * exists for, and it is only observable from here — a unit of the loop's size.
 *
 * The registries are fixtures because the release ships an empty one (`registry.ts`),
 * and an empty registry sweeps a queue of jobs it cannot run. The sweep itself is
 * what has to work in both shapes, and both are tested.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'

import { pollOnce, activeTenantIds, type PollConfig } from '../loop'
import { build, type JobHandler } from '../registry'
import { JobStatus } from '../status'
import { createLogger } from '../logger'

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
  TENANT_B,
} from './fixtures'

const CONFIG: PollConfig = { leaseSeconds: LEASE_SECONDS, claimBatch: 20 }

let database: TestDatabase
let client: PrismaClient
let unscoped: PrismaClient
let lines: string[]

beforeAll(async () => {
  database = await createTestDatabase()
  client = database.client
  unscoped = database.unscoped
  lines = []
  await seedTenants(unscoped)
  await unscoped.clinic.createMany({
    data: [
      { id: 'clinic-a', tenantId: TENANT_A, name: 'A' },
      { id: 'clinic-b', tenantId: TENANT_B, name: 'B' },
    ],
  })
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

/** A logger that keeps its lines, so an assertion can read what the sweep reported. */
function capturingLogger() {
  lines = []
  return createLogger({ level: 'debug', runId: 'test-run', writer: (line) => lines.push(line) })
}

describe('activeTenantIds', () => {
  it('lists the active tenants in a stable order and no closed one', async () => {
    expect(await activeTenantIds(client)).toEqual([TENANT_A, TENANT_B])
  })
})

describe('pollOnce', () => {
  /** A handler that writes a clinic in the tenant it was handed, so a sweep proves where it ran. */
  const writeClinic: JobHandler = {
    async run({ tx, job }) {
      // The name is the job's id, because a sweep can claim two jobs for one tenant
      // and `Clinic` is unique on `(tenantId, name)`; the cast is the documented gap,
      // since `tenantId` comes from the scope and not the call.
      await tx.clinic.create({
        data: { name: `Clinic ${job.id}` } as Prisma.ClinicCreateInput,
      })
    },
  }

  it('recovers a dead claim, claims what is due and runs it, in one sweep', async () => {
    const dead = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.write-clinic',
      status: JobStatus.Running,
      attempts: 0,
      claimedAt: new Date(NOW.getTime() - (LEASE_SECONDS + 60) * 1000),
      claimedBy: 'worker-dead',
    })
    const due = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.write-clinic',
      runAt: new Date(NOW.getTime() - 60_000),
    })

    const summary = await pollOnce({
      client,
      now: NOW,
      clock: FIXED_CLOCK,
      registry: build({ 'fixture.write-clinic': writeClinic }),
      config: CONFIG,
      workerId: 'worker-1',
      multiTenant: true,
      logger: capturingLogger(),
    })

    expect(summary).toMatchObject({ tenants: 2, recovered: 1, claimed: 2, done: 2 })

    // The dead claim went back and was taken by this sweep's worker, which is what
    // "recovered and re-claimed inside the same sweep" looks like from the row: the
    // job finished, and the claim is released with it rather than held after the work.
    const deadAfter = await jobById(unscoped, dead.id)
    expect(deadAfter).toMatchObject({ status: JobStatus.Done, claimedBy: null })

    const dueAfter = await jobById(unscoped, due.id)
    expect(dueAfter?.status).toBe(JobStatus.Done)
  })

  it('skips a kind the registry does not know and counts it, without retrying', async () => {
    const unknown = await seedJob(unscoped, { tenantId: TENANT_A, kind: 'fixture.later-phase' })

    const summary = await pollOnce({
      client,
      now: NOW,
      clock: FIXED_CLOCK,
      registry: build({}),
      config: CONFIG,
      workerId: 'worker-1',
      multiTenant: true,
      logger: capturingLogger(),
    })

    expect(summary).toMatchObject({ claimed: 1, skipped: 1, failed: 0 })
    expect(await jobById(unscoped, unknown.id)).toMatchObject({
      status: JobStatus.Skipped,
      attempts: 0,
    })
  })

  it('continues the sweep past a tenant that broke it, and reports the tenant as errored', async () => {
    // A job whose handler deactivates the tenant the sweep visits next. The sweep
    // read the registry before the handler committed, so the next tenant is in the
    // list and no longer resolvable — which is the one path that raises out of a
    // tenant's iteration, and the one this test is for.
    const marker = await seedJob(unscoped, { tenantId: TENANT_B, kind: 'fixture.nothing' })
    await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.closes-tenant-b',
      runAt: new Date(NOW.getTime() - 30_000),
    })
    const closesTenantB: JobHandler = {
      async run({ tx }) {
        await tx.tenant.update({ where: { id: TENANT_B }, data: { isActive: false } })
      },
    }

    const summary = await pollOnce({
      client,
      now: NOW,
      clock: FIXED_CLOCK,
      registry: build({ 'fixture.closes-tenant-b': closesTenantB }),
      config: CONFIG,
      workerId: 'worker-1',
      multiTenant: true,
      logger: capturingLogger(),
    })

    expect(summary).toMatchObject({ errored: 1, done: 1 })
    expect(lines.some((line) => line.includes('worker.tenantSweepFailed'))).toBe(true)

    // The tenant that broke the tick was not served, and the one after it in the
    // registry was — which is the isolation the sweep's structure is for. Tenant B's
    // marker job is untouched, because the sweep never reached the claim.
    expect(await jobById(unscoped, marker.id)).toMatchObject({ status: JobStatus.Pending })

    // Restore the tenant the fixture closed, so the file's other tenants stay active.
    await unscoped.tenant.update({ where: { id: TENANT_B }, data: { isActive: true } })
  })

  it('reports a job that raised as requeued and keeps the sweep going', async () => {
    const failing: JobHandler = { async run() { throw new Error('the handler raised') } }
    await seedJob(unscoped, { tenantId: TENANT_A, kind: 'fixture.raises' })
    await seedJob(unscoped, { tenantId: TENANT_B, kind: 'fixture.write-clinic' })

    const summary = await pollOnce({
      client,
      now: NOW,
      clock: FIXED_CLOCK,
      registry: build({
        'fixture.raises': failing,
        'fixture.write-clinic': writeClinic,
      }),
      config: CONFIG,
      workerId: 'worker-1',
      multiTenant: true,
      logger: capturingLogger(),
    })

    // One tenant's failure did not cost the other its job.
    expect(summary).toMatchObject({ requeued: 1, done: 1 })
  })

  it('claims nothing when the queue is empty and reports an idle sweep', async () => {
    const summary = await pollOnce({
      client,
      now: NOW,
      clock: FIXED_CLOCK,
      registry: build({ 'fixture.write-clinic': writeClinic }),
      config: CONFIG,
      workerId: 'worker-1',
      multiTenant: true,
      logger: capturingLogger(),
    })

    expect(summary).toMatchObject({ tenants: 2, claimed: 0, recovered: 0 })
  })
})
