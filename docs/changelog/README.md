# Changelog

> What changed, when, and what it means for someone running the product. Written
> for the **reader**, not for git — `git log` already records who changed which
> line.

---

## Why this exists alongside git

`git log` answers "what code changed". It does not answer:

- **What changed for a clinic?** A refactor and a new setting look identical in a
  diff and are completely different to a manager.
- **What should an on-premise install do?** A schema migration requires an
  upgrade procedure; a copy change does not.
- **Is this a breaking change?** The commit history does not say.

The changelog answers those three questions. If an entry does not help answer at
least one of them, it does not belong here.

---

## Format

**Keep a Changelog** structure, one section per released version:

```markdown
## [1.4.0] — ۱۴۰۵/۰۷/۰۹

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Security
- ...

### Upgrade notes
- ...
```

**Categories.** `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` ·
`Security`. `Security` is used for anything a customer should know about,
including a fix to a vulnerability that was never exploited.

**Version numbers** follow semantic versioning:

| Change | Version |
|---|---|
| A new feature a clinic can use | **minor** — `1.4.0` |
| A fix, a copy change, an internal improvement | **patch** — `1.4.1` |
| A change that requires action from an on-premise install, or that changes a behaviour a clinic depends on | **major** — `2.0.0` |

**Dates are Jalali**, matching the product's own calendar convention
(`07-localization.md` §6.4). The Gregorian date is not shown, because the reader
is a Persian-speaking clinic.

---

## What every entry must contain

1. **Written for a clinic manager, in Persian or in plain English** — never in
   code identifiers. `Added the ability to close a doctor's whole day` — not
   `Added SlotBlock.dayScope`.
2. **The reason**, when the change is not self-explanatory. A fix says what was
   going wrong, not just that something changed.
3. **Upgrade notes when an on-premise install must act.** A migration, a new
   environment variable, a changed default. **An entry that requires action and
   does not say so is a defect.**
4. **A `Security` entry for any change to authentication, authorisation, tenancy
   or consent** — even when nobody was affected.

---

## What does not belong

- The commit list. Git has it.
- An entry per pull request. The changelog is per **release**.
- Internal refactors with no observable effect. If a clinic cannot notice it, it
  is not a changelog entry.
- A `TODO`, a plan, or an unreleased intention. The changelog is a record of what
  happened.

---

## Upgrade notes: the important part

For an **on-premise** installation, the changelog is the upgrade instruction. A
major version entry must state, in order:

1. **Back up first** — `pg_dump --format=custom`
2. **New environment variables**, if any
3. **Whether a maintenance window is required** — that is, whether the migration
   is backwards compatible (`database-migration.md` §5)
4. **Anything the clinic must reconfigure** — a changed default on one of the 8
   toggles, a changed message template
5. **The verification step** — the health checks and `npm run test:isolation`

See `../setup/deployment.md` §9 for the full on-premise upgrade procedure.

---

## Releases

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | ۱۴۰۵/۰۷/۱۶ | The first release — every panel, the public site, the worker and the ten phases' rules. |

---

## [1.0.0] — ۱۴۰۵/۰۷/۱۶

The first release. Ten phases of work, and the product a clinic actually runs:
reception, the manager and doctor panels, the customer's own account, the public
site with its booking wizard, the background worker, multi-tenancy and licensing.

### Added

- **The eight public pages and the booking wizard** (Phase 8) — a visitor reads
  the catalogue, picks a service and books a real slot, with no account and no
  staff involvement. The slots the wizard offers come from the same engine the
  desk's grid uses, so a time the site sells is a time the clinic can honour.
- **The customer's own panel** (Phase 9) — upcoming and past sessions, the
  care instructions for each service, receipts and the balance they leave, and
  the profile with its consents.
- **The manager's dashboard, reports and settings** (Phase 10) — the six settings
  tabs, the tenancy surface and the license key.
- **Campaigns and the campaign assistant** (Phase 7) — a manager writes a Persian
  sentence and the assistant reads the audience, the channel and the message out
  of it. A campaign cannot dispatch without a second person's approval.
- **Treatment cycles and the contact list** (Phase 4) — a course of sessions is
  created on the first completed session, and the secretary's contact list holds
  the customers whose next session is not yet booked.
- **Debts in four buckets** (Phase 5), reception's working day (Phase 6), and
  customers, leads and services (Phases 1–3).

### Fixed

- **A deactivated service no longer appears on a doctor's public card.** The
  catalogue stopped selling it and its page returned a 404, but the doctor's card
  still named it, so a visitor could reach a booking the wizard then had to
  refuse. The read now filters the same way the catalogue does (Phase 11).

### Security

- **Tenancy is enforced at two layers.** The application's tenant filter is one;
  the PostgreSQL row-level-security policies are the other. Every one of the 24
  tenant-scoped tables carries `ENABLE`, `FORCE`, `USING` and `WITH CHECK`, and
  the check is run by `npm run check:rls`.
- **A license that lapses blocks the instance and destroys nothing.** The tenant,
  its clinics and its audit rows are exactly where a renewed key finds them.
- **Consent gates the gallery in the read itself**, so no page can render an
  image the clinic unpublished or the person later withdrew.

### Upgrade notes

This is the first release, so there is no upgrade path — only the install path in
`setup/installation.md`. For an on-premise single-tenant install, read
`setup/single-tenant.md` first, then `setup/deployment.md`.

- **PostgreSQL 15 or 16 is required in production.** SQLite is development only
  and carries no row-level security.
- **The worker is not optional.** Without it, cycles do not become due,
  reminders are not sent, campaigns do not dispatch and audience counts do not
  refresh.
- **A clean install reaches a Persian, right-to-left login page with no network
  access**, because the font is self-hosted and committed.


---

## How to write an entry

1. **When a release is cut**, not when a branch merges.
2. **Group by what a clinic would notice**, not by module.
3. **Lead with the change, not with the reason.** The reason follows.
4. **Name the phase** the change came from, so the entry can be traced to
   `../roadmap/phases.md`:

   ```markdown
   ### Added
   - **Treatment cycles** (Phase 4) — a course of sessions is now created
     automatically when a session is marked «انجام شد», and the customer appears
     in the secretary's contact list if the next session is not booked.
   ```

5. **State the upgrade impact** if there is any.
6. **Commit it with the release** — `docs(changelog): release 1.4.0`.

---

## Relation to the other documents

| Document | Records |
|---|---|
| `git log` | Every code change, by whom |
| **`changelog/`** (this) | Every **release**, for the clinic |
| `../roadmap/decisions.md` | Every **architectural decision**, with its reasoning |
| `../roadmap/progress.md` | Every **phase**, as it completes |
| `../reports/` | Every **phase's** output, verifications and open questions |

A decision changes the plan; a changelog entry records that the plan changed for
the customer. Both are written, and they are written for different readers.
