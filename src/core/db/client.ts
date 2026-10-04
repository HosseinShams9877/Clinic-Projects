/**
 * The Prisma client, built with the driver adapter Prisma 7 requires.
 *
 * `installation.md` and `database-migration.md` §1: Prisma 7 removed the built-in
 * engine connection, so `PrismaClient` is constructed with an adapter —
 * `@prisma/adapter-better-sqlite3` in development, `@prisma/adapter-pg` in
 * production. The choice is made **from the URL once**, here, because the URL is
 * also what `env.ts` refuses to let be wrong: a production boot against a
 * `file:` URL never reaches this module.
 *
 * ## Why the client is created here and not imported from the root
 *
 * `src/generated/prisma` is not tracked (`.gitignore`); it is rebuilt by
 * `npm run db:generate`, which `npm run verify` runs first. Everything that needs
 * a client imports from `src/core/db`, so the adapter decision and the tenant
 * extension live in one place. A module that imported `PrismaClient` directly
 * would get an unscoped client — one that can read every tenant's rows — and
 * nothing in the type of the object would say so.
 *
 * ## The extension is the point
 *
 * The client is constructed with the Layer-1 extension of `09-security.md` §5,
 * which injects the `tenantId` predicate into every query on a tenant-scoped
 * model and rejects a query that carries no tenant context. Modules do not
 * hand-write the predicate. See `extension.ts`.
 */

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaPg } from '@prisma/adapter-pg'

import { isPostgresUrl, isSqliteUrl } from '@/core/config/datasource'
import { getEnv } from '@/core/config/env'

import { PrismaClient } from '@/generated/prisma/client'

import { tenantExtension } from './extension'

/**
 * The adapter for a URL.
 *
 * `better-sqlite3` is a native module and `pg` is not, so the two are imported
 * unconditionally — a production build pays for the SQLite adapter's presence in
 * the dependency graph and never its initialisation, which is what the two
 * adapters being separate packages is for.
 */
export function adapterFor(url: string): 'sqlite' | 'postgres' {
  if (isSqliteUrl(url)) return 'sqlite'
  if (isPostgresUrl(url)) return 'postgres'
  throw new Error(
    `The database URL is neither a file: nor a postgresql:// URL, so no driver adapter can be chosen for it. ` +
      'The URL is not printed here, because it may contain credentials.',
  )
}

/**
 * The client for a URL, with the tenant extension applied.
 *
 * Exported for the two entry points that need to control construction — the
 * worker, which holds one client for its whole lifetime, and the tests, which
 * build one per case. Application code uses `prisma()` below.
 */
export function createPrismaClient(url: string): PrismaClient {
  const adapter = isSqliteUrl(url)
    ? new PrismaBetterSqlite3({ url })
    : new PrismaPg({ connectionString: url })

  // `$extends` returns a `DynamicClientExtensionThis`, which carries the
  // extension's own narrowed type rather than `PrismaClient`'s. Casting keeps the
  // public type honest — the client a module receives is a `PrismaClient`, and
  // the difference the extension makes is in its behaviour, not in a type a caller
  // could see — and stops the narrowed type from leaking through every return.
  return new PrismaClient({ adapter }).$extends(tenantExtension) as unknown as PrismaClient
}

/**
 * A client **without** the tenant extension, for the four places that must not
 * have Layer 1.
 *
 * 1. **The resolvers** — `getTenantContext()` and `getTenantContextForCustomer()`,
 *    which resolve the tenant: their session and membership reads run before any
 *    scope exists, and are the only unscoped reads in the product that serve a
 *    request.
 * 2. **`prisma/seed.ts` and the migrations**, which create the first tenant
 *    before any request can scope to it.
 * 3. **The startup check**, which reads the RLS state of every table.
 * 4. **The logins** (`auth`'s `loginWithPassword` and `loginWithOtp`), which are
 *    the step that *resolves* a tenant: a staff login looks a mobile up across
 *    tenants because a mobile is unique per tenant and not globally, and a
 *    one-time-code login holds a challenge id that names no tenant until the row
 *    is read. The writes those logins produce — a challenge row, a session row —
 *    happen under a scope the entry point opens for the tenant the login
 *    resolved, so only the proof reads are unscoped.
 *
 * The function is named for what it is, not for what it does: an unscoped client
 * can read every tenant's rows, and the name is the warning. Nothing in `src/`
 * may use it except those four, and the extension's presence in the default
 * client is what makes that the default rather than the exception.
 */
export function createUnscopedClient(url: string): PrismaClient {
  const adapter = isSqliteUrl(url)
    ? new PrismaBetterSqlite3({ url })
    : new PrismaPg({ connectionString: url })
  return new PrismaClient({ adapter })
}

/**
 * The application's client.
 *
 * Lazy: a top-level `new PrismaClient()` would open a database connection when
 * this module is first imported, which happens during `vitest`'s collection of
 * every file that transitively imports it — including suites that never touch
 * the database and a CI machine where the SQLite file does not exist yet. The
 * getter means the connection is opened by the first query, not by the import.
 */
let client: PrismaClient | undefined
let unscoped: PrismaClient | undefined

export function prisma(): PrismaClient {
  client ??= createPrismaClient(getDatabaseUrl())
  return client
}

/** The unscoped client, for the four uses `createUnscopedClient` names. */
export function unscopedPrisma(): PrismaClient {
  unscoped ??= createUnscopedClient(getDatabaseUrl())
  return unscoped
}

/**
 * The URL the application connects to, resolved once.
 *
 * `env.ts` is the authority and has already refused the impossible combinations
 * — SQLite in production, a scheme that is neither, a production boot with no
 * URL at all. This reads the resolved value rather than `process.env` again so
 * those checks cannot be bypassed by a module that skips them.
 *
 * `getEnv()` is lazy, so importing it costs nothing at module load and the
 * environment is parsed by the first thing that needs a value from it.
 */
function getDatabaseUrl(): string {
  return getEnv().databaseUrl
}
