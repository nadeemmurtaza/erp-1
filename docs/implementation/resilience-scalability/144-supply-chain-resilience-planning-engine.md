# 144 — R20–R26: the resilience-planning engine

`RETAIL-ERP.md` already carries seven complete architecture rules (R20
through R26) specifying a supply-chain resilience and cash-preservation
engine — a derived dependency graph, typed shock scenarios, deterministic
propagation to stockout dates and cash-at-risk, a single ranking formula
for recommended actions, GenAI narration constrained to cite only
computed figures, liquidity forecasting off the ledger, supplier
lead-time as a distribution, and OTIF scorecards. This document is the
buildable brief R20–R26 never got, and is now built against it.

> **Status (2026-09-27): built, WO-144.1–144.8.** A new, always-on
> `planning` module (`apps/api/src/modules/planning/`) — a pure read/
> recommendation engine over rows every other module already writes, no
> reason for a deployment to run without it. `DependencyGraphService.build()`
> (R20) projects five real edge types (Supplier→SKU, RawMaterial→SKU via
> `BomComponent`, SKU→Location via `VariantLocationStock`, Location→
> Location via real `StockTransfer` history, Supplier→Obligation via
> unpaid `SupplierBill`s) — never invented, never guessed. `propagate()`
> (R21) and `rankActions()` (R22) are pure functions with no `prisma.*`
> call of their own, proven deterministic and non-inventive by spec.
> `NarrationService.narrate()` (R23) wires `AiService`/a new
> `AiFeature.PLANNING_NARRATION` value, refusing to show any narration
> whose text contains a standalone number outside the figures it was
> handed — `assertNoOriginatedFigures()`, proven by spec.
> `LiquidityForecastService.forecast()` (R24) reads `JournalLine`/
> `Invoice`/`SupplierBill`/`PayRun` directly, including a real
> `cashConversionCycleDays` (DIO+DSO-DPO). `SupplierLeadTimeObservation`
> + `SupplierResilienceService` (R25) backfill from `GoodsReceived`
> automatically; `supplierScorecard()`'s own `defectRatePct` is honestly
> `null` — no quality/defect field exists anywhere in this schema, never
> fabricated. `OnlineStockService` (R26) reads `onlineStockFor()` as a
> sum of branch allotments and writes through `assignFulfillingBranch()`.
> Permission `planning.propagation.view` (Purchasing category, seeded to
> ADMIN) gates every read; `assignFulfillingBranch()` reuses the existing
> `inventory.manage`. UI: `/admin/resilience` (three tabs — shock
> scenario runner, liquidity forecast, supplier scorecard lookup),
> reachable from the Stock nav group. ADR-066.
>
> **Two honest deviations from this document's own text.** First,
> `buildDependencyGraph()` omits two of the doc's own illustrative edge
> types — "SKU → Channel at Location" (no `LocationAssortment` model
> exists in this schema) and "Sale → Cash account" (would mean inventing
> a projection no work order names) — never built rather than faked; see
> `dependency-graph.ts`'s own header comment. Second, `assignFulfillingBranch()`
> is honestly a REASSIGNMENT, not a first-time decrement: this codebase's
> real order-placement flow (`orders.service.ts`) already resolves and
> decrements a real `locationId` at PLACEMENT time
> (`order.locationId ?? defaultLocationId()`), so "assigning a fulfilling
> branch" reverses the stock commitment at the order's current location
> and re-commits it at the new one, atomically, through the identical
> `InventoryService.move()` writer — never a second, competing decrement
> from an unassigned state. `planning -> inventory` is a new
> `KNOWN_MODULE_COUPLINGS` entry for exactly this write.
>
> **`rankActions()` generates only two of R22's own nine named action
> kinds today** (`TRANSFER_STOCK`, `DELAY_DISCRETIONARY_AP`) — the only
> two this graph currently has real, shipped data to back. The remaining
> seven (`EXPEDITE_PO`, `SPLIT_PO_ALTERNATE_SUPPLIER`, `SUBSTITUTE_SKU`,
> `REALLOCATE_ONLINE_BUFFER`, `DELIST_AT_LOCATION`,
> `MARKDOWN_TRAPPED_STOCK`, `RAISE_PRICE`) are named in the
> `CandidateActionKind` type for forward extensibility but never
> generated — R22's own "generated from the graph, not invented" rule
> applied to itself: an action kind with no real source is not generated
> at all, not faked.

## 1. R20 — the dependency graph is a projection, never a second model

```ts
// core/planning/dependency-graph.ts — read-only, rebuilt on demand from
// rows every enabled module already writes; never a maintained, storable
// graph structure of its own.
interface DependencyEdge {
  from: { type: 'Supplier' | 'Sku' | 'Location' | 'Channel' | 'CashAccount' | 'Obligation'; id: string };
  to: { type: string; id: string };
  weight?: number;
}

async buildDependencyGraph(organizationId: string): Promise<DependencyEdge[]> {
  // Supplier -> SKU: SupplierProduct (shipped)
  // SKU -> Recipe -> SKU: BomRecipe, only when `bom` is enabled — an edge
  //   type that simply does not exist when the module is off, per R20's
  //   own "the graph is whatever the enabled modules can express."
  // SKU -> Location: VariantLocationStock (shipped)
  // Location -> Location: StockTransfer (R4, shipped)
  // SKU -> Channel at Location: LocationAssortment + OrderItem
  // Sale -> Cash account: JournalLine (R15, shipped)
  // Supplier -> Obligation: SupplierBill / AP aging (R18, shipped — see doc 145)
}
```

Every edge type above already has real, shipped rows to project from —
this is the concrete confirmation of R20's own claim that "a shop with
one week of trading already has a complete dependency graph." The
function is pure and stateless: called fresh per request, never
persisted, per R20's own "nobody maintains a second model of the
business."

## 2. R21 — shocks and propagation, arithmetic over the graph, never inference

```ts
type Shock =
  | { kind: 'SupplierDown'; supplierId: string; days: number }
  | { kind: 'LeadTimeShift'; supplierId: string; deltaDays: number }
  | { kind: 'LocationDown'; locationId: string; days: number }
  | { kind: 'DemandShock'; scope: { skuId?: string; categoryId?: string }; pctChange: number }
  | { kind: 'FxMove'; currency: string; pctChange: number }
  | { kind: 'CashShock'; amountMinor: number }
  | { kind: 'SkuRecall'; variantId: string };

interface PropagationResult {
  perSkuLocationDay: Array<{
    variantId: string; locationId: string; date: Date;
    projectedOnHand: number; stockoutDate: Date | null;
    unmetDemandUnits: number; revenueAtRiskMinor: number;
    marginAtRiskMinor: number; cashAtRiskMinor: number;
  }>;
}

function propagate(graph: DependencyEdge[], shock: Shock, forecasts: DemandForecast): PropagationResult {
  // Pure function: same graph + same shock + same forecast input ->
  // byte-identical output, per R21's own "Determinism" property. Every
  // number in the result traces back to a specific graph edge and a
  // specific forecast input — "Traceability," R21's second testable
  // property, satisfied by construction since nothing here is inferred.
}
```

Forecasts (demand, lead-time, payment-delay distributions) are *inputs*
to this function, carrying explicit low/base/high confidence bands — R21's
own "a prediction can be wrong; that is tolerable... a prediction that
cannot be explained or reproduced has no business driving a purchase
order" is the acceptance test: `propagate()` itself contains no model
call, no inference, only arithmetic over its own typed inputs.

## 3. R22 — one ranking formula, actions generated from the graph, never invented

```ts
interface CandidateAction {
  kind: 'TRANSFER_STOCK' | 'EXPEDITE_PO' | 'SPLIT_PO_ALTERNATE_SUPPLIER'
      | 'SUBSTITUTE_SKU' | 'REALLOCATE_ONLINE_BUFFER' | 'DELIST_AT_LOCATION'
      | 'MARKDOWN_TRAPPED_STOCK' | 'DELAY_DISCRETIONARY_AP' | 'RAISE_PRICE';
  cashPreservedMinor: number;
  rupeesSpentMinor: number;
  score: number;              // cashPreservedMinor / rupeesSpentMinor
  feasible: boolean;          // does the lead time beat the stockout date?
  reversibilityRank: number;  // ties break toward the easier-to-undo action
}

function rankActions(propagation: PropagationResult, graph: DependencyEdge[]): CandidateAction[] {
  // Every candidate is GENERATED from a real graph edge (a transfer
  // candidate only exists where a StockTransfer-capable Location pair
  // with surplus cover exists) — never a free-text suggestion an LLM
  // invents, per R22's own "generated from the graph, not invented."
}
```

This function is only possible because R15's ledger already exists —
"you cannot rank by cash without a ledger that knows what cash is,"
already true in this repository (`accounting` module, shipped) before
this document's own work begins.

## 4. R23 — GenAI narrates, cites, never computes

```ts
interface NarrationInput { propagation: PropagationResult; rankedActions: CandidateAction[]; }

async function narrate(input: NarrationInput, ai: AiProvider): Promise<{ text: string; citations: Citation[] }> {
  // ai.complete() is handed the STRUCTURED propagation/ranking result and
  // asked only for prose and a contingency narrative around it — every
  // figure the model writes must be a citation back to a value already
  // computed by propagate()/rankActions() above.
}

// The acceptance test R23 states as mechanical, not aspirational:
function assertNoOriginatedFigures(narration: string, citations: Citation[]): void {
  // Strip every cited figure from the text; assert no bare number remains.
  // This is the literal test doc 09's own AiProvider extension point
  // (already built) gets wired into for this specific use, never a new
  // AI mechanism.
}
```

## 5. R24 — liquidity is a ledger query plus a schedule, not a new forecast model

```ts
async liquidityForecast(organizationId: string, horizonDays: number): Promise<{
  currentCashMinor: number;              // sum of bank-account JournalLine balances (R15, shipped)
  scheduledInflows: Array<{ date: Date; amountMinor: number; source: 'AR' | 'ForecastSales' }>;
  scheduledOutflows: Array<{ date: Date; amountMinor: number; source: 'AP' | 'Payroll' | 'Rent' }>;
  cashConversionCycleDays: number;       // DIO + DSO - DPO, every term from the ledger + stock ledger
}> {
  // AR inflows: doc 145's own receivables/aging (this same batch).
  // AP outflows: SupplierBill's own existing due-date schedule (shipped).
  // Payroll: PayRun's own existing schedule (shipped).
  // No new schema — this is a read, composed entirely from tables that
  // already exist, per R24's own "liquidity is a ledger query plus a
  // schedule."
}
```

## 6. R25 — lead time as a distribution, backfilled from history already in the database

```prisma
// additive — purchasing.prisma
model SupplierLeadTimeObservation {
  id           String   @id @default(cuid())
  supplierId   String
  purchaseOrderId String
  observedDays Int      // GoodsReceipt.receivedAt - PurchaseOrder.placedAt, one row per observation
  createdAt    DateTime @default(now())

  @@index([supplierId, createdAt])
}
```

```ts
async leadTimeDistribution(supplierId: string): Promise<{ meanDays: number; stdDevDays: number; observationCount: number }> {
  // Computed from SupplierLeadTimeObservation; falls back to the existing
  // Supplier.leadTimeDays scalar (unchanged, still the default) when a
  // supplier has too few observations to derive a real distribution —
  // R25's own explicit fallback rule.
}

async supplierScorecard(supplierId: string): Promise<{ otifPct: number; priceVariancePct: number; defectRatePct: number }> {
  // Computed entirely from PurchaseOrder vs GoodsReceipt vs SupplierBill —
  // "none requiring anyone to type anything new," per R25's own words.
}
```

`SupplierLeadTimeObservation` is populated by a listener on
`GoodsReceipt`'s own existing creation event — additive, backfillable
from history already in the database, never requiring new data entry.

## 7. R26 — online stock is the sum of branch allotments, no separate reservation ledger

```ts
async onlineStockFor(variantId: string, organizationId: string): Promise<number> {
  // Sum of VariantLocationStock across every branch's own allotment for
  // this variant — shown as ONE figure at the brand tier, per R26's own
  // "online stock is the sum of branch allotments."
}

async assignFulfillingBranch(orderId: string, locationId: string): Promise<void> {
  // Decrements that branch's allotment through InventoryService.move()
  // (apps/api/src/modules/inventory/inventory.service.ts:204) — THE
  // SAME writer every other sale already uses, per R26's own "like any
  // other sale — no separate online reservation ledger."
}
```

This is a read-model and one assignment call over `InventoryService`'s
own existing, unchanged writer — never a second stock-reservation
mechanism competing with the "one writer per invariant" rule this
repository already enforces everywhere else.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: every function above is a read or a
computation over existing, already-actor-scoped rows; no new actor kind.
**Whose rows, and which columns** — every function is `organizationId`-
scoped (and, for a chain deployment, further scoped to the caller's own
branch/node reach) exactly as every other read in this repository already
is — `buildDependencyGraph()` never spans organizations, `propagate()`
never spans branches the caller cannot see.
**The threshold nobody approves alone** — `rankActions()`'s own output is
a *recommendation*, never an autonomous write: every candidate action
(a transfer, an expedited PO, a markdown) still executes through its own
existing, already-permissioned service call (`InventoryService.move()`
for a transfer, `PurchasingService` for a PO change) — this engine
recommends, it does not act, and the acting permission is whatever that
underlying action already requires.
**The toxic pair** — n/a: a read/recommendation engine introduces no new
permission combination.
**Authority and blast radius** — who may view a propagation result or
trigger a re-run is gated by a new `planning.propagation.view` permission,
distinct from the permission to *act* on any recommended action (which
remains that action's own existing permission) — viewing a risk report
and executing a stock transfer are never the same grant.
**Audience is a capability, not an address** — a `CashShock` propagation
crossing a stated risk threshold notifies whoever holds
`planning.propagation.view` scoped to the affected branch/brand, through
`NotificationsService` (doc 24's own existing audience-resolution),
never a hardcoded recipient list.
**Request or record** — every function in this document is a REQUEST-
shaped read (refusable by permission, never a write of its own); the
*actions* it recommends are records or requests per their own already-
established classification (a stock transfer is a RECORD once
`InventoryService.move()` executes it, unchanged by this document).
**The movement with no address** — n/a: this engine names no movement of
its own; every action it recommends inherits its own underlying service's
existing "name the location explicitly" discipline.
**Four hours down** — the propagation engine's own unavailability degrades
to "no risk report today," never a block on ordinary operations — every
underlying write path (`InventoryService.move()`, `PurchasingService`)
continues to function with this engine entirely absent.
**Click the number** — every figure in a propagation result and every
generated narration sentence (R23) resolves to the exact graph edges and
ledger rows that produced it — the acceptance test for R23 is this lens,
made mechanical.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: this engine posts no
money fact of its own; `liquidityForecast()` reads `JournalLine`'s own
existing posted entries, never posts new ones.
**Dry run before live** — every function in this document (`propagate()`,
`rankActions()`, `narrate()`, `liquidityForecast()`) is already,
structurally, a dry run: none contains a `prisma.*.create/update/delete`
call or a `publish()` — satisfying `CLAUDE.md`'s own "the deciding
function takes inputs, returns the outcome, holds no write" requirement
by construction, not by convention.
**Three silhouettes** — Solo: R20's own point stands — "a shop with one
week of trading already has a complete dependency graph," useful even at
this scale for a single risky supplier. Chain: cross-branch transfer
candidates (R22) become real. Organization: cross-brand liquidity
forecasting and supplier scorecards at real volume — this is squarely
where `rankActions()`'s own scoring earns its keep.
**The absent collaborator** — with `bom` off, recipe edges (R20) simply
do not exist in the graph; with `transfers` off, no lateral
`Location → Location` edges exist — the graph is exactly R20's own "the
graph is whatever the enabled modules can express," never an error.
**The second copy of the write** — n/a: this engine performs no write;
`SupplierLeadTimeObservation`'s own population is idempotent per
`GoodsReceipt`, one observation row per goods receipt, never duplicated
on a replayed event.
**The hundred-thousandth row** — `buildDependencyGraph()`'s own
projection is bounded by real edge counts (suppliers × SKUs, SKUs ×
locations) at whatever scale the organization already operates at, per
the existing tables it projects from; `SupplierLeadTimeObservation` grows
one row per goods receipt, bounded and indexed by `[supplierId,
createdAt]`.
**The reversal document / The undo fan-out** — n/a: this engine writes
nothing to reverse; any *action* it recommends carries its own existing
reversal answer (a stock transfer, a PO change) unchanged.
**The version stamp** — a propagation result is timestamped and never
recomputed retroactively under a later forecast revision — "same inputs,
byte-identical output" (R21) means a stored/shown result from an hour ago
remains explainable exactly as it was computed, never silently
recalculated in place.
**The erasure the ledger cannot obey** — n/a: this engine's own inputs
and outputs carry no personal data — suppliers, SKUs, locations, and cash
figures only.
**The failure path** — a missing or stale forecast input degrades
`propagate()`'s own confidence bands honestly (wider bands, never a
silently-assumed point estimate) rather than failing outright; `narrate()`
failing the citation check (§4) blocks that narration from being shown,
never shown uncited.

## Work orders

**WO-144.1 — `buildDependencyGraph()`** (R20), read-only projection over
existing tables.
**WO-144.2 — `Shock`/`propagate()`** (R21), pure function, unit-tested for
determinism (identical inputs twice, byte-identical output).
**WO-144.3 — `rankActions()`** (R22), generated candidates only, scored by
the stated formula, feasibility-gated, reversibility-tiebroken.
**WO-144.4 — `narrate()` + the citation-stripping acceptance test**
(R23), wired to doc 09's existing `AiProvider`.
**WO-144.5 — `liquidityForecast()`** (R24), a read over `accounting`/
`purchasing`/`payroll`'s own existing schedules.
**WO-144.6 — `SupplierLeadTimeObservation` + `leadTimeDistribution()` +
`supplierScorecard()`** (R25), backfilled from existing `GoodsReceipt`
history.
**WO-144.7 — `onlineStockFor()`/`assignFulfillingBranch()`** (R26), a read
plus a call into `InventoryService.move()`, unchanged.
**WO-144.8 — permissions**: `planning.propagation.view`, seeded to real
roles; every recommended action continues to require its own existing
permission to execute.

## Acceptance

- `propagate()` called twice with identical graph/shock/forecast inputs
  produces byte-identical output, proven by a spec.
- Every figure in a `narrate()` result strips to zero bare numbers when
  its citations are removed, proven by the mandatory acceptance test.
- `rankActions()` never proposes a candidate with no corresponding real
  graph edge (e.g., a transfer between two locations with no
  `StockTransfer` capability), proven by a spec.
- With `bom`/`transfers` off, `buildDependencyGraph()` simply omits those
  edge types, never errors.
- `assignFulfillingBranch()` decrements stock through the identical
  `InventoryService.move()` call path every other sale already uses —
  proven by tracing the call, never a parallel decrement.

## Out of scope

A trained forecasting model of this repository's own — R21's own demand/
lead-time/payment-delay forecasts are named as *inputs* to this engine,
sourced from whatever forecasting mechanism doc 09's own AI layer already
provides or will provide; this document builds the deterministic
propagation/ranking/narration core, never the forecast models feeding it.
