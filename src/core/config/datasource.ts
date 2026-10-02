/**
 * The one place the development database file is named.
 *
 * `installation.md` §4 documents the development `DATABASE_URL` as
 * `file:./dev.db`. It is written here with the directory made explicit, because
 * a relative `file:` URL is resolved by Prisma against different bases depending
 * on which entry point reads it — the schema file for the CLI in older releases,
 * the config file for `prisma.config.ts` in this one — and a URL whose meaning
 * depends on who reads it is the kind of detail that produces two development
 * databases and one confusing afternoon. `prisma/dev.db` is inside the directory
 * `.gitignore` already covers (`prisma/*.db`).
 *
 * This module is deliberately dependency-free: `prisma.config.ts` imports it,
 * and the Prisma CLI loads that file before any application code, so anything
 * imported here is loaded on every `prisma` invocation. It must not pull in Zod,
 * the environment schema, or a single other module.
 */

/** The SQLite file a fresh clone works against, with no database server. */
export const DEVELOPMENT_DATABASE_URL = 'file:./prisma/dev.db'

/** True for a URL that names a SQLite file rather than a database server. */
export function isSqliteUrl(url: string): boolean {
  return url.startsWith('file:')
}

/** True for a URL PostgreSQL accepts in either of its two documented spellings. */
export function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgresql://') || url.startsWith('postgres://')
}
