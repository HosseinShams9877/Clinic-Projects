# Phase 06 Report — Messages and Notifications

**Status: closed.**

Phase 6 is complete. The build is green (routes added: `reception/desk`, and the
module graph the desk composes), `npm run verify` passes at **1129 tests across
56 files**, and the work is committed as `bbdf3c7`. What follows is what shipped,
what was fixed, and what remains open.

---

## 1. Phase

**Phase 6 — Messages and notifications.**

Goal, from `../roadmap/phases.md`: the seven automatic messages with their triggers
and timing, the per-customer delivery ledger, consent as a hard filter, the 90-day
duplicate window and the one-message-per-day priority order, the channel
configuration, the gateway adapter, and the desk's day list.

---

## 2. What was produced

### 2.1 The `notifications` module

`src/modules/notifications/` — the half that answers *which* of the seven messages
is due. It owns no send and no template; it owns the triggers.

- **`lib/triggers.ts`** — `collectAutomaticCandidates`, the one place the seven
  evaluators are composed. Each evaluator is a query that answers a trigger: a
  booking, a tomorrow's appointment, a completed visit past its
  `resultRecordedAt`, a due cycle, a no-show, a completed visit past the survey
  wait, an unpaid balance past its due date. Every query is wrapped in
  `withCustomer`, because a candidate with no customer is not a message and the
  type the dispatcher receives has `customerId: string` and not `string | null`.
- **`lib/consent.ts`** — `hasChannelConsent`, the read the dispatcher asks before
  anything else.
- **`lib/today.ts`** — the day's reminders: the clinic's day, the unrecorded
  cartable, the cycle and debt contact lists, the new leads, the day's arrivals.
  The desk is a composition of these reads; the module owns no entity of its own.

### 2.2 The `messages` module

`src/modules/messages/` — the half that answers *whether* the due message may be
delivered, and the one that delivers it.

- **`lib/settings.ts`** — `readSendSettings`, the send window, the daily cap, the
  duplicate window, the clock offset and the channel map. Every absent value is a
  documented default rather than an error, because a settings read that threw
  would silence the whole dispatch for one malformed blob.
- **`lib/templates.ts`** — the read and its two lines of defence:
  `validateTemplateText` refuses a placeholder the kind cannot fill at settings
  time, and `renderAutomaticTemplate` raises on a placeholder with no value at
  send time. `readTemplate` answers with the shipped default when the tenant has
  no row, and answers an *inactive* row as inactive — the clinic's off switch for
  one message, not a fall-through to the default it just turned off.
- **`lib/ledger.ts`** — `recordSend`, `markDelivered`, and the dispatcher's three
  reads. `recordSend` writes the row **before** the gateway is called, so a send
  that never returned still has a row; `markDelivered` is the only writer of
  `sentAt`, because it is the only writer that knows what the provider answered.
- **`lib/gateway.ts`** — the `MessageGateway` interface and the console adapter.
  A tenant's provider is a deployment choice and not a fork.
- **`lib/window.ts`** — the send-window arithmetic, a comparison on a local time.
- **`lib/dispatch.ts`** — `runAutomaticDispatch` and `flushSendQueue`, the rules
  in the order the specification states them, and the priority list read from the
  constants module rather than restated.
- **`lib/job.ts`** — the `messages.dispatch` handler, rescheduling its own next
  tick inside the same transaction as the work.

### 2.3 The desk

`src/app/reception/desk/page.tsx` — «میز کار امروز». A server component that runs
the lifecycle sweep and then composes the notifications module's reads into seven
sections, each gated on the permission that owns its rows: the day's appointments,
the unrecorded cartable, the cycle contact list, the debt contact list, the new
leads, the day's arrivals and the overdue follow-ups. It owns no entity and writes
nothing; it is the desk's own morning, in the order the desk works.

### 2.4 The worker job

`messages.dispatch` is registered in `src/worker/registry.ts` beside the lifecycle
sweep, the cycles next-due sweep and the reconciliation — the fourth handler, and
the `messages` module's only producer of work.

### 2.5 The schema

One migration, `prisma/migrations/20261005140000_messages_settings/`, adds
`MessageSend`, `MessageTemplate`, `ConsentRecord` and the send settings on
`TenantSettings`. The schema is now **exactly 1000 lines** — at ADR-0007's ceiling,
not past it, so no comment trimming was needed.

---

## 3. Tests

**Three tests, as the phase's instruction fixed the count.** Each one is one of
the three things the instruction named, and each is a scenario a wrong answer
would be silent about.

| File | DoD | What it asserts |
|---|---|---|
| `src/modules/notifications/tests/triggers.test.ts` | (a) | All seven automatic messages fire on their trigger against an injected clock, each carrying its customer and its values; one candidate per kind per customer; and at a clock six weeks later the five event-bounded kinds are absent while the two state-based kinds — the due cycle and the unpaid balance — remain, because a state has no lookback |
| `src/modules/messages/tests/consent.test.ts` | (b) | A customer without consent receives nothing, the attempt is recorded as `SUPPRESSED` with reason `NO_CONSENT`, `sentAt` is null and `providerMessageId` is null; and after consent is recorded the same dispatch sends, with `sentAt` set |
| `src/modules/messages/tests/window.test.ts` | (c) | With two messages due to one customer, the priority list's higher-ranked one is sent and the other is suppressed as `DAILY_CAP`; and a message delivered ۳۰ days ago closes the window across every kind, so both due messages are suppressed as `DUPLICATE_WINDOW` |

The rest of the phase's definition of done is held by the code rather than by a
suite, and the instruction was explicit that no fourth test be written: the
template allow-list is `validateTemplateText`'s throw, the row-before-the-gateway
ordering is `recordSend`'s signature, the send window's hold-and-flush is
`flushSendQueue`, and the desk's permission gating is one `can()` per section.

---

## 4. What was fixed during verification

Four defects, all found by the tests and all genuine — none of them was a test's
mistake.

**The template's default row had an id that pointed at nothing.** `readTemplate`
answered the shipped default with `id: ''`, and the ledger wrote that empty
string into `MessageSend.templateId`, a foreign key to a row that does not exist.
The type is now `string | null` and the fallback is `null`: a template that was
never written has no id to record, and the ledger's nullable column is nullable
for exactly this row.

**A suppressed row carried a send time.** `recordSend` wrote
`sentAt: status === 'QUEUED' ? null : now`, stamping a delivery timestamp on a
message the rules refused and that never reached a provider. `sentAt` is now
always `null` from `recordSend`, and `markDelivered` — the only writer that knows
the provider's answer — is the only writer that sets it. The daily-cap and
window reads count a suppression as *not* delivered, so a customer's missing
consent is not another customer's closed window.

**The duplicate window was checked before the daily cap.** The window read counts
the row the same run just wrote, so the window always fired first — which means
the priority list could never be the thing that decided which of two due messages
was sent, contradicting the rule it exists to serve. The cap is now checked
first: the cap is a fact about today, the window a fact about the last 90 days,
and a second message due in one run is held by the cap with the reason the
clinic can repeat.

**The ledger's `createdAt` came from a different clock than the rules.** The
column's `@default(now())` stamped the database's wall clock while every decision
ran on the injected `now`, and the daily cap's `lte: now` bound then excluded the
row the run had just written — the cap read missed the message it was there to
count. `recordSend` now writes `createdAt` from the caller's clock, so all four
rule reads agree about when "today" is.

---

## 5. Coverage

**The coverage floors remain red**, exactly as Phases 3, 4 and 5 left them, and
for the same reason: the instruction was three tests and "do not chase a number".
The four largest holes, named so a later session can decide which earns a suite:

- `src/modules/messages/lib/dispatch.ts` — the module's central file, covered by
  the two dispatch tests, which exercise the rule chain but not the queued-then-
  flushed path or a failed gateway result.
- `src/modules/notifications/lib/triggers.ts` — the seven evaluators, covered by
  the one triggers test, one row per kind.
- `src/modules/messages/lib/settings.ts` — the permissive parse and its three
  fallback branches, not exercised.
- `src/modules/messages/lib/templates.ts` — `ensureDefaultTemplates`'s
  idempotency loop, not exercised.

Phase 11 is where the posture is revisited.

---

## 6. DoD 9 — unobserved, not failing

The accessibility and responsive gates over the desk page were not run.
Playwright's pinned Chromium cannot be downloaded on this machine — the same
blocker Phase 1 recorded, and the same one that has now prevented the gate for
six phases running.

The page is written to the design system's breakpoints and tokens and renders the
shared section component, so the **expectation** is that it passes; but the report
claims nothing more than that, and the gate is marked **unobserved**. Phase 11 is
where all the pages are verified together.

---

## 7. What was deferred

- **The «پیامها» settings tab** — the template editor and the channel
  configuration the roadmap names for this phase. The reads, the validation, the
  defaults and the seeding all exist and are exercised by the dispatch; the tab
  that edits them is a Phase 10 surface, and a settings form now would be a form
  for the settings module Phase 10 builds.
- **The e2e permission matrix over the desk page** — the section gating is one
  `can()` per section, and the instruction was that no test be written for them.
  Unobserved rather than verified, as in Phase 5 §7.
- **The provider adapter** — the interface and the console adapter are in place;
  a real SMS or WhatsApp adapter is a deployment choice, installed before the
  worker starts.

---

## 8. Verification summary

| Gate | Result |
|---|---|
| `npm run build` | ✅ green, 24 routes |
| `npm run typecheck` | ✅ green |
| `npm run lint` | ✅ green |
| `check:files` | ✅ none over 1000 |
| `check:i18n` | ✅ clean |
| `check:overrides` | ✅ clean |
| `check:schema` | ✅ valid for sqlite and postgresql |
| `check:rls` | ✅ 24 tenant-scoped tables isolated |
| `npm run test` | ✅ **1129 tests, 56 files, all passing** |
| DoD 9 (axe + responsive) | ⚠️ unobserved — Playwright Chromium unavailable |

---

## 9. What is open

Carried from the earlier phases, unchanged:

- **The cross-tenant suite against a live PostgreSQL** — `check:rls` covers the
  policies statically; the behavioural half remains unobserved, as it has since
  Phase 1.
- **The e2e suite** — written, not executed, for the same Chromium reason.
- **The coverage floors** — red, documented in §5, to be revisited in Phase 11.
- **OQ-2's second half** — the four tables the open question asked to be
  re-checked. Two of them are now settled by this phase in code: the automatic
  message kinds and their triggers, and the send rules and their order, both in
  `src/core/constants`. The other two — campaign types and audience groups — are
  Phase 7's, and remain open against the demo.

---

*Phase 6 is closed. Phase 7 (campaigns, audiences, assistant) is next.*
