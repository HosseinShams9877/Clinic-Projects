# Setup — Single-Tenant Mode

> A clinic buys the product and installs it on its own server. One clinic, one
> installation, one tenant. This is **`MULTI_TENANT=false`** — a runtime flag, not
> a fork (ADR-0004).
>
> The same code, the same schema, the same migrations and the same module list
> run in both modes. Only the surface changes.

---

## 1. What actually changes

Exactly two things. If anything else behaves differently, that is a defect.

| | `MULTI_TENANT=true` | `MULTI_TENANT=false` |
|---|---|---|
| **Tenant switcher** in the panel | Rendered, listing the user's memberships | **Not rendered** — a user has one membership |
| **`tenant-management` routes** | Reachable — tenants, clinics, provisioning, suspension | **Unreachable** — redirects, and the module functions refuse |
| **`license` routes** | Inactive | **Active** — key entry, status, expiry |
| **Billing / plan surface** | Present — the tenant's subscription | **Absent** — there is no subscription |
| Schema | identical | identical |
| Migrations | identical | identical |
| Modules loaded | identical | identical |
| RLS policies | active | **active** |
| `tenantId` on every row | present | present, always the same value |
| Permission model | identical | identical |
| Localization | identical | identical |

**The isolation machinery is not removed — it is inert.** Every tenant-scoped
table still carries `tenantId`, every policy still exists, and every query still
filters. There is one tenant, so the filter always matches.

**Why this matters.** Three consequences that a fork could not deliver:

- **The single-tenant customer runs the code with the most usage.** The SaaS
  deployment is where the bugs are found and fixed; the on-premise install gets
  those fixes because it is the same code.
- **The two modes cannot diverge in behaviour.** There is no second
  implementation of the cycle rule, the permission check, or the message rules to
  drift from the first.
- **A single-tenant customer who later moves to SaaS needs no migration.** The
  data is already tenant-scoped; the tenant row exists; nothing is reshaped.

---

## 2. Installing

The install is `installation.md` plus a licence.

```bash
# 1. The normal setup
npm ci
cp .env.example .env

# 2. Configure for single-tenant
#    MULTI_TENANT=false
#    DATABASE_URL=postgresql://…        (a production install uses PostgreSQL)
#    NEXTAUTH_SECRET=<generated>        (unique to this installation)
#    SMS_PROVIDER_KEY=<the clinic's>
#    PAYMENT_PROVIDER_KEY=<the clinic's>
#    LICENSE_KEY=<the issued key>

# 3. Schema and policies
npm run db:migrate:pg

# 4. Seed the single tenant and the first manager
npm run db:seed:single

# 5. Run both processes
npm run start
npm run worker
```

**Step 4 is not the development seed.** `db:seed:single` creates:

- **Exactly one `Tenant` row**, with the clinic's name.
- **One `Clinic` row** — the branch. A single-clinic install uses one; the schema
  still supports more, so a clinic that opens a second branch does not need a
  different product.
- **One manager user**, with a password set on first login.
- **No demo customers, no demo appointments, no demo data.** The clinic starts
  empty. The development seed's synthetic Persian data (`installation.md` §5)
  must never reach a clinic.

**PostgreSQL, not SQLite.** SQLite is a development convenience and is refused in
production (ADR-0003, `database-migration.md` §1). A single-tenant install is a
production install, so it uses PostgreSQL — and therefore gets RLS.

---

## 3. The seed in detail

```
Tenant            clinic name, and nothing else that a SaaS tenant would have
Clinic            the branch — name, address, phone
User (manager)    the first account; must change the password on first login
Membership        the manager's membership in the tenant, role MANAGER
Service           none — the clinic creates its own
Customer          none
```

**The manager account is the only account created.** Every other user — doctors,
secretaries — is created from `admin/staff.html` by the manager, through the
normal invitation flow. There is no "installer creates all users" path, because
that path would be a second way to create a user, and a second way is a second
place for the permission rules to be wrong.

**The first manager cannot be removed.** Immutable rule 9 and the manager-column
lock apply from the first login (`04-roles-permissions.md` §2.3). An install
cannot reach a state with no manager.

---

## 4. Configuring the single tenant

Everything a clinic configures is in `admin/settings.html`, across its six tabs,
and it is the same settings surface a SaaS tenant uses
(`06-constants.md` §5):

| Tab | What the clinic sets |
|---|---|
| نوبتدهی | Booking mode, deposit amount, secretary discount cap |
| ساعات کاری | Shifts, doctor hours, holidays |
| چرخه درمان | Default session counts and intervals, and the two cycle rules |
| پیامها | The seven automatic messages, channels, send windows |
| اختیارات | The **8 behavioral toggles** |
| کلینیک | Name, address, contact, logo |

**The 8 toggles are the only place clinic-specific behaviour is decided**
(`04-roles-permissions.md` §4). A single-tenant clinic that wants its doctors to
close their own hours flips toggle 2; nothing in the code changes, and nothing in
the code knows it is single-tenant.

---

## 5. What single-tenant mode does not have

Stated plainly, so a clinic is not surprised:

- **No tenant switcher.** There is one clinic. A user who works at two clinics
  needs a multi-tenant installation.
- **No self-service provisioning.** The tenant row is seeded at install.
- **No plan or subscription surface.** The commercial relationship is the
  licence, not a subscription.
- **No platform-level admin.** There is no super-admin who can see across
  tenants — because there is one tenant, and the vendor has no remote access to
  the clinic's data.
- **No cross-tenant reporting.** There is nothing to report across.

**The vendor does not have a back door.** A support session is the clinic granting
access to a named user account, through the same permission model as any other
user — audited, and revocable. There is no remote-administration path that
bypasses the permission matrix, and there is no mechanism by which the vendor can
read a clinic's data without it.

---

## 6. The worker in single-tenant mode

**Unchanged.** The worker runs the same jobs at the same cadences
(`02-architecture.md` §12). It resolves a tenant per job — in single-tenant mode
that resolution returns the one tenant, and the job sets `app.tenant_id` to that
value exactly as it does in SaaS (`09-security.md` §8).

**This is deliberate.** A worker that special-cased single-tenant mode would be a
second code path, and a second code path is a second place for the tenancy rules
to be wrong. The one tenant costs one extra column comparison per job.

**What the worker does in a clinic that has just installed:** it is the mechanism
by which the product starts to be useful. The cycle sweep finds due cycles, the
dispatch job sends the reminders, the audience refresh builds the group counts.
Until the clinic has appointments and cycles, the jobs run and find nothing —
which is correct, and the health check accounts for it
(`deployment.md` §6).

---

## 7. Operating it

The clinic, or the vendor remotely:

```bash
npm run db:migrate:pg         # after an upgrade
curl localhost:3000/api/health
curl localhost:3000/api/health/worker
npm run test:isolation        # after any restore, without exception
```

**Backups** are the clinic's responsibility, documented for them, and the restore
path must be known before it is needed (`deployment.md` §8).

**Upgrades** are deliberate and pinned (`deployment.md` §9). An on-premise
installation never tracks a moving branch.

**The licence** is validated at boot and re-validated after an upgrade
(`licensing.md` §5).

---

## 8. Moving from single-tenant to SaaS

Supported, and it is a data operation, not a code change.

1. The vendor provisions the customer's `Tenant` row in the SaaS installation.
2. The clinic's database is exported (`database-migration.md` §7).
3. Rows are imported with the **new** `tenantId`, replacing the single-tenant one.
   Every table already carries the column, so the mapping is one value.
4. The `Clinic` rows carry over as branches of the new tenant.
5. Users become memberships of the new tenant; passwords carry over.
6. A licence is no longer required; the tenant gets a plan instead.
7. Run the isolation suite against the imported data.

**Nothing is reshaped.** The import is a `tenantId` substitution because the
schema was never simplified for single-tenant mode. This is the payoff for
ADR-0004, and it is the reason the schema keeps a `tenantId` and RLS policies it
does not appear to need.

---

## 9. Moving from SaaS to single-tenant

The reverse, and the same shape: export the tenant's rows, import them into a
fresh single-tenant installation with that installation's `tenantId`, issue a
licence, and verify. The clinic leaves with its data because the data was always
its own rows in a shared schema.

---

## 10. Definition of done for this mode

Phase 10's DoD, restated for this document:

1. With `MULTI_TENANT=false`, the tenant switcher is **absent** and the
   `tenant-management` routes are **unreachable**.
2. With `MULTI_TENANT=true`, the reverse.
3. **The identical test suite passes under both flag values.**
4. The schema, migrations and loaded modules are **byte-identical** in both
   modes — the only difference is the flag.
5. The seeds differ, and `db:seed:single` creates no demo data.
6. The isolation suite passes in single-tenant mode, proving the machinery is
   inert rather than absent.
7. No module branches on the flag. **A module that behaves differently under the
   flag is a finding** (`05-conventions.md` §14).

---

*Related: `licensing.md` (the on-premise key), `deployment.md` (on-premise
deployment), `installation.md` (base setup), ADR-0004,
`../knowledge/02-architecture.md` §4.*
