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

> **Status (2026-09-27): built, WO-38.1–38.6, with the gaps named below
> rather than papered over.** WO-38.1's §1 table is now a tested claim: a
> row-by-row degradation test exists for every dependency this environment
> can simulate — `HealthController.ready()`'s Postgres-down path
> (`health.controller.spec.ts`, new), `AiService`'s circuit tripping and
> falling back to `null` (`ai.service.spec.ts`, new), `RagRetrievalService`'s
> `VectorStore` circuit doing the same (`rag-retrieval.service.spec.ts`,
> new), `PaymentsService`'s per-provider circuit independence — Easypaisa
> down never touches COD's own circuit (`payments.service.spec.ts`, new
> file), and `NotificationsService`'s existing `Promise.all`-per-channel
> fan-out, now proven with two channels where one throws
> (`notifications.service.spec.ts`, new case). Two rows were **already
> covered** and are cited, not duplicated: the replication-parent-down row
> by `replication-sync.agent.spec.ts`'s existing "never throws when the
> parent is unreachable" cases, and "the branch itself, offline" by
> `packages/pos-core/src/outbox.spec.ts`'s existing state-machine tests. One
> row is a **found gap in the matrix's own claim**, named honestly rather
> than faked: `StorageDriver (S3/R2)`'s "new uploads queue for retry" text
> has no queue behind it anywhere in `storage.service.ts` — `put()`
> propagates a driver failure straight to its caller
> (`storage.service.spec.ts`'s new test proves the real, current behavior).
> Building that queue is a separate, larger work order, not a side effect
> of WO-38.1's job (proving existing behavior). `OutboundConnector` (doc 36)
> has no live subject to test at all — it does not exist in this codebase
> (`grep -rln "OutboundConnector" apps/api/src` returns nothing) — the same
> honest "nothing to wrap" this status gives `CircuitBreakerService` below.
>
> **WO-38.2 — `CircuitBreakerService`** (`core/resilience/`) implements the
> exact three-state interface this document's §2 specifies — CLOSED/OPEN/
> HALF_OPEN, a per-key configurable failure threshold (default 5) and
> cooldown (default 30s) — proven under a forced-failure test including the
> HALF_OPEN trial call and re-open-on-trial-failure paths
> (`circuit-breaker.service.spec.ts`). It wraps exactly the three extension
> points with a live implementation to wrap: `AiService`'s one funnel
> (`complete`/`embed`/`describeImage`, keyed `ai.<provider>`),
> `PaymentsService.createForOrder()`'s `provider.initiate()` call (keyed
> `payment.<provider>`), and `VectorStore`'s two call sites in
> `RagRetrievalService`/`RagIngestionService` (one shared `vector.store`
> key, exported from `vector-store.ts` so both stay in step). It is written
> generically enough to wrap `OutboundConnector` the day doc 36 ships — a
> new key, no change to `execute()` — but doc 36 does not exist yet, so
> nothing was wrapped for it; building `OutboundConnector` itself is out of
> this document's own scope and was not done here. `StorageDriver`/
> `SmsProvider`/`WhatsAppProvider` were **not** wrapped: this document's own
> §2 names `AiProvider`/`PaymentProvider`/`OutboundConnector`/`VectorStore`
> specifically, and `NotificationsService`'s existing per-channel
> `Promise.all` fan-out already gives every channel call its own isolated
> failure path with no shared state to trip — a circuit breaker would add
> nothing there today; `StorageDriver` has no retry path to protect (the
> gap named above), so wrapping it would only make an already-thrown error
> fail faster, not differently. `simulate()` (the "dry run before live"
> lens) is real and unit-tested as a pure replay function, but has no live
> data to run: no call-outcome log exists for `AiProvider`/`PaymentProvider`/
> `VectorStore` calls specifically (WO-38.3's own `RequestOutcome` table
> instruments three different, named business paths — checkout, POS sale,
> replication sync — never these four extension points), so "would this
> threshold have tripped last month" is honestly unanswerable today rather
> than faked against data that does not exist — named in the admin
> screen itself, not hidden.
>
> **WO-38.3 — SLO instrumentation.** `core/metrics/metric-provider.ts`
> (built earlier for permission-gated, previous-period-compared *business*
> dashboard numbers) is the wrong shape for a raw per-request success/
> latency stream, exactly as this work order's own brief predicted — a new,
> minimal `RequestOutcome` table (`resilience.prisma`, migration
> `20260927100000_wo38_request_outcomes`, indexed on `(path, occurredAt)`)
> and `SloRecorderService` (`core/slo/`) were built instead, with
> `RequestOutcomePruneCron` (nightly, `@Cron('30 3 * * *')`, 35-day
> retention) keeping this operational log bounded rather than growing
> forever like a business record. `OrdersController.place()` and
> `PosSalesController.sell()` wrap their own call through
> `SloRecorderService.time()`, which never awaits its own recording write —
> a failed or slow outcome-log write cannot slow or fail a real checkout or
> sale (proven: `slo-recorder.service.spec.ts`'s own "never throws or slows
> the caller when the recording write itself fails" case).
> `ReplicationSyncAgent.pushFacts()` records the oldest still-unsynced
> fact's own age every tick, regardless of whether that tick's push
> succeeds — the actual number doc 38 §3's "facts land within 4 hours"
> bound is measured against, not a proxy. `replication.sync` carries no
> percentage error-budget figure, on purpose: this document's own §3 states
> an error budget only against the two paths with a stated percentage SLO
> (checkout 99.9%, POS 99.95%); replication's own stated bound is a hard
> latency bound, and inventing a percentage target the document never
> wrote would be exactly the kind of speculative number `CLAUDE.md` warns
> against. `GET /admin/resilience/slo` computes the trailing-30-day success
> rate, p95 latency (Postgres `percentile_cont`, one indexed query rather
> than pulling every row into Node — the "hundred-thousandth row" lens)
> and remaining error-budget minutes per path, each carrying its own
> `overBudget` boolean. **The honest scope of "freezes non-essential
> deploys":** this repository has no CI/CD gate to hook a real freeze into,
> so this ships as a real, computed boolean any future CI job could read
> from that same endpoint, plus an unmissable banner on the admin screen
> when any path is over budget — never a claim that a pipeline actually
> enforces it today, because none does.
>
> **WO-38.4 — DR numbers**, in `DEPLOYMENT.md` §9. RPO is real and stated:
> 24 hours, from `yaseen-backup.timer`'s own nightly 03:00 UTC schedule.
> RTO is **honestly unmeasured**: `deploy/backup.sh`'s own restore-test path
> needs a live Docker Swarm stack running the production images against
> `.env.production`, which neither this sandbox nor CI provides — no
> plausible-sounding number was written in its place. The quarterly
> game-day is recorded as a scheduled, owned commitment
> (`platform.resilience.oncall` holder) whose first real run also produces
> the first real RTO measurement — a calendar commitment, not code, per
> this document's own "Out of scope."
>
> **WO-38.5 — contract test suite.** One table-driven Jest suite
> (`core/events/event-contracts.spec.ts` + `contract-analyzer.ts`) over
> every `@OnDomainEvent` handler in the real source tree (71 handlers
> across 36 files today) beats 69 hand-written files, per this document's
> own "use your judgment" — the assertion is identical for every handler
> (its declared/accessed payload fields must be a subset of the real
> event's canonical shape), checked once against the whole tree on every
> `pnpm test`. Character-level masking (comments and plain strings blanked,
> a template literal's own `${...}` code kept live) avoids the false
> positives a naive line scan would hit — proven directly:
> `posting-rules.subscriber.ts`'s own `` `${payload.billId}:${payload
> .paidAt}` `` sourceRef is checked, not skipped. **Proven live, not just
> asserted:** `PasswordChangedPayload.userId` was temporarily renamed,
> `pnpm test` failed with the exact broken subscriber named
> (`security-notification.subscriber.ts :: onPasswordChanged()`), and the
> rename was reverted — the diff this PR ships contains no trace of that
> edit. A permanent synthetic-fixture suite in the same file proves the
> same catch mechanically on every future run, so this is not a one-time
> demonstration.
>
> **WO-38.6 — permissions**: `platform.resilience.view`,
> `platform.resilience.oncall`, `platform.resilience.tune`, added to the
> existing `Platform` category doc 37 created, seeded onto `ADMIN` the same
> way `platform.flags.*` already is. `ResilienceAdminController`
> (`/admin/resilience`, `alwaysOn: true` in `modules.registry.ts`, the same
> shape `feature-flags` already establishes) is the read/tune surface; the
> admin screen (`/admin/platform-resilience` — named to avoid colliding
> with `144-supply-chain-resilience-planning-engine.md`'s own, unrelated
> `/admin/resilience` "Resilience Planning" screen, a genuine naming
> collision this work order found and resolved rather than overwriting)
> renders the degradation matrix (static, already fully-specified text),
> every circuit's live state, the three SLO paths' trailing-30-day figures,
> and the DR numbers above, gated by `platform.resilience.view` and
> reachable from the Settings nav group.

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
