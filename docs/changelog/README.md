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
| — | — | No release yet. The product is at end of Phase 0: documentation only, no application code. |

The first entry appears when Phase 11 produces the first release. Until then this
table is deliberately empty — a changelog entry for code that does not exist
would be exactly the kind of placeholder this project forbids.

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
