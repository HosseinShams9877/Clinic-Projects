/**
 * A database for one test file, built from the schema.
 *
 * `10-testing-strategy.md` §2 rule 4: "tests run against the same engine as
 * production." They cannot — production is PostgreSQL, and the isolation suite is
 * the one that runs there — but the engine the unit suite *does* use is a real
 * SQLite file with the real DDL, not a mock of a client. A mocked client asserts
 * what the extension was called with; a real one asserts what a query returns,
 * which is the only assertion that catches the failure that matters. A predicate
 * intersected wrongly looks correct to a mock and returns the wrong rows to a
 * database.
 *
 * ## Why the schema is the input
 *
 * The suite once read every committed `migration.sql` and applied it to the file,
 * on the principle that the file a developer applies is the file the suite
 * exercises. That stopped being possible when the schema was switched between
 * providers per environment (`scripts/db-provider.mjs`): `prisma/migrations` is
 * locked to `postgresql` and its `ALTER TABLE … ADD CONSTRAINT` form is not
 * SQLite, and `prisma/migrations-sqlite` drifted behind `schema.prisma` as soon
 * as features landed through `db push`. The one file that is single-source-of-
 * truth for both engines, and the one the developer's SQLite database is built
 * from, is `prisma/schema.prisma` — so the suite applies it with the same `db
 * push` command, and a schema the CLI cannot apply to SQLite is a schema a test
 * fails on, which is the same property the migrations were there to give.
 *
 * ## Why the file is per test file
 *
 * Vitest isolates each test file's module registry, so a client built by one file
 * is never seen by another, but the SQLite file on disk is shared. A unique name
 * keeps two files running in parallel workers from attaching to one database,
 * which SQLite would serialise at best and corrupt at worst. `prisma/*.db` is
 * gitignored, so the files never reach a commit; the delete in `afterEach` is
 * what keeps them off the disk between runs.
 */

import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import type { PrismaClient } from '@prisma/client'

import { createPrismaClient, createUnscopedClient } from '../index'

/** The Prisma CLI, resolved from the directory vitest runs in. */
const PRISMA_CLI = join('node_modules', 'prisma', 'build', 'index.js')

/**
 * The environment a boot resolves, for a test file that opens a scope.
 *
 * `getEnv()` caches on first resolution (`config/env.ts`), and the value it
 * returns is what `runInTenantScope` reads to decide whether Layer 2 exists — a
 * test file must therefore have the variables in place before the first scope
 * opens, or the failure is a `ConfigError` about a missing secret rather than an
 * assertion about tenant isolation.
 *
 * `NEXTAUTH_SECRET` is the one the schema makes required. The value is arbitrary
 * here: it never signs a token in a unit test, and `09-security.md` §14's
 * objection is to a *weak fallback*, which is why this is 64 hex characters
 * rather than the word `secret`.
 */
process.env.NEXTAUTH_SECRET ??= randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')

/** A database that has never heard of a tenant. */
export interface TestDatabase {
  /** The `file:` URL the clients connect to. */
  readonly url: string
  /** The scoped client — Layer 1 applies, and a query outside a scope throws. */
  readonly client: PrismaClient
  /** The unscoped client, for writing the rows a scope is supposed to keep out. */
  readonly unscoped: PrismaClient
}

/**
 * Creates a database with the schema applied, and the two clients a test needs:
 * the scoped one the product uses, and the unscoped one that writes the rows the
 * scope should keep out — which is how a test proves it kept them out.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  // Prisma 6 (no driver adapter) resolves a relative `file:` URL against the
  // schema directory, not the working directory: `file:./x.db` opens
  // `<cwd>/prisma/x.db`. The URL is therefore written as if relative to `prisma/`
  // — and the delete below removes it from that same place. An absolute URL is
  // not an option here: the repo path contains a space, and SQLite refuses
  // percent-encoded absolute `file:` URLs with `SQLITE_CANTOPEN`.
  const url = `file:./.test-${randomUUID()}.db`
  mkdirSync(join(process.cwd(), 'prisma'), { recursive: true })

  // `db push` has no `--url` flag in this Prisma version; the datasource reads
  // `DATABASE_URL`/`DIRECT_URL`, and process variables are not overridden by the
  // `.env` the CLI loads, so an env scoped to the child process is the override.
  execFileSync(process.execPath, [PRISMA_CLI, 'db', 'push', '--skip-generate'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  })

  const unscoped = createUnscopedClient(url)
  return { url, client: createPrismaClient(url), unscoped }
}

/**
 * Deletes the file, after the connections that used it have gone.
 *
 * `$disconnect()` is awaited, but on Windows the query engine releases its file
 * handle asynchronously, and the first `rmSync` can race it and throw `EPERM`.
 * The handle is always released within a moment, so the delete retries with a
 * short backoff — and a file that still lingers is not a test failure: the
 * databases are gitignored `prisma/.test-*.db` and the next run would have
 * deleted it, so the only cost of leaving one is a little disk.
 */
export async function deleteTestDatabase(database: TestDatabase): Promise<void> {
  await database.client.$disconnect()
  await database.unscoped.$disconnect()
  // Relative to the schema directory (`prisma/`), see createTestDatabase.
  const file = join(process.cwd(), 'prisma', database.url.slice('file:'.length))
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(file, { force: true })
      return
    } catch {
      if (attempt === 4) return // see above: a lingering file is not a failure.
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
