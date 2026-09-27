# 174 — Layer 5: the control center — five questions, and Simulate → Accept → Modify, persisted and audited

> **Status: proposed (2026-09-27), not yet built.** Extends the screen and
> permission doc 144 already shipped — `/admin/resilience` (WO-144.8,
> `apps/web/src/app/(admin)/admin/(app)/resilience/page.tsx`), gated by
> `planning.propagation.view`, reachable from the Stock nav group
> (`nav-registry.ts`, key `resilience`). `RETAIL-ERP.md` Part 4 already names
> this layer ("Resilience control center → Simulate / Accept / Modify") and
> its safety rule ("Accept creates drafts, it does not execute"). What is new
> is that a simulation and every decision on it are **persisted and audited**,
> so "what did we decide, and did it work?" has an answer: three tables in a
> new `planning.prisma`, one permission (`planning.recommendations.decide`,
> doc 170 §2), and a screen that asks for names instead of database ids.

## 1. What ships today, read as it is

`page.tsx` (359 lines) has three tabs: a shock-scenario runner, a liquidity
forecast, and a supplier scorecard lookup. It is honest and it is thin:

- **It asks for raw ids.** The runner's inputs are free-text fields labelled
  "Supplier id", "Location id", "Variant id" (`page.tsx`, the `field-label`
  spans in the runner tab); the risk table renders `r.variantId` as its first
  column. ADR-061 already fixed this exact shape for bundles with a
  `withLabels()` step, "so a bare scalar id never reaches an admin screen".
- **It simulates and forgets.** `POST /admin/planning/propagate` returns a
  result that nothing stores; there is no Accept, no Modify, no record of a
  decision, and nothing to measure an outcome against.
- **It cannot state its own basis.** It shows no data freshness and no
  confidence, because until doc 172 every row was native.

## 2. The five questions

The control center answers five questions, in the order an owner asks them.
Each maps onto code that exists (doc 144) or that docs 172–173 specify.

| # | The question | Answered by | New here |
|---|---|---|---|
| 1 | **What is my business exposed to right now?** | `DependencyGraphService.build()` | `ExposureSummary` — a pure function over the graph and trailing revenue (below) |
| 2 | **If this fails, what breaks, where, and when?** | `propagate()` — the headline and baseline runs (doc 173 §2.3) | Persisted as a `ResilienceSimulation` |
| 3 | **How much money is at risk — and will I make payroll?** | `revenueAtRiskMinor`/`marginAtRiskMinor` (doc 173 §5); `LiquidityForecastService.forecast()` with `cashSource` (doc 173 §4.3) | Shown beside the run, with the cash source named |
| 4 | **What can I do, what does it cost, and how sure are we?** | `rankActions()` — two bands, known and unknown cost (doc 173 §3.4), each candidate's lowest tier | Persisted as `ResilienceRecommendation`s; narration optional (doc 144 R23) |
| 5 | **What did we decide, and did it work?** | — | `RecommendationDecision` and its measured outcome |

**Question 1, computed.** `ExposureSummary` is pure over inputs the
orchestrator resolves — the graph, and trailing-90-day revenue per variant
(native `OrderItem` lines on non-cancelled orders plus `ObservedSale` rows, each
(location, day) from the one source its system-of-record window names, doc 169
§5):

- **Single-source items** — variants with exactly one Supplier→SKU edge, ranked
  by their revenue share.
- **Supplier concentration** — each supplier's share of revenue carried by the
  variants it supplies (a variant with two suppliers splits its revenue evenly
  between them, stated on screen as the rule, not hidden).
- **Coverage** — the revenue-linked dependency coverage doc 180 defines, and
  the gap: records held at `ADVISORY`, kinds with no confirmed mapping.
- **Freshness** — per record kind, the oldest `sourceUpdatedAt` among the
  edges used (doc 172 §7).

## 3. Simulate → Accept → Modify

### 3.1 Simulate — a run is a record

Running a scenario writes one `ResilienceSimulation` holding what it rested on,
and one `ResilienceRecommendation` per ranked candidate. **Why persist at all:**
question 5 has nothing to measure against otherwise; doc 180's "time to first
value" needs a timestamp for the first simulation on the SME's own data; and
the version-stamp lens needs a run from last month to stay explainable after
the data under it has changed.

```prisma
// planning.prisma — new schema file, owned by the planning module. Bare
// scalars for every other-module reference (ADR-012).

model ResilienceSimulation {
  id                String   @id @default(cuid())
  /// The typed Shock exactly as propagate() received it.
  shock             Json
  horizonDays       Int
  /// sha256 over the sorted edge list — two runs on an unchanged graph
  /// share a fingerprint, which is what "byte-identical" can be checked by.
  graphFingerprint  String
  /// What the run rested on: confirmed mapping versions and batch ids per
  /// record kind, the oldest sourceUpdatedAt per kind, the confidence
  /// policy (doc 172 §5), the release it ran on (GET /meta.release, doc 171).
  inputProvenance   Json
  /// Counts per lowest tier (NATIVE / SIMULATION / WARNING) among the edges
  /// used, and whether ANY ingested edge was used — the "on its own data"
  /// test doc 180 reads.
  tierCounts        Json
  usedIngestedData  Boolean
  /// The at-risk rows only (unmet demand > 0, or stockout within the
  /// horizon), from both runs, with labels snapshotted — bounded, and the
  /// durable explanation. The full result is reproducible only while its
  /// inputs are unchanged, so it is fingerprinted, never stored whole.
  atRiskRows        Json
  resultHash        String
  liquidity         Json?    // the forecast shown beside it, with cashSource
  narration         String?  // only a narration that passed assertNoOriginatedFigures()
  /// Wall-clock time of build() + both propagate() runs + rankActions() —
  /// the simulation-latency SLI doc 176 §5 computes from rows, since no APM
  /// exists (ADR-017 is open). Narration time is excluded (it is optional).
  durationMs        Int
  edgeCount         Int
  createdById       String
  createdAt         DateTime @default(now())

  recommendations ResilienceRecommendation[]

  @@index([createdAt])
  @@index([usedIngestedData, createdAt])
}

model ResilienceRecommendation {
  id                 String   @id @default(cuid())
  simulationId       String
  ordinal            Int      // rank within its band
  band               RecommendationBand
  kind               String   // CandidateActionKind — a string, so a new kind is never a migration
  /// Snapshotted, never re-derived: the description, the figures, and the
  /// source edges exactly as rankActions() produced them.
  candidate          Json
  cashPreservedMinor Int
  cashSpentMinor     Int?     // null = cost not modelled (doc 173 §3.4)
  /// The explicit assumptions behind the figures, as data: the demand band's
  /// source and spread, the lead-time source (distribution / SupplierProduct /
  /// Supplier scalar), whether cost is modelled, the horizon.
  assumptions        Json
  /// Every entity the action touches, with a label snapshot: variants,
  /// locations, suppliers, bills.
  affectedEntities   Json
  lowestTier         String   // NATIVE | SIMULATION | WARNING
  minConfidenceBps   Int?     // null when every source edge is native
  requiresAcknowledgement Boolean @default(false)
  /// Set once, on the first open of this recommendation's detail by a
  /// non-support user — the funnel's "viewed" stage (doc 180 §5).
  firstViewedAt      DateTime?
  firstViewedById    String?
  createdAt          DateTime @default(now())

  simulation ResilienceSimulation @relation(fields: [simulationId], references: [id], onDelete: Restrict)
  decisions  RecommendationDecision[]

  @@unique([simulationId, band, ordinal])
  @@index([kind, createdAt])
}

enum RecommendationBand { KNOWN_COST UNKNOWN_COST }

enum RecommendationDecisionKind { ACCEPTED MODIFIED DISMISSED }

enum RecommendationDismissReason { NOT_RELEVANT TOO_COSTLY DATA_WRONG ALREADY_HANDLED OTHER }

enum RecommendationOutcomeStatus {
  PENDING          // horizon not yet reached
  EXECUTED         // the owning module's own document exists and matches
  NOT_EXECUTED     // horizon reached with no matching document
  MEASURED         // executed, and the outcome below is recorded
}

model RecommendationDecision {
  id                String   @id @default(cuid())
  recommendationId  String
  decision          RecommendationDecisionKind
  /// MODIFIED only: the changed parameters (a different quantity, a
  /// different source location), re-validated against a real edge (§3.3).
  modifiedParameters Json?
  dismissReason     RecommendationDismissReason?
  note              String?
  /// Set when the recommendation required acknowledgement (a WARNING-tier
  /// source): the ids of the uncertain records the decider acknowledged.
  acknowledgedRecordIds String[]
  deciderId         String
  decidedAt         DateTime @default(now())

  /// The owning module's document that executed it — bare scalars
  /// (refType/refId idiom), linked after the fact (§3.4).
  executionRefType  String?  // "StockTransfer" | "PurchaseOrder" | "PurchaseRequisition" | "SupplierBill"
  executionRefId    String?
  executionLinkedAt DateTime?
  outcomeStatus     RecommendationOutcomeStatus @default(PENDING)
  /// What was observed for the same entities over the same horizon (§3.5).
  outcome           Json?
  outcomeMeasuredAt DateTime?

  recommendation ResilienceRecommendation @relation(fields: [recommendationId], references: [id], onDelete: Restrict)

  @@index([recommendationId])
  @@index([outcomeStatus, decidedAt])
  @@index([deciderId, decidedAt])
}
```

**Checked for an existing equivalent before adding.** Two suggestion-and-decision
models exist: `MarkdownSuggestion` (`PENDING`/`CREATED`/`DISMISSED`,
`inventory.prisma`) and `ProductAiSuggestion` (`PENDING`/`APPROVED`/`REJECTED`,
`catalog.prisma`). Each is bound to one kind of target (a discount for a variant;
a text field on a product) and neither carries assumptions, affected entities,
confidence or an outcome. Neither generalises without becoming this table, so
this table is added and the vocabulary follows theirs where it fits
(`DISMISSED`).

### 3.2 Accept — a decision, then the owning module's own act

`RETAIL-ERP.md` Part 4: "Accept creates drafts, it does not execute. Accepting a
ranked action produces a *draft transfer*, *draft PO* or *draft markdown* that
the owning module then takes through its own approval flow." Checked against the
real modules, that sentence holds for purchasing and not for transfers:

| Action kind | Owning module's draft state | What Accept does |
|---|---|---|
| `TRANSFER_STOCK` | **None.** `StockTransferStatus` is `IN_TRANSIT`/`RECEIVED`/`CANCELLED` (`transfers.prisma`) — creating a transfer *is* dispatching it | Records the decision and opens the transfers screen pre-filled (variant, source, destination, quantity); dispatch requires `transfers.manage` at the act. A `REQUESTED` transfer state is a transfers-module change this program names and does not make |
| `SPLIT_PO_ALTERNATE_SUPPLIER` | `PurchaseRequisition` (doc 152) — a REQUEST that converts to a PO — or a `PurchaseOrder` in `DRAFT` | Records the decision and opens a requisition pre-filled for the alternate supplier (`purchasing.requisitions.create` at the act) |
| `DELAY_DISCRETIONARY_AP` | **Nothing to draft.** No AP payment schedule exists to mutate; bills are paid when someone pays them | Records the intent; its execution is observed, not created (§3.4) |

Accept writes, **in one transaction**: the `RecommendationDecision` row and an
evidence-class audit row (`AuditService.recordEvidence()`, ruling 9 — this is a
decision about money and stock) carrying the recommendation id, the assumptions
hash, the affected entities, the lowest tier and confidence, the decider, and
the acknowledged records. A recommendation with `requiresAcknowledgement` is
refused without `acknowledgedRecordIds` covering every `WARNING` record among
its source edges.

### 3.3 Modify — still generated, never invented

A modification changes parameters, never the rule that the action must rest on
a real edge. `validateModification(recommendation, parameters, graph)` is pure
and runs the same generator constraint `rankActions()` used: a modified transfer
must name a source location with a real `Location → Location` edge to the
destination and enough surplus at that source; a modified split must name a
supplier with a real Supplier→SKU edge for the variant. A modification that
fails is refused with the reason; one that passes is recorded as `MODIFIED`
with its `modifiedParameters`. The original recommendation is never edited —
the version-stamp lens: the ranked figure stays explainable as it was ranked.

### 3.4 Executed — linked, verified, never assumed

Planning may not import the modules that execute (RETAIL-ERP Part 4's zero
couplings). Execution is therefore **linked after the fact and verified by
reading**, never reported by a call:

- The control center proposes a link: rows in the owning module's table created
  after `decidedAt` that match the decision — a `StockTransfer` with the same
  variant, source and destination; a `PurchaseRequisition`/`PurchaseOrder` to the
  alternate supplier containing the variant — read by bare Prisma read, as the
  engine reads everything else.
- A `planning.recommendations.decide` holder confirms the link;
  `executionRefType`/`executionRefId` are set and `outcomeStatus` becomes
  `EXECUTED`. A proposed link that no longer matches when confirmed is refused.
- `DELAY_DISCRETIONARY_AP` is executed when the bill is still unpaid at its
  `dueAt` (`SupplierBill.paidAt` null, `amountPaid < amount`) — read, not
  claimed.
- A decision whose horizon passes with no link becomes `NOT_EXECUTED` — the
  funnel's honest drop-off (doc 180).

### 3.5 Outcome — measured against the run's own projection, and nothing more

`RecommendationOutcomeCron` (daily, planning module) measures executed decisions
whose horizon has ended, over **the same entities and the same horizon** the
recommendation named:

| Kind | Projected (from the run) | Observed (from rows) |
|---|---|---|
| `TRANSFER_STOCK`, `SPLIT_PO_ALTERNATE_SUPPLIER` | `stockoutInDays` and unmet units at the at-risk (variant, location) | Whether that (variant, location) reached zero on-hand within the horizon — native `StockMovement.resultingStock` / `VariantLocationStock`, or for a mirrored location the ingested `STOCK_POSITION` snapshots — and on which day; the executed document's actual quantity and, where recorded, its cost |
| `DELAY_DISCRETIONARY_AP` | the cash preserved by the delay | Whether the bill was paid after `dueAt` and on which day; the cash position on `dueAt` from the same `LiquidityForecastService` source the run used |

**What an outcome is not.** The counterfactual — what would have happened had
the action not been taken — is not observable, and no screen, report or
narration may claim it ("the transfer saved AED 12,000" is refused wording;
"the projected stock-out on day 6 did not occur; the transfer of 40 units
arrived on day 3" is the permitted shape). An outcome compares an observation to
the run's own projection; it does not attribute causation.

## 4. The screen

`/admin/resilience` keeps its URL, its nav entry and its permission, and is
rebuilt to the seven laws: **one main job** (understand and act on disruption
risk, Law 5), **overview first, detail on click** (Law 7):

- **Overview** (question 1): exposure tiles — single-source items, supplier
  concentration, coverage, freshness — each a link to the rows that produced it
  ("click the number"); a banner "new data since your last simulation" computed
  on read (latest `IngestionBatch.completedAt` with status `PROMOTED` vs latest
  `ResilienceSimulation.createdAt`, both bare reads — no state kept for it).
- **Simulate** (questions 2–3): pickers that search suppliers, locations and
  variants **by name** (labels resolved server-side, never a typed cuid); the
  result shows the headline run with a toggle to the baseline, each row with its
  tier badge; revenue and margin at risk; the liquidity forecast with its cash
  source.
- **Recommendations** (question 4): two bands, known cost then unknown cost;
  each with Accept / Modify / Dismiss for `planning.recommendations.decide`
  holders, read-only for everyone else with `planning.propagation.view`.
- **Decisions** (question 5, `/admin/resilience/decisions`): the log, filterable
  by status, each row linking to its run, its executing document and its
  outcome.

Every state is shipped (empty: "no suppliers yet — connect a source"; loading;
error; partial: "sales data is 3 days old"), per `.claude/rules/design.md`'s
"every state shipped, no dead end".

## Scope lenses

Ingestion-side lenses are in doc 172; money-movement lenses in doc 175. These
answer the control center's own artifacts: runs, recommendations, decisions,
outcomes, the permission, the screen.

**The actor with three tables** — the decider is a `User`; no counterparty is
introduced.
**The principal with no permission key** — `RecommendationOutcomeCron` acts as
no principal and writes only outcome fields on existing decisions.
**The grant that ends itself** — n/a: no grant introduced; a deactivated
decider's pending decisions need no reassignment (a decision is complete when
recorded), and their execution links can be confirmed by any other holder.
**Whose rows, and which columns** — runs and recommendations are visible to
`planning.propagation.view`; decisions are made by `planning.recommendations.decide`;
the linked executing documents are shown only to holders of that module's own
view permission (the link shows a label, the document opens under its own
guard).
**The threshold nobody approves alone** — the decision commits no money; the
executing act does, under the owning module's own thresholds
(`purchasing.requisitions.approve` for a requisition, unchanged).
**The toxic pair, caught at grant or at act** — `planning.recommendations.decide`
+ `transfers.manage` is the intended workflow, not toxic; no pair added.
**Authority and blast radius** — the worst a decider can do is accept a bad
recommendation, whose blast radius is bounded by the owning module's own
permission and approval at the act; the audit row holds the assumptions and
figures the decider saw.
**Audience is a capability, not an address** — when a run finds a stock-out
inside the horizon on a single-source item, holders of
`planning.recommendations.decide` are notified through the action hub (one item
per run, never per row); zero holders → holders of `planning.propagation.view`;
many holders → one action-hub item.
**Request or record — classify every write** — a decision is a REQUEST (it asks
the owning module to act and may be refused there); a run is a RECORD of what
was computed; an outcome is a RECORD of what was observed.
**The movement with no address** — n/a: this layer moves nothing; every action
it opens names its locations in its own module.
**Four hours down, the counter stays open** — the control center down: nothing
stops; decisions wait.
**The unwritten posting rule / Every column or none / The period that already
moved / The second legal entity** — n/a: no money fact is written here.
**Dry run before live** — every run *is* a dry run; `validateModification()` is
pure.
**Click the number** — every tile, row and recommendation links to its edges,
its records (doc 173 `linkIds`) and, for a decision, its executing document.
**Three silhouettes, and the day the tier above appears** — Solo: one location,
transfer recommendations never appear (no lateral edges). Chain: transfers
appear. Organization: out of pilot scope.
**The absent collaborator** — `transfers` off: no transfer recommendations (no
edges) and no transfer screen to open; `purchasing` requisitions off: the split
opens a draft PO instead; `AiProvider` absent: no narration, everything else
unchanged.
**The second copy of the write** — `@@unique([simulationId, band, ordinal])`; a
decision is refused if the recommendation already has a non-dismissed decision
by the same decider (a retried Accept returns the first, keyed by the client's
`IdempotencyKey`, doc 157).
**The hundred-thousandth row** — a busy SME running one scenario a day for a
year: ~365 runs, a few thousand recommendations and decisions; `atRiskRows` is
bounded to at-risk rows only.
**The adoption test** — n/a: no generated code.
**The reversal document, not the reversal flag** — a decision is never edited;
a changed mind is a new decision (a later `DISMISSED` after an `ACCEPTED` is a
second row), and the log shows both.
**The undo fan-out** — Accept fires one action-hub update and opens a pre-filled
screen (nothing irreversible); the executing document's own undo is its own
module's (a transfer's cancel, a requisition's rejection).
**The version stamp** — runs stamp the confidence policy, the mapping versions,
the release and the graph fingerprint; recommendations snapshot their figures,
assumptions and labels.
**The erasure the ledger cannot obey** — runs and decisions hold supplier and
product labels and user ids; a `User` erasure pseudonymises `deciderId` /
`createdById` per ruling 1; no customer data is held.
**The failure path, and who is allowed to walk it** — a run that fails (a
provenance query error, doc 173) records nothing and shows the error; an
outcome measurement that fails leaves `outcomeStatus` unchanged and is retried
by the next cron run; `NOT_EXECUTED` decisions are listed, never hidden.

## Work orders

**WO-174.1 — `planning.prisma`**: the three models and four enums, forward-only
migration; `planning` stays `alwaysOn`.
**WO-174.2 — Persisted runs**: `PlanningService.runPropagation()` writes the
simulation and its recommendations; `graphFingerprint`, `inputProvenance`,
`atRiskRows`; and publishes `planning.simulation_recorded` (`{ simulationId,
usedIngestedData, anyConfirmedMapping, runBySupportSession, createdAt }`) in the
same transaction through the outbox — the event doc 180's time-to-first-value
milestone reads.
**WO-174.3 — `ExposureSummary`** (question 1), pure, with specs.
**WO-174.4 — Decisions**: Accept/Modify/Dismiss endpoints under
`planning.recommendations.decide`, evidence-class audit in the same
transaction, `validateModification()`, acknowledgement enforcement.
**WO-174.5 — Execution linking** (proposal by bare read, confirmation by a
holder) and **`RecommendationOutcomeCron`** (§3.5).
**WO-174.6 — The screen**: the four sections, name-searching pickers, labels via
a `withLabels()` step (ADR-061's precedent), every state, the decisions log.
**WO-174.7 — Reachability**: `planning.recommendations.decide` seeded (doc 170
WO-170.1); the existing nav entry kept; the action-hub source.

## Acceptance

- Running the same scenario twice on an unchanged graph produces two
  `ResilienceSimulation` rows with the same `graphFingerprint` and
  `resultHash`.
- `usedIngestedData` is `true` exactly when at least one edge used carries
  `INGESTED` provenance.
- Accepting a `WARNING`-tier recommendation without acknowledging every
  `WARNING` record is refused; accepting with them writes one decision and one
  evidence-class `AuditLog` row in the same transaction.
- A modification naming a source location with no transfer edge is refused.
- A decision is `EXECUTED` only after a matching document is linked and
  re-verified; a decision past its horizon with no link is `NOT_EXECUTED`.
- No screen renders a raw cuid where a label exists; the runner accepts names.
- No outcome text claims a counterfactual — enforced by the outcome record's
  fixed structure (projected vs observed), not by review alone.

## Out of scope

Executing any action from the control center (Part 4's rule). A `REQUESTED`
state on `StockTransfer` (a transfers-module change, named). Causal attribution
of outcomes. A cross-tenant resilience dashboard for du (doc 180's metrics are
program measures, not an SME-facing feature). Alerts pushed to SMEs by SMS or
WhatsApp (the action hub and in-app notification only in this program).
