/**
 * `tenant-models.ts`’s header promises this test:
 *
 * > `tests/tenant-models.test.ts` reads `prisma/schema.prisma` and asserts this
 * > array is exactly its set of models with a scalar `tenantId`. A model that gains
 * > a `tenantId` and is not added here fails that test, which is the same failure
 * > `check:rls` reports from the other direction.
 *
 * Two lists are derived from the same schema by two different consumers, and both
 * must agree with the hand-written one: this test, and
 * `scripts/check-rls-coverage.mjs`. The agreement is what makes "every
 * tenant-scoped table has a policy" and "Layer 1 applies to every tenant-scoped
 * model" the same sentence.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { TENANT_SCOPED_MODELS, isTenantScoped } from '../tenant-models'

const SCHEMA = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8')

/**
 * Every `model Name { … }` block, parsed the way the RLS coverage check parses
 * them, so the two derivations cannot drift apart in how they read the file.
 */
const MODELS = [...SCHEMA.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)].map((match) => {
  const [, name, body] = match
  // `matchAll` yields only matches, so both groups are present on every row. The
  // guard is there for the type; the throw cannot be reached.
  if (name === undefined || body === undefined) {
    throw new Error('A model block matched without its name or body, which the regex cannot do.')
  }
  return { name, hasScalarTenantId: /^\s*tenantId\s+\S/m.test(body) }
})

describe('the tenant-scoped model list', () => {
  it('is exactly the schema’s models with a scalar tenantId', () => {
    const expected = MODELS.filter((model) => model.hasScalarTenantId).map((model) => model.name)

    expect([...TENANT_SCOPED_MODELS].sort()).toEqual([...expected].sort())
  })

  it('answers for every model the extension is asked about', () => {
    // A name in the array that the schema does not declare is inert, and a name
    // the schema declares that is missing from the array is a model Layer 1
    // silently does not apply to. The first test covers both; this one covers the
    // spelling, because the hook receives `Clinic` and a `clinic` in the array
    // would match nothing.
    for (const name of TENANT_SCOPED_MODELS) {
      expect(isTenantScoped(name)).toBe(true)
      expect(MODELS.some((model) => model.name === name)).toBe(true)
    }

    expect(isTenantScoped('Tenant')).toBe(false)
    expect(isTenantScoped('clinic')).toBe(false)
  })

  it('excludes the tenant registry, which is scoped by id and not by tenantId', () => {
    const tenant = MODELS.find((model) => model.name === 'Tenant')
    expect(tenant).toBeDefined()
    expect(tenant?.hasScalarTenantId).toBe(false)
    expect(TENANT_SCOPED_MODELS).not.toContain('Tenant')
  })
})
