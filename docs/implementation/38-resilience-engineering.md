# 38 — Resilience: absorbing future demand and change without breaking

`CLAUDE.md`'s own "Resilience first" pillar already names the mechanisms:
the transactional outbox, idempotent event handlers, predicate-on-write
guards, and R5's "a sale that already happened is never rejected by sync."
Every document in `docs/implementation/` from 22 onward answers this
pillar's two lenses — "four hours down, the counter stays open" and "the
absent collaborator" — **per module, in isolation.** What does not exist
yet is the document that reads all of those answers **together**, because
resilience at the system level is not "every module handles its own
failure" — it is knowing, in one place, what happens when *any* dependency
fails, so an incident is a lookup, not a page-by-page search through
thirty-five documents at 3am.

## 1. The degradation matrix: what actually happens when each dependency is down

This is a synthesis, not new design — every row cites the document that
already committed to the answer, made queryable in one place:

| Dependency down | What still works | What degrades | Source |
|---|---|---|---|
| Postgres (primary) | Nothing writes; `health.controller.ts`'s `/health/ready` fails, load balancer stops routing | Total — this is the one dependency with no degraded mode, by design (it is the single source of truth) | `core/health` |
| `AiProvider` | Every non-AI feature, unaffected | All AI features (search ranking, RAG — doc 35, WhatsApp assistant) fall back to their stated non-AI path | `09-ai-layer.md` |
| `VectorStore`/`pgvector` index | Keyword search, catalogue browsing | Semantic/RAG retrieval only | doc 35 |
| `PaymentProvider` (Easypaisa/JazzCash) | Cash tender at POS, other configured providers | The specific down provider's checkout option, hidden or shown as unavailable | `payments` module |
| `StorageDriver` (S3/R2) | Everything except upload/view of a specific new/existing file | New uploads queue for retry; existing already-cached URLs may still resolve depending on CDN | `core/storage` |
| `SmsProvider`/`WhatsAppProvider` | Every other channel; `log` channel always available | That channel's sends queue in `OutboundMessageLog`, fall through to the next configured channel | doc 33 |
| A replication parent (chain/org node) | The branch's own local sale, stock, attendance — all still record | Facts queue for sync; policy reads fall back to the last-cached value | `RETAIL-ERP.md` R5/R9 |
| `OutboundConnector` target | Everything internal | That connector's deliveries queue at `FAILED_RETRYING` | doc 36 |
| The branch itself, offline | Local sale, attendance punch, asset condition report — everything the "record, not request" lens already covers | Anything needing a live cross-branch read (a transfer availability check) | docs 22, 29, 32 |

**The rule this table encodes, stated once instead of thirty-five times:**
a dependency being down removes *one capability*, never *the record of
what already happened*. Every "total" outage in this table is Postgres
itself, which is the correct, minimal single point of failure a modular
monolith accepts — everything else already degrades by design, and this
table is what makes that a checkable claim instead of an assertion.

## 2. Circuit breakers, generalized from the one pattern the outbox already proves

`outbox.dispatcher.ts`'s exponential backoff already solves *retry*. What
it does not solve — and nothing in this repository does yet — is **stopping
a call attempt entirely once a dependency is clearly down**, rather than
queuing thousands of doomed attempts against it. A circuit breaker sits in
front of every extension-point call (`AiProvider`, `PaymentProvider`,
`OutboundConnector`, `VectorStore`):

```ts
export interface CircuitBreaker {
  /** Throws immediately without calling fn() if the circuit is OPEN. */
  execute<T>(key: string, fn: () => Promise<T>): Promise<T>;
}
```

Three states, the standard shape: **CLOSED** (calls flow normally, failures
counted), **OPEN** (calls fail fast for a cooldown window once a failure
threshold is crossed — no wasted attempts against a dependency already
known to be down), **HALF_OPEN** (one trial call after cooldown; success
closes the circuit, failure reopens it). This is infrastructure *around*
every existing extension point, not a redesign of any of them — a
`PaymentProvider` call wrapped in `circuitBreaker.execute('payment.easypaisa',
() => provider.charge(...))` needs no change to `PaymentProvider` itself.

## 3. SLOs and error budgets for the paths that actually matter

Not every endpoint needs a formal target — most of this repository's
screens are internal admin tools where "it eventually loads" is fine. Three
paths are different, because a failure there is either revenue-blocking or
trust-destroying:

| Path | SLO | Why this one |
|---|---|---|
| Checkout (`orders.service.ts` `place()`) | 99.9% success, p95 < 800ms | Direct revenue; R5's own rule already says the sale must never be lost, this adds "and must not be slow enough that the customer leaves first" |
| POS sale completion | 99.95% success, p95 < 400ms | A queue forms behind a slow till in a way a slow web page does not |
| Till → parent sync (chain/org) | Facts land within 4 hours of connectivity returning | `RETAIL-ERP.md`'s own stated bound, made a measured target instead of an aspiration |

An **error budget** is the operational use of this table: 99.9% success
over 30 days on checkout means roughly 43 minutes of acceptable failure —
spend it on planned migrations and controlled experiments, not silently on
undiagnosed incidents. Crossing the budget freezes non-essential deploys to
that path until the root cause is fixed — the same discipline behind every
SRE error-budget policy, scaled to this platform's actual three critical
paths rather than an SLO defined for its own sake on everything.

## 4. Disaster recovery, naming the numbers `deploy/backup.sh` already earns

`deploy/backup.sh` already restore-tests every dump before calling a backup
good — real, working infrastructure, not a stated intention. What it does
not yet state is the numbers that make it a *plan* rather than a script:

- **RPO (Recovery Point Objective): the backup interval** — whatever
  `deploy/systemd/yaseen-backup.timer` is actually scheduled at is the real
  RPO; this document requires it be stated in `DEPLOYMENT.md` as a number
  ("nightly backup = up to 24h of data at risk"), not left implicit in a
  timer file nobody reads as a promise.
- **RTO (Recovery Time Objective): how long a restore actually takes** —
  measured by running `backup.sh`'s own restore-test path against a
  realistic data volume and recording the wall-clock time, not assumed.
- **A quarterly game-day**: actually failing over to a restored backup in a
  non-production environment, on a schedule, so the first real test of a
  restore is not the day it is needed for real — the same "flexibility,
  resilience and innovation outrank everything else" principle `CLAUDE.md`
  states, made into a calendar entry instead of a value statement.

## 5. Contract tests: the module-boundary guarantee, extended to behavior

`pnpm lint`'s `check-module-boundaries.mjs` already guarantees module A
cannot *import* module B's internals. It does not guarantee module A's
*behavior* stays compatible with what module B's event subscriber expects
when A changes its own domain-event payload shape. A contract test suite —
one test per domain event, asserting the payload shape every current
subscriber depends on — is the missing half: a change to `OrderPlaced`'s
payload that would silently break `finance`'s posting-rules subscriber
fails a contract test before it ever reaches a subscriber's own spec file,
which only proves the subscriber handles the payload *it expects*, not
whether the publisher still sends it.

## Scope lenses

**The actor with three tables** — n/a.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a.
**Whose rows, and which columns** — the degradation matrix and SLO
dashboards are visible to `platform.resilience.view` (engineering-ops),
not a general admin screen — this is operational tooling, not a
customer- or branch-manager-facing report.
**The threshold nobody approves alone** — freezing deploys to a path over
its error budget is a unilateral, automatic gate (not an approval) —
restated because this is deliberately *not* a human threshold: the whole
point of an error budget is that it triggers without waiting for a meeting.
**The toxic pair** — n/a.
**Authority and blast radius** — who may tune a circuit breaker's failure
threshold or cooldown window (engineering-ops); the worst value is a
threshold set so sensitive it trips on ordinary latency variance, which a
dry-run mode (below) catches before it ships.
**Audience is a capability, not an address** — an open circuit or a
breached error budget pages whoever holds `platform.resilience.oncall` for
that path, resolved by role, never a hardcoded phone number.
**Request or record** — n/a: this document is entirely about how existing
requests/records already behave under failure; it introduces no new write
of its own beyond circuit-breaker state (below) and delivery-log rows
already covered by docs 33/36.
**The movement with no address** — n/a.
**Four hours down, the counter stays open** — this document's entire §1 is
the answer to this lens, asked once at the system level instead of once per
module.
**Click the number** — the SLO dashboard's success percentage links to the
underlying request/failure counts it was computed from, never a bare
number with no drill-down.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a.
**The second legal entity** — n/a: resilience infrastructure is
platform-wide, not scoped per legal entity.
**Dry run before live** — a circuit breaker's threshold change can be
simulated against historical request logs ("would this threshold have
tripped last month, and when") before it is applied live — the same
preview-before-live discipline this repository already requires for every
computed rule.
**Three silhouettes** — Solo: circuit breakers rarely trip (low volume,
few dependencies actually stressed); SLOs are aspirational, not enforced.
Chain: replication-parent unavailability is the resilience story that
actually matters day to day. Organization: SLO/error-budget enforcement,
contract tests across many subscriber modules, and DR game-days all become
load-bearing rather than theoretical.
**The absent collaborator** — a circuit breaker wrapping an unused
extension point (no `PaymentProvider` configured, say) never trips, because
it never has a real call to fail — this infrastructure is inert, not
broken, when the thing it protects doesn't exist.
**The second copy of the write** — n/a beyond what docs 33/36 already
cover for their own delivery logs.
**The hundred-thousandth row** — circuit-breaker state is in-memory per
process (a small, bounded set — one entry per extension-point key), never
a database table that could grow; contract-test count grows with domain-
event count (39 today), bounded and cheap to run on every CI build.
**The reversal document** — n/a.
**The undo fan-out** — n/a: this document does not introduce a business
write with side effects to fan out.
**The version stamp** — a contract test is versioned alongside the event
payload's own shape — when a payload genuinely needs to change, the
contract test changes with it in the same PR, proving every subscriber was
updated together rather than one at a time across separate changes.
**The erasure the ledger cannot obey** — n/a.
**The failure path** — restated as this entire document's subject: this is
the failure path, made explicit, tested (contract tests, game-days) and
observable (the degradation matrix, SLO dashboards) rather than left to be
discovered live.

## Work orders

**WO-38.1 — degradation matrix** as a living doc (this document's §1),
reviewed and updated every time a new extension point (doc 36, doc 33's
providers) ships — a checklist item on that work order's own definition of
done, not a separate follow-up.
**WO-38.2 — `CircuitBreaker`** implementation wrapping every existing
`AiProvider`/`PaymentProvider`/`OutboundConnector`/`VectorStore` call site,
with the simulate-against-history dry run.
**WO-38.3 — SLO instrumentation**: success/latency measurement on the
three named critical paths, an error-budget dashboard, and the deploy-
freeze automation tied to budget breach.
**WO-38.4 — DR numbers**: measure and document real RPO/RTO from
`backup.sh`'s existing restore-test path; schedule the quarterly game-day.
**WO-38.5 — contract test suite**: one test per domain event in
`core/events`'s catalogue, run in CI, failing on a payload shape change
with no corresponding subscriber update in the same PR.
**WO-38.6 — permissions**: `platform.resilience.view`,
`platform.resilience.oncall`, `platform.resilience.tune` (circuit breaker
thresholds).

## Acceptance

- Every dependency in the degradation matrix has a passing test that
  simulates it failing and asserts the stated degraded behavior actually
  occurs — not just documented, proven.
- A circuit breaker opens after its configured failure threshold and stops
  issuing calls until the cooldown elapses, proven under a forced-failure
  test.
- Checkout's error budget dashboard correctly computes remaining budget
  from real success/failure counts over the trailing 30 days.
- A restored backup's wall-clock time is measured and recorded as the
  documented RTO, not asserted from memory.
- Changing a domain event's payload shape with no corresponding subscriber
  update fails CI via the contract test suite.

## Out of scope

Multi-region active-active failover (this document's DR plan is
restore-from-backup, appropriate for this platform's current single-node-
per-deployment architecture; active-active is a materially larger
infrastructure commitment, named as a future decision if uptime
requirements ever demand it, not assumed here). A dedicated incident-
management tool/on-call rotation product (this document names the
permission and the escalation audience; the paging tool itself is an
operational choice, not a code artifact this repository owns). Automatic
self-healing (auto-restarting a failed dependency, auto-scaling
infrastructure) — this document is about correct behavior under failure,
not infrastructure automation, which belongs to whoever operates the
hosting (doc 39, where it becomes a real platform-operator concern).
