/**
 * License key issuance and validation — the on-premise half of the commercial
 * boundary (`02-architecture.md` §7: `license` is active when `MULTI_TENANT=false`,
 * `tenant-management` when it is true).
 *
 * ## Why the key is a random value rather than a signature
 *
 * The key is a high-entropy value the issuer records and the install presents, not a
 * value the instance verifies against a public key. That is the honest choice for the
 * deployment this module serves: an on-premise install's clock is the operator's own,
 * so a signed expiry would be defeated by the clock it is checked against. The row in
 * the database is the authority, and the database is the operator's too — which is why
 * the sanction for a lapsed license is a blocked instance and not destroyed data
 * (DoD 6).
 *
 * ## Why nothing is deleted when a license lapses
 *
 * `Tenant.isActive`, the clinics, the patients and the audit are untouched by a
 * lapsed key. The instance stops rendering its panels and starts rendering the
 * sentence `LICENSE_BLOCK_SENTENCES` holds for the status, and the data is exactly
 * where a renewed license finds it.
 */

import { randomUUID } from 'node:crypto'

import { DomainError } from '@/core/types'
import type { PrismaClient } from '@/generated/prisma/client'

import type { LicenseRow, LicenseValidation } from '../types'
import { LicenseStatus as Status } from '../types'

/** The prefix every issued key carries, so a pasted value names what it is. */
const KEY_PREFIX = 'CLN'

/** The shape a key must have to be recorded: `CLN-` followed by eight groups of four. */
const KEY_PATTERN = /^CLN(-[A-Z0-9]{4}){8}$/

/** The columns a license read needs, named once so a rename touches one select. */
const LICENSE_SELECT = {
  id: true,
  key: true,
  issuedTo: true,
  issuedAt: true,
  expiresAt: true,
  maxUsers: true,
  activatedAt: true,
  notes: true,
} as const

/**
 * Issues a key and records it as the instance's license.
 *
 * Only one key is active for an install, so the write replaces any previous one —
 * a reissue is a renewal, and keeping the superseded row would leave two authorities.
 *
 * @throws DomainError — the key does not have the issuer's shape.
 */
export async function issueLicenseKey(
  prisma: PrismaClient,
  args: {
    readonly issuedTo?: string
    readonly expiresAt?: Date
    readonly maxUsers?: number
    readonly notes?: string
    readonly now: Date
  },
): Promise<LicenseRow> {
  const key = formatKey(randomUUID())

  await prisma.licenseKey.deleteMany({})
  const row = await prisma.licenseKey.create({
    data: {
      key,
      issuedTo: args.issuedTo?.trim() || null,
      expiresAt: args.expiresAt ?? null,
      maxUsers: args.maxUsers ?? null,
      activatedAt: args.now,
      notes: args.notes?.trim() || null,
    },
    select: LICENSE_SELECT,
  })

  return row
}

/**
 * Records the key the installer was issued, activating the instance.
 *
 * @throws DomainError — the value is not a key of the issuer's shape.
 */
export async function recordLicenseKey(
  prisma: PrismaClient,
  key: string,
  now: Date,
): Promise<LicenseRow> {
  const trimmed = key.trim().toUpperCase()
  if (!KEY_PATTERN.test(trimmed)) {
    throw new DomainError('The value is not a license key of the issuer\'s shape.', {
      messageKey: 'license.invalidKey',
      detail: {},
    })
  }

  const existing = await prisma.licenseKey.findFirst({ select: { id: true } })
  if (existing !== null) {
    await prisma.licenseKey.deleteMany({})
  }

  return prisma.licenseKey.create({
    data: { key: trimmed, activatedAt: now },
    select: LICENSE_SELECT,
  })
}

/**
 * The one key the instance holds, or `null` when none has been recorded.
 */
export async function currentLicense(prisma: PrismaClient): Promise<LicenseRow | null> {
  return prisma.licenseKey.findFirst({ orderBy: { issuedAt: 'desc' }, select: LICENSE_SELECT })
}

/**
 * Validates the instance's license against the clock the caller holds.
 *
 * The statuses map one-to-one onto the three sentences the blocking screen renders,
 * and `VALID` is the only one that lets the panels render. Seats are counted against
 * the install's own users, because an on-premise license caps the people who can sign
 * in rather than the tenants — there is exactly one.
 */
export async function validateLicense(
  prisma: PrismaClient,
  key: string,
  now: Date,
): Promise<LicenseValidation> {
  const row = await prisma.licenseKey.findUnique({
    where: { key: key.trim().toUpperCase() },
    select: LICENSE_SELECT,
  })

  if (row === null) {
    return Object.freeze({
      status: Status.Invalid,
      expiresAt: null,
      seatsRemaining: null,
    })
  }

  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
    return Object.freeze({ status: Status.Expired, expiresAt: row.expiresAt, seatsRemaining: null })
  }

  const seatsRemaining = await seatsLeft(prisma, row.maxUsers)

  return Object.freeze({
    status: Status.Valid,
    expiresAt: row.expiresAt,
    seatsRemaining,
  })
}

/** The instance's own license, validated — the guard the app layout asks. */
export async function currentLicenseStatus(
  prisma: PrismaClient,
  now: Date,
): Promise<LicenseValidation> {
  const row = await currentLicense(prisma)
  if (row === null) {
    return Object.freeze({ status: Status.Missing, expiresAt: null, seatsRemaining: null })
  }
  return validateLicense(prisma, row.key, now)
}

/** The seats still free under the license's cap, or `null` when the cap is unlimited. */
async function seatsLeft(prisma: PrismaClient, maxUsers: number | null): Promise<number | null> {
  if (maxUsers === null) return null
  const users = await prisma.user.count({ where: { isActive: true } })
  return Math.max(0, maxUsers - users)
}

/** A UUID rendered as the issuer's key shape. */
function formatKey(uuid: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const hex = uuid.replace(/-/g, '')
  let value = 0n
  for (const digit of hex) value = value * 16n + BigInt(Number.parseInt(digit, 16))

  const groups: string[] = []
  for (let index = 0; index < 8; index += 1) {
    let group = ''
    let remaining = value % 456976n // 26 ** 4, so a group is four base-26 digits
    value /= 456976n
    for (let place = 0; place < 4; place += 1) {
      group = alphabet[Number(remaining % 26n)] + group
      remaining /= 26n
    }
    groups.push(group)
  }

  return `${KEY_PREFIX}-${groups.join('-')}`
}
