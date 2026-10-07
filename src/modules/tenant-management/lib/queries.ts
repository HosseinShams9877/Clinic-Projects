/**
 * The tenant administration surface's reads.
 *
 * Unscoped reads across the tenants this instance serves — the operator is the one
 * actor the platform serves who is answered across tenants, and a tenant's own scope
 * would answer none of them. The rows are the operator's own view of the platform,
 * never a clinic's, and no patient data is on any of them.
 */

import type { PrismaClient } from '@/generated/prisma/client'

import type { ClinicRow, TenantMembershipRow, TenantRow } from '../types'

/** The tenants this instance serves, newest first, with the counts the list renders. */
export async function listTenants(prisma: PrismaClient): Promise<readonly TenantRow[]> {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      _count: { select: { clinics: true, memberships: true } },
    },
  })

  return tenants.map((tenant) =>
    Object.freeze({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      isActive: tenant.isActive,
      clinicCount: tenant._count.clinics,
      memberCount: tenant._count.memberships,
    }),
  )
}

/** One tenant's branches, in the order it opened them. */
export async function listClinics(prisma: PrismaClient, tenantId: string): Promise<readonly ClinicRow[]> {
  const clinics = await prisma.clinic.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, tenantId: true, name: true, phone: true, address: true, isActive: true },
  })

  return clinics.map((clinic) =>
    Object.freeze({
      id: clinic.id,
      tenantId: clinic.tenantId,
      name: clinic.name,
      phone: clinic.phone,
      address: clinic.address,
      isActive: clinic.isActive,
    }),
  )
}

/** One tenant's memberships, for the member list the operator administers. */
export async function listTenantMemberships(
  prisma: PrismaClient,
  tenantId: string,
): Promise<readonly TenantMembershipRow[]> {
  const memberships = await prisma.membership.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      isActive: true,
      role: true,
      user: { select: { id: true, firstName: true, lastName: true, mobile: true } },
    },
  })

  return memberships.map((membership) =>
    Object.freeze({
      id: membership.id,
      userId: membership.user.id,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      mobile: membership.user.mobile,
      role: membership.role,
      isActive: membership.isActive,
    }),
  )
}
