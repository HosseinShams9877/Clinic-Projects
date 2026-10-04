/**
 * The Layer-1 tenant extension — `09-security.md` §5.
 *
 * > A Prisma client extension performs Layer 1 automatically. It injects the
 * > `tenantId` predicate into every query on a tenant-scoped model and rejects a
 * > query for such a model that carries no tenant context. Modules do not
 * > hand-write the predicate; the extension is the single enforcement point, so
 * > "forgot the filter" is not a mistake a module author can make.
 *
 * ## Why the hooks are under `$allModels`
 *
 * Prisma 7 removed the operation-name keys (`findMany`, `updateMany`, …) from the
 * top level of a client-level `query` extension. What remains there is
 * `$allOperations`, `$allModels`, a per-model key, and the `$queryRaw` family.
 * `$allModels` is the one that says "every model, and here is a hook per
 * operation", which is the same set of hooks the Prisma 5 spelling named
 * directly, and it keeps one hook per operation family rather than one hook that
 * dispatches on a string — so the arg handling for a read and for a write stays
 * in its own body instead of sharing a cast.
 *
 * Every hook receives the schema's PascalCase model name (`"Clinic"`, not
 * `"clinic"`), which is what `isTenantScoped` compares against.
 *
 * ## What it does to each operation
 *
 * | Operation | Treatment |
 * |---|---|
 * | `findMany` · `findFirst` · `count` · `aggregate` · `groupBy` · `updateMany` · `deleteMany` | The `where` is **intersected** with `{ tenantId }` as an `AND`. A caller's `where` that names a different tenant is not a leak — it is an empty result. |
 * | `findUnique` · `update` · `delete` · `upsert` | `where.tenantId` is **set** to the context's id. These take a `WhereUniqueInput`, which Prisma 7 restricts to a unique field plus filters and does not accept `AND`, so there is no intersection to build — and there is no need for one, because a unique field that identifies another tenant's row simply does not exist in this tenant. |
 * | `create` · `createMany` · the `create` and `update` of an `upsert` | `data.tenantId` is *set* to the context's, and a caller's own value is ignored rather than honoured. |
 *
 * ### Why the reads intersect instead of overwriting
 *
 * A `findMany` that overwrote a caller's `tenantId` would stay safe — no other
 * tenant's rows could come back — but it would answer a question the caller did
 * not ask. A module reading `where: { tenantId }` from a value it had no business
 * trusting would receive this tenant's rows and read them as the other tenant's.
 * The intersection makes the answer empty, which is what the caller's own predicate
 * says, and is the answer a developer can reason about when the query returns
 * nothing (`09-security.md` §5).
 *
 * A caller's explicit `tenantId` that disagrees with the context is **not** an
 * error, and that is deliberate: raising would turn every such query into a
 * failure a developer has to reason about, for no security gain over the empty
 * result.
 *
 * ### The one operation family where "empty" is loud
 *
 * `update`, `delete` and `upsert` on a single row are Prisma's *required*
 * operations: they throw `P2025` when the `where` matches nothing. Adding the
 * tenant predicate therefore makes a cross-tenant `update` or `delete` throw
 * rather than silently touch nothing. That is the right failure mode — the
 * `updateMany`/`deleteMany` variants report a count of zero and are quiet, and the
 * single-row variants are the ones a caller expected a specific row from, so the
 * throw is what tells a developer the row was in another tenant. It is also what
 * keeps an `upsert` honest: the `create` branch is scoped too, so a row another
 * tenant owns cannot be claimed by id.
 *
 * ## What it deliberately does not do
 *
 * **Authorisation.** Layer 1 is isolation, not permissions (`09-security.md`
 * §4.4). A doctor querying inside the correct tenant can still see a colleague's
 * patients unless the module applies the ownership predicate. `can()` and
 * `requirePermission()` are that layer, and they live in `roles-permissions`.
 *
 * **`set_config`.** The transaction wrapper that sets `app.tenant_id` for
 * PostgreSQL's RLS is a separate concern, held with the scope in `scope.ts`,
 * because SQLite has no RLS to set it for and the two layers must not be coupled
 * to each other's availability.
 *
 * ## Why the context is read on every query
 *
 * A connection is pooled and a scope is per-request, so a cached context read
 * once at client construction would serve every request the client serves. The
 * `AsyncLocalStorage` read is what makes the client safe to share, and the cost
 * is a lookup in a map the runtime keeps per async chain.
 */

import { isTenantScoped } from './tenant-models'
import { requireTenantContext } from './scope'

/**
 * The arguments one of these hooks receives.
 *
 * Prisma types these per model — the `args` of a `Clinic` `findMany` is not the
 * `args` of a `User` one — and the client-level union across all 24 models is not
 * a type a hook body can name, so the hooks declare the three fields they read
 * and let the rest be opaque. `model` is the schema's spelling (`"Clinic"`),
 * which is what `isTenantScoped` compares against.
 *
 * An operation's args are only typed loosely here; the runtime contract they
 * follow is the table above, and the tests under `src/core/db/tests/` are what
 * holds the extension to it for every operation family.
 */
interface QueryHookArgs {
  readonly model: string
  readonly args: OperationArgs
  readonly query: (args: unknown) => Promise<unknown>
}

/**
 * The arg fields the hooks rewrite, with the index signature for everything else
 * (`orderBy`, `take`, `select`, …) that passes through untouched.
 */
interface OperationArgs {
  where?: OperationFilter
  data?: OperationWrite
  create?: OperationWrite
  update?: OperationWrite
  [name: string]: unknown
}

type OperationFilter = Record<string, unknown>
type OperationWrite = OperationFilter | OperationFilter[]

/**
 * Intersects a filter with the tenant id, without mutating the caller's object.
 *
 * For the operations that take a `WhereInput`. `where` is optional on every one of
 * them, so `undefined` means "no filter" and becomes the tenant predicate alone.
 */
function scopedFilter(where: OperationFilter | undefined, tenantId: string): OperationFilter {
  return where === undefined ? { tenantId } : { AND: [where, { tenantId }] }
}

/**
 * Adds the tenant id to a unique filter, without mutating the caller's object.
 *
 * For the operations that take a `WhereUniqueInput`, which Prisma 7 does not let an
 * `AND` be built on. The unique field still has to match, and now has to match in
 * this tenant, so the effect is the intersection's — a row another tenant owns is
 * not found. A caller's own `tenantId` is replaced rather than honoured, for the
 * same reason the reads intersect: a query that asked for another tenant and got
 * this one is a query whose answer is not its own.
 */
function scopedUniqueFilter(where: OperationFilter | undefined, tenantId: string): OperationFilter {
  return { ...where, tenantId }
}

/**
 * Sets `tenantId` on a write's `data`, overriding a value the caller supplied.
 *
 * Overriding rather than rejecting is the choice the document's wording makes:
 * "injects the `tenantId` predicate" is silent about the caller's own value, and
 * a module that passes one is a module that did not know the extension would set
 * it. Rejecting would make the extension a barrier to a straightforward call;
 * ignoring keeps the write inside the tenant and costs the caller nothing.
 */
function scopedData(data: OperationWrite | undefined, tenantId: string): OperationWrite {
  if (data === undefined) return { tenantId }
  return Array.isArray(data) ? data.map((row) => ({ ...row, tenantId })) : { ...data, tenantId }
}

/**
 * The tenant id for this query, or the failure that says there is no scope to take
 * one from. Read once per hook and named for what it is, because a hook that read
 * it twice would be a hook that could see two tenants in one query.
 */
function tenantId(): string {
  return requireTenantContext().tenantId
}

/**
 * The Prisma `$extends` query object. One hook per operation family, applied to
 * every model, with `isTenantScoped` deciding whether a model is one of the 23.
 */
export const tenantExtension = {
  name: 'tenantScope',
  query: {
    $allModels: {
      // The filtered reads. Each returns the modified args, so the predicate
      // applies before the query reaches the engine.
      findMany({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedFilter(args.where, tenantId())
        return query(args)
      },
      findFirst({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedFilter(args.where, tenantId())
        return query(args)
      },
      count({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedFilter(args.where, tenantId())
        return query(args)
      },
      aggregate({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedFilter(args.where, tenantId())
        return query(args)
      },
      groupBy({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedFilter(args.where, tenantId())
        return query(args)
      },

      // The unique read. `where` is required here, so there is no `undefined`
      // case.
      findUnique({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedUniqueFilter(args.where, tenantId())
        return query(args)
      },

      // The writes. `create` and `createMany` set the id; the filtered writes
      // get the predicate, so a delete or an update cannot reach across the
      // boundary.
      create({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.data = scopedData(args.data, tenantId())
        return query(args)
      },
      createMany({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.data = scopedData(args.data, tenantId())
        return query(args)
      },
      update({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedUniqueFilter(args.where, tenantId())
        return query(args)
      },
      updateMany({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedFilter(args.where, tenantId())
        return query(args)
      },
      delete({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedUniqueFilter(args.where, tenantId())
        return query(args)
      },
      deleteMany({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        args.where = scopedFilter(args.where, tenantId())
        return query(args)
      },
      upsert({ model, args, query }: QueryHookArgs) {
        if (!isTenantScoped(model)) return query(args)
        const id = tenantId()
        args.where = scopedUniqueFilter(args.where, id)
        args.create = scopedData(args.create, id)
        args.update = scopedData(args.update, id)
        return query(args)
      },
    },
  },
} as const
