/**
 * Provisioning and suspension — the operator's writes on a tenant.
 *
 * These are unscoped writes by necessity: the operator is the one actor the platform
 * serves who acts *across* tenants, so the writes cannot go through a tenant's own
 * scope. Every `where` still names the tenant it means, and the suspension is a
 * flag rather than a delete (`Tenant.isActive`), because the rows below a tenant are
 * its history and its patients, and closing a clinic is not a permission to lose them.
 */

import { Role } from '@/core/constants'
import { DomainError } from '@/core/types'
import { hashPassword } from '@/modules/auth'
import type { PrismaClient } from '@/generated/prisma/client'

import type { ProvisionTenantInput, TenantRow } from '../types'

/** The columns a tenant list reads, named once so a rename touches one select. */
const TENANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  isActive: true,
} as const

/** A slug is the tenant's address, so it is the one value that must be unique. */
function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
}

/**
 * Provisions a tenant: the row, its settings row, its primary clinic, and the one
 * manager membership the platform requires (`04-roles-permissions.md` §2.3's tenant
 * invariant — a tenant without an active manager is a tenant nobody can administer).
 *
 * @throws DomainError — the slug is already another tenant's address.
 */
export async function provisionTenant(
  prisma: PrismaClient,
  input: ProvisionTenantInput,
): Promise<TenantRow> {
  const slug = normalizeSlug(input.slug)
  if (slug === '') {
    throw new DomainError('A tenant needs a slug to serve its address.', {
      messageKey: 'settings.invalidValue',
      detail: { field: 'slug' },
    })
  }

  const taken = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
  if (taken !== null) {
    throw new DomainError(`The slug ${slug} is already another tenant's address.`, {
      messageKey: 'tenant.slugTaken',
      detail: { slug },
    })
  }

  const passwordHash = await hashPassword(input.temporaryPassword)

  // The tenant is created with its settings row and its primary clinic first, so the
  // manager's membership can name the tenant by the id that row has — a membership is
  // a row of the tenant it belongs to, and a nested create two levels deep cannot
  // inherit the grandparent's id the way the user row itself does.
  const created = await prisma.tenant.create({
    data: {
      slug,
      name: input.name.trim(),
      settings: { create: {} },
      clinics: {
        create: [{ name: (input.clinicName ?? input.name).trim(), isActive: true }],
      },
    },
    select: TENANT_SELECT,
  })

  await prisma.user.create({
    data: {
      tenantId: created.id,
      mobile: input.managerMobile.trim(),
      firstName: input.managerFirstName.trim(),
      lastName: input.managerLastName?.trim() ?? '',
      passwordHash,
      isActive: true,
      memberships: {
        create: [{ tenantId: created.id, role: Role.Manager, isActive: true }],
      },
    },
  })

  return toRow(prisma, created)
}

/**
 * Suspends a tenant: `isActive` becomes `false`, and the tenant's address stops
 * resolving (`resolveTenantId` answers `null` for a closed tenant). Nothing is
 * deleted — the patients, the cycles and the audit stay, and reactivation is a flag.
 */
export async function suspendTenant(prisma: PrismaClient, tenantId: string): Promise<void> {
  await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } })
}

/** Reopens a tenant. Its rows never moved, so the clinic is exactly where it left off. */
export async function reactivateTenant(prisma: PrismaClient, tenantId: string): Promise<void> {
  await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } })
}

/**
 * Deactivates a membership, with §2.3's guard: a tenant cannot be left without an
 * active manager, so the last one is refused rather than taken away.
 *
 * @throws DomainError — the membership is the tenant's last active manager.
 */
export async function deactivateTenantMembership(
  prisma: PrismaClient,
  tenantId: string,
  membershipId: string,
): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: { id: true, role: true, isActive: true, tenantId: true },
  })
  if (membership === null || membership.tenantId !== tenantId) return

  if (membership.role === Role.Manager && membership.isActive) {
    const otherManagers = await prisma.membership.count({
      where: {
        tenantId,
        role: Role.Manager,
        isActive: true,
        NOT: { id: membershipId },
      },
    })
    if (otherManagers === 0) {
      throw new DomainError('The tenant would be left without an active manager.', {
        messageKey: 'tenant.cannotSuspendLastManager',
        detail: { membershipId },
      })
    }
  }

  await prisma.membership.update({ where: { id: membershipId }, data: { isActive: false } })
}

/** Reactivates a membership the operator previously deactivated. */
export async function reactivateTenantMembership(
  prisma: PrismaClient,
  tenantId: string,
  membershipId: string,
): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: { tenantId: true },
  })
  if (membership === null || membership.tenantId !== tenantId) return

  await prisma.membership.update({ where: { id: membershipId }, data: { isActive: true } })
}

/** Adds a branch to a tenant, which is how a clinic group grows past its first door. */
export async function addClinic(
  prisma: PrismaClient,
  tenantId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new DomainError('A clinic needs a name.', {
      messageKey: 'settings.invalidValue',
      detail: { field: 'clinicName' },
    })
  }

  await prisma.clinic.create({
    data: { tenantId, name: trimmed, isActive: true },
  })
}

/** The tenant row with the two counts the list's columns render. */
async function toRow(
  prisma: PrismaClient,
  tenant: {
    readonly id: string
    readonly slug: string
    readonly name: string
    readonly isActive: boolean
  },
): Promise<TenantRow> {
  const [clinicCount, memberCount] = await Promise.all([
    prisma.clinic.count({ where: { tenantId: tenant.id } }),
    prisma.membership.count({ where: { tenantId: tenant.id } }),
  ])

  return Object.freeze({
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    isActive: tenant.isActive,
    clinicCount,
    memberCount,
  })
}
