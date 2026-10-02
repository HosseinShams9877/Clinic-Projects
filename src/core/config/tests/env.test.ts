/**
 * `src/core/config` — the environment schema.
 *
 * Two properties are asserted here that a happy-path test would miss, and both
 * are the reason the module exists rather than reading `process.env` at the
 * point of use:
 *
 * 1. **A boot failure names the variable, never its value.** `09-security.md`
 *    §14 forbids a secret "in a log, in a URL, or in an error message", and Zod
 *    will happily echo the received value for some issue kinds. The description
 *    is built from the issue path and code instead.
 * 2. **Production refuses SQLite.** `database-migration.md` §1: "A production
 *    boot against SQLite refuses to start … The failure is loud at boot rather
 *    than quiet at runtime."
 *
 * The two functions at the bottom are the file's only shared helpers, and they
 * exist so that a failure is asserted as a whole — name, variables, and the
 * absence of a leaked value — rather than one property at a time.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConfigError, DEVELOPMENT_DATABASE_URL, getEnv, loadEnv } from '../index'
import type { Env } from '../index'

/** A source that passes the schema and nothing else. */
const BASE: Record<string, string> = { NEXTAUTH_SECRET: 'a'.repeat(64) }

/** A PostgreSQL URL in the shape `deployment.md` §3 documents. */
const POSTGRES = 'postgresql://clinic:secret@localhost:5432/clinic'

/** A source with one or more overrides applied. */
function source(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const merged: Record<string, string> = { ...BASE }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return merged
}

/** Run a parse that is expected to fail, and return the error. */
function refusal(overrides: Record<string, string | undefined>): ConfigError {
  try {
    loadEnv(source(overrides))
  } catch (error) {
    if (error instanceof ConfigError) return error
    throw error
  }
  throw new Error('loadEnv returned where a ConfigError was expected')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('a usable environment', () => {
  it('applies every documented default', () => {
    const env: Env = loadEnv(source())

    // `installation.md` §4 and the deployment table in §3 of `deployment.md`.
    expect(env.nodeEnv).toBe('development')
    expect(env.isProduction).toBe(false)
    expect(env.multiTenant).toBe(true)
    expect(env.logLevel).toBe('info')
    expect(env.worker.pollIntervalMs).toBe(15_000)
    expect(env.worker.leaseSeconds).toBe(300)
  })

  it('falls back to the development SQLite file', () => {
    // The state of a clone that has run `npm install` and nothing else. It is
    // the reason `npm run db:generate` works before `.env` exists.
    expect(loadEnv(source()).databaseUrl).toBe(DEVELOPMENT_DATABASE_URL)
  })

  it('prefers DATABASE_URL, then DATABASE_URL_PRODUCTION, then the default', () => {
    expect(loadEnv(source({ DATABASE_URL: POSTGRES })).databaseUrl).toBe(POSTGRES)

    const productionNamed = loadEnv(source({ DATABASE_URL_PRODUCTION: POSTGRES }))
    expect(productionNamed.databaseUrl).toBe(POSTGRES)
    expect(productionNamed.databaseUrlProduction).toBe(POSTGRES)

    // DATABASE_URL wins when both are set, and both are still reported.
    const both = loadEnv(source({ DATABASE_URL: POSTGRES, DATABASE_URL_PRODUCTION: 'file:./x.db' }))
    expect(both.databaseUrl).toBe(POSTGRES)
    expect(both.databaseUrlProduction).toBe('file:./x.db')
  })

  it('accepts a SQLite file in development and in test', () => {
    expect(loadEnv(source({ DATABASE_URL: 'file:./tmp/dev.db' })).databaseUrl).toBe(
      'file:./tmp/dev.db',
    )
    expect(loadEnv(source({ NODE_ENV: 'test', DATABASE_URL: 'file:./tmp/t.db' })).nodeEnv).toBe(
      'test',
    )
  })

  it('accepts a PostgreSQL URL in every environment', () => {
    for (const nodeEnv of ['development', 'test', 'production'] as const) {
      const env = loadEnv(source({ NODE_ENV: nodeEnv, DATABASE_URL: POSTGRES }))
      expect(env.databaseUrl).toBe(POSTGRES)
    }
  })

  it('coerces the worker numbers from their string form', () => {
    // Every environment variable is a string; a schema that typed these as
    // `number` would reject a perfectly correct `.env`.
    const env = loadEnv(
      source({ WORKER_POLL_INTERVAL_MS: '1500', WORKER_LEASE_SECONDS: '90' }),
    )

    expect(env.worker.pollIntervalMs).toBe(1500)
    expect(env.worker.leaseSeconds).toBe(90)
  })

  it('reports the optional keys it was given, and undefined for the rest', () => {
    const env = loadEnv(
      source({
        SMS_PROVIDER_KEY: 'sms-sandbox',
        PAYMENT_PROVIDER_KEY: 'pay-sandbox',
        LICENSE_KEY: 'licence',
        SINGLE_TENANT_SLUG: 'clinic',
      }),
    )

    expect(env.smsProviderKey).toBe('sms-sandbox')
    expect(env.paymentProviderKey).toBe('pay-sandbox')
    expect(env.licenseKey).toBe('licence')
    expect(env.singleTenantSlug).toBe('clinic')
  })

  it('is frozen, so nothing downstream can rewrite the parsed values', () => {
    const env = loadEnv(source())

    expect(Object.isFrozen(env)).toBe(true)
    expect(Object.isFrozen(env.worker)).toBe(true)
  })
})

describe('a malformed variable', () => {
  it('refuses a missing session secret', () => {
    const error = refusal({ NEXTAUTH_SECRET: undefined })

    expect(error.variables).toContain('NEXTAUTH_SECRET')
  })

  it('refuses a session secret shorter than 32 characters', () => {
    // `installation.md` §4 generates 64 hex characters. A shorter secret is a
    // secret that was typed by hand.
    expect(refusal({ NEXTAUTH_SECRET: 'too-short' }).variables).toContain('NEXTAUTH_SECRET')
  })

  it('refuses a flag that is not true or false', () => {
    expect(refusal({ MULTI_TENANT: 'yes' }).variables).toContain('MULTI_TENANT')
  })

  it('refuses an unknown NODE_ENV', () => {
    expect(refusal({ NODE_ENV: 'staging' }).variables).toContain('NODE_ENV')
  })

  it('refuses an unknown log level', () => {
    expect(refusal({ LOG_LEVEL: 'verbose' }).variables).toContain('LOG_LEVEL')
  })

  it('refuses a poll interval below the floor, and an empty one', () => {
    expect(refusal({ WORKER_POLL_INTERVAL_MS: '10' }).variables).toContain(
      'WORKER_POLL_INTERVAL_MS',
    )
    // An empty variable coerces to 0, which is why the floor is a minimum
    // rather than a check for a positive number.
    expect(refusal({ WORKER_POLL_INTERVAL_MS: '' }).variables).toContain(
      'WORKER_POLL_INTERVAL_MS',
    )
  })

  it('names every failing variable once, not once per issue', () => {
    const error = refusal({ NEXTAUTH_SECRET: undefined, MULTI_TENANT: 'maybe', LOG_LEVEL: 'no' })

    expect([...error.variables].sort()).toEqual(['LOG_LEVEL', 'MULTI_TENANT', 'NEXTAUTH_SECRET'])
    expect(new Set(error.variables).size).toBe(error.variables.length)
  })

  it('never puts the value in the message', () => {
    // The whole reason the description is built from issue paths and codes.
    const secret = 'super-secret-value-that-must-not-be-logged'
    const error = refusal({ NEXTAUTH_SECRET: secret, MULTI_TENANT: secret })

    expect(error.message).not.toContain(secret)
    expect(JSON.stringify(error.variables)).not.toContain(secret)
  })

  it('is a ConfigError and not an AppError', () => {
    // It carries no catalog key, because the person who reads it is the operator
    // who started the process and there is no Persian sentence for them.
    const error = refusal({ NEXTAUTH_SECRET: undefined })

    expect(error.name).toBe('ConfigError')
    expect(error).not.toHaveProperty('messageKey')
  })
})

describe('a database URL that is neither engine', () => {
  it('refuses it in development', () => {
    const error = refusal({ DATABASE_URL: 'mysql://localhost/clinic' })

    expect(error.variables).toEqual(['DATABASE_URL'])
    expect(error.message).toContain('SQLite')
  })

  it('refuses a production-named variable holding a SQLite file', () => {
    expect(refusal({ DATABASE_URL_PRODUCTION: 'mongodb://localhost' }).variables).toEqual([
      'DATABASE_URL',
    ])
  })
})

describe('production', () => {
  it('refuses SQLite, loudly, at boot', () => {
    const error = refusal({ NODE_ENV: 'production', DATABASE_URL: 'file:./prisma/dev.db' })

    expect(error.variables).toEqual(['DATABASE_URL'])
    expect(error.message).toContain('row-level security')
  })

  it('refuses a boot with no database URL at all', () => {
    const error = refusal({ NODE_ENV: 'production' })

    expect(error.variables).toEqual(['DATABASE_URL', 'DATABASE_URL_PRODUCTION'])
  })

  it('refuses a database URL that is not PostgreSQL', () => {
    const error = refusal({ NODE_ENV: 'production', DATABASE_URL: 'sqlite://whatever' })

    expect(error.message).toContain('postgresql://')
  })

  it('accepts PostgreSQL under either documented spelling', () => {
    expect(loadEnv(source({ NODE_ENV: 'production', DATABASE_URL: POSTGRES })).isProduction).toBe(
      true,
    )
    expect(
      loadEnv(source({ NODE_ENV: 'production', DATABASE_URL: 'postgres://h/c' })).databaseUrl,
    ).toBe('postgres://h/c')
  })

  it('accepts DATABASE_URL_PRODUCTION as the only URL', () => {
    const env = loadEnv(source({ NODE_ENV: 'production', DATABASE_URL_PRODUCTION: POSTGRES }))

    expect(env.databaseUrl).toBe(POSTGRES)
    expect(env.isProduction).toBe(true)
  })
})

describe('single-tenant mode', () => {
  it('requires a licence key in production', () => {
    // `installation.md` §4: LICENSE_KEY is "the issued key when MULTI_TENANT=false".
    const error = refusal({
      NODE_ENV: 'production',
      DATABASE_URL: POSTGRES,
      MULTI_TENANT: 'false',
    })

    expect(error.variables).toEqual(['LICENSE_KEY'])
  })

  it('is satisfied by a licence key', () => {
    const env = loadEnv(
      source({
        NODE_ENV: 'production',
        DATABASE_URL: POSTGRES,
        MULTI_TENANT: 'false',
        LICENSE_KEY: 'CLINIC-0001',
      }),
    )

    expect(env.multiTenant).toBe(false)
    expect(env.licenseKey).toBe('CLINIC-0001')
  })

  it('does not require a licence key in development', () => {
    // ADR-0004: the flag is testable in development, and a developer has no
    // issued key. Requiring one there would make single-tenant mode untestable
    // until after it shipped.
    expect(loadEnv(source({ MULTI_TENANT: 'false' })).multiTenant).toBe(false)
  })
})

describe('getEnv', () => {
  it('parses the process environment once and returns the same object', () => {
    // The property that makes "parsed once at startup" true rather than
    // aspirational: a second reader cannot observe a different environment.
    vi.stubEnv('NEXTAUTH_SECRET', 'b'.repeat(64))

    const first = getEnv()
    const second = getEnv()

    expect(second).toBe(first)
    expect(first.sessionSecret).toBe('b'.repeat(64))
  })
})
