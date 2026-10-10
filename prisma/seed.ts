/**
 * `prisma/seed.ts` — the development dataset.
 *
 * `installation.md` §5 documents what this produces: two tenants, five staff each,
 * Persian names, and no real clinic data anywhere in it (`09-security.md` §5 — a
 * policy, not a preference). `prisma.config.ts` points both `npm run db:seed` and
 * `prisma migrate reset` at this file, so the script a developer runs and the one a
 * reset runs are the same file.
 *
 * ## Why the client is unscoped
 *
 * The seed creates the first `Tenant` before any request can scope to one, and the
 * scoped `prisma()` would refuse that insert — the extension rejects a query on a
 * tenant-scoped model that carries no tenant context, which is the correct default
 * and the reason `unscopedPrisma()` exists as a named exception. It is use 2 of the
 * four `createUnscopedClient()` documents in `src/core/db/client.ts`, and this file
 * is one of them because it is the only writer that runs with no tenant in the
 * database yet. Everything below is a plain write: no `app.tenant_id` is set, and the
 * rows this writes are the ones the scoped client would then have to be able to read.
 *
 * ## Why there are two tenants, and a shared mobile
 *
 * `10-testing-strategy.md` §13 asks for "two tenants minimum in every isolation
 * test, seeded deterministically", and for the fixture that catches the most common
 * isolation bug: **the same mobile number exists in both tenants.** `User`'s unique
 * constraint is `[tenantId, mobile]` and not `[mobile]`, because a mobile is unique
 * per tenant and not globally — a doctor who works at two clinics is one person with
 * two rows (`02-architecture.md` §2). This seed writes that person twice, under the
 * same name and the same mobile, so a login that looks a mobile up without scoping it
 * to a tenant finds two rows and the isolation suite has its failing case on disk.
 * One customer mobile is shared the same way, so `customer_mobile_key` has the
 * fixture too.
 *
 * ## Why upsert, and not truncate-and-rebuild
 *
 * Idempotency here is **upsert on the natural keys**: `Tenant.slug`, the `(tenantId,
 * mobile)` pairs, `Membership`'s `(userId, tenantId)`, the settings row's `tenantId`.
 * Re-running the seed never fails on a unique constraint and never duplicates a row.
 *
 * A truncate-and-rebuild seed would be simpler to read, and it is not buildable here:
 * the schema declares no `onDelete` cascade anywhere, so a rebuild has to delete
 * every tenant-scoped table by hand and in dependency order, and the order is
 * correct only until a later phase adds a table — a seed that silently stops working
 * is the failure mode the upsert avoids entirely. `prisma migrate reset` drops the
 * whole database before it runs this file, so the seed never has to clear one, and
 * the two paths do not disagree about what a clean database is.
 *
 * The other consequence is deliberate: a developer's own edits to a seeded row
 * **survive** a re-run. Only the facts the seed owns — the names, the mobiles, the
 * roles, the password hash — are written back. The settings row is created and then
 * left alone, so an evening of configuration in `dev.db` is not undone by the next
 * `db:seed`.
 *
 * ## The password
 *
 * **Every seeded staff member logs in with `12345678`.** One value for all ten,
 * hashed with the `auth` module's own `hashPassword` — Argon2id, never a hand-rolled
 * hash — because the development database has to contain hashes the login actually
 * verifies, and a seed that stored a plain-text or a SHA placeholder would log in
 * nowhere. It is digits so a Persian keyboard needs no layout switch, and it is weak
 * because the development database holds no real person's account (`09-security.md`
 * §5 again).
 *
 * ## What the dataset deliberately does not contain
 *
 * `Service`, `Appointment` and `Payment` are absent, though `installation.md` §5
 * names them for the finished dataset. Their modules do not exist in Phase 1, and a
 * service or a ledger row written by a seed that bypassed them would be data the
 * product's own write paths never validated. `Customer.chargedTotal`, `discountTotal`
 * and `paidTotal` are left at their `0` default for the same reason: they are
 * recomputable caches of ledger facts (`03-data-model.md` §4.3), and caching a sum
 * whose addends do not exist yet would produce a balance nobody can recompute. The
 * customer rows carry the facts that are the *inputs* to those computations —
 * lifecycle, visit dates, completed sessions, consent — so the audience logic has
 * something to run against on the day it is written.
 *
 * Permission overrides are NULL for the same kind of reason: the schema says NULL
 * means nothing is declared and every default applies, which is the state of every
 * tenant at onboarding, and the `staff` write path that owns the override column's
 * serialisation is not written yet. The recovery-manager invariant is still checked,
 * from the rows as committed, through `roles-permissions`'s own assertion.
 *
 * ## The clock
 *
 * `05-conventions.md` §8 bans an ambient clock read in business logic, and the lint
 * rule that encodes it bans `new Date()` in every TypeScript file in the repository —
 * this one included. The seed is an entry point, so it takes `realClock` and hands
 * the *value* down, exactly as the worker's poll loop does: an entry point is the one
 * shape of caller the clock module names for this. Its visit dates are worth more as
 * *recent* dates than as constants, because a dashboard that shows the last month's
 * arrivals should not be empty on the day it is first run, and reading the clock once
 * keeps the dataset internally consistent — no customer's first visit lands after
 * their last one because the two were computed at different milliseconds.
 *
 * ## Persian text, and where it comes from
 *
 * `05-conventions.md` §14 makes a Persian string literal outside the catalog a
 * finding, and this file is not one of the places a literal may be. Every name
 * written to the database comes from `src/core/localization/catalog/seed.ts` and is
 * joined to the rest of the dataset **by key** — a positional join would pair a
 * person with another person's mobile, and a keyed one makes that a named error
 * before a single row is written. Mobiles go through `normalizeMobile`, because a
 * unique constraint over a column written in several shapes enforces nothing, and
 * `searchName` through `normalizeForSearch`, because the column and the query it
 * serves have to be the same function. Birth dates go through `asLocalDate`, the
 * validator every date that enters the system passes through, and the month and day
 * columns are read back out of it rather than typed a second time.
 *
 * ## Why `.env` is loaded here
 *
 * `npm run db:seed` is `tsx prisma/seed.ts`, and `tsx` is not Next.js: it does not
 * read `.env` before the process starts, the way `next dev` does. Without the line
 * below, the only environment the seed sees is the shell's, so `installation.md`'s
 * `cp .env.example .env` — the documented step that puts `NEXTAUTH_SECRET` somewhere
 * — produces a file the seed never opens, and the run dies in `loadEnv` on a variable
 * that is sitting right there.
 *
 * `loadEnvConfig` is the loader Next itself runs at boot, so the seed and the
 * application read the same file by the same rule: process environment wins, `.env`
 * fills what it does not set, and a variable neither supplies still fails in
 * `loadEnv` with the name of the thing it needs. That last part is the point of
 * `09-security.md` §14 — a missing secret fails at startup rather than falling back —
 * and it is why this loads the file instead of supplying a value.
 */

import { loadEnvConfig } from '@next/env'

import { unscopedPrisma } from '@/core/db'
import { realClock } from '@/core/lib'
import {
  AcquisitionSource,
  AppointmentSource,
  AppointmentStatus,
  CustomerLifecycle,
  ROLES,
  Role,
  ServiceCategory,
  isMember,
} from '@/core/constants'
import {
  SEED_SERVICES,
  SEED_TENANTS,
  addLocalDays,
  asLocalDate,
  asLocalTime,
  jalaliParts,
  minutesToTime,
  normalizeForSearch,
  normalizeMobile,
  timeToMinutes,
  todayLocalDate,
  toUtcInstant,
  type SeedName,
  type SeedTenantText,
} from '@/core/localization'
import { parsePermissionOverrides } from '@/core/tenant'
import { asClinicId, asTenantId, asUserId, type UserId } from '@/core/types'
import { hashPassword } from '@/modules/auth'
import {
  assertTenantKeepsRecoveryManager,
  type MembershipSnapshot,
} from '@/modules/roles-permissions'

import type { PrismaClient } from '@/generated/prisma/client'

/**
 * The password every seeded staff member logs in with — see the header.
 *
 * Never rendered by the application and never logged by it; printed once by this
 * script, because a developer who cannot log in has a dataset they cannot use.
 */
const SEED_STAFF_PASSWORD = '12345678'

/**
 * The mobile the isolation fixture shares across both tenants.
 *
 * A staff mobile, and a customer one. Both are ordinary rows in each tenant; the
 * point is that they are the *same* value twice, which is what a query that forgets
 * the tenant predicate returns two of.
 */
const SHARED_STAFF_MOBILE = '09121111111'
const SHARED_CUSTOMER_MOBILE = '09123330001'

/**
 * `installation.md` §5's shape — one manager, three doctors, two secretaries —
 * spelled from `ROLES` and never as a re-typed string.
 *
 * The catalog lists a tenant's staff in this order, so the position a person is at
 * *is* their role. `assertShape` below ties the two files together, and the seed's
 * own facts carry a mobile per position and nothing about a role.
 */
const STAFF_ROLES_PER_TENANT: readonly Role[] = [
  ROLES[0],
  ROLES[1],
  ROLES[1],
  ROLES[1],
  ROLES[2],
  ROLES[2],
]

/** The number of staff one tenant's seed writes. */
const STAFF_PER_TENANT = STAFF_ROLES_PER_TENANT.length

/** A day, in milliseconds. The one unit `daysAgo` below is written in. */
const MILLISECONDS_PER_DAY = 86_400_000

/* ── The dataset's facts ───────────────────────────────────────────────────────
 *
 * Everything in the catalog is text. Everything below is data the seed owns: slugs,
 * mobiles, lifecycles, acquisition sources, dates. The two are joined in `dataset()`
 * by key, and the join validates the shape of both sides.
 * ------------------------------------------------------------------------- */

/** The non-text facts of one seeded customer. */
interface CustomerFacts {
  readonly mobile: string
  readonly lifecycle: CustomerLifecycle
  /** `Customer.acquisitionSource`, when the customer's origin is known. */
  readonly acquisitionSource?: AcquisitionSource
  /** A Jalali `YYYY-MM-DD` birth date, validated through `asLocalDate` on write. */
  readonly birthDate?: string
  /** The customer's two visits and their completed-session count. */
  readonly visits?: {
    readonly firstAgoDays: number
    readonly lastAgoDays: number
    readonly sessions: number
  }
  readonly consentSms?: boolean
  readonly consentWhatsApp?: boolean
  /** Which of the tenant's three doctors is the customer's primary doctor. */
  readonly primaryDoctor?: 0 | 1 | 2
  /**
   * Days from `now` the lead is next to be contacted. Negative is a lead that is
   * already overdue, which is the state the lead cartable's alert is built from.
   */
  readonly nextContactInDays?: number
}

/** The non-text facts of one tenant's dataset. */
interface TenantFacts {
  readonly key: string
  /**
   * The tenant's slug. ASCII, because it is a subdomain and a URL path segment rather
   * than copy — `tenantIdOfSlug()` resolves it, and a Persian slug is not resolvable.
   */
  readonly slug: string
  /** One mobile per staff member, in the catalog's staff order. */
  readonly staff: readonly string[]
  /** One set of facts per customer, in the catalog's customer order. */
  readonly customers: readonly CustomerFacts[]
}

const TENANT_FACTS: readonly TenantFacts[] = [
  {
    key: 'aria',
    slug: 'aria',
    staff: [
      '09120000000',
      SHARED_STAFF_MOBILE,
      '09120000002',
      '09120000005',
      '09120000003',
      '09120000004',
    ],
    customers: [
      {
        mobile: SHARED_CUSTOMER_MOBILE,
        lifecycle: CustomerLifecycle.Customer,
        birthDate: '1370-03-15',
        visits: { firstAgoDays: 420, lastAgoDays: 12, sessions: 6 },
        consentSms: true,
        primaryDoctor: 0,
      },
      {
        mobile: '09123330002',
        lifecycle: CustomerLifecycle.Customer,
        acquisitionSource: AcquisitionSource.Instagram,
        visits: { firstAgoDays: 300, lastAgoDays: 45, sessions: 3 },
        primaryDoctor: 1,
      },
      {
        mobile: '09123330003',
        lifecycle: CustomerLifecycle.Customer,
        birthDate: '1365-11-02',
        visits: { firstAgoDays: 800, lastAgoDays: 200, sessions: 12 },
        consentSms: true,
        consentWhatsApp: true,
        primaryDoctor: 2,
      },
      {
        mobile: '09123330004',
        lifecycle: CustomerLifecycle.Customer,
        acquisitionSource: AcquisitionSource.Referral,
        visits: { firstAgoDays: 150, lastAgoDays: 150, sessions: 1 },
        primaryDoctor: 1,
      },
      {
        mobile: '09123330005',
        lifecycle: CustomerLifecycle.Customer,
        birthDate: '1378-07-20',
        visits: { firstAgoDays: 95, lastAgoDays: 30, sessions: 2 },
        consentSms: true,
        primaryDoctor: 2,
      },
      {
        mobile: '09123330006',
        lifecycle: CustomerLifecycle.Customer,
        acquisitionSource: AcquisitionSource.Website,
        visits: { firstAgoDays: 365, lastAgoDays: 365, sessions: 1 },
        primaryDoctor: 1,
      },
      {
        mobile: '09123330007',
        lifecycle: CustomerLifecycle.Lead,
        acquisitionSource: AcquisitionSource.Instagram,
        nextContactInDays: 2,
      },
      {
        mobile: '09123330008',
        lifecycle: CustomerLifecycle.Lead,
        acquisitionSource: AcquisitionSource.Phone,
        nextContactInDays: -5,
      },
    ],
  },
  {
    key: 'parsian',
    slug: 'parsian',
    staff: [
      '09120000010',
      SHARED_STAFF_MOBILE,
      '09120000012',
      '09120000015',
      '09120000013',
      '09120000014',
    ],
    customers: [
      {
        mobile: SHARED_CUSTOMER_MOBILE,
        lifecycle: CustomerLifecycle.Customer,
        birthDate: '1372-05-08',
        visits: { firstAgoDays: 260, lastAgoDays: 8, sessions: 4 },
        consentSms: true,
        primaryDoctor: 0,
      },
      {
        mobile: '09123340002',
        lifecycle: CustomerLifecycle.Customer,
        acquisitionSource: AcquisitionSource.Website,
        visits: { firstAgoDays: 540, lastAgoDays: 120, sessions: 8 },
        primaryDoctor: 1,
      },
      {
        mobile: '09123340003',
        lifecycle: CustomerLifecycle.Customer,
        birthDate: '1368-02-30',
        visits: { firstAgoDays: 1000, lastAgoDays: 400, sessions: 15 },
        consentWhatsApp: true,
        primaryDoctor: 2,
      },
      {
        mobile: '09123340004',
        lifecycle: CustomerLifecycle.Customer,
        acquisitionSource: AcquisitionSource.Referral,
        visits: { firstAgoDays: 60, lastAgoDays: 60, sessions: 1 },
        primaryDoctor: 1,
      },
      {
        mobile: '09123340005',
        lifecycle: CustomerLifecycle.Customer,
        birthDate: '1375-09-14',
        visits: { firstAgoDays: 700, lastAgoDays: 95, sessions: 5 },
        consentSms: true,
        primaryDoctor: 2,
      },
      {
        mobile: '09123340006',
        lifecycle: CustomerLifecycle.Customer,
        acquisitionSource: AcquisitionSource.Instagram,
        visits: { firstAgoDays: 210, lastAgoDays: 210, sessions: 1 },
        primaryDoctor: 1,
      },
      {
        mobile: '09123340007',
        lifecycle: CustomerLifecycle.Lead,
        acquisitionSource: AcquisitionSource.WhatsApp,
        nextContactInDays: 1,
      },
      {
        mobile: '09123340008',
        lifecycle: CustomerLifecycle.Lead,
        acquisitionSource: AcquisitionSource.Instagram,
        nextContactInDays: -3,
      },
    ],
  },
]

/* ── The join, and its shape checks ─────────────────────────────────────────── */

/** One staff member, fully joined: the catalog's name, the role the position gives. */
interface StaffMember {
  readonly name: SeedName
  readonly role: Role
  readonly mobile: string
}

/** One customer, fully joined: the catalog's name and the seed's facts. */
interface CustomerRow {
  readonly name: SeedName
  readonly facts: CustomerFacts
}

/** One tenant's whole dataset, text and facts joined. */
interface TenantDataset {
  readonly text: SeedTenantText
  readonly facts: TenantFacts
  readonly staff: readonly StaffMember[]
  readonly customers: readonly CustomerRow[]
}

/**
 * The facts of the tenant the catalog names `key`, or a named failure.
 *
 * The join is by key and not by position: a tenant present in one file and absent
 * from the other is a defect either way, but a positional join would report it as a
 * mobile that belongs to the wrong person.
 */
function tenantFacts(key: string): TenantFacts {
  const found = TENANT_FACTS.find((tenant) => tenant.key === key)
  if (found === undefined) {
    throw new Error(`The catalog names the tenant '${key}' and the seed describes no such tenant.`)
  }
  return found
}

/**
 * Asserts the catalog and the seed agree on a tenant's shape before anything is
 * written, so a mismatch fails the seed rather than the row that exposes it.
 */
function assertShape(text: SeedTenantText, facts: TenantFacts): void {
  if (facts.staff.length !== STAFF_PER_TENANT) {
    throw new Error(
      `The tenant '${facts.key}' describes ${facts.staff.length} staff and the seed expects ${STAFF_PER_TENANT}.`,
    )
  }
  if (text.staff.length !== STAFF_PER_TENANT) {
    throw new Error(
      `The tenant '${text.key}' names ${text.staff.length} staff and the seed expects ${STAFF_PER_TENANT}.`,
    )
  }
  if (facts.customers.length !== text.customers.length) {
    throw new Error(
      `The tenant '${text.key}' names ${text.customers.length} customers and describes ${facts.customers.length}.`,
    )
  }
}

/**
 * One tenant's staff, zipped. The lengths were checked a moment ago by `assertShape`;
 * the guard is here because the type system cannot see a length check, and a
 * position without a role or a mobile is a person the seed cannot write.
 */
function zipStaff(text: SeedTenantText, facts: TenantFacts): readonly StaffMember[] {
  return text.staff.map((name, index) => {
    const role = STAFF_ROLES_PER_TENANT[index]
    const mobile = facts.staff[index]
    if (role === undefined || mobile === undefined) {
      throw new Error(
        `The tenant '${facts.key}' has a staff member at position ${index} with no role or mobile.`,
      )
    }
    return { name, role, mobile }
  })
}

/**
 * The dataset, joined and validated.
 *
 * Built before the first query, so every failure here is a failure about the dataset
 * rather than a database error a developer has to translate into one.
 */
function dataset(): readonly TenantDataset[] {
  if (TENANT_FACTS.length !== SEED_TENANTS.length) {
    throw new Error(
      `The catalog names ${SEED_TENANTS.length} tenants and the seed describes ${TENANT_FACTS.length}.`,
    )
  }

  return SEED_TENANTS.map((text) => {
    const facts = tenantFacts(text.key)
    assertShape(text, facts)
    return {
      text,
      facts,
      staff: zipStaff(text, facts),
      customers: text.customers.map((name, index) => {
        const found = facts.customers[index]
        if (found === undefined) {
          throw new Error(`The tenant '${text.key}' has no customer at position ${index}.`)
        }
        return { name, facts: found }
      }),
    }
  })
}

/* ── Column helpers ─────────────────────────────────────────────────────────── */

/** The birth-date columns, derived from one Jalali date through the layer's validator. */
function birthColumns(birthDate: string | undefined): {
  readonly birthDate?: string
  readonly birthMonth?: number
  readonly birthDay?: number
} {
  if (birthDate === undefined) return {}
  const parts = jalaliParts(asLocalDate(birthDate))
  return { birthDate, birthMonth: parts.month, birthDay: parts.day }
}

/** The visit columns, as instants relative to `now`. */
function visitColumns(
  visits:
    | { readonly firstAgoDays: number; readonly lastAgoDays: number; readonly sessions: number }
    | undefined,
  now: Date,
): {
  readonly firstVisitAt?: Date
  readonly lastVisitAt?: Date
  readonly completedSessions?: number
} {
  if (visits === undefined) return {}
  return {
    firstVisitAt: daysAgo(now, visits.firstAgoDays),
    lastVisitAt: daysAgo(now, visits.lastAgoDays),
    completedSessions: visits.sessions,
  }
}

/** The consent columns, present only where the facts set one. */
function consentColumns(facts: CustomerFacts): {
  readonly consentSms?: boolean
  readonly consentWhatsApp?: boolean
} {
  return {
    ...(facts.consentSms === undefined ? {} : { consentSms: facts.consentSms }),
    ...(facts.consentWhatsApp === undefined ? {} : { consentWhatsApp: facts.consentWhatsApp }),
  }
}

/** `now`, shifted by a number of days. Negative is a date after `now`. */
function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MILLISECONDS_PER_DAY)
}

/* ── The writers ────────────────────────────────────────────────────────────── */

/** What one tenant's seed produced, for the summary. */
interface TenantSummary {
  readonly slug: string
  readonly name: string
  readonly roles: readonly Role[]
  readonly customers: number
}

/**
 * Seeds one tenant: its row, its settings, its branch, its six staff with their
 * memberships, and its customers.
 *
 * Every write is an upsert on the row's natural key, so this function is the whole
 * idempotency story — the second run takes the same path as the first, and the rows
 * it finds are the rows it updates.
 */
async function seedTenant(
  client: PrismaClient,
  tenant: TenantDataset,
  now: Date,
  passwordHash: string,
): Promise<TenantSummary> {
  const tenantId = asTenantId(
    (
      await client.tenant.upsert({
        where: { slug: tenant.facts.slug },
        create: { slug: tenant.facts.slug, name: tenant.text.name },
        update: { name: tenant.text.name },
      })
    ).id,
  )

  // Created and never updated: the row's documented state at onboarding is NULL for
  // the overrides and the toggles alike, and a developer's settings survive a re-run.
  await client.tenantSettings.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {},
  })

  const clinicId = asClinicId(
    (
      await client.clinic.upsert({
        where: { tenantId_name: { tenantId, name: tenant.text.clinic } },
        create: { tenantId, name: tenant.text.clinic },
        update: { name: tenant.text.clinic },
      })
    ).id,
  )

  const doctorIds: UserId[] = []
  for (const member of tenant.staff) {
    const mobile = normalizeMobile(member.mobile)
    const userId = asUserId(
      (
        await client.user.upsert({
          where: { tenantId_mobile: { tenantId, mobile } },
          create: {
            tenantId,
            mobile,
            firstName: member.name.firstName,
            lastName: member.name.lastName,
            passwordHash,
          },
          update: {
            firstName: member.name.firstName,
            lastName: member.name.lastName,
            passwordHash,
          },
        })
      ).id,
    )

    await client.membership.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: { userId, tenantId, role: member.role, clinicId },
      update: { role: member.role, clinicId },
    })

    if (member.role === Role.Doctor) doctorIds.push(userId)
  }

  for (const customer of tenant.customers) {
    const mobile = normalizeMobile(customer.facts.mobile)
    const data = {
      tenantId,
      mobile,
      firstName: customer.name.firstName,
      lastName: customer.name.lastName,
      searchName: normalizeForSearch(`${customer.name.firstName} ${customer.name.lastName}`),
      lifecycle: customer.facts.lifecycle,
      ...(customer.facts.acquisitionSource === undefined
        ? {}
        : { acquisitionSource: customer.facts.acquisitionSource }),
      ...birthColumns(customer.facts.birthDate),
      ...visitColumns(customer.facts.visits, now),
      ...consentColumns(customer.facts),
      ...(customer.facts.nextContactInDays === undefined
        ? {}
        : { leadNextContactAt: daysAgo(now, -customer.facts.nextContactInDays) }),
      ...(customer.facts.primaryDoctor === undefined
        ? {}
        : {
            primaryClinicId: clinicId,
            primaryDoctorId: doctorIds[customer.facts.primaryDoctor],
          }),
    }

    await client.customer.upsert({
      where: { tenantId_mobile: { tenantId, mobile } },
      create: data,
      update: data,
    })
  }

  // The invariant is checked over the rows as committed, not over the seed's intent,
  // because the question is what the database will serve. It is read back rather than
  // derived, so a membership the seed did not write is still part of the answer —
  // and so a role the seed *did* write is checked against the closed set on the way.
  const committed = await client.membership.findMany({
    where: { tenantId },
    select: { role: true, overrides: true, isActive: true },
  })
  assertTenantKeepsRecoveryManager(committed.map(membershipSnapshot))

  // The reception grid's development dataset — two months of booked slots so the
  // client can open any day and see a full grid. `aria` only; `parsian` stays minimal.
  if (tenant.facts.key === 'aria') {
    await seedGridDataset(client, tenantId, clinicId, doctorIds, now)
  }

  return {
    slug: tenant.facts.slug,
    name: tenant.text.name,
    roles: tenant.staff.map((member) => member.role),
    customers: tenant.customers.length,
  }
}

/** The non-text facts of the four grid services, joined to `SEED_SERVICES` by key. */
const GRID_SERVICE_FACTS: Readonly<
  Record<string, { category: string; price: bigint; depositAmount: bigint; durationMinutes: number; defaultSessions: number; defaultIntervalDays: number }>
> = {
  facial: { category: ServiceCategory.Skin, price: 3_500_000n, depositAmount: 500_000n, durationMinutes: 60, defaultSessions: 1, defaultIntervalDays: 0 },
  meso: { category: ServiceCategory.Injection, price: 4_800_000n, depositAmount: 800_000n, durationMinutes: 45, defaultSessions: 4, defaultIntervalDays: 21 },
  laser: { category: ServiceCategory.Laser, price: 2_500_000n, depositAmount: 400_000n, durationMinutes: 30, defaultSessions: 6, defaultIntervalDays: 30 },
  filler: { category: ServiceCategory.Injection, price: 8_000_000n, depositAmount: 1_500_000n, durationMinutes: 45, defaultSessions: 1, defaultIntervalDays: 0 },
}

/** The clinic-local timezone offset the grid dataset is written against (Tehran, +03:30). */
const GRID_UTC_OFFSET = 210
/** How far ahead the dataset reaches, in clinic-local days. */
const GRID_HORIZON_DAYS = 60

/** A doctor's working window for the grid, by their index among the tenant's doctors. */
function gridDoctorHours(index: number): { start: string; end: string } {
  if (index === 0) return { start: '08:00', end: '14:00' }
  if (index === 1) return { start: '10:00', end: '18:00' }
  return { start: '12:00', end: '20:00' }
}

/**
 * The reception grid's development dataset for `aria`: the clinic shift, each doctor's
 * weekday hours, the four services, and two months of booked appointments.
 *
 * Appointments are written in **one `findMany` + one `createMany`**: every intended row
 * is built deterministically (service and customer by index, so a re-run is identical),
 * the existing `(doctorId, slotKey)` pairs are read once, and only the missing rows are
 * inserted — SQLite's `createMany` has no `skipDuplicates`, so the pre-filter is the
 * idempotency. Shift, hours and services use the same `findFirst`/`upsert` idempotency
 * the rest of the seed uses.
 */
async function seedGridDataset(
  client: PrismaClient,
  tenantId: string,
  clinicId: string,
  doctorIds: readonly string[],
  now: Date,
): Promise<void> {
  // 1. Clinic shift — 08:00–20:00 every weekday. No @@unique, so findFirst then write.
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const existing = await client.clinicShift.findFirst({ where: { tenantId, clinicId, weekday } })
    const data = { tenantId, clinicId, weekday, startTime: '08:00', endTime: '20:00' }
    if (existing === null) await client.clinicShift.create({ data })
    else await client.clinicShift.update({ where: { id: existing.id }, data })
  }

  // 2. Doctor working hours — one window per doctor per weekday.
  for (const [index, doctorId] of doctorIds.entries()) {
    const { start, end } = gridDoctorHours(index)
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const existing = await client.doctorWorkingHours.findFirst({ where: { tenantId, doctorId, weekday } })
      const data = { tenantId, doctorId, weekday, startTime: start, endTime: end }
      if (existing === null) await client.doctorWorkingHours.create({ data })
      else await client.doctorWorkingHours.update({ where: { id: existing.id }, data })
    }
  }

  // 3. Services — idempotent on (tenantId, name).
  const services: { id: string; price: bigint; depositAmount: bigint; durationMinutes: number }[] = []
  for (const svc of SEED_SERVICES) {
    const facts = GRID_SERVICE_FACTS[svc.key]
    if (facts === undefined) continue
    const data = {
      tenantId,
      clinicId,
      name: svc.name,
      searchName: normalizeForSearch(svc.name),
      category: facts.category,
      price: facts.price,
      depositAmount: facts.depositAmount,
      durationMinutes: facts.durationMinutes,
      defaultSessions: facts.defaultSessions,
      defaultIntervalDays: facts.defaultIntervalDays,
      isActive: true,
    }
    const row = await client.service.upsert({
      where: { tenantId_name: { tenantId, name: svc.name } },
      create: data,
      update: data,
    })
    services.push({ id: row.id, price: row.price, depositAmount: row.depositAmount, durationMinutes: row.durationMinutes })
  }

  // 4. Appointments — two months of booked slots, built deterministically.
  if (services.length === 0 || doctorIds.length === 0) return

  const customers = await client.customer.findMany({
    where: { tenantId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  if (customers.length === 0) return

  const today = todayLocalDate(now)
  const horizon = addLocalDays(today, GRID_HORIZON_DAYS)
  const holidays = new Set(
    (
      await client.holiday.findMany({
        where: { tenantId, localDate: { gte: today, lte: horizon } },
        select: { localDate: true },
      })
    ).map((row) => row.localDate),
  )

  type Row = {
    tenantId: string
    clinicId: string
    doctorId: string
    customerId: string
    serviceId: string
    scheduledAt: Date
    localDate: string
    localTime: string
    durationMinutes: number
    status: string
    source: string
    isSlotBlock: boolean
    slotKey: string
    priceAtBooking: bigint
    depositAmount: bigint
    cancelledAt?: Date
  }

  const rows: Row[] = []
  let counter = 0
  let cancelledPlaced = false
  let unrecordedPlaced = false

  for (let day = 0; day <= GRID_HORIZON_DAYS; day += 1) {
    const localDate = addLocalDays(today, day)
    if (holidays.has(localDate)) continue

    for (const [index, doctorId] of doctorIds.entries()) {
      const hours = gridDoctorHours(index)
      const start = timeToMinutes(asLocalTime(hours.start))
      const end = timeToMinutes(asLocalTime(hours.end))
      const count = 4 + ((day + index) % 3) // 4–6 per doctor per day

      for (let slot = 0; slot < count; slot += 1) {
        const minute = start + slot * 60
        if (minute + 30 > end) break

        const service = services[counter % services.length]
        const customer = customers[counter % customers.length]
        if (service === undefined || customer === undefined) continue
        const localTime = String(minutesToTime(minute))
        const scheduledAt = toUtcInstant(asLocalDate(localDate), asLocalTime(localTime), GRID_UTC_OFFSET)
        const slotKey = scheduledAt.toISOString()

        // Status mix: today's past → done/arrived, today's near future → booked, future
        // days → booked. One CANCELLED today, one RESULT_NOT_RECORDED in the last 3 days.
        let status: string = AppointmentStatus.Booked
        let cancelledAt: Date | undefined
        if (day === 0 && !cancelledPlaced && slot === 1) {
          status = AppointmentStatus.Cancelled
          cancelledAt = now
          cancelledPlaced = true
        } else if (day >= GRID_HORIZON_DAYS - 2 && !unrecordedPlaced && index === 0 && slot === 0) {
          status = AppointmentStatus.ResultNotRecorded
          unrecordedPlaced = true
        } else if (day === 0) {
          status =
            scheduledAt.getTime() < now.getTime()
              ? counter % 2 === 0
                ? AppointmentStatus.Completed
                : AppointmentStatus.Arrived
              : AppointmentStatus.Booked
        }

        rows.push({
          tenantId,
          clinicId,
          doctorId,
          customerId: customer.id,
          serviceId: service.id,
          scheduledAt,
          localDate,
          localTime,
          durationMinutes: service.durationMinutes,
          status,
          source: AppointmentSource.Reception,
          isSlotBlock: false,
          slotKey,
          priceAtBooking: service.price,
          depositAmount: service.depositAmount,
          ...(cancelledAt === undefined ? {} : { cancelledAt }),
        })
        counter += 1
      }
    }
  }

  // One findMany for every intended key, then one createMany of the missing rows.
  // SQLite's createMany has no skipDuplicates, so the pre-filter is the idempotency.
  const slotKeys = [...new Set(rows.map((row) => row.slotKey))]
  const existing = await client.appointment.findMany({
    where: { tenantId, slotKey: { in: slotKeys } },
    select: { doctorId: true, slotKey: true },
  })
  const seen = new Set(existing.map((row) => `${row.doctorId}|${row.slotKey}`))
  const fresh = rows.filter((row) => !seen.has(`${row.doctorId}|${row.slotKey}`))

  if (fresh.length > 0) {
    await client.appointment.createMany({ data: fresh })
  }
  console.log(`Seeded ${fresh.length} appointments across ${GRID_HORIZON_DAYS + 1} days (aria grid dataset).`)
}

/**
 * A committed membership as the permission rules read it.
 *
 * The role is narrowed out of the column's `string`, because the rules are stated
 * over `Role` and a row holding a value the closed set does not contain is a row the
 * matrix cannot answer a question about.
 */
function membershipSnapshot(row: {
  readonly role: string
  readonly overrides: string | null
  readonly isActive: boolean
}): MembershipSnapshot {
  if (!isMember(ROLES, row.role)) {
    throw new Error(`A seeded membership holds the unknown role '${row.role}'.`)
  }
  return {
    role: row.role,
    overrides: parsePermissionOverrides(row.overrides).overrides,
    active: row.isActive,
  }
}

/* ── The entry point ────────────────────────────────────────────────────────── */

/** One tenant's staff counts as a summary fragment, from `ROLES` so the order is fixed. */
function roleLine(roles: readonly Role[]): string {
  return ROLES.map((role) => `${roles.filter((value) => value === role).length} ${role}`).join(', ')
}

/**
 * Writes the dataset and prints what it created.
 *
 * `now` is taken once from `realClock` and threaded down, so one run's visit dates are
 * all relative to the same instant — see the header for how the seed reads the clock.
 */
async function main(now: Date): Promise<void> {
  // Before `unscopedPrisma()`, which is the first thing here to ask `getEnv()` for a
  // value. The project root is where `.env` lives, and `process.cwd()` is passed
  // explicitly so the seed is not sensitive to the directory it was invoked from.
  loadEnvConfig(process.cwd())

  const tenants = dataset()
  const passwordHash = await hashPassword(SEED_STAFF_PASSWORD)
  const client = unscopedPrisma()

  const summaries: TenantSummary[] = []
  for (const tenant of tenants) {
    summaries.push(await seedTenant(client, tenant, now, passwordHash))
  }

  const staff = summaries.length * STAFF_PER_TENANT
  const customers = summaries.reduce((total, summary) => total + summary.customers, 0)

  console.log(
    `Seeded ${summaries.length} tenants: ${staff} users with ${staff} memberships, and ${customers} customers.`,
  )
  for (const summary of summaries) {
    console.log(`  ${summary.slug} — ${summary.name}: ${roleLine(summary.roles)} · ${summary.customers} customers`)
  }
  console.log(`Password for every seeded staff member: ${SEED_STAFF_PASSWORD}`)
  console.log(
    `Isolation fixture: ${SHARED_STAFF_MOBILE} is a staff mobile in both tenants, and ${SHARED_CUSTOMER_MOBILE} a customer mobile.`,
  )
}

main(realClock()).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})