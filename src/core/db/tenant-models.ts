/**
 * The models that carry a `tenantId`, as a closed list.
 *
 * `09-security.md` §5: "A Prisma client extension performs Layer 1 automatically.
 * It injects the `tenantId` predicate into every query on a tenant-scoped model
 * and rejects a query for such a model that carries no tenant context."
 *
 * The list is the same one `scripts/check-rls-coverage.mjs` derives from the
 * schema to verify Layer 2’s policies, and it is derived the same way rather than
 * restated by hand: a second copy of the schema’s tenant-scoping in a check or an
 * extension is a copy that will disagree with the schema, and the disagreement
 * will surface as a failing query in the wrong place.
 *
 * `Tenant` itself is **not** here. It is the tenant registry — scoped by `id`
 * under RLS, and readable through `resolveTenant()` rather than by a model query
 * a module writes. Including it would make every `findMany` on the registry
 * require a tenant id, which is the one query that must not.
 *
 * ## Why the names are the schema’s spelling
 *
 * A query hook receives the model as the DMMF names it — `Clinic`, not `clinic` —
 * so the PascalCase declaration is what the extension compares against, and what a
 * mismatch with the schema is visible in. The client exposes the same model
 * lowercased (`prisma.clinic`), but no code in this tree looks a model up by its
 * client spelling, so the two spellings are never both in play at once.
 *
 * ## How the list is kept honest
 *
 * `tests/tenant-models.test.ts` reads `prisma/schema.prisma` and asserts this
 * array is exactly its set of models with a scalar `tenantId`. A model that gains
 * a `tenantId` and is not added here fails that test, which is the same failure
 * `check:rls` reports from the other direction.
 */

/** Every model whose table carries a `tenantId` column, as the schema declares it. */
export const TENANT_SCOPED_MODELS = [
  'TenantSettings',
  'Clinic',
  'User',
  'Membership',
  'Session',
  'OtpChallenge',
  'AuditLog',
  'JobQueue',
  'Customer',
  'ConsentRecord',
  'BeforeAfterImage',
  'Appointment',
  'ClinicShift',
  'DoctorWorkingHours',
  'Holiday',
  'LeaveRequest',
  'Service',
  'ServiceDoctor',
  'TreatmentCycle',
  'Payment',
  'MessageTemplate',
  'Campaign',
  'MessageSend',
  'AudienceGroup',
] as const

/** A model name as the extension’s query hooks receive it. */
export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number]

const TENANT_SCOPED_SET: ReadonlySet<string> = new Set(TENANT_SCOPED_MODELS)

/** True if the model’s table carries a `tenantId` and Layer 1 applies to it. */
export function isTenantScoped(model: string): boolean {
  return TENANT_SCOPED_SET.has(model)
}
