# 180 — Metrics: each one a query over real tables, or labelled NOT MEASURED

> **Status: proposed (2026-09-27), not yet built.** This document defines
> this program's pilot metrics — not the platform's KPIs, which `PRD.md` leaves
> "not yet defined" as the owner's decision, unchanged here. Every metric below
> is given as a query shape over named tables: tenant-side tables (each SME's
> own database) or control-plane tables (`apps/platform`). Where today's schema
> — including the tables docs 169–176 add — cannot measure something, it is
> labelled **NOT MEASURED**, with what would make it measurable. One control-plane
> table is added (`TenantMilestone`, with its own read cursor); doc 176's
> `TenantSliSample` is reused for cohort counts.

## 0. How a fleet metric is computed without breaking tenant isolation

A tenant's facts live in its own database; the control plane may not pool
connections across tenants (doc 39). Two mechanisms already exist and are
reused:

- **Events out of the tenant's outbox, read by the control plane** —
  `UsageMeteringService` reads each tenant's `OutboxEvent` rows after a per-tenant
  cursor, "through the identical connection-per-call mechanism
  `SeatCounterService.countBillableSeats()` already established — never a new
  push channel". This document adds `TenantMilestonePoller`, the same shape with
  **its own cursor**, so a defect in KPI code can never stall billing metering
  (resilience first: two consumers, two cursors).
- **Read-only per-tenant queries, sampled** — doc 176's `TenantSliSampler`,
  writing good/total counts into `TenantSliSample`.

```prisma
// apps/platform/prisma/schema/platform.prisma — additive
enum TenantMilestoneKind {
  SIGNED_UP                  // written by the control plane itself, from SignupVerification / PlatformTenant
  FIRST_CONNECTOR_CREATED
  FIRST_MAPPING_CONFIRMED
  FIRST_BATCH_PROMOTED
  FIRST_OWN_DATA_SIMULATION  // §2's end event
  DERIVABILITY_ASSESSED      // doc 177
  FIRST_DECISION
  CUTOVER_EFFECTIVE          // doc 179
}

/// The FIRST occurrence of each milestone per tenant — never overwritten,
/// so a metric computed today and next year from it agrees.
model TenantMilestone {
  id            String              @id @default(cuid())
  tenantId      String
  milestone     TenantMilestoneKind
  /// The tenant-side time the fact happened, from the event payload —
  /// never the poll time.
  occurredAt    DateTime
  /// The tenant OutboxEvent id it was read from — the idempotency key.
  sourceEventId String?
  detail        Json?
  recordedAt    DateTime            @default(now())

  tenant PlatformTenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, milestone])
  @@index([milestone, occurredAt])
}

/// TenantMilestonePoller's own high-water mark — UsageMeteringCursor's exact
/// shape, deliberately a separate row.
model TenantMilestoneCursor {
  id                 String    @id @default(cuid())
  tenantId           String    @unique
  lastEventId        String?
  lastEventCreatedAt DateTime?
  updatedAt          DateTime  @updatedAt
}
```

Every milestone kind has exactly one source, named here so that none of them
is a column nothing writes. Seven are tenant-side outbox events, each published
in the same transaction as the fact it reports; none carries an amount, an
entity name or a user id:

| Milestone | Source | Published by |
|---|---|---|
| `SIGNED_UP` | the control plane's own `SignupVerification.createdAt` / `PlatformTenant.createdAt` (§2) | WO-180.2 — no event |
| `FIRST_CONNECTOR_CREATED` | `connectors.connector_created` | the connectors module (WO-180.4) |
| `FIRST_MAPPING_CONFIRMED` | `connectors.mapping_confirmed` | the connectors module (WO-180.4) |
| `FIRST_BATCH_PROMOTED` | `connectors.ingestion_batch_promoted` | doc 172 §9 |
| `FIRST_OWN_DATA_SIMULATION` | `planning.simulation_recorded` `{ simulationId, usedIngestedData, anyConfirmedMapping, runBySupportSession, createdAt }`, filtered by §2's four conditions | `PlanningService.runPropagation()`, WO-174.2 |
| `DERIVABILITY_ASSESSED` | `planning.derivability_assessed` `{ outcomeId, outcome, policyVersion, assessedAt, runBySupportSession }` | WO-177.2 |
| `FIRST_DECISION` | `planning.recommendation_decided` `{ decisionId, recommendationKind, decision, lowestTier, decidedAt }` | WO-174.4 |
| `CUTOVER_EFFECTIVE` | `connectors.cutover_effective` `{ cutoverId, factScope, effectiveAt }` | WO-179.3 |

All seven event keys are additive entries in `domain-events.ts`; the keys
`connectors.*` and `planning.*` are unused today (checked: the file has no
entry in either namespace).

**The tenant's current derivability class** is the one fact here that is *not*
a first occurrence: doc 179's gates and §4's target apply to tenants whose
*latest* assessment is `DERIVABLE`, and a milestone is never overwritten. So the
poller also keeps three nullable columns on the control plane's existing tenant
row, written from every `planning.derivability_assessed` it reads:

```prisma
// apps/platform/prisma/schema/platform.prisma — additive to PlatformTenant
  /// The latest assessment's class (doc 177) — null = never assessed, which
  /// every metric reads as "not assessed", never as "not derivable".
  derivabilityClass       String?
  derivabilityPolicy      String?
  derivabilityAssessedAt  DateTime?
```

The write is predicate-guarded — `UPDATE … WHERE "derivabilityAssessedAt" IS
NULL OR "derivabilityAssessedAt" < :assessedAt` — so a redelivered or
out-of-order older event can never replace a newer class. Only the class
crosses the boundary; the measures behind it stay in the tenant's
`DerivabilityOutcome` rows.

## 1. Connect success — target ≥ 85%

**The unit** is a *connection*: one `PollConnector`, `FileConnector` or
`InboundWebhookEndpoint` created in a tenant (doc 172 §3). **A connection
succeeds** when, **within 14 days of its creation**, all five stages hold:

| Stage | Precisely | Query over (tenant DB) |
|---|---|---|
| **S1 — authenticated** | OAuth: an `OAuthConnection` exists for the connector **and** at least one `PollConnectorRun` succeeded. SFTP: at least one `FileConnectorRun` arrived over `SFTP`. Upload: the first `FileConnectorRun` (an upload is made by an authenticated user). Webhook: the first *verified* delivery | `OAuthConnection`, `PollConnectorRun.status`, `FileConnectorRun` |
| **S2 — required fields mapped** | An `IngestionMapping` for the connector with `status = 'CONFIRMED'` and `requiredFieldsSatisfied = true` — every required field of its record kind (doc 172 §4's table) mapped | `IngestionMapping` |
| **S3 — validated** | A batch under that confirmed mapping reached `PROMOTED` with `recordsFailed ≤ 5% of recordsTotal` (i.e. not `HELD_ERROR_RATE`) and not `HELD_SCHEMA_DRIFT` | `IngestionBatch` |
| **S4 — canonical records created** | At least one `IngestionRecord` for the connector is `PROMOTED` with `canonicalEntityId` set | `IngestionRecord` |
| **S5 — no unresolved critical errors** | At the day-14 evaluation: no `IngestionRecord` for the connector with `severity = 'CRITICAL'`, `resolvedAt IS NULL` and created more than 72 h earlier; and no batch of the connector held (`HELD_*`, `AWAITING_CONFIRMATION`) for more than 72 h | `IngestionRecord`, `IngestionBatch` |

```sql
-- tenant DB, per connection created in cohort week W (evaluated at created_at + 14 days)
WITH c AS (
  SELECT id, "createdAt" FROM "PollConnector"      WHERE "createdAt" >= :w AND "createdAt" < :w + interval '7 days'
  UNION ALL SELECT id, "createdAt" FROM "FileConnector"          WHERE …
  UNION ALL SELECT id, "createdAt" FROM "InboundWebhookEndpoint" WHERE …
)
SELECT count(*) AS total,
       count(*) FILTER (WHERE s1 AND s2 AND s3 AND s4 AND s5) AS good
FROM c
CROSS JOIN LATERAL (SELECT
  /* s1 */ EXISTS (…a successful run within 14 days of c."createdAt"…) AS s1,
  /* s2 */ EXISTS (SELECT 1 FROM "IngestionMapping" m WHERE m."connectorId" = c.id AND m.status = 'CONFIRMED'
                   AND m."requiredFieldsSatisfied" AND m."confirmedAt" <= c."createdAt" + interval '14 days') AS s2,
  /* s3 */ EXISTS (SELECT 1 FROM "IngestionBatch" b WHERE b."connectorId" = c.id AND b.status = 'PROMOTED'
                   AND b."recordsFailed" * 20 <= b."recordsTotal" AND b."completedAt" <= c."createdAt" + interval '14 days') AS s3,
  /* s4 */ EXISTS (SELECT 1 FROM "IngestionRecord" r WHERE r."connectorId" = c.id AND r.status = 'PROMOTED'
                   AND r."canonicalEntityId" IS NOT NULL AND r."promotedAt" <= c."createdAt" + interval '14 days') AS s4,
  /* s5 */ NOT EXISTS (SELECT 1 FROM "IngestionRecord" r WHERE r."connectorId" = c.id AND r.severity = 'CRITICAL'
                   AND r."resolvedAt" IS NULL AND r."createdAt"… < c."createdAt" + interval '14 days' - interval '72 hours')
        AND NOT EXISTS (…a batch held more than 72 h at day 14…) AS s5
) AS stages;
```

`TenantSliSampler` runs this per tenant per cohort week and stores `good`/`total`
as `TenantSliSample(sli = 'connect_success_14d', windowStart = W)`. **Fleet
connect success = Σ good ÷ Σ total** across tenants and weeks — a ratio of sums,
never an average of per-tenant percentages. Also reported per stage (the funnel
S1 → S5) and per connector kind, because the target is only actionable if it
says which stage fails.

**Schema this needs beyond doc 172:** `IngestionMapping.requiredFieldsSatisfied
Boolean` (set when a version is saved, from the pure required-fields check), and
`IngestionRecord.createdAt` — both added to doc 172's sketch by WO-180.1.

## 2. Time to first value — target ≤ 5 days (median)

**Start:** the SME's first request. For a self-service signup (doc 51),
`SignupVerification.createdAt` (the form submission, before email verification —
the moment the SME asked); for an ops-provisioned tenant, `PlatformTenant.createdAt`.
Written by the control plane as `TenantMilestone(SIGNED_UP)`.

**End:** the first `ResilienceSimulation` (doc 174) that is a **verified disruption
simulation on the SME's own ingested data** — all of:

- `usedIngestedData = true` — at least one edge in the run carries `INGESTED`
  provenance (doc 173 §2.2);
- `anyConfirmedMapping = true` — that data came through a `CONFIRMED` mapping
  (by construction nothing else reaches the graph, doc 172 §6, but the flag is
  stored so the metric does not depend on reasoning);
- run by the SME's own user, not a support session (`runBySupportSession =
  false`) — a demo run by NEWAX staff on the SME's behalf does not count;
- a real shock (`shock.kind` not null) — not a scenario-less view.

Read from the tenant outbox as `planning.simulation_recorded` →
`TenantMilestone(FIRST_OWN_DATA_SIMULATION, occurredAt = simulation.createdAt)`.

```sql
-- control plane
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY e."occurredAt" - s."occurredAt") AS median,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY e."occurredAt" - s."occurredAt") AS p90,
       avg(((e."occurredAt" - s."occurredAt") <= interval '5 days')::int)        AS share_within_5d,
       count(*) FILTER (WHERE e.id IS NULL)                                       AS not_yet_reached
FROM "TenantMilestone" s
LEFT JOIN "TenantMilestone" e ON e."tenantId" = s."tenantId" AND e.milestone = 'FIRST_OWN_DATA_SIMULATION'
WHERE s.milestone = 'SIGNED_UP' AND s."occurredAt" BETWEEN :cohortStart AND :cohortEnd;
```

**Target:** median ≤ 5 days; p90 and the share within 5 days reported beside it;
tenants that never reached the end are counted, never dropped (`not_yet_reached`).
The intermediate milestones (`FIRST_CONNECTOR_CREATED`, `FIRST_MAPPING_CONFIRMED`,
`FIRST_BATCH_PROMOTED`) decompose the interval so a slow cohort shows *where* it
was slow.

## 3. Time-to-impact visibility — the primary resilience KPI

The question: once a disruption exists in the world, how long until the SME can
see its time-phased impact (which products stock out, where, on which day, with
what revenue at risk)? Measured honestly, it splits into what the system
controls and what it does not yet:

| Segment | Definition | Measured from | Status |
|---|---|---|---|
| **A. Source → promoted** (data latency) | For each promoted record: `IngestionRecord.promotedAt − sourceUpdatedAt` (falls back to the run's start when the source gives no modification time — then marked "lower bound") | `IngestionRecord`, `PollConnectorRun`/`FileConnectorRun` | **Measured**, p50/p95 per record kind |
| **B. Promoted → assessable** (compute latency) | `ResilienceSimulation.durationMs` for runs whose inputs include the batch | `ResilienceSimulation` | **Measured** (doc 176 SLI 4) |
| **C. Promoted → assessed** (human latency) | For each batch: the first `ResilienceSimulation.createdAt` whose `inputProvenance` includes that batch, minus the batch's `completedAt` | `IngestionBatch`, `ResilienceSimulation` | **Measured, reported, no target** — it measures when a person chose to look, not a system property |
| **D. Disruption signal → impact assessment, end to end, without a person** | The time from a disruption first being *detectable* in the data (a supplier bill overdue from a slipping supplier, a snapshot showing cover below lead time) to an automatically produced assessment | — | **NOT MEASURED** — no disruption detector exists: the engine runs when asked (doc 144), and this program adds no automatic detection. Measurable only after a detector exists that records `detectedAt` and the simulation it triggered |

**The latency budget** (doc 176 §5): segment A ≤ poll interval (default 15 min)
+ promotion (SLO p95 ≤ 10 min); segment B ≤ 5 s p95 — **≤ 25 minutes p95 from
the data reaching the SME's own source system to an impact assessment being
available**, for data under a confirmed mapping. The KPI is reported as segments
A + B (system-controlled) with C beside it, and D stated as not measured.

## 4. Revenue-linked dependency coverage — target ≥ 80%

**Plainly:** of the revenue the SME actually earned in the last 90 days, what
share came from products the graph can reason about — products with a confirmed
supplier and a known stock position where they were sold.

**A variant is *covered at a location*** when both hold:

1. it has at least one Supplier → SKU edge — a `SupplierProduct` row whose
   supplier and variant resolve to `NATIVE` or confirmed `SIMULATION`/`WARNING`
   provenance (doc 173 §2.2); and
2. it has a SKU → Location position at that location — a `VariantLocationStock`
   row (any quantity, including zero: coverage is about knowing, not having)
   whose most recent source is native or a confirmed, promoted `STOCK_POSITION`
   within its 48 h freshness window.

**The formula**, trailing 90 days, in base minor units:

```
            Σ revenue on lines whose (variant, location) is covered
coverage = ─────────────────────────────────────────────────────────
                       Σ all observed revenue
```

**Numerator** = Σ `ObservedSale.baseRevenueMinor` where (`variantId`,
`locationId`) is covered
  + Σ native `OrderItem.lineTotal` (on `Order`s not `CANCELLED`/`RETURNED`,
  `placedAt` in window, `Order.currency = BRAND.locale.currency`) where
  (`OrderItem.variantId`, `Order.locationId` — or the default location for a web
  order, *named* as such) is covered.

**Denominator** = Σ `ObservedSale.baseRevenueMinor` with `refType = 'IngestionRecord'`
(POS lines with no document)
  + Σ mirrored `Invoice.subtotalMinor` (status `ISSUED`/`PAID`, `issueDate` in
  window, base currency) — the **whole** invoice, so revenue on invoice lines that
  could not be resolved to a variant (and so produced no `ObservedSale`) stays in
  the denominator and out of the numerator, instead of silently vanishing from
  both
  + Σ native `OrderItem.lineTotal` as above, covered or not.

Foreign-currency `Invoice`s are excluded from both sides and reported as a
named figure (doc 173 §4.2) until `Invoice` carries R16's base columns.
**Target ≥ 80%**, applied to tenants whose latest assessment is *derivable*
(`PlatformTenant.derivabilityClass = 'DERIVABLE'`, §0; doc 177 §4); for
*partially derivable* tenants the figure is reported, not targeted, and for a
tenant never assessed it is reported as "not assessed".

**How it leaves the tenant.** The ratio is computed inside the tenant and
sampled by doc 176's `TenantSliSampler` once a day as `sli =
"revenue_coverage_bps"`, `good = round(coverage × 10000)`, `total = 10000` —
the ratio in basis points and never the revenue, so no amount reaches the
control plane. Because every tenant's `total` is the same, the fleet figure is
reported as a distribution (median, p10, share of targeted tenants at ≥ 8000),
not as a pooled Σ good ÷ Σ total, which here would silently be a plain mean.

## 5. The recommendation funnel — measured, with no target claimed

| Stage | Definition | Query over |
|---|---|---|
| **Surfaced** | `ResilienceRecommendation` rows in the window | `ResilienceRecommendation.createdAt` |
| **Viewed** | a user opened the recommendation's detail (Law 7: overview first, detail on click) — `firstViewedAt` set on first open by a non-support user | `ResilienceRecommendation.firstViewedAt` (added by WO-180.3) |
| **Accepted** | a `RecommendationDecision` with `decision IN ('ACCEPTED','MODIFIED')` | `RecommendationDecision` |
| **Executed** | `outcomeStatus IN ('EXECUTED','MEASURED')` — a matching document in the owning module, linked and re-verified (doc 174 §3.4) | `RecommendationDecision.outcomeStatus`, `executionRefType/Id` |
| **Outcome** | `outcomeStatus = 'MEASURED'` with `outcome` recorded | `RecommendationDecision.outcome` |

**What "outcome" is measured against.** The recommendation's own run: for the
same (variant, location) or bill and the same horizon, the projected stock-out
day and unmet units (or the projected cash position on the bill's due date)
versus what the rows show happened (doc 174 §3.5). It is **not** measured
against a counterfactual — what would have happened without the action is not
observable — and the funnel never reports "value created". No target is claimed
for any stage: the pilot's job is to learn the shape of this funnel, and a
target set before it is known would be invented.

Reported per action kind and per lowest tier (a `WARNING`-tier recommendation's
acceptance rate is itself information about the ingestion layer).

## 6. NOT MEASURED — named, not dropped

| Not measured | Why | What would make it measurable |
|---|---|---|
| End-to-end time-to-impact without a person (§3 D) | No disruption detector | A detector recording `detectedAt` and the run it triggered |
| Value created by accepted actions | The counterfactual is unobservable | Nothing honest in this program; a controlled comparison design is a research question, not a metric |
| Payment callback application latency | No receipt timestamp is recorded | WO-176.5 (`callbackReceivedAt`) |
| SME satisfaction / NPS | Not a system fact | A survey instrument outside this codebase |
| Revenue per SME to NEWAX, churn | Commercial figures, not pilot-program measures — `PRD.md` leaves the platform's KPIs to the owner, and this document does not define them | Already readable where they would come from: NEWAX's control plane bills each SME directly (doc 182 §4), so `PlatformInvoice` is the record of revenue, and `PlatformTenant.status = DEPROVISIONED` with `deprovisionedAt` is the record of churn — defined as KPIs only once the owner decides them |
| Accuracy of the ±30% demand band | The band is a labelled heuristic (`propagation.ts:11–20`), not a model with a claimed accuracy | Back-testing `ObservedSale` against past bands — a later work order, only once there is history to test |

## Scope lenses

Ingestion and settlement lenses are answered in docs 172 and 175. This
document's own artifacts: `TenantMilestone`, `TenantMilestoneCursor`, the
poller, the seven milestone events (§0's table), the added columns — tenant-side
and `PlatformTenant`'s derivability class — and the metric queries.

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — the poller acts as the control plane, reading per
tenant per call, read-only; no new actor.
**Whose rows, and which columns** — milestones and samples are visible to NEWAX's
program owners through `PLATFORM_PERMISSIONS` (`platform.resilience.view`,
doc 176); **they carry timestamps and counts, never an SME's business figures**
— the revenue-coverage *ratio* is sampled, never the revenue.
**The threshold nobody approves alone / The toxic pair / Authority and blast
radius** — metric definitions are code, versioned (`metrics-1`); changing one is
a reviewed change and a new definition key, so a target cannot be met by
redefining it quietly.
**Audience is a capability, not an address** — n/a: no messages.
**Request or record** — a milestone is a RECORD of the first occurrence; never
refused, never overwritten.
**The movement with no address** — n/a: milestones, samples and the derivability
class are counts and times; no stock or cash moves.
**Four hours down, the counter stays open** — the control plane down: nothing at
any tenant waits on it; milestones are late, not lost — the events stay in each
tenant's `OutboxEvent` table (no code in `apps/api/src` deletes outbox rows —
checked) and the poller's own cursor resumes where it stopped. A tenant down:
its milestones arrive late carrying their tenant-side `occurredAt`, so no
interval is stretched by the outage itself.
**The unwritten posting rule / Every column or none / The period that already
moved / The second legal entity** — n/a: no journal line, tax document or
numbered series is written.
**Dry run before live** — every query runs read-only against a tenant copy
before it is scheduled.
**Click the number** — a fleet figure drills to per-tenant samples and
milestones; a tenant's own figure drills (in the tenant) to the rows counted.
**Three silhouettes, and the day the tier above appears** — metrics are
per-tenant; a multi-branch tenant's coverage is location-aware by definition.
**The absent collaborator** — `connectors` off: no connections, connect success
has no denominator and reads "not applicable", never 0% or 100%.
**The second copy of the write** — `@@unique([tenantId, milestone])` and
`sourceEventId`; the cursor.
**The hundred-thousandth row** — ≤ 8 milestones per tenant: 400,000 rows at
50,000 tenants; indexed by `[milestone, occurredAt]`.
**The adoption test** — n/a: no human-readable code or number is generated;
milestones are keyed `(tenantId, milestone)` and written by one central poller,
so there is no second node to collide with.
**The reversal document / The undo fan-out** — a milestone is never reversed; a
tenant that later disconnects keeps its first-value milestone, deliberately.
**The version stamp** — each metric computation names its definition version.
**The erasure the ledger cannot obey** — no personal data: tenant ids, times,
counts.
**The failure path, and who is allowed to walk it** — a poller that cannot read
a tenant advances nothing for it and logs; its cursor makes the next run resume
exactly.

## Work orders

**WO-180.1 — Columns the metrics need**: `IngestionMapping.requiredFieldsSatisfied`,
`IngestionRecord.createdAt` (doc 172), `ResilienceSimulation`'s event flags (doc
174).
**WO-180.2 — `TenantMilestone` + `TenantMilestoneCursor` + `TenantMilestonePoller`**
(the `UsageMeteringService` shape, its own cursor); `SIGNED_UP` written by the
control plane; `PlatformTenant.derivabilityClass/Policy/AssessedAt` with the
predicate-guarded latest-wins write (§0).
**WO-180.3 — `ResilienceRecommendation.firstViewedAt/firstViewedById`**, set on
first open of a recommendation's detail by a non-support user.
**WO-180.4 — The milestone events**: `connectors.connector_created` and
`connectors.mapping_confirmed` published by the connectors module; the other
five are published by the work orders §0's table names. All seven get payload
contract tests (doc 176 §7), including the assertion that none carries an
amount or a user id.
**WO-180.5 — The metric queries** as versioned, read-only functions with specs
over fixtures, and the program report for NEWAX's program owner (doc 179 WO-179.5).

## Acceptance

- Fleet connect success is Σ good ÷ Σ total over `TenantSliSample`, proven by a
  spec in which two tenants with 1/1 and 0/9 yield 10%, not 50%.
- A simulation run by a support session never sets `FIRST_OWN_DATA_SIMULATION`.
- Revenue on an invoice line that could not be resolved to a variant lowers
  coverage (it is in the denominator only) — proven by fixture.
- No control-plane table stores an SME's revenue or amounts.
- Every `TenantMilestoneKind` value has a source in §0's table, proven by a spec
  that fails when an enum value is added without one.
- An older `planning.derivability_assessed` delivered after a newer one leaves
  `PlatformTenant.derivabilityClass` at the newer class.
- Every §6 item renders as "NOT MEASURED" in the program report, with its reason.

## Out of scope

The platform's own KPIs (`PRD.md`: the owner's decision). Any SME-facing
analytics beyond the control center. A metrics backend (ADR-017, Open).
