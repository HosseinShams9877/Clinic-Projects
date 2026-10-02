#!/usr/bin/env node
/**
 * The portability check of `setup/database-migration.md` §9 and
 * `03-data-model.md` §5.
 *
 * > **Schema portability.** The migration list is applied to a fresh SQLite
 * > database and a fresh PostgreSQL database on every pull request. If a
 * > migration uses an engine-specific feature, the engine that cannot apply it
 * > fails the build — before the developer finds out on the clinic's server.
 *
 * ## What this script can and cannot do
 *
 * The document describes applying the **migration list** to both engines. That
 * needs a PostgreSQL server, and this script deliberately does not need one: it
 * runs `prisma validate` against the same schema under both providers, which is
 * the half that catches an engine-specific **schema** construct — a native enum,
 * an array, a `Json` column, a `citext`, a partial index, a generated column.
 * Those are the defects a developer writes by accident, and they are the ones
 * `database-migration.md` §3 lists. Applying the migrations to a real PostgreSQL
 * is the other half and belongs to the CI job that has a server; it is recorded
 * as outstanding rather than implied by this script's green tick.
 *
 * ## Why the schema is validated from a copy
 *
 * Prisma 7.10.0 refuses a computed provider — "The provider argument in a
 * datasource must be a string literal" — refuses `env()` inside it, and refuses
 * more than one datasource block, so one schema file cannot select its engine at
 * load time. The checked-in file therefore names one provider literally, and
 * this script writes a copy beside it with the other provider substituted. The
 * copy is removed in a `finally`, so a crash cannot leave a second schema file
 * behind — `database-migration.md` §8.1 makes a second schema file a defect.
 *
 * The copy is written into `prisma/` rather than a temporary directory on
 * purpose: `prisma validate` resolves the generator's relative `output` and
 * discovers `prisma.config.ts` from the schema's neighbourhood, and a copy in
 * `%TEMP%` would be validated under conditions the real file never sees.
 *
 * ## It fails closed
 *
 * A missing schema, a missing Prisma CLI, or a schema with no datasource block
 * are all failures rather than silent passes.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ── The paths ────────────────────────────────────────────────────────────── */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SCHEMA_PATH = join(ROOT, 'prisma', 'schema.prisma')
const PRISMA_CLI = join(ROOT, 'node_modules', 'prisma', 'build', 'index.js')

/** The two engines `database-migration.md` §1 commits to. */
const PROVIDERS = ['sqlite', 'postgresql']

/* ── The schema, read once ────────────────────────────────────────────────── */

if (!existsSync(SCHEMA_PATH)) {
  console.error(`Schema portability: ${SCHEMA_PATH} does not exist. Nothing to check.`)
  process.exit(1)
}

if (!existsSync(PRISMA_CLI)) {
  console.error(
    `Schema portability: the Prisma CLI is not installed at ${PRISMA_CLI}.\n` +
      'Run `npm install` first — a check that cannot run is a failure, not a pass.',
  )
  process.exit(1)
}

const schema = readFileSync(SCHEMA_PATH, 'utf8')

/** Every `datasource name { … }` block, with its body. */
const DATASOURCE_BLOCK = /datasource\s+\w+\s*\{([^}]*)\}/g

const datasources = [...schema.matchAll(DATASOURCE_BLOCK)]

if (datasources.length !== 1) {
  console.error(
    `Schema portability: expected exactly one datasource block, found ${datasources.length}.\n` +
      'Prisma allows one; `setup/database-migration.md` §8.1 allows one schema file.',
  )
  process.exit(1)
}

const providerIn = (body) => {
  const match = /\bprovider\s*=\s*"([a-z0-9]+)"/.exec(body)
  return match === null ? null : match[1]
}

const declared = providerIn(datasources[0][1])

if (declared === null) {
  console.error('Schema portability: the datasource block declares no string-literal provider.')
  process.exit(1)
}

if (!PROVIDERS.includes(declared)) {
  console.error(
    `Schema portability: the datasource provider is "${declared}", which is neither of the two ` +
      `engines this project runs on (${PROVIDERS.join(', ')}).`,
  )
  process.exit(1)
}

/**
 * The schema with the datasource provider replaced.
 *
 * Only the datasource block is rewritten. The generator block has a `provider`
 * too — `prisma-client` — and replacing that as well would produce a schema that
 * validates under neither engine, which is the failure mode a naive
 * `replace(/provider = "sqlite"/)` would have.
 */
function withProvider(provider) {
  const [block] = datasources
  const close = block.index + block[0].length
  const body = block[0].replace(/\bprovider\s*=\s*"[a-z0-9]+"/, `provider = "${provider}"`)

  return schema.slice(0, block.index) + body + schema.slice(close)
}

/* ── The check ────────────────────────────────────────────────────────────── */

const failures = []

for (const provider of PROVIDERS) {
  const temporary = join(ROOT, 'prisma', `.portability-${provider}.prisma`)

  try {
    writeFileSync(temporary, withProvider(provider), 'utf8')

    const result = spawnSync(process.execPath, [PRISMA_CLI, 'validate', '--schema', temporary], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' },
    })

    if (result.status !== 0) {
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
      failures.push({ provider, output: output === '' ? 'no output' : output })
    }
  } finally {
    rmSync(temporary, { force: true })
  }
}

/* ── The report ───────────────────────────────────────────────────────────── */

if (failures.length === 0) {
  console.log(
    `Schema portability: the schema validates as ${PROVIDERS.join(' and ')} ` +
      `(checked in as ${declared}).`,
  )
  process.exit(0)
}

console.error(`Schema portability: the schema failed to validate as ${failures.length} engine(s).`)
for (const { provider, output } of failures) {
  console.error(`\n  ${provider}:\n${output.replace(/^/gm, '    ')}`)
}
console.error(
  '\nAn engine-specific construct in the schema is a defect: development is SQLite and production ' +
    'is PostgreSQL, and the engines must both accept one schema. ' +
    '(docs/setup/database-migration.md §3, §9)',
)
process.exit(1)
