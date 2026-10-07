/**
 * The shapes the tenant administration surface returns.
 *
 * The module is active only when `MULTI_TENANT=true` (`02-architecture.md` §7), so
 * every row here is another tenant the platform serves. Its reads are unscoped by
 * design: the surface is the operator's, and the rows it lists are the ones a
 * tenant's own scope would hide.
 */

/** One tenant, as the administration list renders it. */
export interface TenantRow {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly isActive: boolean
  /** The number of clinics the tenant has, for the column that names its footprint. */
  readonly clinicCount: number
  /** The number of memberships, for the column that names its headcount. */
  readonly memberCount: number
}

/** One clinic of one tenant, as the branches list renders it. */
export interface ClinicRow {
  readonly id: string
  readonly tenantId: string
  readonly name: string
  readonly phone: string | null
  readonly address: string | null
  readonly isActive: boolean
}

/** One membership, as the tenant's member list renders it. */
export interface TenantMembershipRow {
  readonly id: string
  readonly userId: string
  readonly firstName: string
  readonly lastName: string | null
  readonly mobile: string
  readonly role: string
  readonly isActive: boolean
}

/** The values provisioning a tenant takes. */
export interface ProvisionTenantInput {
  readonly slug: string
  readonly name: string
  /** The manager's mobile, which the platform's first membership is created for. */
  readonly managerMobile: string
  readonly managerFirstName: string
  readonly managerLastName?: string
  /** A temporary password the first manager changes at first login. */
  readonly temporaryPassword: string
  /** The primary clinic's name, when it is not the tenant's own name. */
  readonly clinicName?: string
}
