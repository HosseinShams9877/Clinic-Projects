/**
 * The structured logger (`05-conventions.md` §11).
 *
 * The contract that makes the worker's output greppable: one JSON object per line, a
 * dotted event name, a correlation id on every line, and the error turned into data.
 * A test asserts each by reading the line the writer received, which is the only
 * place the contract is observable — the logger's output is the product here.
 */

import { describe, expect, it } from 'vitest'

import { createLogger, type LogLine, WORKER_EVENTS } from '../logger'

/** Parses the lines a capturing writer received, in the order they were written. */
function linesFor(lines: string[]): LogLine[] {
  return lines.map((line) => {
    const parsed = JSON.parse(line) as LogLine & { readonly ts: string; readonly runId: string }
    return { level: parsed.level, event: parsed.event, fields: parsed.fields }
  })
}

/** A logger writing to an array, so an assertion reads exactly what a process would have emitted. */
function capturing(level: 'debug' | 'info' | 'warn' | 'error') {
  const written: string[] = []
  const logger = createLogger({
    level,
    runId: 'run-1',
    clock: () => new Date('2026-10-03T12:00:00Z'),
    writer: (line) => written.push(line),
  })
  return { logger, written }
}

describe('the line', () => {
  it('is one JSON object carrying the level, the event, the fields, a timestamp and the run id', () => {
    const { logger, written } = capturing('debug')
    logger.info(WORKER_EVENTS.jobDone, { tenantId: 'tenant-a', jobId: 'job-1' })

    const line = JSON.parse(written[0] as string) as Record<string, unknown>
    expect(line).toMatchObject({
      level: 'info',
      event: 'worker.jobDone',
      ts: '2026-10-03T12:00:00.000Z',
      runId: 'run-1',
      fields: { tenantId: 'tenant-a', jobId: 'job-1' },
    })
    expect(written).toHaveLength(1)
  })

  it('emits an empty fields object when the event carries none', () => {
    const { logger, written } = capturing('info')
    logger.info(WORKER_EVENTS.started)

    expect(linesFor(written)[0]?.fields).toEqual({})
  })
})

describe('level filtering', () => {
  it('keeps the threshold level and everything above it', () => {
    const { logger, written } = capturing('warn')
    logger.debug(WORKER_EVENTS.jobClaimed)
    logger.info(WORKER_EVENTS.pollCompleted)
    logger.warn(WORKER_EVENTS.jobRequeued)
    logger.error(WORKER_EVENTS.jobFailed)

    expect(linesFor(written).map((line) => line.event)).toEqual([
      WORKER_EVENTS.jobRequeued,
      WORKER_EVENTS.jobFailed,
    ])
  })

  it('emits everything at debug', () => {
    const { logger, written } = capturing('debug')
    logger.debug(WORKER_EVENTS.jobClaimed)
    logger.error(WORKER_EVENTS.jobFailed)

    expect(written).toHaveLength(2)
  })
})

describe('the error field', () => {
  it('serialises an Error to its name, message and stack, rather than to an empty object', () => {
    const { logger, written } = capturing('error')
    const error = new Error('the job raised')
    logger.error(WORKER_EVENTS.jobFailed, { jobId: 'job-1', error })

    const fields = linesFor(written)[0]?.fields as Record<string, unknown>
    expect(fields.error).toMatchObject({ name: 'Error', message: 'the job raised' })
    expect(typeof fields.error).toBe('object')
    // `JSON.stringify` alone would render an `Error` as `{}`, which says nothing
    // about the thing the line was written for — the stack is the evidence.
    expect((fields.error as { stack: unknown }).stack).toContain('the job raised')
  })

  it('renders a non-Error as a string', () => {
    const { logger, written } = capturing('error')
    logger.error(WORKER_EVENTS.pollFailed, { error: 'a string was thrown' })

    expect((linesFor(written)[0]?.fields as Record<string, unknown>).error).toBe('a string was thrown')
  })

  it('leaves the other fields in place beside it', () => {
    const { logger, written } = capturing('error')
    logger.error(WORKER_EVENTS.jobFailed, { tenantId: 'tenant-a', jobId: 'job-1', error: new Error('x') })

    const fields = linesFor(written)[0]?.fields as Record<string, unknown>
    expect(fields.tenantId).toBe('tenant-a')
    expect(fields.jobId).toBe('job-1')
  })
})

describe('WORKER_EVENTS', () => {
  it('names every event with a dotted code, so a line is greppable by name and not by sentence', () => {
    expect(WORKER_EVENTS.started).toBe('worker.started')
    expect(WORKER_EVENTS.jobFailed).toBe('worker.jobFailed')
    expect(WORKER_EVENTS.tenantSweepFailed).toBe('worker.tenantSweepFailed')
    expect(WORKER_EVENTS.pollCompleted).toBe('worker.pollCompleted')
    expect(WORKER_EVENTS.shuttingDown).toBe('worker.shuttingDown')
  })
})
