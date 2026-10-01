# Setup — Deployment

> Two deployment shapes, one codebase: the **SaaS deployment** (many tenants, one
> installation) and the **on-premise deployment** (one tenant, the clinic's own
> server). The difference is `MULTI_TENANT` and the licence — not the code
> (ADR-0004).
>
> Both run the **same two processes**: the web tier and the background worker
> (ADR-0002).

---

## 1. The two processes

| Process | Command | Role |
|---|---|---|
| **Web** | `npm run start` | Serves every page, Route Handler and Server Action |
| **Worker** | `npm run worker` | Runs the scheduled jobs: cycles, messages, campaigns, audience refresh, appointment transitions |

**Both must run, and both must be supervised.** Without the worker, the product
looks functional and silently stops doing its central job: cycles never become
due, reminders are never sent, campaigns never dispatch, audience counts never
refresh.

**They scale independently.** The web tier is CPU-bound and bursty; the worker is
I/O-bound and steady. Two web instances and one worker is a normal shape. **Two
workers are safe** — job claiming uses `SELECT … FOR UPDATE SKIP LOCKED` with an
expiring claim (ADR-0006), so a second worker adds throughput rather than
duplicate sends.

---

## 2. Requirements

| | SaaS | On-premise |
|---|---|---|
| Node.js | 20 LTS or 22 LTS | 20 LTS or 22 LTS |
| PostgreSQL | 15 or 16, managed | 15 or 16, local |
| Reverse proxy | provided by the platform | nginx or Caddy on the clinic's server |
| TLS | platform-managed | required — see §7 |
| RAM | 1 GB per process, minimum | 2 GB total |
| Outbound network | SMS and payment gateways | SMS and payment gateways, and licence validation |

**Nothing else.** No Redis, no message broker, no object store, no CDN. The
design deliberately requires nothing beyond Node and PostgreSQL so that an
on-premise install is a task a clinic's IT can complete (ADR-0006,
`07-localization.md` §2).

---

## 3. Production environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | The PostgreSQL URL, with RLS enabled |
| `DATABASE_URL_PRODUCTION` | yes | Used by the production migration path |
| `MULTI_TENANT` | yes | `true` for SaaS, `false` for on-premise |
| `NEXTAUTH_SECRET` | yes | 32+ random bytes; **unique per installation** |
| `SMS_PROVIDER_KEY` | yes | Live key |
| `PAYMENT_PROVIDER_KEY` | yes | Live key |
| `LICENSE_KEY` | when `MULTI_TENANT=false` | The issued key |
| `NODE_ENV` | yes | `production` |
| `LOG_LEVEL` | recommended | `info` in production; never `debug` |

**Configuration is validated at boot.** A missing or malformed variable fails the
start with a named error, rather than failing later at the point of use
(`installation.md` §4).

**A production boot refuses to start** if:

- `DATABASE_URL` points at SQLite.
- `NODE_ENV=production` with `NEXTAUTH_SECRET` unset or short.
- A tenant-scoped table has no RLS policy.
- `MULTI_TENANT=false` and `LICENSE_KEY` is missing or invalid.

These are boot-time refusals, not warnings, because each one is a condition under
which serving traffic would be unsafe (`10-testing-strategy.md` §6.5).

---

## 4. Secrets

| Environment | Where secrets live |
|---|---|
| Development | `.env`, gitignored |
| Staging | The platform's secret store, or a separate gitignored file on the host |
| SaaS production | The platform's secret store; injected as environment variables |
| On-premise | A file readable only by the service account, `chmod 600`, outside the repository |

The universally forbidden list (`09-security.md` §14): no secret in a commit, in
`.env.example` (which carries names and shapes, never values), in a log line, in
an error message, in a screenshot, in a build artefact, or in the client bundle.

**Secrets in scope:** the session signing secret, the SMS gateway key, the
payment gateway key, the database password, the licence key, and the SMTP
credentials if email is used.

**Rotation.** Rotating `NEXTAUTH_SECRET` invalidates every session — it is a
planned action, announced, not an emergency reflex. The gateway keys rotate on
the vendor's schedule. The database password rotates on the host's schedule. Each
rotation is recorded in `../changelog/`.

---

## 5. Deploying

The sequence matters. Running the new version before the migration, or the
migration before the previous version has stopped, both cause an outage.

```
1. Build the release            npm ci && npm run build
2. Put the app in maintenance   (optional — only if a migration needs it)
3. Apply migrations             npm run db:migrate:pg
4. Start the new web tier       npm run start
5. Health check the web tier    GET /api/health
6. Start the new worker         npm run worker
7. Health check the worker      GET /api/health/worker
8. Verify tenant isolation      npm run test:isolation
9. Exit maintenance
10. Watch the logs for the first cycle of jobs
```

**Migrations are backwards compatible with the previous application version**
(`database-migration.md` §5), so steps 3 and 4 may overlap during a rolling
deploy. A migration that is not backwards compatible requires a maintenance
window, and that is a decision made when the migration is written — not during
the deploy.

**Step 8 is not optional.** It is cheap, and it is the check that catches a
restore or a migration that left a table without its policies — a condition in
which every tenant can read every other tenant, and nothing looks wrong
(`database-migration.md` §7).

**Rolling back:** the previous release is restarted, and **the migration is
not** rolled back. The old version runs against the newer schema, which is why
§5's compatibility rule exists. A migration that cannot be rolled forward past
requires restoring the backup taken before step 3.

---

## 6. Health checks

| Endpoint | Checks | Used by |
|---|---|---|
| `/api/health` | The process is up and can reach the database | The web tier's supervisor |
| `/api/health/worker` | The worker has claimed a job since it last started, and its last error time | The worker's supervisor |

**The worker's health check is the important one**, because a worker that is
running but claiming nothing looks healthy from the outside. The check asserts
that a job has been claimed within the expected window for the fastest cadence
job.

**Alerting.** A failed job after its retry threshold, a worker that has claimed
nothing in its window, and a nightly balance reconciliation mismatch
(ADR-0014) all raise an alert. The reconciliation mismatch is an alert because a
silent drift in a clinic's balances is the worst failure this product can have.

---

## 7. Reverse proxy and TLS

Terminated at the proxy. TLS is **required in every deployment**, including
on-premise — a clinic's customer data over plain HTTP on a shared network is not
acceptable, and the customer panel is reachable from the public internet.

Configuration requirements:

- **HTTPS only.** HTTP redirects to HTTPS.
- **Security headers** set at the proxy or the application (`09-security.md` §11): HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a Content Security Policy.
- **The client IP forwarded** as `X-Forwarded-For`, so rate limiting works on the real address rather than the proxy's.
- **Session cookies** are `Secure`, `HttpOnly`, and `SameSite=Lax` (`09-security.md` §10).
- **Body size limits** on the upload paths, matching the application's own limit.

**A note for on-premise:** the clinic's server may be reachable from the internet
for the public site and the customer panel. The staff panel should be restricted
where the clinic's network allows it, but the product does not require it —
access is enforced on the server regardless (immutable rule 2).

---

## 8. Backups

| | SaaS | On-premise |
|---|---|---|
| Frequency | Continuous WAL archiving, nightly base backup | Nightly `pg_dump`, weekly full |
| Retention | 30 days | 30 days |
| Off-site | Required | Recommended; the clinic's decision |
| Restore test | Quarterly | Documented for the clinic |

**The database is the only state.** There is no object store and no queue to back
up: uploaded images live in the database or on a path named by configuration, and
the job queue is a table. One backup covers the product.

**A restore is not complete until the isolation suite passes against the restored
database** (`database-migration.md` §7). A restore silently missing its RLS
policies is a data breach waiting for a query.

---

## 9. Upgrading

**SaaS.** Deploy the new release on the normal cadence. Tenants are notified of
behavioural changes through the changelog. No tenant action is required, and no
tenant is on a different version.

**On-premise.** The clinic, or the vendor remotely:

```
1. Back up           pg_dump --format=custom
2. Stop the worker   (so no job runs mid-upgrade)
3. Deploy the code   the new release, same paths
4. Apply migrations  npm run db:migrate:pg
5. Restart the web tier
6. Restart the worker
7. Verify            health checks, then npm run test:isolation
```

**Version pinning.** An on-premise install is on an exact version and upgrades
deliberately. It is never on a moving branch — a clinic must not receive a change
because someone pushed to `main`.

**The licence is re-validated after an upgrade** (`licensing.md` §5).

---

## 10. What is deliberately not used

Recorded so it is not proposed as an improvement without a decision:

- **No container orchestration requirement.** A single container per process is
  the target; Kubernetes is not required for either shape, and requiring it would
  exclude on-premise clinics.
- **No CDN.** The font is self-hosted (`07-localization.md` §2), so the product
  renders correctly with no internet connection — which is a real on-premise
  condition, not a theoretical one.
- **No external queue or cache.** ADR-0006.
- **No serverless deployment.** The worker needs a long-lived process
  (ADR-0001).

---

## 11. Deployment checklist

Before declaring a deployment successful:

- [ ] The web tier and the worker are **both** running and both healthy
- [ ] Migrations applied, and the applied list matches the release
- [ ] `/api/health` and `/api/health/worker` both return healthy
- [ ] **The isolation suite passes against this database**
- [ ] A manager, a doctor and a secretary can each log in and reach their shell
- [ ] The login page renders in Persian, RTL, Vazirmatn, Persian digits
- [ ] No external host is contacted for fonts, styles or scripts
- [ ] The worker claims its first job within the expected window
- [ ] No secret appears in any log line
- [ ] A backup exists and its restore path is known
- [ ] The changelog is updated for this release

---

*Related: `installation.md` (development), `single-tenant.md` (on-premise),
`licensing.md` (the on-premise key), `database-migration.md` (migrations),
`../knowledge/09-security.md` §10–§14.*
