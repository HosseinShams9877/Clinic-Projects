/**
 * The `tenant-management` module's complete public surface.
 *
 * `02-architecture.md` §7 names this one of the two conditional modules: it is
 * active only when `MULTI_TENANT=true`, and its routes are unreachable in a
 * single-tenant install. The functions take the unscoped client rather than a
 * transaction because they act across tenants, which is the one thing a tenant's own
 * scope forbids — the operator is the actor that exception exists for.
 */

export type {
  ClinicRow,
  ProvisionTenantInput,
  TenantMembershipRow,
  TenantRow,
} from './types'

export { MESSAGES, PROVISION_FIELDS, TENANT_MANAGEMENT_FIELDS, TENANT_STATUS_LABELS } from './catalog'
export type { TenantManagementMessageKey } from './catalog'

export {
  addClinic,
  deactivateTenantMembership,
  provisionTenant,
  reactivateTenant,
  reactivateTenantMembership,
  suspendTenant,
} from './lib/provision'

export { listClinics, listTenantMemberships, listTenants } from './lib/queries'
