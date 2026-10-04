-- ═════════════════════════════════════════════════════════════════════════════
-- Tenant isolation — row-level security for PostgreSQL.
--
-- Spec:      docs/setup/database-migration.md §4, §7, §8.4
--            docs/knowledge/09-security.md §4.1, §5
--            docs/knowledge/02-architecture.md §6
-- Applied:   npm run db:migrate:pg — after `prisma migrate deploy`, never by
--            Prisma, never by hand.
--
-- This file adds no table and no column. It is the isolation layer, and it is
-- the layer that is allowed to fail closed: `current_setting('app.tenant_id',
-- true)` returns NULL when no tenant context has been set, `"tenantId" = NULL`
-- is never true, so a query that forgot its tenant context returns **zero rows**
-- rather than every tenant's rows.
--
-- Three details, each of which is load-bearing (database-migration.md §4):
--
--   1. FORCE **and** ENABLE. `ENABLE` alone leaves the table's owner exempt from
--      its own policies, and the application connects as the owner. `FORCE` is
--      what makes the policy apply to the connection that actually runs the
--      queries; without it this file would be decoration.
--
--   2. `current_setting(..., true)` — the second argument is `missing_ok`. With
--      it the unset case is NULL; without it, PostgreSQL raises and the failure
--      is a 500 instead of an empty result. Fail-closed, not fail-loud, is the
--      specified behaviour for a *read*: an empty page is a bug someone reports,
--      a cross-tenant page is a breach nobody reports.
--
--   3. WITH CHECK as well as USING. `USING` filters rows that are read and rows
--      that are updated or deleted; `WITH CHECK` filters rows that are inserted
--      or updated *into*. Without it a tenant could not read another tenant's
--      row but could still write one, and `"tenantId"` would be attacker-chosen.
--
-- ## Why DROP POLICY IF EXISTS before every CREATE POLICY
--
-- §7: "The RLS policies are re-applied by the migration step, not carried by
-- `pg_restore`." A database restored from `pg_dump` may be missing the policies
-- — and will look completely healthy until someone queries it. So this file is
-- re-run against restored databases by design, which means every statement in it
-- must be idempotent. `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` already
-- is; `CREATE POLICY` is not, hence the drop.
--
-- ## Tables this file deliberately does not touch
--
--   "tenants"       has no "tenantId" column — it *is* the tenant. Its policy
--                   matches on "id" instead, immediately below.
--   "license_keys"  is deployment configuration, not tenant data. It carries no
--                   "tenantId" and is read only during boot (installation.md §4).
--   _prisma_migrations  Prisma's own bookkeeping table. Policies on it would
--                   break `migrate deploy`, which reads it before any tenant
--                   context can exist.
--
-- Every table that is not named above and that carries a "tenantId" column must
-- appear in this file. `npm run check:rls` fails the build if one does not, and
-- that check is the reason this list cannot silently fall behind the schema.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── The tenant registry ──────────────────────────────────────────────────────
-- A tenant sees its own row and no other. Provisioning sets the context to the
-- new tenant's own id before inserting, so the WITH CHECK is satisfiable.

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "tenants";
CREATE POLICY tenant_isolation ON "tenants"
  USING      ("id" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("id" = current_setting('app.tenant_id', true)::text);

-- ── Clinic structure ─────────────────────────────────────────────────────────

ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "tenant_settings";
CREATE POLICY tenant_isolation ON "tenant_settings"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "clinics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinics" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "clinics";
CREATE POLICY tenant_isolation ON "clinics"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "clinic_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinic_shifts" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "clinic_shifts";
CREATE POLICY tenant_isolation ON "clinic_shifts"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "doctor_working_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_working_hours" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "doctor_working_hours";
CREATE POLICY tenant_isolation ON "doctor_working_hours"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holidays" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "holidays";
CREATE POLICY tenant_isolation ON "holidays"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_requests" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "leave_requests";
CREATE POLICY tenant_isolation ON "leave_requests"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ── People and access ────────────────────────────────────────────────────────

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "users";
CREATE POLICY tenant_isolation ON "users"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "memberships";
CREATE POLICY tenant_isolation ON "memberships"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "sessions";
CREATE POLICY tenant_isolation ON "sessions"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- One-time-code challenges are written by the login that is about to establish a
-- session, so they are the same shape as "sessions": the challenge's tenant is the
-- one the login resolved, and the row is what the login's rate limit counts. A
-- challenge is never read outside its own login, and the mobile it was texted to is
-- the only thing the response discloses (09-security.md §10).
ALTER TABLE "otp_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "otp_challenges" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "otp_challenges";
CREATE POLICY tenant_isolation ON "otp_challenges"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "audit_logs";
CREATE POLICY tenant_isolation ON "audit_logs"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ── Customers ────────────────────────────────────────────────────────────────

ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "customers";
CREATE POLICY tenant_isolation ON "customers"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "consent_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_records" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "consent_records";
CREATE POLICY tenant_isolation ON "consent_records"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- Before/after images are medical media (immutable rule 6). They are the rows a
-- missing policy would leak most expensively.
ALTER TABLE "before_after_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "before_after_images" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "before_after_images";
CREATE POLICY tenant_isolation ON "before_after_images"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ── Appointments and services ────────────────────────────────────────────────

ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "appointments";
CREATE POLICY tenant_isolation ON "appointments"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "services" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "services";
CREATE POLICY tenant_isolation ON "services"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "service_doctors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_doctors" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "service_doctors";
CREATE POLICY tenant_isolation ON "service_doctors"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ── Treatment cycles and the ledger ──────────────────────────────────────────

ALTER TABLE "treatment_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "treatment_cycles" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "treatment_cycles";
CREATE POLICY tenant_isolation ON "treatment_cycles"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "payments";
CREATE POLICY tenant_isolation ON "payments"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ── Campaigns and messaging ──────────────────────────────────────────────────

ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_templates" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "message_templates";
CREATE POLICY tenant_isolation ON "message_templates"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "campaigns";
CREATE POLICY tenant_isolation ON "campaigns"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "message_sends" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_sends" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "message_sends";
CREATE POLICY tenant_isolation ON "message_sends"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

ALTER TABLE "audience_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audience_groups" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "audience_groups";
CREATE POLICY tenant_isolation ON "audience_groups"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

-- ── Background work ──────────────────────────────────────────────────────────
-- The worker claims jobs across tenants, so it is the one process that has a
-- legitimate reason to read more than one tenant's rows (02-architecture.md §12,
-- 09-security.md §8). It does not get that by being exempt from this policy: it
-- claims a job, sets the context to that job's tenant, and works from there. A
-- policy on this table is what makes "scoped per tenant, fail closed" true for
-- the worker as well, rather than a rule the worker is trusted to follow.

ALTER TABLE "job_queues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_queues" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "job_queues";
CREATE POLICY tenant_isolation ON "job_queues"
  USING      ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);

COMMIT;
