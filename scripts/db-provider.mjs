#!/usr/bin/env node
/**
 * The provider switch for `prisma/schema.prisma`.
 *
 * ## Why a switch exists at all
 *
 * `setup/database-migration.md` §1 requires **one** schema that works on SQLite
 * in development and PostgreSQL in production, and §8.1 makes a second schema
 * file a defect. Prisma 7.10.0 makes those two requirements pull against each
 * other, because the engine is chosen by a literal in the datasource block:
 *
 * - "The provider argument in a datasource must be a string literal"
 * - "A datasource must not use the env() function in the provider argument"
 * - "You defined more than one datasource. This is not allowed yet because
 *   support for multiple databases has not been implemented yet."
 *
 * So the provider cannot be computed, cannot be read from the environment, and
 * cannot be selected by having two files. It is one line, and this script is how
 * that line changes — deliberately, visibly, and with a check that notices when
 * it has been changed and forgotten.
 *
 * ## Usage
 *
 * ```
 * node scripts/db-provider.mjs              # report the checked-in provider
 * node scripts/db-provider.mjs --check      # fail if it disagrees with DATABASE_PROVIDER
 * node scripts/db-provider.mjs set postgresql
 * ```
 *
 * `--check` defaults `DATABASE_PROVIDER` to `sqlite`, so a CI job that sets
 * nothing is asserting the development default. The check exists because the
 * failure it prevents is quiet: a checkout left on `postgresql` generates a
 * PostgreSQL client and then fails at runtime against the developer's SQLite
 * file, and the error names the client, not the line that was left behind.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SCHEMA_PATH = join(ROOT, 'prisma', 'schema.prisma')

const PROVIDERS = ['sqlite', 'postgresql']
const DATASOURCE_BLOCK = /datasource\s+\w+\s*\{([^}]*)\}/
const PROVIDER_LINE = /\bprovider\s*=\s*"([a-z0-9]+)"/

function fail(message) {
  console.error(`db-provider: ${message}`)
  process.exit(1)
}

if (!existsSync(SCHEMA_PATH)) {
  fail(`${SCHEMA_PATH} does not exist.`)
}

const schema = readFileSync(SCHEMA_PATH, 'utf8')
const block = DATASOURCE_BLOCK.exec(schema)

if (block === null) {
  fail('the schema has no datasource block.')
}

const match = PROVIDER_LINE.exec(block[1])

if (match === null) {
  fail('the datasource block declares no string-literal provider.')
}

const current = match[1]

/* ── The arguments ────────────────────────────────────────────────────────── */

const [command, argument] = process.argv.slice(2)

if (command === undefined) {
  console.log(`db-provider: the schema is written for ${current}.`)
  process.exit(0)
}

if (command === '--check') {
  if (existsSync(join(ROOT, '.env'))) {
    try {
      loadEnvFile(join(ROOT, '.env'))
    } catch {
      // An unreadable `.env` is not this check's business; the variable is read
      // from the process either way, and the default below applies.
    }
  }

  const expected = process.env.DATABASE_PROVIDER ?? 'sqlite'
  if (!PROVIDERS.includes(expected)) {
    fail(`DATABASE_PROVIDER is "${expected}", which is not one of ${PROVIDERS.join(', ')}.`)
  }

  if (current !== expected) {
    console.error(
      `db-provider: the schema is written for ${current} but this environment expects ${expected}.\n` +
        `Run \`node scripts/db-provider.mjs set ${expected}\`, and commit the line with the change ` +
        'that needed it.',
    )
    process.exit(1)
  }

  console.log(`db-provider: the schema is written for ${current}, as this environment expects.`)
  process.exit(0)
}

if (command === 'set') {
  if (argument === undefined || !PROVIDERS.includes(argument)) {
    fail(`\`set\` needs one of ${PROVIDERS.join(', ')}.`)
  }

  if (current === argument) {
    console.log(`db-provider: the schema is already written for ${argument}.`)
    process.exit(0)
  }

  const open = block.index + block[0].indexOf('{')
  const close = block.index + block[0].length
  const body = block[0].replace(PROVIDER_LINE, `provider = "${argument}"`)

  writeFileSync(SCHEMA_PATH, schema.slice(0, block.index) + body + schema.slice(close), 'utf8')
  console.log(`db-provider: the schema is now written for ${argument} (was ${current}).`)
  process.exit(0)
}

fail(`unknown command "${command}". See the header of this file for usage.`)
