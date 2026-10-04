/**
 * The retry policy and the error rendering (`status.ts`, ADR-0006).
 *
 * Pure on the clock and pure on the error, which is the whole reason both are
 * functions rather than constants the queue interpolates: a backoff is arithmetic a
 * test can check against the base, and a truncated message is a length a test can
 * check against the budget. Neither touches a database, so neither needs one.
 */

import { describe, expect, it } from 'vitest'

import {
  describeError,
  JobStatus,
  LAST_ERROR_MAX_LENGTH,
  RETRY_BACKOFF_BASE_MS,
  RETRY_BACKOFF_MAX_MS,
  retryRunAt,
} from '../status'

const NOW = new Date('2026-10-03T12:00:00Z')

describe('JobStatus', () => {
  it('spells the five states the queue moves a row through', () => {
    expect(JobStatus).toEqual({
      Pending: 'pending',
      Running: 'running',
      Done: 'done',
      Failed: 'failed',
      Skipped: 'skipped',
    })
  })
})

describe('retryRunAt', () => {
  it('waits the base on the first retry and doubles after it', () => {
    expect(retryRunAt(NOW, 1)).toEqual(new Date(NOW.getTime() + RETRY_BACKOFF_BASE_MS))
    expect(retryRunAt(NOW, 2)).toEqual(new Date(NOW.getTime() + 2 * RETRY_BACKOFF_BASE_MS))
    expect(retryRunAt(NOW, 3)).toEqual(new Date(NOW.getTime() + 4 * RETRY_BACKOFF_BASE_MS))
    expect(retryRunAt(NOW, 4)).toEqual(new Date(NOW.getTime() + 8 * RETRY_BACKOFF_BASE_MS))
  })

  it('never waits longer than the ceiling, however many attempts have failed', () => {
    // The doubling reaches the ceiling at the seventh attempt: 60s, 2m, 4m, 8m, 16m,
    // 32m, then 64m which is past an hour and is what the cap is for.
    expect(retryRunAt(NOW, 6)).toEqual(new Date(NOW.getTime() + 32 * RETRY_BACKOFF_BASE_MS))
    expect(retryRunAt(NOW, 7)).toEqual(new Date(NOW.getTime() + RETRY_BACKOFF_MAX_MS))
    expect(retryRunAt(NOW, 100)).toEqual(new Date(NOW.getTime() + RETRY_BACKOFF_MAX_MS))
  })

  it('treats a non-positive attempt count as the first retry', () => {
    // The queue passes the attempt number, which is one or greater by construction;
    // the clamp is what keeps the exponent arithmetic honest if it ever is not.
    expect(retryRunAt(NOW, 0)).toEqual(retryRunAt(NOW, 1))
    expect(retryRunAt(NOW, -1)).toEqual(retryRunAt(NOW, 1))
  })
})

describe('describeError', () => {
  it('names an Error and keeps its message', () => {
    expect(describeError(new TypeError('not a string'))).toBe('TypeError: not a string')
  })

  it('renders a non-Error as a string, because the queue stores a message and not a trace', () => {
    expect(describeError('a plain string')).toBe('a plain string')
    expect(describeError(42)).toBe('42')
    // `String(value)` is what a thrown non-Error becomes, which is what the column
    // should hold for one.
    expect(describeError({ toString: () => 'an object' })).toBe('an object')
  })

  it('truncates a message longer than the column’s budget and marks the cut', () => {
    const long = 'x'.repeat(LAST_ERROR_MAX_LENGTH + 500)
    const described = describeError(new Error(long))

    expect(described.length).toBe(LAST_ERROR_MAX_LENGTH + 1)
    expect(described.endsWith('…')).toBe(true)
  })

  it('leaves a message that fits the budget alone, marker and all', () => {
    // The budget counts the `Error: ` prefix, so the message itself is shorter by it.
    const message = 'y'.repeat(LAST_ERROR_MAX_LENGTH - 'Error: '.length)
    const described = describeError(new Error(message))

    expect(described).toBe(`Error: ${message}`)
    expect(described.length).toBe(LAST_ERROR_MAX_LENGTH)
    expect(described.endsWith('…')).toBe(false)
  })
})
