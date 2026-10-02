#!/usr/bin/env node
/**
 * `npm run db:migrate:pg` — the production migration step.
 *
 * > ```bash
 * > npm run db:migrate:pg     # prisma migrate deploy, then the RLS migrations
 * > ```
 * > `migrate deploy` applies committed migrations in order and records them. It
 * > does **not** generate, does not reset, and does not reconcile drift.
 * >   — `setup/database-migration.md` §5
 *
 * Two steps, in this order and no other:
 *
 *   1. `prisma migrate deploy` — the data model, from `prisma/migrations/`.
 *   2. Every `prisma/migrations-pg/*.sql`, in filename order — the isolation
 *      layer.
 *
 * The order is not a preference. The policies in step 2 name tables that step 1
 * creates, so applying them first fails; and a database that has the tables but
 * not the policies is a database where every tenant can read every other tenant
 * while looking perfectly healthy.
 *
 * ## Why the SQL is re-applied rather than recorded as applied
 *
 * §7: "**The RLS policies are re-applied by the migration step, not carried by
 * `pg_restore`.** A restored database without policies is a database where every
 * tenant can read every other tenant, and it will look fine until someone
 * queries it. `npm run db:migrate:pg` re-emits them."
 *
 * So there is no bookkeeping table for this half. The files in
 * `prisma/migrations-pg/` are written to be idempotent — `DROP POLICY IF EXISTS`
 * before every `CREATE POLICY` — precisely so that running them again on every
 * deploy is the safe and intended thing to do. A `pg_restore` that dropped them
 * is repaired by the next deploy without anyone having to notice.
 *
 * ## Why it uses `pg` and not `psql`
 *
 * `psql` is not guaranteed on an application server, and a migration that cannot
 * run because a client binary is missing is a deploy that stops at the worst
 * moment. `pg` is already a dependency of `@prisma/adapter-pg`, which the
 * application installs to talk to PostgreSQL at all.
 *
 * ## It refuses SQLite
 *
 * Row-level security is a PostgreSQL feature and `database-migration.md` §1
 * makes a production boot against SQLite refuse to start. This script refuses
 * even earlier, because "apply the isolation layer" against an engine that has
 * no isolation layer is a command whose success would mean nothing.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const MIGRATIONS_DIRECTORY = join(ROOT, 'prisma', 'migrations-pg')
const PRISMA_CLI = join(ROOT, 'node_modules', 'prisma', 'build', 'index.js')

function fail(message) {
  console.error(`db-migrate-pg: ${message}`)
  process.exit(1)
}

/* ── The environment ──────────────────────────────────────────────────────── */

if (process.env.DATABASE_URL === undefined && existsSync(join(ROOT, '.env'))) {
  try {
    loadEnvFile(join(ROOT, '.env'))
  } catch {
    // An unreadable `.env` is not this script's business; the refusal below is
    // the same either way.
  }
}

const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_PRODUCTION

if (url === undefined) {
  fail(
    'no DATABASE_URL is set.\n' +
      'A production migration connects to a real database; there is no default worth guessing.',
  )
}

if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
  fail(
    `DATABASE_URL is not a PostgreSQL URL (it starts with "${url.split(':')[0]}:").\n` +
      'Row-level security does not exist on SQLite, so there is nothing to apply. ' +
      '(docs/setup/database-migration.md §1, §4)',
  )
}

/* ── Step 1: the data model ───────────────────────────────────────────────── */

if (!existsSync(PRISMA_CLI)) {
  fail(
    `the Prisma CLI is not installed at ${PRISMA_CLI}.\n` +
      'Run `npm ci` first — a migration step that cannot run is a failure, not a no-op.',
  )
}

console.log('db-migrate-pg: applying prisma/migrations (prisma migrate deploy)…')

const deploy = spawnSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
})

if (deploy.status !== 0) {
  fail(
    '`prisma migrate deploy` failed.\n' +
      'It does not generate, does not reset, and does not reconcile drift: if the database ' +
      'disagrees with the migration history, a human decides what to do. Nothing below ran.',
  )
}

/* ── Step 2: the isolation layer ──────────────────────────────────────────── */

if (!existsSync(MIGRATIONS_DIRECTORY)) {
  fail(`${MIGRATIONS_DIRECTORY} does not exist. The isolation layer is missing entirely.`)
}

const files = readdirSync(MIGRATIONS_DIRECTORY)
  .filter((name) => name.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  fail(`${MIGRATIONS_DIRECTORY} contains no .sql files. The schema is unisolated.`)
}

let pg

try {
  // Imported here rather than at the top so that step 1 needs nothing but Prisma,
  // and so that the failure names the missing dependency instead of surfacing as
  // a module-resolution stack trace before any output.
  pg = await import('pg')
} catch {
  fail(
    'the `pg` package is not installed.\n' +
      'It arrives with `@prisma/adapter-pg`, which the application needs to reach PostgreSQL. ' +
      'Run `npm ci`.',
  )
}

const client = new pg.default.Client({ connectionString: url })

try {
  await client.connect()
} catch (error) {
  fail(`could not connect to PostgreSQL: ${error instanceof Error ? error.message : error}`)
}

try {
  for (const name of files) {
    const sql = readFileSync(join(MIGRATIONS_DIRECTORY, name), 'utf8')

    process.stdout.write(`db-migrate-pg: applying ${name}…`)

    try {
      // Not wrapped in a transaction here: each file carries its own BEGIN and
      // COMMIT, so that a human running `psql -f` by hand gets the same all-or-
      // nothing behaviour this script does. An outer BEGIN would only produce
      // "there is already a transaction in progress" warnings.
      await client.query(sql)
      process.stdout.write(' done\n')
    } catch (error) {
      process.stdout.write(' failed\n')
      fail(
        `${name} failed: ${error instanceof Error ? error.message : error}\n` +
          'The policies are re-applied on every deploy, so a partial application is repaired by ' +
          'fixing this file and running the command again — never by editing the database.',
      )
    }
  }
} finally {
  await client.end()
}

console.log(
  `db-migrate-pg: the data model and ${files.length} isolation file(s) are applied.\n` +
    'Run `npm run test:isolation` against this database before it serves traffic ' +
    '(docs/setup/database-migration.md §7).',
)
process.exit(0)
