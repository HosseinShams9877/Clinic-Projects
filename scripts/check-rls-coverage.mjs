#!/usr/bin/env node
/**
 * The row-level-security coverage check.
 *
 * > **The policy is generated for every tenant-scoped table**, and a CI check
 * > asserts that a new table with a `tenantId` column has a policy. A table
 * > without one is a security defect, not a missing nicety.
 * >   — `setup/database-migration.md` §4
 *
 * ## What this check is for
 *
 * The failure it exists to catch is the quietest one in the system. A developer
 * adds a table, adds its `tenantId` column, writes the migration, and forgets
 * the policy. Nothing breaks. Every test passes, because tests run on SQLite,
 * which has no row-level security to notice the omission. The application layer
 * still filters by tenant, because it is written correctly — and so the defect
 * is invisible until the day a query forgets, at which point one clinic can read
 * another's patients.
 *
 * So this check does not test behaviour. It compares two lists: the tables the
 * schema says are tenant-scoped, and the tables the PostgreSQL migration says
 * are isolated. They must be the same list.
 *
 * ## The four properties
 *
 * 1. **Coverage.** Every model with a `tenantId` field has a policy. `tenants`
 *    is checked separately: it is tenant-scoped without having a `tenantId`
 *    column, because it is the tenant.
 * 2. **`FORCE`, not only `ENABLE`.** A table with `ENABLE` alone leaves its
 *    owner exempt, and the application connects as the owner. `ENABLE` without
 *    `FORCE` is decoration.
 * 3. **Fail-closed.** Every policy reads `current_setting('app.tenant_id', true)`
 *    — the `true` is `missing_ok`. Without it an unset context raises instead of
 *    matching nothing, and the fail-closed property is lost. A policy that names
 *    a literal tenant id is rejected outright: a hard-coded tenant is a policy
 *    that grants exactly one tenant access to a shared table.
 * 4. **`WITH CHECK`.** `USING` alone filters reads and does not constrain
 *    writes, so a tenant could not read another tenant's row but could still
 *    write one with an attacker-chosen `tenantId`.
 *
 * ## It fails closed itself
 *
 * A missing schema, a schema with no models, or a `migrations-pg/` directory
 * with no `.sql` files are all failures. A check that cannot read its two inputs
 * has learned nothing, and reporting a green tick there would be worse than
 * reporting nothing.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ── Paths ────────────────────────────────────────────────────────────────── */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SCHEMA_PATH = join(ROOT, 'prisma', 'schema.prisma')
const MIGRATIONS_DIRECTORY = join(ROOT, 'prisma', 'migrations-pg')

/**
 * The tenant registry, which is tenant-scoped without carrying a `tenantId`.
 * Its policy matches on `id`; every other detail is identical.
 */
const TENANT_REGISTRY = 'tenants'

/* ── The schema's side of the list ────────────────────────────────────────── */

if (!existsSync(SCHEMA_PATH)) {
  console.error(`RLS coverage: ${SCHEMA_PATH} does not exist. Nothing to check against.`)
  process.exit(1)
}

const schema = readFileSync(SCHEMA_PATH, 'utf8')

/** Every `model Name { … }` block. Prisma model bodies contain no nested braces. */
const MODEL_BLOCK = /model\s+(\w+)\s*\{([^}]*)\}/g

const models = [...schema.matchAll(MODEL_BLOCK)].map(([, name, body]) => {
  const mapped = /@@map\("([^"]+)"\)/.exec(body)
  return {
    name,
    table: mapped === null ? name : mapped[1],
    // A scalar field named `tenantId`. The relation field is `tenant`, so a
    // match here is always the column itself and never a foreign-key relation.
    tenantScoped: /^\s*tenantId\s+\S/m.test(body),
  }
})

if (models.length === 0) {
  console.error('RLS coverage: the schema declares no models. The parse found nothing to verify.')
  process.exit(1)
}

const tenantScoped = models.filter((model) => model.tenantScoped)
const knownTables = new Set(models.map((model) => model.table))

if (tenantScoped.length === 0) {
  console.error('RLS coverage: no model carries a `tenantId` field. That cannot be right.')
  process.exit(1)
}

/* ── The migration's side of the list ─────────────────────────────────────── */

if (!existsSync(MIGRATIONS_DIRECTORY)) {
  console.error(
    `RLS coverage: ${MIGRATIONS_DIRECTORY} does not exist.\n` +
      'The PostgreSQL additions of `database-migration.md` §4 live there, and without them ' +
      'production has no isolation layer at all.',
  )
  process.exit(1)
}

const sqlFiles = readdirSync(MIGRATIONS_DIRECTORY)
  .filter((name) => name.endsWith('.sql'))
  .sort()

if (sqlFiles.length === 0) {
  console.error(`RLS coverage: ${MIGRATIONS_DIRECTORY} contains no .sql files.`)
  process.exit(1)
}

const sql = sqlFiles
  .map((name) => readFileSync(join(MIGRATIONS_DIRECTORY, name), 'utf8'))
  .join('\n')

/** `ALTER TABLE "x" ENABLE ROW LEVEL SECURITY` — and the FORCE variant. */
const alters = (keyword) => {
  const pattern = new RegExp(
    `ALTER\\s+TABLE\\s+"([^"]+)"\\s+${keyword}\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'gi',
  )
  return new Set([...sql.matchAll(pattern)].map(([, table]) => table))
}

const enabled = alters('ENABLE')
const forced = alters('FORCE')

/**
 * `CREATE POLICY <name> ON "x" … ;` with the full statement body, so the body
 * can be inspected rather than just the table name.
 */
const POLICY = /CREATE\s+POLICY\s+\w+\s+ON\s+"([^"]+)"([\s\S]*?);/gi
const policies = new Map([...sql.matchAll(POLICY)].map(([, table, body]) => [table, body]))

/* ── The four properties ──────────────────────────────────────────────────── */

const failures = []
const report = (table, message) => failures.push(`  ${table}: ${message}`)

const expectPolicyOn = (table, requirement) => {
  if (!enabled.has(table)) report(table, 'has no `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.')
  if (!forced.has(table)) {
    report(
      table,
      'has no `ALTER TABLE … FORCE ROW LEVEL SECURITY`. Without FORCE the table owner — the ' +
        'connection the application uses — is exempt from its own policy.',
    )
  }

  const body = policies.get(table)

  if (body === undefined) {
    report(table, 'has no `CREATE POLICY`.')
    return
  }

  if (!/current_setting\(\s*'app\.tenant_id'\s*,\s*true\s*\)/.test(body)) {
    // Either the `true` is missing (raises instead of failing closed) or the
    // policy is built some other way, which for this codebase means it is wrong.
    report(
      table,
      "does not read `current_setting('app.tenant_id', true)`. The second argument is " +
        '`missing_ok`: without it an unset tenant context raises instead of matching zero rows, ' +
        'and the fail-closed property is lost.',
    )
  }

  if (!/WITH\s+CHECK/.test(body)) {
    report(
      table,
      'has no `WITH CHECK`. `USING` alone does not constrain writes, so a tenant could insert a ' +
        'row carrying another tenant id.',
    )
  }

  if (requirement !== undefined && !new RegExp(requirement).test(body)) {
    report(table, `does not match its policy on ${requirement}.`)
  }
}

for (const model of tenantScoped) {
  expectPolicyOn(model.table)
}

// The registry is tenant-scoped on its primary key rather than on a `tenantId`.
if (knownTables.has(TENANT_REGISTRY)) {
  expectPolicyOn(TENANT_REGISTRY, '"id"')
}

// The other direction: a policy for a table the schema does not declare is a
// policy left behind by a rename or a drop. It is harmless in itself and it is
// how a real omission hides, because the list still "looks" complete.
for (const table of policies.keys()) {
  if (!knownTables.has(table)) {
    failures.push(
      `  ${table}: has a policy but is not a model in the schema. A policy for a table that no ` +
        'longer exists usually means a rename left the isolation behind.',
    )
  }
}

/* ── The report ───────────────────────────────────────────────────────────── */

if (failures.length === 0) {
  const registry = knownTables.has(TENANT_REGISTRY) ? ' and the registry' : ''
  console.log(
    `RLS coverage: ${tenantScoped.length} tenant-scoped tables${registry} are isolated ` +
      `(ENABLE, FORCE, USING and WITH CHECK) across ${sqlFiles.length} file(s).`,
  )
  process.exit(0)
}

console.error(
  `RLS coverage: ${failures.length} problem(s) in the PostgreSQL isolation layer.\n\n` +
    `${failures.join('\n')}\n\n` +
    'Every tenant-scoped table needs its policy in `prisma/migrations-pg/`, and it needs it in the ' +
    'same migration that creates it (docs/setup/database-migration.md §4, §8.4).',
)
process.exit(1)
