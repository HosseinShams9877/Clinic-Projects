/**
 * The tenant context of `docs/knowledge/02-architecture.md` §11.
 *
 * One object, resolved on the server once per request, that answers *who is
 * calling and where*: the authenticated user, the tenant and clinic their
 * membership resolved to, their role, and their per-user permission overrides.
 * Every module function takes it as its first argument, and no part of it is ever
 * read from a request body, a query string, a header or a cookie — §11: "Tenant
 * context is resolved, never received."
 *
 * It is a core module rather than a module-folder because all twenty modules of
 * §7 need it and a module may not import another module's private types; placing
 * it in any one of them would make that module a dependency of the other nineteen
 * for a shape none of them owns.
 *
 * This barrel is the module's complete public surface — `02-architecture.md` §10
 * rule 2: "Every module exports a **barrel** `index.ts` that is its complete
 * public surface. If something is not in the barrel, it is private."
 */

export type { PermissionOverrides, TenantContext, TenantPrincipal } from './types'

export type { ParsedPermissionOverrides } from './lib/overrides'
export { EMPTY_PERMISSION_OVERRIDES, parsePermissionOverrides } from './lib/overrides'
