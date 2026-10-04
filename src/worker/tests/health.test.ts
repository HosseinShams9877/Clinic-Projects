/**
 * The health check — `setup/deployment.md` §6.
 *
 * > | `/api/health/worker` | The worker has claimed a job since it last started,
 * > | and its last error time | The worker's supervisor |
 *
 * The status is derived, never stored: a supervisor reads whether the process did
 * its job, and the facts that decide it are the last claim, the last error and the
 * last poll. This file asserts the derivation in both directions — the boot that is
 * too young to have claimed anything is healthy, and the boot that is old enough and
 * has not is not — and then asserts the endpoint serves the derived body, because a
 * supervisor reads HTTP, not a function.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createWorkerHealth,
  healthPayload,
  HEALTH_PATH,
  recordError,
  recordPoll,
  startHealthServer,
} from '../health'
import type { PollSummary } from '../loop'
import { createLogger } from '../logger'

const STARTED_AT = new Date('2026-10-03T12:00:00Z')
const POLL_INTERVAL_MS = 30_000

/** A health state at boot, with every fact the process has not produced yet. */
function healthAtBoot() {
  return createWorkerHealth({ startedAt: STARTED_AT, kinds: ['fixture.test'] })
}

/** A summary with only the counters the test is exercising. */
function summaryWith(fields: Partial<PollSummary>): PollSummary {
  return {
    tenants: 2,
    recovered: 0,
    claimed: 0,
    done: 0,
    requeued: 0,
    failed: 0,
    skipped: 0,
    errored: 0,
    ...fields,
  }
}

describe('healthPayload', () => {
  it('is ok for a boot younger than the first tick could have landed', () => {
    const payload = healthPayload(healthAtBoot(), new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS), POLL_INTERVAL_MS)
    expect(payload.status).toBe('ok')
    expect(payload.uptimeMs).toBe(POLL_INTERVAL_MS)
    expect(payload.lastClaimedAt).toBeNull()
    expect(payload.polls).toBe(0)
  })

  it('is down when the process is old enough for two ticks and has polled nothing', () => {
    const now = new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS * 3)
    const payload = healthPayload(healthAtBoot(), now, POLL_INTERVAL_MS)
    expect(payload.status).toBe('down')
  })

  it('is degraded when the process polls but has never claimed a job', () => {
    const health = healthAtBoot()
    recordPoll(health, new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS), summaryWith({ claimed: 0 }))
    const now = new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS * 3)

    // It is alive — the polls are moving — and it is not doing its job, which is the
    // two facts `degraded` exists to say in one word.
    expect(healthPayload(health, now, POLL_INTERVAL_MS).status).toBe('degraded')
  })

  it('is degraded when an error was recorded and nothing was ever claimed', () => {
    const health = healthAtBoot()
    recordError(health, new Date(STARTED_AT.getTime() + 5_000), new Error('the database went away'))

    const payload = healthPayload(health, new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS), POLL_INTERVAL_MS)
    expect(payload.status).toBe('degraded')
    expect(payload.lastErrorMessage).toBe('the database went away')
  })

  it('is ok when the worker has claimed, even after an error', () => {
    const health = healthAtBoot()
    const firstPoll = new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS)
    recordPoll(health, firstPoll, summaryWith({ claimed: 1 }))
    recordPoll(health, firstPoll, summaryWith({ failed: 1 }))

    const payload = healthPayload(health, new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS * 3), POLL_INTERVAL_MS)
    expect(payload.status).toBe('ok')
    expect(payload.claimedTotal).toBe(1)
    expect(payload.lastErrorAt).toBe(firstPoll.toISOString())
  })

  it('reports the kinds this release can run, which is what "cannot" looks like next to "nothing to do"', () => {
    const health = createWorkerHealth({ startedAt: STARTED_AT, kinds: ['audience-groups.refresh'] })
    expect(healthPayload(health, STARTED_AT, POLL_INTERVAL_MS).kinds).toEqual(['audience-groups.refresh'])
  })

  it('renders the timestamps as ISO strings, or null where no fact exists yet', () => {
    const health = healthAtBoot()
    const pollAt = new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS)
    recordPoll(health, pollAt, summaryWith({ claimed: 2 }))

    const payload = healthPayload(health, new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS * 2), POLL_INTERVAL_MS)
    expect(payload.lastPollAt).toBe(pollAt.toISOString())
    expect(payload.lastClaimedAt).toBe(pollAt.toISOString())
    expect(payload.lastErrorAt).toBeNull()
  })
})

describe('recordPoll', () => {
  it('counts every poll and moves the claim time only when a job was claimed', () => {
    const health = healthAtBoot()
    const first = new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS)
    const second = new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS * 2)

    recordPoll(health, first, summaryWith({ claimed: 3 }))
    expect(health).toMatchObject({ polls: 1, lastPollAt: first, claimedTotal: 3, lastClaimedAt: first })

    recordPoll(health, second, summaryWith({ claimed: 0 }))
    expect(health).toMatchObject({ polls: 2, claimedTotal: 3, lastClaimedAt: first })
  })

  it('records a terminal failure as an error, which is the condition a supervisor pages for', () => {
    const health = healthAtBoot()
    const now = new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS)
    recordPoll(health, now, summaryWith({ failed: 1 }))

    expect(health.lastErrorAt).toBe(now)
    expect(health.lastErrorMessage).toBe('1 job(s) reached their terminal state on this poll.')
  })

  it('records a sweep that failed as an error', () => {
    const health = healthAtBoot()
    const now = new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS)
    recordPoll(health, now, summaryWith({ errored: 1 }))

    expect(health.lastErrorAt).toBe(now)
    expect(health.lastErrorMessage).toBe('1 tenant sweep(s) failed on this poll.')
  })
})

describe('recordError', () => {
  it('records the message of an error, and the string of anything else', () => {
    const health = healthAtBoot()
    const now = new Date(STARTED_AT.getTime() + POLL_INTERVAL_MS)

    recordError(health, now, new Error('the loop broke'))
    expect(health.lastErrorAt).toBe(now)
    expect(health.lastErrorMessage).toBe('the loop broke')

    recordError(health, now, 'a string')
    expect(health.lastErrorMessage).toBe('a string')
  })
})

describe('startHealthServer', () => {
  const health = healthAtBoot()

  /** A logger whose lines are discarded; the endpoint is what this file reads. */
  const logger = createLogger({
    level: 'info',
    runId: 'test-run',
    clock: () => STARTED_AT,
    writer: () => undefined,
  })

  /** The handle the suite probes, resolved once and closed once. */
  let handle: Awaited<ReturnType<typeof startHealthServer>>

  beforeAll(async () => {
    // Port `0` asks the kernel for an ephemeral port, which is what a test needs, and
    // the resolved port is on the handle the server returns. The state the endpoint
    // reports is the same object the suite above wrote to, which is the point: the
    // loop writes it and the endpoint reads it.
    handle = await startHealthServer({
      health,
      port: 0,
      pollIntervalMs: POLL_INTERVAL_MS,
      clock: () => STARTED_AT,
      logger,
    })
  })

  afterAll(async () => {
    await handle.close()
  })

  it('answers the documented path with the payload and a no-store cache header', async () => {
    const response = await fetch(`http://127.0.0.1:${handle.port}${HEALTH_PATH}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({ status: 'ok', polls: 0 })
  })

  it('answers any other path with 404 and nothing about the worker', async () => {
    const response = await fetch(`http://127.0.0.1:${handle.port}/api/health`)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ status: 'not-found' })
  })

  it('serves 503 when the worker is down, which is the status a supervisor alerts on', async () => {
    // A boot old enough to have ticked and never polled — the derivation in
    // `healthPayload`, served over HTTP.
    const down = await startHealthServer({
      health: createWorkerHealth({
        startedAt: new Date(STARTED_AT.getTime() - POLL_INTERVAL_MS * 3),
        kinds: health.kinds,
      }),
      port: 0,
      pollIntervalMs: POLL_INTERVAL_MS,
      clock: () => STARTED_AT,
      logger,
    })

    try {
      const response = await fetch(`http://127.0.0.1:${down.port}${HEALTH_PATH}`)
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ status: 'down' })
    } finally {
      await down.close()
    }
  })

  it('stops listening when the handle closes', async () => {
    const stopped = await startHealthServer({
      health,
      port: 0,
      pollIntervalMs: POLL_INTERVAL_MS,
      clock: () => STARTED_AT,
      logger,
    })
    await stopped.close()

    await expect(fetch(`http://127.0.0.1:${stopped.port}${HEALTH_PATH}`).then(
      (response) => `unexpected ${response.status} response`,
      (error) => error instanceof Error ? error.constructor.name : String(error),
    )).resolves.toBe('TypeError')
  })
})
