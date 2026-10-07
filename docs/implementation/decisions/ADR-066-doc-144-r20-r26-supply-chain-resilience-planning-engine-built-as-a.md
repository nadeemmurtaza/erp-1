# ADR-066 — Doc 144 (R20–R26 supply-chain resilience planning engine): built as a pure read/recommendation engine, generating only the two action kinds this graph has real data to back

[← Decision log](../DECISIONS.md)


### Context

`RETAIL-ERP.md` names seven complete architecture rules (R20–R26) — a
dependency graph, shock propagation, action ranking, GenAI narration,
liquidity forecasting, supplier lead-time distributions, and an online-
stock read model — with no code anywhere implementing any of them. This
was, by the doc's own words, "the single largest gap between what this
repository has already designed and what it has actually built." The
owner asked to build both doc 14 (already found built) and doc 144 in
the same pass; doc 144 is this ADR's own subject.

### Options Considered

1. **Build the full R20–R26 sketch literally, including its illustrative
   edge types and all nine named action kinds.** Rejected in part: two of
   the sketch's own illustrative dependency-graph edges ("SKU → Channel at
   Location" via a `LocationAssortment` model, "Sale → Cash account" via
   `JournalLine`) have no real, already-shipped row to project from in
   this actual schema — building them would mean inventing a projection,
   the exact thing R21's own "never invented, never guessed" rule forbids.
   Likewise, seven of R22's nine named action kinds (`EXPEDITE_PO`,
   `SPLIT_PO_ALTERNATE_SUPPLIER`, `SUBSTITUTE_SKU`,
   `REALLOCATE_ONLINE_BUFFER`, `DELIST_AT_LOCATION`,
   `MARKDOWN_TRAPPED_STOCK`, `RAISE_PRICE`) need data this graph does not
   project (an alternate-supplier PO split, a substitute-SKU mapping,
   markdown price elasticity) — generating them today would mean
   fabricating a recommendation with no real backing edge.
2. **Skip the whole document as "too large" and defer it entirely.**
   Rejected — the owner explicitly asked for it, and five of the seven
   architecture rules (R20, R21, R24, R25, R26) map cleanly onto real,
   already-shipped tables with no invented data required; only R22's own
   full action-kind catalogue and two of R20's own illustrative edges
   needed honest scoping, not the whole document.
3. **Build every function complete, generate every action kind with best-
   effort heuristics for the ones lacking real data.** Rejected — a
   "best-effort" `MARKDOWN_TRAPPED_STOCK` candidate with no real price-
   elasticity model behind it is exactly the "free-text suggestion an LLM
   invents" R22 explicitly refuses to be; a recommendation engine that
   sometimes fabricates its own inputs is worse than one that honestly
   says a capability is not there yet.
4. **Build every function this document names, generate only the action
   kinds with real, already-shipped backing data, and name the rest as
   forward-extensible but ungenerated.** Chosen.

### Decision

Built in full as a new, always-on `planning` module
(`apps/api/src/modules/supply-chain/planning/`): `DependencyGraphService.build()`
(R20) projects five real edge types — Supplier→SKU (`SupplierProduct`),
RawMaterial→SKU (`BomComponent`, extending the document's own type union
since this schema's raw materials are a distinct model from a finished
SKU, never conflated), SKU→Location (`VariantLocationStock`), Location→
Location (real `StockTransfer` history only — never a blanket "any two
locations may transfer" assumption), and Supplier→Obligation (unpaid
`SupplierBill`s). `propagate()` (R21) and `rankActions()` (R22) are pure
functions — no `prisma.*` call, no side effect, identical inputs produce
byte-identical output, proven by spec — with `rankActions()` generating
only `TRANSFER_STOCK` and `DELAY_DISCRETIONARY_AP`, the two action kinds
this graph has real data to back; the other seven are named in the
`CandidateActionKind` type for forward extensibility but never generated.
`NarrationService.narrate()` (R23) adds `AiFeature.PLANNING_NARRATION`
and refuses any narration whose text contains a standalone number outside
the exact figures it was handed — `assertNoOriginatedFigures()`,
word-boundary-matched so a bare entity id ("l1", "v42") is never mistaken
for an originated figure. `LiquidityForecastService.forecast()` (R24)
reads `JournalLine`/`Invoice`/`SupplierBill`/`PayRun` directly, including
a real `cashConversionCycleDays` computed as DIO+DSO-DPO from the same
tables. `SupplierLeadTimeObservation` + `SupplierResilienceService` (R25)
backfill automatically from the existing `GoodsReceived` domain event;
`supplierScorecard()`'s own `defectRatePct` is honestly `null` — no
quality/defect field exists anywhere in this schema, never fabricated.
`OnlineStockService` (R26) provides `onlineStockFor()` (a pure sum of
branch allotments) and `assignFulfillingBranch()` — the one place this
document writes, reversing and re-committing stock through the identical
`InventoryService.move()` writer every sale already uses, a new
`planning -> inventory` entry in `KNOWN_MODULE_COUPLINGS`. Permission
`planning.propagation.view` (Purchasing category) seeded to ADMIN; UI at
`/admin/resilience` (shock-scenario runner, liquidity forecast, supplier
scorecard lookup), reachable from the Stock nav group.

One further deviation beyond the two named above:
`assignFulfillingBranch()` is honestly a REASSIGNMENT, not a first-time
decrement from an unassigned state as the document's own pseudocode
assumed — this codebase's real order-placement flow already resolves and
decrements a real `locationId` at placement time, so assigning a
fulfilling branch reverses the existing commitment and re-commits it
elsewhere, never a second, competing decrement.

### Reasoning

R21 and R22 both state, in their own words, that a candidate or a
propagated figure must never be invented or guessed — that rule cannot
apply to every OTHER part of this document and stop applying to this
document's own scope-completeness. An engine that fabricates a
`MARKDOWN_TRAPPED_STOCK` recommendation with no real elasticity model
behind it, or a `Location -> Channel` edge with no `LocationAssortment`
row to back it, would be a worse violation of R20–R23's own stated
philosophy than simply not generating that piece yet. Naming the
remaining action kinds in the type (rather than omitting them entirely)
keeps the door open for a future work order to extend `rankActions()`
the moment a real data source exists — House Rule 1's own "adding a
sector adds a folder" instinct applied to a recommendation engine instead
of a sector pack.

### Consequences

- A new client with real purchase-order/goods-receipt/stock-transfer
  history gains a working resilience report and liquidity forecast with
  zero code changes — the engine is a pure projection over rows it
  already writes for other reasons.
- `rankActions()`'s own coverage is honestly partial (2 of 9 action
  kinds) — a future work order extending it to `EXPEDITE_PO` or
  `SUBSTITUTE_SKU` needs a real data source for that kind first (an
  alternate-supplier mapping, a substitute-SKU table), not a heuristic
  bolted onto the existing function.
- `assertNoOriginatedFigures()`'s word-boundary matching means a
  narration is free to name a location or variant id in prose without
  being wrongly refused — verified by spec against the exact failure mode
  a naive digit-anywhere check would have hit.
- `docs/implementation/resilience-scalability/144-supply-chain-resilience-planning-engine.md`
  carries its own Status blockquote naming every real file and all three
  deviations above, the same discipline this session applies to every
  other document's own build.
- 9 new spec files cover the document's own Acceptance criteria directly:
  `propagate()`'s determinism, `rankActions()`'s "never a candidate with
  no real edge," the citation-stripping refusal, `buildDependencyGraph()`'s
  omission of edge types when the underlying rows are absent, and
  `assignFulfillingBranch()`'s own call-path proof against
  `InventoryService.move()`.
- `pnpm index` must be regenerated (new module, new routes, new
  permission, new screen) and `docs/implementation/README.md`'s own entry
  updated to state exactly what shipped.

### Status
**Accepted.**
