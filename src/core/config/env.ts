/**
 * The environment, parsed once (`05-conventions.md` §5, `installation.md` §4).
 *
 * "Every value crossing a trust boundary is parsed by Zod before it reaches a
 * module function", and the environment is on the list: "Environment variables
 * (parsed once at startup, not read ad hoc)". `installation.md` §4 states the
 * consequence — "A missing or malformed variable fails the boot with a named
 * error, rather than failing later at the point of use."
 *
 * ## Why `ConfigError` is not an `AppError`
 *
 * `src/core/types/errors.ts` holds the taxonomy of `05-conventions.md` §7, and
 * every member of it carries a `messageKey` — a catalog key for the Persian
 * sentence a user reads. A configuration failure has no user: it happens before
 * a request exists, and the person who reads it is the operator who started the
 * process. Giving it a catalog key would mean inventing Persian copy for a
 * sentence no clinic staff member will ever see. It is therefore a plain
 * `Error` with a `variables` list, deliberately outside that taxonomy, and it is
 * exported from this module rather than from `src/core/types`.
 *
 * ## What fails a boot
 *
 * - **A variable the schema rejects** — missing, empty, or the wrong shape.
 * - **SQLite in production.** `database-migration.md` §1: "A production boot
 *   against SQLite refuses to start … The failure is loud at boot rather than
 *   quiet at runtime." Development is SQLite by design and production is
 *   PostgreSQL because tenancy needs RLS as a second layer, so a production
 *   process pointed at a file is a process with one layer.
 * - **A database URL that is neither** — a typo in a scheme is a connection
 *   string that will fail later with an error nobody can trace back to `.env`.
 * - **Single-tenant mode without a licence key.** `installation.md` §4:
 *   `LICENSE_KEY` is "the issued key when `MULTI_TENANT=false`".
 *
 * Nothing here reads the database. The other half of the production boot check —
 * that every tenant-scoped table has RLS enabled and forced — is a question for
 * the database, and it lives with the connection.
 */

import { z } from 'zod'

import { DEVELOPMENT_DATABASE_URL, isPostgresUrl, isSqliteUrl } from './datasource'

/** A variable that must be present and non-empty when it is read at all. */
const nonEmpty = z.string().min(1)

/** `installation.md` §4 writes every flag as the string `true` or `false`. */
const flag = z.enum(['true', 'false'])

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: nonEmpty.optional(),
  DATABASE_URL_PRODUCTION: nonEmpty.optional(),

  MULTI_TENANT: flag.default('true'),
  SINGLE_TENANT_SLUG: nonEmpty.optional(),

  // 32 characters, per the generation command in `installation.md` §4
  // (`randomBytes(32).toString('hex')` produces 64). There is no default and no
  // fallback: `09-security.md` §14 — "a missing secret must fail at startup, not
  // fall back to a weak value".
  NEXTAUTH_SECRET: z.string().min(32),

  SMS_PROVIDER_KEY: nonEmpty.optional(),
  PAYMENT_PROVIDER_KEY: nonEmpty.optional(),
  LICENSE_KEY: nonEmpty.optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // The worker's two knobs. `02-architecture.md` §12 lists the jobs; the
  // interval is how often the process looks for a due job, and the lease is how
  // long a claimed job may run before another worker may reclaim it — the
  // mechanism that keeps a job from being lost when a process dies mid-run.
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(15_000),
  WORKER_LEASE_SECONDS: z.coerce.number().int().min(30).default(300),
})

export type NodeEnvironment = 'development' | 'test' | 'production'

export interface WorkerConfig {
  /** How often the worker looks for a due job. */
  readonly pollIntervalMs: number
  /** How long a claimed job may run before it may be reclaimed. */
  readonly leaseSeconds: number
}

export interface Env {
  readonly nodeEnv: NodeEnvironment
  readonly isProduction: boolean
  readonly databaseUrl: string
  /** The production URL, present only when the environment documents one. */
  readonly databaseUrlProduction: string | undefined
  readonly multiTenant: boolean
  readonly singleTenantSlug: string | undefined
  readonly sessionSecret: string
  readonly smsProviderKey: string | undefined
  readonly paymentProviderKey: string | undefined
  readonly licenseKey: string | undefined
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
  readonly worker: WorkerConfig
}

export class ConfigError extends Error {
  /** The variables at fault, by name. Never their values — §14. */
  readonly variables: readonly string[]

  constructor(message: string, variables: readonly string[]) {
    super(message)
    this.name = 'ConfigError'
    this.variables = variables
  }
}

/**
 * The failing variable names, and nothing else.
 *
 * Zod's own message for some issues echoes the received value, and a received
 * value here can be a secret. `09-security.md` §14 forbids a secret "in a log,
 * in a URL, or in an error message", so the description is built from the path
 * and the issue code — both of which are Zod's vocabulary, not the input.
 */
function failingVariables(error: z.ZodError): readonly string[] {
  const names = error.issues.map((issue) => issue.path.join('.') || '(root)')
  return [...new Set(names)]
}

function describe(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`)
    .join(', ')
}

function resolveDatabaseUrl(
  nodeEnv: NodeEnvironment,
  databaseUrl: string | undefined,
  databaseUrlProduction: string | undefined,
): string {
  const isProduction = nodeEnv === 'production'

  if (isProduction) {
    // `DATABASE_URL` wins; `DATABASE_URL_PRODUCTION` is the second documented
    // name (`deployment.md` §3 lists both), and is read here so an environment
    // that sets only the production-named variable is not silently pointed at a
    // development file.
    const url = databaseUrl ?? databaseUrlProduction
    if (url === undefined) {
      throw new ConfigError(
        'A production boot requires DATABASE_URL or DATABASE_URL_PRODUCTION',
        ['DATABASE_URL', 'DATABASE_URL_PRODUCTION'],
      )
    }
    if (isSqliteUrl(url)) {
      throw new ConfigError(
        'A production boot against SQLite is refused: production requires PostgreSQL, because ' +
          'SQLite has no row-level security and tenant isolation would have one layer instead of two',
        ['DATABASE_URL'],
      )
    }
    if (!isPostgresUrl(url)) {
      throw new ConfigError(
        'The production database URL must be a postgresql:// or postgres:// URL',
        ['DATABASE_URL'],
      )
    }
    return url
  }

  const url = databaseUrl ?? databaseUrlProduction ?? DEVELOPMENT_DATABASE_URL
  if (!isSqliteUrl(url) && !isPostgresUrl(url)) {
    throw new ConfigError(
      'The database URL must be a file: (SQLite) or postgresql:// URL',
      ['DATABASE_URL'],
    )
  }
  return url
}

/**
 * Parse an environment. Pure: the default argument is `process.env`, but a test
 * passes its own object and nothing else is touched.
 */
export function loadEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Env {
  const parsed = environmentSchema.safeParse(source)
  if (!parsed.success) {
    throw new ConfigError(
      `The environment is not usable — ${describe(parsed.error)}`,
      failingVariables(parsed.error),
    )
  }

  const values = parsed.data
  const isProduction = values.NODE_ENV === 'production'

  // `installation.md` §4: the licence key is what single-tenant mode runs on.
  // Required only in production, because development runs single-tenant to test
  // the flag (ADR-0004) and a developer has no issued key.
  if (isProduction && values.MULTI_TENANT === 'false' && values.LICENSE_KEY === undefined) {
    throw new ConfigError('MULTI_TENANT=false requires LICENSE_KEY in production', [
      'LICENSE_KEY',
    ])
  }

  return Object.freeze({
    nodeEnv: values.NODE_ENV,
    isProduction,
    databaseUrl: resolveDatabaseUrl(
      values.NODE_ENV,
      values.DATABASE_URL,
      values.DATABASE_URL_PRODUCTION,
    ),
    databaseUrlProduction: values.DATABASE_URL_PRODUCTION,
    multiTenant: values.MULTI_TENANT !== 'false',
    singleTenantSlug: values.SINGLE_TENANT_SLUG,
    sessionSecret: values.NEXTAUTH_SECRET,
    smsProviderKey: values.SMS_PROVIDER_KEY,
    paymentProviderKey: values.PAYMENT_PROVIDER_KEY,
    licenseKey: values.LICENSE_KEY,
    logLevel: values.LOG_LEVEL,
    worker: Object.freeze({
      pollIntervalMs: values.WORKER_POLL_INTERVAL_MS,
      leaseSeconds: values.WORKER_LEASE_SECONDS,
    }),
  })
}

let cached: Env | undefined

/**
 * The environment, parsed on first use and then reused.
 *
 * Lazy rather than parsed at import: a module-level parse would run during
 * `vitest`'s collection of every file that transitively imports this one, so a
 * missing variable would break the build of the test runner rather than the boot
 * of the application — and the failure would name a test file instead of a
 * missing variable.
 */
export function getEnv(): Env {
  cached ??= loadEnv(process.env)
  return cached
}
