/**
 * A database for one test file, built from the committed migrations.
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
 * ## Why the migrations are the input
 *
 * The schema could be created with `prisma db push`, but that derives the DDL
 * from the schema at run time. Reading every committed `migration.sql` under
 * `prisma/migrations/` instead means the file a developer applies — and the file
 * production applies — is the file the suite exercised
 * (`setup/database-migration.md` §2). A migration SQLite cannot accept is a
 * migration that fails a real test, not a check that validated a schema.
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
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import type { PrismaClient } from '@/generated/prisma/client'

import { createPrismaClient, createUnscopedClient } from '../index'

/** Where the committed migrations live, relative to the directory vitest runs in. */
const MIGRATIONS = join('prisma', 'migrations')

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
 * Creates a database with every committed migration applied, and the two clients
 * a test needs: the scoped one the product uses, and the unscoped one that writes
 * the rows the scope should keep out — which is how a test proves it kept them
 * out.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const url = `file:./prisma/.test-${randomUUID()}.db`
  mkdirSync(join(process.cwd(), 'prisma'), { recursive: true })

  const unscoped = createUnscopedClient(url)
  for (const statement of migrationStatements()) {
    await unscoped.$executeRawUnsafe(statement)
  }

  return { url, client: createPrismaClient(url), unscoped }
}

/** Deletes the file, after the connections that used it have gone. */
export async function deleteTestDatabase(database: TestDatabase): Promise<void> {
  await database.client.$disconnect()
  await database.unscoped.$disconnect()
  rmSync(join(process.cwd(), database.url.slice('file:'.length)), { force: true })
}

/**
 * Every committed migration's SQL, as executable statements.
 *
 * Comments are stripped before the split rather than after, so a semicolon inside
 * a comment cannot become a statement boundary. The committed migrations hold no
 * string literal containing a semicolon — no trigger, no function body — and that
 * is the assumption the split makes; a migration that breaks it is a migration
 * this helper would misapply, and the test that catches it is the one that reads
 * the schema back.
 */
function migrationStatements(): readonly string[] {
  const files = readdirSync(join(process.cwd(), MIGRATIONS))
    .filter((name) => /^\d+_/.test(name))
    .sort()

  return files
    .map((name) => readFileSync(join(process.cwd(), MIGRATIONS, name, 'migration.sql'), 'utf8'))
    .join('\n')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
}
