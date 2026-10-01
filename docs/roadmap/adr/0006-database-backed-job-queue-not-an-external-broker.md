# ADR-0006 — Database-backed job queue, not an external broker

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0

**Context.** The worker (ADR-0002) needs a way to know what to run. The options
are an external broker (Redis, RabbitMQ, SQS), a scheduler library, or a table in
the existing database.

**Decision.** **A `Job` table in PostgreSQL with claim semantics** — a job is
claimed by updating it with a conditional `where` on its status and owner, and a
claim expires so a killed worker's jobs are recovered.

**Why not a broker.**

- **On-premise.** A clinic's server must install with nothing beyond PostgreSQL.
  Requiring Redis is an additional service to install, secure, back up and
  monitor, on a machine the vendor does not control. This alone decides it.
- **The database is already the consistency boundary.** Enqueuing a job inside
  the same transaction as the change that caused it means the job cannot be lost
  by a crash between "the cycle became due" and "the reminder was queued". With
  an external broker that gap exists and needs an outbox pattern to close.
- **Operational surface.** One fewer thing to monitor, and the job queue is
  inspectable with SQL — which matters when diagnosing a clinic's problem at
  distance.
- **Volume.** The product's job volume is in the tens of thousands per day at
  full scale, far below where PostgreSQL's `SKIP LOCKED` claim pattern is a
  bottleneck.

**Consequences accepted.**

- Claiming must be correct under concurrency. `SELECT ... FOR UPDATE SKIP
  LOCKED` plus a conditional update; the double-run and mid-job-kill tests in the
  Phase 11 DoD verify it.
- A long-running job holds a row lock for its duration. Mitigated by claiming in
  one short transaction and running the work outside it, with the job's
  ownership recorded.
- No built-in fan-out or dead-letter semantics. A failed job increments an
  attempt count and returns to the queue with backoff; after a threshold it is
  marked failed and surfaced in worker health.

**Documented in.** `02-architecture.md` §12, `setup/deployment.md`.
