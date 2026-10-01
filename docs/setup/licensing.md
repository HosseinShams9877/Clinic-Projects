# Setup — Licensing

> The on-premise installation is licensed. `MULTI_TENANT=false` requires a valid
> `LICENSE_KEY`; `MULTI_TENANT=true` does not — a SaaS tenant has a subscription,
> not a licence (ADR-0004).
>
> **The licence protects the vendor's commercial interest. It must never hold the
> clinic's data hostage.** Every failure mode below is chosen so that an expired
> licence degrades the product rather than destroying or withholding a clinic's
> records.

---

## 1. What the licence is

A signed, self-contained token that states:

| Claim | Meaning |
|---|---|
| `licenseId` | The licence's identifier, unique per issue |
| `tenantName` | The licensed clinic's name, for display |
| `installationId` | The installation this key was issued for |
| `issuedAt` | When it was issued |
| `expiresAt` | When it stops being valid |
| `plan` | The licensed plan, which sets the limits in §6 |
| `features` | Optional named features, if a plan is sold in pieces |
| `signature` | The vendor's signature over the claims above |

**It contains no customer data, no usage data, and no telemetry.** A licence is a
statement by the vendor, not a report from the clinic.

---

## 2. Where it lives

| | |
|---|---|
| Environment | `LICENSE_KEY=<the key>` |
| Storage | Only in the environment or the secrets file — never in the database, never in a commit |
| Displayed | `admin/settings.html`, in the licence section: the clinic name, the expiry, and the status |
| Entered | At install, and on renewal through the settings surface |

**The key is validated at boot** (`deployment.md` §3). A missing or invalid key on
a `MULTI_TENANT=false` installation refuses to start — which is a deliberate,
visible failure at a moment when someone is watching, rather than a silent
degradation discovered by a secretary at 9am.

---

## 3. How validation works

```
1. Parse the key.                     Malformed → invalid.
2. Verify the signature.              Failed   → invalid.
3. Check expiresAt against the clock. Past     → expired.
4. Check installationId.              Mismatch → invalid for this installation.
5. Apply the plan's limits.           §6.
```

**Validation is local.** The key is self-contained and verified with the vendor's
public key. **No network call is required for the product to run.**

**Why offline validation is a requirement, not a nicety:** an on-premise clinic's
server may have no reliable internet, and a licence check that requires a network
call would take the product down when the clinic's connection drops. A product
that stops working because a licence server is unreachable is a product the
clinic cannot trust.

**Optional online confirmation** exists for renewal and for the vendor's
reporting, and it is **never** on the critical path. Its absence is not a
failure.

**Clock skew.** The check allows a documented tolerance. A clinic's server clock
that is wrong by hours should not falsely expire a valid licence; a clock set
back by years to evade expiry is a different matter, and the installation records
the highest date it has seen so that a backwards jump is detectable.

---

## 4. What happens when a licence expires

**The product keeps working. Nothing is deleted. No data is withheld.**

An expired licence:

- **Shows a persistent, dismissible notice** to managers, in Persian, naming the
  expiry date and the next step.
- **Blocks new user invitations** beyond the plan's seat limit.
- **Blocks upgrades** to a release newer than the licence's entitlement.
- **Continues** every existing function: booking, cycles, messages, payments,
  reports, the customer panel, the worker's jobs.

**Why degrade rather than lock.** A clinic whose licence lapsed by a week still
has customers with appointments tomorrow. Locking the product would mean a
secretary cannot see the day's schedule, a doctor cannot record a result, and
patients are turned away — for a commercial disagreement that has nothing to do
with them. The vendor's remedy for non-payment is the commercial relationship,
not the clinic's patients.

**The single hard stop** is at boot on a `MULTI_TENANT=false` installation with
**no key at all**, or with a key whose **signature fails**. Those are not expiries
— they are an unlicensed installation, which is a different situation from a
lapsed one.

---

## 5. Renewal and re-validation

**Renewal** issues a new key with a later `expiresAt`. The clinic replaces the
`LICENSE_KEY` value and restarts — or enters the key through the settings
surface, if the installation allows it, in which case the key is written to the
configuration and the application reloads it.

**Re-validation happens at boot and after an upgrade**
(`deployment.md` §9). An upgrade to a release the licence does not entitle the
installation to is refused **before** the new version starts, not after.

**An upgrade never destroys data, and never leaves the installation in a
half-upgraded state.** If the licence check fails, the previous version keeps
running.

---

## 6. Plan limits

| Limit | Enforced |
|---|---|
| Active staff accounts | At invitation — an invitation beyond the limit is refused with a Persian explanation |
| Clinics (branches) | At creation |
| Monthly message volume | Reported; and a warning at the threshold. **Not** a hard block at the limit, because stopping a clinic's customer messages mid-month is worse than an overage conversation |
| Feature flags | At the route and the module function — the same server-side enforcement as a permission (immutable rule 2) |

**Seat and branch limits are enforced on the server**, in the `staff` and
`tenant-management` modules, not in the UI. Hiding an invitation button is not a
licence limit (immutable rule 2).

**Message volume is metered, not blocked.** The clinic's messages are customer
communication; interrupting them to enforce a quota harms the clinic's customers
for the clinic's commercial reason. The overage is surfaced, and it is a
conversation.

---

## 7. Issuing a licence

A vendor-side procedure, recorded here so the process is defined.

1. The clinic's installation produces an `installationId` on first boot and
   displays it in the licence section.
2. The clinic sends the `installationId` and its clinic name to the vendor.
3. The vendor issues a key bound to that `installationId` and a plan.
4. The key is delivered and installed.
5. The vendor records the issue in `../changelog/`.

**The `installationId` is a random identifier, not a fingerprint of the machine.**
It does not encode hardware, network address, or anything about the clinic's
infrastructure. It exists so a key cannot be copied to a second installation, and
nothing more.

---

## 8. What the licence must never do

Stated explicitly, because each is a plausible design that this product rejects:

- **Never withhold or delete the clinic's data.** The data is the clinic's. It is
  not collateral.
- **Never require a network call to function.** Offline validation (§3).
- **Never transmit customer data, usage data, or telemetry.** The key is
  one-directional.
- **Never phone home silently.** The optional online confirmation is disclosed,
  and it is optional.
- **Never block the customer panel or the public site.** A patient booking an
  appointment is not a party to the clinic's licence.
- **Never block the worker's jobs.** Reminders, cycle sweeps and campaign
  dispatch keep running, because stopping them would lose the clinic's customers
  — the exact harm the product exists to prevent.

---

## 9. Relationship to SaaS mode

| | `MULTI_TENANT=true` | `MULTI_TENANT=false` |
|---|---|---|
| `LICENSE_KEY` | Ignored — may be empty | **Required** |
| Commercial model | A plan and a subscription on the tenant | A licence key on the installation |
| Expiry behaviour | The tenant's plan state | The licence's `expiresAt` |
| Seat limits | The plan's seats across the tenant | The licence's seats |
| Vendor access | Support through a granted, audited account | The same — no back door (`single-tenant.md` §5) |

**The licence module is active only in single-tenant mode**, and the billing
surface only in multi-tenant mode (ADR-0004). Neither is a second implementation
of the other: they are two commercial models over one product.

---

## 10. Definition of done

Phase 10's DoD, restated for this document:

1. A valid key boots and the product runs fully.
2. A missing key on `MULTI_TENANT=false` **refuses to start**, with a Persian
   explanation.
3. A malformed or wrongly-signed key refuses to start.
4. A key bound to a different `installationId` is refused.
5. **An expired key keeps the product running** — booking, cycles, messages,
   payments, reports and the customer panel all still work — and shows the
   manager notice.
6. An expired key blocks new invitations beyond the seat limit, and blocks an
   upgrade, **without touching existing data**.
7. **No network call is required** for any of the above; validated by running
   with the network disconnected.
8. The key never appears in a log line, an error message, or the client bundle.
9. With `MULTI_TENANT=true`, `LICENSE_KEY` is ignored and no licence surface is
   reachable.

---

*Related: `single-tenant.md` (the on-premise install), `deployment.md` (boot
checks), `../knowledge/06-constants.md` (the immutable rules the licence honours),
ADR-0004.*
