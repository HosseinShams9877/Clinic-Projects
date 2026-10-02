/**
 * `prisma.config.ts` — the configuration Prisma 7 requires.
 *
 * Three things this file exists to do, each of which used to live in the schema:
 *
 * 1. **The datasource URL.** In Prisma 7 the `url`, `directUrl` and
 *    `shadowDatabaseUrl` properties are no longer supported in a schema file
 *    ("The datasource property `url` is no longer supported in schema files.
 *    Move connection URLs for Migrate to `prisma.config.ts`"), so the schema
 *    carries the provider and this file carries the connection.
 * 2. **The schema path.** `prisma/schema.prisma`, named explicitly rather than
 *    discovered, so a stray `.prisma` file elsewhere in the tree cannot join the
 *    schema (`setup/database-migration.md` §8.1 — the schema is one file).
 * 3. **The migration path and the seed command**, so that `prisma migrate reset`
 *    and `npm run db:seed` cannot disagree about which script seeds.
 *
 * ## Why the environment is read directly rather than through `env()`
 *
 * `prisma/config` exports an `env()` helper that throws when a variable is
 * missing. Using it would make **every** Prisma command require a populated
 * `.env` — including `prisma generate`, which needs no database at all and which
 * `installation.md` §5 lists as the first command a new developer runs on a
 * fresh clone. A fallback to the development SQLite file keeps that path working.
 * The refusal that matters is not here: it is in `src/core/config/env.ts`, which
 * fails the **application boot** rather than the code generator, and which is
 * where `09-security.md` §14's "a missing secret must fail at startup, not fall
 * back to a weak value" is enforced.
 *
 * The `.env` file is loaded with Node's own `process.loadEnvFile()` — no
 * `dotenv` dependency, and the same semantics the runtime gives `--env-file`. An
 * absent file is not an error; it is a fresh clone.
 */

import { loadEnvFile } from 'node:process'

import { defineConfig } from 'prisma/config'

import { DEVELOPMENT_DATABASE_URL } from './src/core/config/datasource'

if (process.env.DATABASE_URL === undefined) {
  try {
    loadEnvFile()
  } catch {
    // No `.env`: the development default below applies, which is the documented
    // state of a clone that has run `npm install` and nothing else.
  }
}

const url =
  process.env.DATABASE_URL ?? process.env.DATABASE_URL_PRODUCTION ?? DEVELOPMENT_DATABASE_URL

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
})
