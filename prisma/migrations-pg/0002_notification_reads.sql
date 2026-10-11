-- ═════════════════════════════════════════════════════════════════════════════
-- Tenant isolation for notification_reads — row-level security for PostgreSQL.
--
-- Spec:      docs/setup/database-migration.md §4, §7
--            docs/knowledge/09-security.md §4.1
-- Applied:   npm run db:migrate:pg — after `prisma migrate deploy`, re-applied on
--            every deploy, idempotent by DROP POLICY IF EXISTS.
--
-- `notification_reads` carries a "tenantId" column, so `npm run check:rls`
-- requires its policy here. Same shape as every other tenant-scoped table in
-- `0001_tenant_isolation.sql`: ENABLE and FORCE, then a policy that both reads
-- (USING) and writes (WITH CHECK) only within the current tenant context, failing
-- closed to zero rows when no context is set.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE "notification_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_reads" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "notification_reads";
CREATE POLICY tenant_isolation ON "notification_reads"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

COMMIT;
