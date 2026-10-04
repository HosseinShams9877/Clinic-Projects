/**
 * The runner — a claimed job under its tenant's scope (`09-security.md` §8).
 *
 * The claim under test here is the one the security rules are about: a job's handler
 * sees only its own tenant's rows, a job whose tenant closed does not become a
 * failure, and a `kind` this release has no handler for is skipped rather than
 * retried until the end of time. Each is a property of what the runner *does* with
 * the scope it opens, so each is asserted against a real database rather than a
 * client that was told what to return.
 *
 * The handlers below are fixtures built for this file. The release ships none
 * (`registry.ts`), so a fixture is the only way to exercise a handler at all — and
 * the registry's own suite is what covers the empty case.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Prisma } from '@/generated/prisma/client'
import type { PrismaClient } from '@/generated/prisma/client'

import { runInTenantScope, tenantContextOf } from '@/core/db/scope'
import { ROLES } from '@/core/constants'

import { runJob, handlerFor, type JobOutcome } from '../runner'
import type { JobHandler } from '../registry'
import { JobStatus, MAX_JOB_ATTEMPTS } from '../status'
import { createLogger } from '../logger'

import {
  createTestDatabase,
  deleteTestDatabase,
  type TestDatabase,
} from '@/core/db/tests/database'
import {
  FIXED_CLOCK,
  jobById,
  NOW,
  seedJob,
  seedTenants,
  TENANT_A,
  TENANT_B,
  TENANT_CLOSED,
} from './fixtures'

const TENANT_A_CONTEXT = tenantContextOf({ tenantId: TENANT_A, role: ROLES[0] })

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
  // The row a scope is supposed to keep out: a clinic in the other tenant, which a
  // handler running for tenant-a must not see.
  await unscoped.clinic.createMany({
    data: [{ id: 'clinic-b', tenantId: TENANT_B, name: 'B' }],
  })
})

afterAll(async () => {
  await deleteTestDatabase(database)
})

/** A logger that keeps its lines, so an assertion can read what the runner reported. */
function capturingLogger() {
  lines = []
  return createLogger({ level: 'debug', runId: 'test-run', writer: (line) => lines.push(line) })
}

describe('a job with a handler', () => {
  /** A handler that writes a clinic in whatever scope it was handed. */
  const writeClinic: JobHandler = {
    async run({ tx, job }) {
      // The name is the job's id, because `Clinic` is unique on `(tenantId, name)`
      // and two jobs in this suite write one each. The cast is the documented gap:
      // `tenantId` is supplied by the scope's extension and required by the type.
      await tx.clinic.create({
        data: { name: `Clinic ${job.id}` } as Prisma.ClinicCreateInput,
      })
    },
  }

  it('runs under its own tenant, records the job done, and reports the outcome', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.write-clinic',
      status: JobStatus.Running,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })

    const outcome = await runJob({
      client,
      job,
      handler: writeClinic,
      now: NOW,
      clock: FIXED_CLOCK,
      multiTenant: true,
      tenantIds: [TENANT_A, TENANT_B],
      logger: capturingLogger(),
    })

    expect(outcome).toBe('done')
    expect(await jobById(unscoped, job.id)).toMatchObject({ status: JobStatus.Done, finishedAt: NOW })

    const clinics = await unscoped.clinic.findMany({ where: { tenantId: TENANT_A } })
    expect(clinics.some((row) => row.name === `Clinic ${job.id}`)).toBe(true)
  })

  it('cannot see another tenant’s rows from inside its own scope', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.count-clinics',
      status: JobStatus.Running,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })
    const seen: string[] = []
    const handler: JobHandler = {
      async run({ tx }) {
        const clinics = await tx.clinic.findMany()
        seen.push(...clinics.map((row) => row.id))
      },
    }

    await runJob({
      client,
      job,
      handler,
      now: NOW,
      clock: FIXED_CLOCK,
      multiTenant: true,
      tenantIds: [TENANT_A, TENANT_B],
      logger: capturingLogger(),
    })

    // Tenant B has a clinic and the handler ran in tenant A, so the scope is what
    // kept it out — not the handler's good behaviour.
    expect(seen).not.toContain('clinic-b')
  })

  it('records the error, counts the attempt and re-queues when the handler raises', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.raises',
      status: JobStatus.Running,
      attempts: 0,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })
    const handler: JobHandler = { async run() { throw new Error('the handler raised') } }

    const outcome = await runJob({
      client,
      job,
      handler,
      now: NOW,
      clock: FIXED_CLOCK,
      multiTenant: true,
      tenantIds: [TENANT_A],
      logger: capturingLogger(),
    })

    expect(outcome).toBe('requeued')
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Pending,
      attempts: 1,
      lastError: 'Error: the handler raised',
    })
    expect(lines.some((line) => line.includes('worker.jobRequeued'))).toBe(true)
  })

  it('marks the job failed once the attempt budget is exhausted', async () => {
    // The runner is called once per attempt, the way the poll loop calls it, and the
    // row is read back between calls because the attempt counter is what the queue
    // moved — not something the runner holds in memory.
    let job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.always-raises',
      status: JobStatus.Running,
      attempts: 0,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })
    const handler: JobHandler = { async run() { throw new Error('it raises every time') } }
    const outcomes: JobOutcome[] = []

    for (let attempt = 0; attempt < MAX_JOB_ATTEMPTS; attempt += 1) {
      const current = await jobById(unscoped, job.id)
      if (current === null) throw new Error('the seeded job is gone')
      outcomes.push(
        await runJob({
          client,
          job: current,
          handler,
          now: NOW,
          clock: FIXED_CLOCK,
          multiTenant: true,
          tenantIds: [TENANT_A],
          maxAttempts: MAX_JOB_ATTEMPTS,
          logger: capturingLogger(),
        }),
      )
      job = current
    }

    expect(outcomes).toEqual(['requeued', 'requeued', 'requeued', 'requeued', 'failed'])
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Failed,
      attempts: MAX_JOB_ATTEMPTS,
      lastError: 'Error: it raises every time',
    })
  })

  it('leaves no work behind when the handler writes then raises: the outcome and the work roll back together', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.writes-then-raises',
      status: JobStatus.Running,
      attempts: 0,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })
    const before = await unscoped.clinic.count({ where: { tenantId: TENANT_A } })
    const handler: JobHandler = {
      async run({ tx }) {
        await tx.clinic.create({ data: { name: 'Clinic that should not survive' } as Prisma.ClinicCreateInput })
        throw new Error('after the write')
      },
    }

    const outcome = await runJob({
      client,
      job,
      handler,
      now: NOW,
      clock: FIXED_CLOCK,
      multiTenant: true,
      tenantIds: [TENANT_A],
      logger: capturingLogger(),
    })

    expect(outcome).toBe('requeued')
    expect(await unscoped.clinic.count({ where: { tenantId: TENANT_A } })).toBe(before)
  })
})

describe('a job whose kind has no handler', () => {
  it('is skipped without an attempt, and is not claimed again on the next sweep', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.from-a-later-phase',
      status: JobStatus.Running,
      attempts: 0,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })

    const outcome = await runJob({
      client,
      job,
      handler: undefined,
      now: NOW,
      clock: FIXED_CLOCK,
      multiTenant: true,
      tenantIds: [TENANT_A],
      logger: capturingLogger(),
    })

    expect(outcome).toBe('skipped')
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Skipped,
      // Nothing ran, so nothing was spent: the state is the deployment skew, not a
      // failure, and the attempt count says so.
      attempts: 0,
    })
    expect(lines.some((line) => line.includes('worker.unknownJobKind'))).toBe(true)

    // `skipped` is terminal, which is what keeps an unknown kind from being retried
    // forever: the next sweep's claim looks for `pending` and this row is not one.
    const requeued = await runInTenantScope(TENANT_A_CONTEXT, client, async (tx) => {
      const rows = await tx.jobQueue.findMany({ where: { id: job.id, status: JobStatus.Pending } })
      return rows.length
    })
    expect(requeued).toBe(0)
  })
})

describe('a job whose tenant closed', () => {
  it('is left as it is and reported as unresolved, not failed', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_CLOSED,
      kind: 'fixture.own-tenant',
      status: JobStatus.Running,
      attempts: 1,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })
    const handler: JobHandler = { async run() { throw new Error('must not run') } }

    const outcome = await runJob({
      client,
      job,
      handler,
      now: NOW,
      clock: FIXED_CLOCK,
      multiTenant: true,
      tenantIds: [TENANT_A, TENANT_B],
      logger: capturingLogger(),
    })

    expect(outcome).toBe('unresolved')
    expect(lines.some((line) => line.includes('worker.jobUnresolved'))).toBe(true)
    // The row is untouched, because every write on it needs the tenant's scope and
    // the tenant will not serve one. `running` in a closed tenant is inert.
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Running,
      attempts: 1,
    })
  })
})

describe('a job that spans tenants', () => {
  /** A handler that records which tenant's rows it could see, one entry per tenant. */
  const handlerVisiting = (visited: string[], raised: string[]): JobHandler => ({
    scope: 'each-tenant',
    async run({ tx }) {
      const clinics = await tx.clinic.findMany()
      if (clinics.length === 0) return
      visited.push(clinics[0]?.tenantId as string)
      if (clinics[0]?.tenantId === TENANT_B) {
        raised.push(TENANT_B)
        throw new Error('tenant B refuses')
      }
    },
  })

  it('runs once per active tenant, each in its own scope', async () => {
    await unscoped.clinic.createMany({
      data: [
        { id: 'clinic-a', tenantId: TENANT_A, name: 'A' },
        { id: 'clinic-b-span', tenantId: TENANT_B, name: 'B span' },
      ],
    })
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.each-tenant',
      status: JobStatus.Running,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })
    const visited: string[] = []
    const raised: string[] = []

    const outcome = await runJob({
      client,
      job,
      handler: handlerVisiting(visited, raised),
      now: NOW,
      clock: FIXED_CLOCK,
      multiTenant: true,
      tenantIds: [TENANT_A, TENANT_B],
      logger: capturingLogger(),
    })

    // Both tenants were visited, including the job's own — the spanning job does not
    // get a separate run for its own tenant on top of the loop.
    expect(visited.sort()).toEqual([TENANT_A, TENANT_B])
    expect(raised).toEqual([TENANT_B])
    // One tenant's failure did not stop the other's iteration, and the outcome is
    // the failure, recorded in the job's own tenant scope.
    expect(outcome).toBe('requeued')
    expect(await jobById(unscoped, job.id)).toMatchObject({
      status: JobStatus.Pending,
      attempts: 1,
      lastError: 'Error: tenant B refuses',
    })
  })

  it('is done when every tenant iteration succeeded', async () => {
    const job = await seedJob(unscoped, {
      tenantId: TENANT_A,
      kind: 'fixture.each-tenant-ok',
      status: JobStatus.Running,
      claimedAt: NOW,
      claimedBy: 'worker-1',
    })
    const visited: string[] = []
    const raised: string[] = []

    const outcome = await runJob({
      client,
      job,
      handler: handlerVisiting(visited, raised),
      now: NOW,
      clock: FIXED_CLOCK,
      multiTenant: true,
      tenantIds: [TENANT_A],
      logger: capturingLogger(),
    })

    expect(outcome).toBe('done')
    expect(raised).toEqual([])
    expect(await jobById(unscoped, job.id)).toMatchObject({ status: JobStatus.Done })
  })
})

describe('handlerFor', () => {
  it('returns the handler for a kind the registry holds', async () => {
    const handler: JobHandler = { async run() { await Promise.resolve() } }
    expect(handlerFor({ handlers: { 'fixture.known': handler }, kinds: ['fixture.known'] }, 'fixture.known')).toBe(handler)
  })

  it('returns nothing for a kind the registry does not hold', async () => {
    expect(handlerFor({ handlers: {}, kinds: [] }, 'fixture.known')).toBeUndefined()
  })
})
