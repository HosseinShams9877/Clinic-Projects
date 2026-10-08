/**
 * The schema's shape — DoD 2.
 *
 * `03-data-model.md` §4.1: the balance is *computed*, and §4.3's `chargedTotal`,
 * `discountTotal` and `paidTotal` are explicitly "recomputable caches of facts, not a
 * stored balance". A `balance` column would be a second copy of a number the ledger
 * already determines, and the whole point of the nightly reconciliation is that no such
 * column exists to fall out of step.
 *
 * The assertion reads the schema the migrations run against, so a column added by a
 * later release is caught here and not only in review. A field named `balance` inside
 * any model is the failure, whatever its type — there is no model for which a stored
 * balance is right, because the debt is a fact about rows and not a row.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/** The schema's own path, resolved from the package root the test runs in. */
const SCHEMA_PATH = resolve(process.cwd(), 'prisma/schema.prisma')

/** One `model Name { … }` block, as this test reads the file. */
interface ModelBlock {
  readonly name: string
  readonly body: string
}

/**
 * The schema's models, as blocks this test can read field names out of.
 *
 * A Prisma block is `model <name> {` to the matching `}` at the start of a line, and
 * the fields are the lines inside it that are not comments, attributes or the closing
 * brace. A line is a field when its first word is a name and its second a type, which
 * is the shape `balance BigInt` has and `@@index(...)` and `// …` do not.
 */
function readModels(path: string): readonly ModelBlock[] {
  const text = readFileSync(path, 'utf8')
  const models: ModelBlock[] = []
  let rest = text

  for (;;) {
    const start = rest.indexOf('\nmodel ')
    if (start === -1) break
    const open = rest.indexOf('{', start)
    const end = rest.indexOf('\n}', open)
    if (open === -1 || end === -1) break

    const header = rest.slice(start, open)
    const name = header.replace(/^[\s]*model[\s]+/, '').trim()
    models.push({ name, body: rest.slice(open + 1, end) })
    rest = rest.slice(end + 1)
  }

  return models
}

/** One model's field names, in the order the schema declares them. */
function fieldNames(model: ModelBlock): readonly string[] {
  return model.body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => line.split(/\s+/)[0] ?? '')
    .filter((name) => name.length > 0)
}

describe('DoD 2 — no stored balance exists', () => {
  it('declares no field named `balance` on any model', () => {
    const models = readModels(SCHEMA_PATH)
    const names = models.map((model) => model.name)

    // The two models the balance is computed from, so a parser that matched nothing
    // fails here rather than passing vacuously.
    expect(names).toContain('Appointment')
    expect(names).toContain('Payment')

    const offenders = models
      .map((model) => ({
        model: model.name,
        fields: fieldNames(model).filter((name) => name === 'balance'),
      }))
      .filter((found) => found.fields.length > 0)

    expect(offenders).toEqual([])
  })
})
