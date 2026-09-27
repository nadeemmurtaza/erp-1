# 176 — Platform resilience: a resilience platform that breaks when a connector breaks isn't one

> **Status: proposed (2026-09-27), not yet built — and its foundation, doc 38,
> is specified but unbuilt too.** Doc 38 (`38-resilience-engineering.md`)
> specifies a degradation matrix, a `CircuitBreaker` generalised from the
> outbox's backoff, SLOs with error budgets, measured DR numbers and contract
> tests. Checked against the code: **no `CircuitBreaker` class exists** (the
> only occurrence is a comment in `core/versioning/api-version-policy.service.ts:35`);
> no SLO is instrumented; **RPO and RTO were never measured** (WO-38.4 is open;
> doc 90 says so). This document reuses doc 38's formats and mechanisms directly
> and, because this program is their first real consumer, its work orders
> **build** doc 38's `CircuitBreaker` and the measurement this program's SLOs
> need. Every SLO below is a number over rows this platform already writes or
> that docs 172–175 add — because `DECISIONS.md` ADR-017 (an observability
> backend) is still **Open**, and `CLAUDE.md` forbids claiming monitoring exists
> where only logging does.

## 1. The honest starting point

| What the resilience story leans on | State today | Source |
|---|---|---|
| Transactional outbox with retry | **Built.** Poll every 2 s, batches of 25, up to 8 attempts, backoff `min(2^n s, 300 s)` — a failing event is abandoned as `FAILED` after roughly 4¼ minutes of cumulative backoff; `SELECT … FOR UPDATE SKIP LOCKED` | `core/events/outbox.dispatcher.ts:6–8`, `:61`, `:92–95` |
| A screen for `FAILED` outbox rows | **None** — the lens index: "No admin screen for `OutboxEvent`" | `docs/erp-lenses/_meta/_index.md` |
| Circuit breakers | **Specified, not built** | doc 38 §2 |
| SLO instrumentation | **Not built**; no APM, no metrics backend | doc 38 §3, ADR-017 (Open) |
| Backups | **Built for one stack**: `deploy/backup.sh` dumps, gzip-checks, restore-tests into a throwaway database, ships off-site only when `S3_TARGET` is set, keeps `RETAIN_DAYS=14` locally; `deploy/systemd/yaseen-backup.timer` fires `*-*-* 03:00:00`, `RandomizedDelaySec=300`, `Persistent=true` | `deploy/` |
| RPO / RTO | **RPO implied ≈ 24 h** for that one stack (a nightly dump); **RTO unmeasured** | doc 38 §4, WO-38.4 |
| Per-tenant backups in the doc 39 fleet | **None scheduled.** `TenantExportService` produces on-demand and deprovisioning `pg_dump` exports; nothing backs up 50,000 tenant databases on a schedule | doc 39 WO-39.7 |
| Scheduled jobs | 33 `@Cron`/`@Interval` jobs in `apps/api/src`, all assuming one runner per node | ADR-018 (Open) |

## 2. The degradation matrix, extended

Doc 38 §1's format and its rule — "a dependency being down removes *one
capability*, never *the record of what already happened*" — applied to every
dependency this program adds. Doc 38's own rows stand unchanged.

| Dependency down | What still works | What degrades | Source |
|---|---|---|---|
| **An accounting-system API** (the SME's `PollConnector`) | The SME's own accounting (it is the system of record); every promoted fact; simulations on the last promoted data | New AR/AP/items stop arriving; `STALE` scores rise; the control center shows "accounting data as of <time>"; the circuit opens after 5 failures | doc 172 §10 |
| **A POS export / SFTP host** (`FileConnector`) | Same as above | Sales and stock snapshots stop arriving; freshness banner | doc 172 §10 |
| **An OAuth token revoked or expired** | Everything already promoted | Connector `REAUTH_REQUIRED`; `ConnectorNeedsReauth`; action-hub item | doc 172 §10 |
| **A pushing POS's webhook path** (our endpoint unreachable) | The POS keeps selling; its own retries | Deliveries arrive late; applied idempotently; a vendor that stops retrying leaves a gap that the next full export (or a reconciliation pull) closes | doc 132, doc 172 |
| **`AiProvider`** (or absent by residency policy) | Every engine figure; deterministic mapping suggestions | No narration (`narrate()` returns `null`); no AI mapping suggestion | doc 09, doc 144 R23, doc 172 §4 |
| **The du payment rail** | Cash, bank transfer; every recorded payment | The rail's option hides at checkout (circuit open); `PENDING` payments resolved by the status poll when it returns | doc 175 §3, WO-175.4 |
| **The rail's payout report** | Payments and their posting | Batches stay `EXPECTED`; the forecast shows them as cash in transit, not cash | doc 175 §5 |
| **The e-invoicing ASP** | Sales; invoices issued as documents | Submission queues in `FiscalSubmission` with retry/backoff (doc 15's own design) — a sale is never blocked by a tax authority | doc 15, doc 181 |
| **UAE PASS** | Password sign-in; every other IdP | UAE-PASS-only users cannot sign in; the sign-in screen says so | doc 170 §3.2 |
| **The control plane** (`apps/platform`) | Every tenant already routed and running (each is its own deployment) | No new tenant, no hostname resolution for a tenant whose route is not already cached, no release moves, no new support tokens (live ones lapse ≤ 15 min) | doc 39 "four hours down", doc 171, doc 170 §4 |
| **A tenant's own database** | Nothing in that tenant — the one total outage a modular monolith accepts | Total for that tenant; **no other tenant is affected** (no shared database) | doc 38 row 1, doc 39 |
| **The outbox dispatcher** (stalled) | Every write (events are rows, committed with their facts) | Subscribers lag: postings, notifications, metering; nothing is lost — rows wait as `PENDING` | `outbox.dispatcher.ts` |
| **A scaled-to-zero tenant instance** | Nothing is lost | **No `@Cron` fires**: connector polls, promotion resumes, outcome measurement all stop until the instance wakes — silently, unless §3.7's rule holds | §3.7 |
| **`StorageService`** | Promoted data | New files cannot be received (a `FileConnectorRun` needs its `storageKey`); an SFTP poll retries next tick; an upload fails visibly | doc 162 §3 |

## 3. The failure modes, one by one

Each: the trigger, how it is detected, what contains it, what the SME sees, how
it recovers, and the test that proves it. Mechanisms are specified in doc 172
§10 and doc 175; this is the operator's view.

### 3.1 Connector outage
- **Trigger:** the source returns 5xx, times out, or its host is unreachable.
- **Detected by:** `PollConnectorRun`/`FileConnectorRun` status `FAILED` with
  the error class (vendor vs ours — §5.1 needs the distinction).
- **Contained by:** backoff on the outbox's curve; the connector's circuit
  (`connector.<connectorId>`) opens after 5 consecutive failures, and polls stop
  for the cooldown instead of piling up.
- **The SME sees:** "Accounting data as of 09:12 — the connection has been
  failing since 10:40", on the control center and on Connections.
- **Recovers by:** the half-open trial succeeding; the cursor resumes; overlap
  deduplicated at the record level.
- **Proved by:** a fault-injection test that makes the source return 503 for an
  hour of simulated time and asserts: no duplicate records afterwards, the
  circuit opened, the banner states the right time.

### 3.2 Duplicate ingestion
- **Trigger:** the same file re-uploaded, a poll window overlapping the last, a
  webhook redelivered, a promotion job re-run.
- **Detected by / contained by:** the four keys — file checksum, batch
  `idempotencyKey`, record `(connectorId, recordKind, sourceRecordKey,
  sourceVersionHash)`, and each canonical write's own unique key
  (`ObservedSale.ingestionRecordId`, `ExternalRecordLink`'s pair, sink
  upserts).
- **The SME sees:** a batch reading "0 new, 412 already imported".
- **Proved by:** the doc 172 acceptance tests, plus a property test that replays
  a random interleaving of the same inputs and asserts identical canonical rows.

### 3.3 Partial import
- **Trigger:** the process dies mid-promotion; a deploy restarts it; a database
  failover.
- **Contained by:** 200-record chunks, each atomic (canonical row + link +
  record flip); `promotedThroughOrdinal`.
- **The SME sees:** "Import in progress — 600 of 2,000 applied"; any simulation
  run meanwhile says the same in its header.
- **Recovers by:** resume from the cursor (default) or "reject remainder" (a
  person); never a delete.
- **Proved by:** killing the promotion worker at a random chunk in a test and
  asserting the resumed result equals an uninterrupted run.

### 3.4 API timeout
- **Trigger:** the source is slow.
- **Contained by:** a 30 s per-request timeout; pages staged one at a time; the
  cursor advances per staged page; timeouts count toward the circuit.
- **The SME sees:** nothing unless timeouts persist, then the outage banner.
- **Proved by:** a source stub that sleeps past the timeout on page 4 of 6.

### 3.5 Schema drift
- **Trigger:** the source changes its export — a renamed column, a new date
  format, a decimal comma.
- **Detected by:** `schemaFingerprint` mismatch against the confirmed mapping;
  a per-column parse-failure spike for format changes the fingerprint cannot see.
- **Contained by:** additive drift proceeds; breaking drift holds the batch
  (`HELD_SCHEMA_DRIFT`), invalidates the mapping, publishes `IngestionHeld`.
- **The SME sees:** "Your POS export changed on 14 Oct: column 'Qty' is missing.
  Review the mapping" — and the last confirmed data, ageing, still in use.
- **Proved by:** a test that renames a mapped column and one that switches
  `12/10/2026` to `2026-10-12`.

### 3.6 Tenant isolation under the doc 39 shared-hosting model
Every tenant is its own database behind its own credential; isolation holds by
construction, and the failure modes are the ways construction could be
undermined:

| Way it could fail | Why it does not, today or after this program |
|---|---|
| A request routed to the wrong tenant | `HostnameResolverService` resolves hostname → `PlatformTenant` → `deploymentRef`; its cache is invalidated on every status/domain change (WO-39.3); an unverified custom domain is never routed (`customDomainVerifiedAt`) |
| A control-plane job reading two tenants at once | `SeatCounterService`/`UsageMeteringService` open **one connection per tenant per call**, read-only, and close it; doc 180's milestone poller and §5's SLI sampler reuse that exact mechanism, never a pooled cross-tenant connection |
| A connector writing into the wrong tenant | Connectors run inside the tenant's own deployment against its own database; their credentials are encrypted with that deployment's key — there is no path to another database |
| A support engineer reaching a tenant without a live grant | Doc 170 §4.1: signed, ≤ 15-minute support tokens verified inside the tenant; unset key = no door |
| A noisy neighbour on shared compute | `ResourceTierQuota`/`ResourceQuotaAlert` alert before a hard cap (doc 39 WO-39.6); **enforcement is the orchestrator's** (doc 39 out of scope), so the protection is alerting plus the operator's own limits — stated, not claimed |
| One tenant's backlog starving others | Per-tenant crons run in per-tenant processes; the control plane's pollers cap work per tenant per run (`MAX_BATCHES_PER_TENANT_PER_RUN = 20` in `usage-metering.service.ts` is the precedent reused) |
| A shared AI key leaking one tenant's data to another | AI calls carry only the calling tenant's data, and each tenant's `AiUsageLog` and monthly budget are in its own database; for du tenants AI is off by default (doc 181) |

**Proved by:** doc 39's own acceptance test (two tenants, a forced
misconfiguration, a request that can only reach its own database), extended to
the connectors: a connector configured in tenant A with tenant B's source
credentials still writes only into A.

### 3.7 A scaled-to-zero tenant runs no scheduled work

At 50,000 tenants an operator will want idle instances to sleep. A sleeping
NestJS process runs no `@Cron` — connector polls, promotion resumes, the
settlement expectation cron and the outcome cron all stop, and nothing says so.
This program's rule, pending the compute-density decision (WO-168.3):
**a tenant with at least one `ACTIVE` connector, an `EXPECTED` settlement batch,
or a `PENDING` decision outcome is never scaled to zero**, and its manifest
(doc 171) carries that fact as a derived flag the orchestrator reads. The
alternative — the always-on control plane waking tenants on their schedules —
is the density ADR's to choose. Detection meanwhile: §5.1's on-schedule SLI
measures exactly this failure.

## 4. Circuit breakers — doc 38 §2, built

Doc 38 §2's interface, unchanged:

```ts
export interface CircuitBreaker {
  /** Throws immediately without calling fn() if the circuit is OPEN. */
  execute<T>(key: string, fn: () => Promise<T>): Promise<T>;
}
```

Implemented as `core/resilience/circuit-breaker.service.ts` (a new core
service; doc 38 names no location), wrapping every call site this program adds:

| Key | Wraps |
|---|---|
| `connector.<connectorId>` | every `PollConnector` fetch and SFTP session (doc 172) |
| `payment.<providerKey>` | `initiate()` and the status poll (doc 175) |
| `settlement.<institution>` | `reconcileBatch()` (doc 175) |
| `fiscal.<authority>` | `FiscalComplianceProvider.submit()` (doc 181) |
| `ai.<providerKey>` | `AiService` calls (doc 09's own timeout stays the inner guard) |

Parameters (stored as settings, tuned under doc 38's reserved
`platform.resilience.tune`): **open** after 5 consecutive failures, or ≥ 50%
failures over the last 20 calls within 60 s; **cooldown** 60 s, doubling per
consecutive re-open up to 900 s (the outbox's own doubling, with a longer cap
because a third-party outage is longer than a transient DB error);
**half-open** admits one trial call. State is in memory per process — doc 38's
own "never a database table that could grow" — so a restart closes every
circuit, stated as the known cost. **Dry run** (doc 38's own lens): the
thresholds replay over the last 30 days of `PollConnectorRun` history and report
when the circuit would have opened, before a change is applied.

## 5. SLOs and error budgets — numbers, computed from rows

No APM exists, and ADR-017 must not be decided inside this program. So every
SLI below is a query over rows the platform writes, sampled per tenant by the
control plane through the connection-per-call mechanism of §3.6 and stored in
one new control-plane table:

```prisma
// apps/platform/prisma/schema/platform.prisma — additive
/// One SLI sample per tenant per window — good/total counts, never a
/// percentage (so fleet aggregation sums, never averages averages). Written
/// only by TenantSliSampler; PlatformUsageRecord is NOT reused, because its
/// own comment scopes it to "what feeds an invoice line".
model TenantSliSample {
  id          String   @id @default(cuid())
  tenantId    String
  sli         String   // "connector_on_schedule" | "promotion_latency_10m" | …
  windowStart DateTime
  good        Int
  total       Int
  createdAt   DateTime @default(now())

  @@unique([tenantId, sli, windowStart])
  @@index([sli, windowStart])
}
```

| # | Path | SLI (good / total) — computed from | SLO | 30-day budget |
|---|---|---|---|---|
| 1 | **Connector runs on schedule** | runs that *started* within 2× the connector's `intervalMinutes` of the previous one ÷ expected runs; from `PollConnectorRun`/`FileConnectorRun` start times. Vendor-caused failures (5xx, timeout) still count as "started" — this measures *our* scheduling; §3.7 is what it catches | **99.5%** | 3.6 h of missed schedule per connector |
| 2 | **Connector success, vendor-attributed** | runs not failed by vendor error ÷ runs; same tables, error class | **reported, no target** — a vendor's availability is du's vendor-management fact, not this platform's promise | — |
| 3 | **Promotion latency** | batches under a confirmed mapping, not held, reaching `PROMOTED` within 10 min of their run's completion ÷ such batches; `IngestionBatch.completedAt` vs the run's finish time | **p95 ≤ 10 min** (≥ 95% good at the 10-min threshold), and **99% within 30 min** | 5% / 1% of batches |
| 4 | **Simulation latency** | runs with `durationMs ≤ 5,000` ÷ runs, for `edgeCount ≤ 50,000`; from `ResilienceSimulation` (doc 174) | **95% ≤ 5 s**, **99% ≤ 15 s** | 5% / 1% |
| 5 | **Callback applied** | verified callbacks whose `Payment` status changed within 60 s of receipt ÷ verified callbacks | **99.9%** | 43 min of slow application per 30 days |
| 6 | **Settlement reconciled on time** | batches reaching `CONFIRMED`/`SHORT` by expected payout date + 1 day ÷ batches due; `SettlementBatch` | **99%** | ~7 h-equivalent (≈ 3 late batches of 365) |
| 7 | **Routing** | `GET /routing/resolve` answered from cache or database within 50 ms ÷ requests | **99.95%** | 22 min |
| 8 | **Checkout / POS / till sync** | doc 38 §3's three, unchanged | 99.9% · 99.95% · 4 h | doc 38 |

**Two are not measurable yet, and say so.** SLI 5 needs the time a callback was
*received*; nothing records it today (`Payment.updatedAt` is the write time).
WO-176.5 records `callbackReceivedAt` in `Payment.meta` at the controller before
verification; until then SLI 5 is **NOT MEASURED**. SLI 7 needs request
timing from `apps/platform`'s routing controller; until WO-176.6 adds a sampled
timing row, SLI 7 is **NOT MEASURED**.

**What burning a budget does** — the error-budget policy doc 38 §3 describes,
wired to doc 171's Update Agent so it is a mechanism, not a meeting: while a
path's 30-day budget is exhausted, `PREFLIGHT` refuses to move any tenant to a
release whose diff touches that path's code beyond the `CANARY` ring
(`connectors/**` for SLIs 1–3, `planning/**` for 4, `payments/**` for 5,
`settlements/**` for 6, `apps/platform/src/modules/routing/**` for 7). Freezing
is unilateral; unfreezing is the budget recovering.

**The time-to-impact budget** (doc 180's primary KPI) is the sum of three of
these: the source's own arrival → the next poll (≤ the connector's interval,
default 15 min) → promotion (SLO 3, ≤ 10 min p95) → a simulation (SLO 4, ≤ 5 s).
So **a disruption visible in the SME's own data can be simulated within 25 min
p95 of that data reaching its source system** — for a person who runs the
simulation. Automatic detection of a disruption *signal* without a person is
not built (doc 180 names it NOT MEASURED).

## 6. Disaster recovery — what is measured, what is a target

| Figure | Status | Value |
|---|---|---|
| RPO, the single-stack deployment `backup.sh` serves | **Implied by config, not measured as a promise** | ≈ 24 h (nightly 03:00, ±5 min) |
| RTO, same | **Unmeasured** | WO-38.4 |
| RPO, the doc 39 tenant fleet | **No mechanism** | — |
| **Target** RPO for du tenants | a target the operator must meet and this program measures | **≤ 15 min** — continuous WAL archiving / point-in-time recovery on the cluster (the operator's choice of tool), because a nightly dump loses a trading day |
| **Target** RTO for one du tenant | measured at the quarterly game-day doc 38 §4 already requires | **≤ 4 h** to a restored, routed tenant |
| Restore test per backup | **Built** for the single stack (`backup.sh` restores every dump into a throwaway database) | carried to the fleet as a sampled nightly restore of N tenants (WO-176.8) |

The targets are labelled targets. They become figures only when WO-176.8's
game-day records a measured value in `DEPLOYMENT.md`, the file doc 38 §4 names.

## 7. Contract tests for the new events

Doc 38 §5's contract-test suite (one test per domain event, asserting the payload
shape every current subscriber depends on) gains the ten events this program
adds — doc 172 §9's `connectors.ingestion_batch_promoted`,
`connectors.ingestion_held` and `connectors.needs_reauth`; doc 180 §0's
`connectors.connector_created` and `connectors.mapping_confirmed`; doc 174's
`planning.simulation_recorded` and `planning.recommendation_decided`; doc 177's
`planning.derivability_assessed`; doc 179's `connectors.cutover_effective` —
each also asserting that no amount and no user id is in the payload (only
`ingestion_held` and `needs_reauth` have a tenant-side consumer, the connectors
module's own notification listener; the other eight exist for the control
plane's milestone poller). Because the control plane reads them out of the tenant's outbox by name
(the `UsageMeteringService` string contract), a cross-app test proves that the
control plane's parser accepts exactly the payloads `apps/api` publishes. A breaking change publishes under a new name
(`domain-events.ts`'s own versioning rule), never mutates these.

## Scope lenses

Ingestion and settlement lenses are answered in full in docs 172 and 175. These
lines answer this document's own artifacts: the `CircuitBreaker`, the SLI
sampler and `TenantSliSample`, the release freeze, the keep-warm rule, the DR
targets.

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — the sampler runs as the control plane, reading
tenants read-only per call; no new actor.
**Whose rows, and which columns** — SLI samples are visible to
`platform.resilience.view` (doc 38's reserved key, added to
`PLATFORM_PERMISSIONS` by WO-176.7); a tenant never sees another tenant's
samples.
**The threshold nobody approves alone** — freezing is automatic, unfreezing is
the budget; overriding a freeze to ship a fix is a `platform.releases.approve`
maker-checker act (doc 171), with the override recorded.
**The toxic pair, caught at grant or at act** — n/a: no new pair.
**Authority and blast radius** — `platform.resilience.tune` changes breaker
thresholds; the worst value (a hair trigger) is caught by the dry-run replay
before it applies; the audit row holds old and new thresholds.
**Audience is a capability, not an address** — an open circuit or a burning
budget pages `platform.resilience.oncall` holders (doc 38's reserved key); the
paging tool is the operator's (doc 38's out-of-scope).
**Request or record** — a sample is a RECORD; a freeze is a RECORD of a
computed state.
**The movement with no address** — n/a: a sample, a breaker state and a freeze
move no stock or cash.
**Four hours down, the counter stays open** — this document is that lens, at
system level, for every dependency the program adds (§2).
**The unwritten posting rule / Every column or none / The period that already
moved / The second legal entity** — n/a: no journal line, no tax document and no
numbered series is written; samples are counts.
**Dry run before live** — breaker thresholds replay over history (§4); a freeze
rule can be evaluated against last month's samples before enforcement.
**Click the number** — a fleet SLI links to per-tenant samples, and each sample
to the rows it counted.
**Three silhouettes, and the day the tier above appears** — SLIs are
per-tenant, edition-independent.
**The absent collaborator** — `settlements` off: SLI 6 has no denominator and is
reported "not applicable", never 100%.
**The second copy of the write** — `@@unique([tenantId, sli, windowStart])`.
**The hundred-thousandth row** — 50,000 tenants × 7 SLIs × 96 fifteen-minute
windows ≈ 33.6 M samples/day at full granularity — too many; samples are hourly
(≈ 8.4 M/day) and rolled up to daily after 7 days, stated in WO-176.4. Doc 180's
two coarser keys (`connect_success_14d` weekly, `revenue_coverage_bps` daily)
add ≈ 57,000 rows/day.
**The adoption test** — n/a: nothing human-readable is generated; samples are
keyed `(tenantId, sli, windowStart)` and a breaker's name (`connector.<id>`,
`fiscal.<authority>`) derives from an id that is already unique.
**The reversal document / The undo fan-out** — n/a: no business write.
**The version stamp** — each sample names its SLI definition by key; a changed
definition is a new key.
**The erasure the ledger cannot obey** — no personal data.
**The failure path, and who is allowed to walk it** — a sampler that cannot
reach a tenant records nothing for that window and logs it; a missing window is
shown as a gap, never as good.

## Work orders

**WO-176.1 — Degradation matrix rows** (§2) added to doc 38 §1's living table by
the PR that ships each dependency — a checklist item on each work order's
definition of done, doc 38 WO-38.1's own rule.
**WO-176.2 — `CircuitBreaker`** (doc 38 WO-38.2): `core/resilience/`, the five
key families, settings, the dry-run replay.
**WO-176.3 — Fault-injection suite** for §3.1–§3.6, run in CI against a real
Postgres.
**WO-176.4 — `TenantSliSample` + `TenantSliSampler`** (hourly, connection-per-call,
per-tenant work cap) and the daily roll-up.
**WO-176.5 — `callbackReceivedAt`** recorded before verification (SLI 5).
**WO-176.6 — Routing timing sample** in `apps/platform` (SLI 7).
**WO-176.7 — `platform.resilience.view/.oncall/.tune`** into
`PLATFORM_PERMISSIONS` (doc 38 WO-38.6's reserved names); an SLO screen.
**WO-176.8 — Fleet DR**: continuous archiving on the tenant cluster (operator
tooling), a sampled nightly restore test, and the first quarterly game-day
recording measured RPO/RTO in `DEPLOYMENT.md`.
**WO-176.9 — Keep-warm derivation** on the manifest (§3.7).
**WO-176.10 — Event contract tests** (§7).

## Acceptance

- Every row of §2 has a passing test that makes the dependency fail and asserts
  the stated degraded behaviour (doc 38's own acceptance, extended).
- A circuit opens after the configured threshold and admits exactly one trial
  after cooldown, proven under forced failure; the dry run reports the same
  opening times over recorded history.
- SLIs 1, 3, 4 and 6 are computed from rows for every tenant hourly; SLIs 5 and
  7 read **NOT MEASURED** until WO-176.5/176.6 land, and no dashboard shows a
  figure for them before.
- With SLI 3's budget exhausted, a release touching `connectors/**` is refused
  beyond `CANARY` at `PREFLIGHT`.
- A tenant with an `ACTIVE` connector is marked keep-warm on its manifest.
- `DEPLOYMENT.md` records a measured RTO from a real restore before the first
  pilot wave goes live (doc 179's gate).

## Out of scope

Choosing an APM or metrics backend (ADR-017, Open — this program measures from
rows instead). Horizontal replicas and leader election for crons (ADR-018,
Open). The orchestrator and its enforcement of quotas (doc 39). Multi-region
active-active (doc 38's own out-of-scope). A paging product.
