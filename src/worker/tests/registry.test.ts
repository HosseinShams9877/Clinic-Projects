/**
 * The job registry — `02-architecture.md` §12, `09-security.md` §8.
 *
 * The mechanism the worker's `unknown kind` path depends on, tested here because the
 * release ships none of the six jobs the architecture names — which makes the empty
 * registry the only shipped entry point a `kind` can be looked up in, and the
 * fixture registries in the other suites the only ones that hold a handler
 * (`registry.ts` documents why that is the honest artefact of the phase order).
 */

import { describe, expect, it } from 'vitest'

import { build, JOB_REGISTRY, type JobHandler, type JobRegistry } from '../registry'

/** A handler a fixture registry holds; its body is never called by these tests. */
const handler: JobHandler = { async run() { await Promise.resolve() } }

describe('build', () => {
  it('holds the handlers it was given, keyed by kind, and lists the kinds', () => {
    const registry: JobRegistry = build({ 'fixture.first': handler })

    expect(registry.handlers['fixture.first']).toBe(handler)
    expect(registry.kinds).toEqual(['fixture.first'])
  })

  it('keeps every kind it was given, in the order they were written', () => {
    const registry = build({ 'fixture.first': handler, 'fixture.second': handler })

    expect(registry.kinds).toEqual(['fixture.first', 'fixture.second'])
  })

  it('builds an empty registry from no entries', () => {
    const registry = build({})

    expect(registry.handlers).toEqual({})
    expect(registry.kinds).toEqual([])
  })

  it('returns a registry that cannot be edited, because a settings row cannot add a handler', () => {
    const registry = build({ 'fixture.first': handler })

    expect(Object.isFrozen(registry)).toBe(true)
    expect(Object.isFrozen(registry.handlers)).toBe(true)
    expect(() => {
      ;(registry.handlers as Record<string, JobHandler>)['fixture.smuggled'] = handler
    }).toThrowError()
  })

  it('does not share its entries with the caller’s object, so a caller cannot mutate the table after it is built', () => {
    const entries: Record<string, JobHandler> = { 'fixture.first': handler }
    const registry = build(entries)

    entries['fixture.second'] = handler

    expect(registry.kinds).toEqual(['fixture.first'])
  })
})

describe('JOB_REGISTRY', () => {
  it('holds one handler per module that has shipped its job, keyed by the kind the module owns', () => {
    // Phase 1 asserted the empty registry, because none of §12's six modules
    // existed. Phase 2 ships the first one: `appointments`'s lifecycle sweep. The
    // five after it land the same way — a kind per module, from the module's barrel.
    expect(JOB_REGISTRY.kinds).toEqual(['appointment.lifecycle'])
    expect(typeof JOB_REGISTRY.handlers['appointment.lifecycle']?.run).toBe('function')
  })
})
