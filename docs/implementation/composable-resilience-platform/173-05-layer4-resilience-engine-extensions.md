# 173 — Layer 4: the resilience engine, extended — confidence-partitioned propagation, a currency-neutral cost field, and an honest count of which actions gain real data

> **Status: proposed (2026-09-27), not yet built. The base engine below is
> already built per doc 144** (`apps/api/src/modules/planning/`, ADR-066);
> this document specifies the extension only. It changes no guarantee doc 144
> proves: `propagate()` and `rankActions()` stay pure and deterministic, every
> candidate stays generated from a real edge, every narrated figure stays a
> citation. It adds four things: confidence carried from ingestion (doc 172)
> into the arithmetic by **partitioning** the graph rather than by
> discounting quantities; the rename of `rupeesSpentMinor` to the
> currency-neutral `cashSpentMinor` (plus the "paisa" literals beside it);
> three currency- and honesty-correctness fixes to the shipped liquidity and
> obligation code; and revenue at risk. It also counts, action kind by action
> kind, which of R22's nine gain a real data source — and finds one more than
> ADR-066 did, from evidence already in the schema.

## 1. What does not change

| Guarantee (doc 144) | Proven by | After this document |
|---|---|---|
| `propagate()` is pure and deterministic | `propagation.spec.ts` | Unchanged; the extension adds a pure pre-partition step outside it and one optional passthrough field |
| `rankActions()` never proposes a candidate with no real edge | `action-ranking.spec.ts` | Unchanged; every new candidate kind below names its edge |
| No narration shows a figure it was not handed | `NarrationService.assertNoOriginatedFigures()` (`narration.service.ts:87`) | Unchanged; citations are built from the same formatter the prompt uses (§3.3) |
| The graph is a projection, never stored | `DependencyGraphService.build()` (`dependency-graph.ts:43`) | Unchanged; provenance is read at build time, never persisted into a graph table |
| The engine writes nothing but `SupplierLeadTimeObservation` and `assignFulfillingBranch()`'s stock reassignment | the module's own code | Unchanged here; doc 174 adds `planning.prisma`'s run/decision records |

## 2. Confidence-weighted edges — carried by partition, never by multiplication

### 2.1 Why not multiply

The obvious implementation — scale an edge's weight by its confidence, so a
0.8-confidence snapshot of 100 units contributes 80 — would invent a meaning
the score never had. Doc 172 §5's score says how much the *record* can be
trusted (its match, its completeness, its freshness); it says nothing about
the *distribution of the quantity*. R21 is explicit that propagation is
"arithmetic, not inference", and "a prediction that cannot be explained or
reproduced has no business driving a purchase order". A discounted quantity
is exactly such a prediction.

### 2.2 What the graph carries instead

```ts
// planning/dependency-graph.ts — additive, optional field (existing
// consumers that ignore it are unaffected)
export type EdgeProvenance =
  | { kind: 'NATIVE' }                                   // written by this platform's own services
  | { kind: 'INGESTED'; tier: 'SIMULATION' | 'WARNING';  // doc 172 §5 — ADVISORY/EXCLUDED never reach the graph
      confidenceBps: number;                              // the MINIMUM over every record composing the edge
      linkIds: string[] };                                // the ExternalRecordLink rows — "click the number"

export interface DependencyEdge {
  from: GraphNode;
  to: GraphNode;
  weight?: number;
  provenance?: EdgeProvenance;   // new — absent means NATIVE, so every existing spec still holds
}
```

`DependencyGraphService.build()` resolves provenance with **one extra query per
canonical entity type** it already reads — `ExternalRecordLink` where
`ourEntityType` is the model name and `ourEntityId` is in the ids it just
fetched, `isSystemOfRecord = true`, using the `[ourEntityType, ourEntityId]`
index doc 169 §4 adds. An edge's provenance is the **minimum** tier and
confidence of its composing records: a `SupplierProduct` edge from a
`WARNING` supplier record and a `SIMULATION` item record is `WARNING`. An
entity with no system-of-record link is `NATIVE`.

### 2.3 Two pure runs, one headline

`PlanningService.runPropagation()` — the orchestrator, already "the only place
in this module that touches Prisma for the propagation path"
(`planning.service.ts:19–25`) — partitions before it calls the pure functions:

```ts
const confirmed   = edges.filter((e) => !e.provenance || e.provenance.kind === 'NATIVE' || e.provenance.tier === 'SIMULATION');
const withWarning = edges; // everything that reached the graph: NATIVE + SIMULATION + WARNING

const headline = propagate(withWarning, shock, forecasts);   // pure
const baseline = propagate(confirmed,   shock, forecasts);   // pure
```

- **The headline is the run that includes `WARNING` data**, because doc 172's
  tier table says `WARNING` data is "used in simulation with a warning" — used,
  not hidden.
- **Every result row carries `lowestTier`** — the minimum provenance over the
  edges that contributed to it (its SKU→Location stock edge and its
  Supplier→SKU edges). `propagate()` gains this as a pure passthrough computed
  from the edges it already iterates; a graph with no provenance produces rows
  with `lowestTier: 'NATIVE'` and otherwise byte-identical output, which the
  existing determinism spec is extended to assert.
- **The delta between `headline` and `baseline` is itself shown** — "3 of the
  12 at-risk products are at risk only because of data held at warning; here is
  which" — so the SME sees exactly how much of the story rests on uncertain
  data, with every such row linking to the records that made it uncertain.
- **`ADVISORY` data never enters either run.** The control center shows it as a
  coverage gap instead — a count and value of `IngestionRecord`s held at
  advisory per kind, read from `connectors.prisma` by bare Prisma read, linking
  to review (doc 174 question 1).
- **Demand bands inherit provenance too.** `buildDemandForecasts()` now reads
  `ObservedSale` (doc 169 §6) alongside `StockMovement` `SALE`/`POS_SALE`
  (`planning.service.ts:10`, `:55–58`) — for each (location, day) from exactly
  one source, the one the system-of-record window names — and a variant's
  `DemandBand` is tagged with the lowest tier of the observations it came from.
  The existing ±30% band (`DEMAND_BAND_SPREAD`) is unchanged and is still
  labelled a heuristic, never a modelled variance.

### 2.4 What ranking and narration do with it

- `rankActions()` stamps each candidate with the minimum provenance of its
  `sourceEdges` and sets `requiresAcknowledgement: true` when that is
  `WARNING`; doc 174 will not record an Accept on such a candidate without the
  decider acknowledging the named uncertain records.
- `NarrationService` is handed the tier of each figure as a label ("based on
  data held at warning") — never a confidence *number* it was not also handed
  as a citation — so `assertNoOriginatedFigures()` still passes only
  narrations that cite.

## 3. `rupeesSpentMinor` — the finding, the rename, and every call site

### 3.1 The finding

`CandidateAction` (`action-ranking.ts:27–37`) is the engine's money-bearing
output type. One of its two money fields is named after a currency:

```ts
export interface CandidateAction {
  kind: CandidateActionKind;
  description: string;
  cashPreservedMinor: number;
  rupeesSpentMinor: number;   // action-ranking.ts:31
  score: number;
  …
}
```

Law 1 ("No hardcoding… currency… resolves through
`packages/shared/src/brand.ts`") is about exactly this. Currency is a value —
`BRAND.locale.currency` (`brand.ts:105`, ISO 4217) with
`BRAND.locale.minorUnitsPerMajor` (`brand.ts:112`, "100 for
rupees/dollars/dirhams") — and every amount in the database is "an integer of
these". A field whose name says rupees, in an AED deployment, holds fils and
tells every reader, API consumer and model prompt otherwise. It is invisible
to `pnpm check:rebrand`, which derives its search terms from `brand.ts`'s
identity and contact fields, not its currency (`scripts/check-rebrand.mjs:77–137`).
It descends from `RETAIL-ERP.md` R22's own heading, "Rank actions by cash
preserved per rupee spent" — the document of record baked the currency into
the architecture rule, and the code followed.

### 3.2 The new name, and why not the one the brief suggested

**`cashSpentMinor`.** The field is the cash cost of *executing* the action —
the denominator of R22's "cash preserved per unit of cash spent" — the exact
mirror of its sibling `cashPreservedMinor`. The program brief suggested
`amountAtRiskMinor` "or equivalent"; that name would invert the meaning (the
amount at risk is what the shock threatens, not what the remedy costs) and
collide with doc 144's own propagation vocabulary, where
`revenueAtRiskMinor`/`cashAtRiskMinor` name the exposure (doc 144 §2). The
equivalent that preserves meaning is `cashSpentMinor`.

### 3.3 Every call site

| # | Location | Today | After |
|---|---|---|---|
| 1 | `apps/api/src/modules/planning/action-ranking.ts:31` | `rupeesSpentMinor: number;` | `cashSpentMinor: number \| null;` (the `null` is §3.4, a separate work order) |
| 2 | `action-ranking.ts:82` | `const rupeesSpentMinor = 0;` | `const cashSpentMinor = …` (see §3.4) |
| 3 | `action-ranking.ts:88` | `rupeesSpentMinor,` | `cashSpentMinor,` |
| 4 | `action-ranking.ts:89` | `score: rupeesSpentMinor > 0 ? cashPreservedMinor / rupeesSpentMinor : cashPreservedMinor,` | `score: cashSpentMinor && cashSpentMinor > 0 ? … : …` per §3.4 |
| 5 | `action-ranking.ts:104` | description: `` `… preserving ${amountMinor} paisa of cash.` `` | a structured description; the amount rendered with `formatMoney()` (`packages/shared/src/constants.ts:137`), never a unit word |
| 6 | `action-ranking.ts:106` | `rupeesSpentMinor: 0,` | `cashSpentMinor: 0,` (delaying a payment genuinely costs nothing now) |
| 7 | `apps/api/src/modules/planning/narration.service.ts:63` | `citations.push({ value: String(action.rupeesSpentMinor) });` | citations built from `formatMoney(action.cashSpentMinor)` — the same string the prompt shows |
| 8 | `narration.service.ts:75` | prompt line `` `${a.kind}: preserves ${a.cashPreservedMinor} paisa, costs ${a.rupeesSpentMinor} paisa` `` | `` `${a.kind}: preserves ${formatMoney(a.cashPreservedMinor)}, costs ${fmt(a.cashSpentMinor)}` `` with `fmt(null) = 'cost not modelled'` |
| 9 | `apps/api/src/modules/planning/narration.service.spec.ts:16` | fixture `rupeesSpentMinor: 0` | `cashSpentMinor: 0` |
| 10 | `narration.service.spec.ts:35`, `:42` | fixture texts "…preserves 5000 paisa" / "99999 paisa" | fixtures re-written around formatted citations; the refusal case keeps an originated figure so the spec still proves refusal |
| 11 | `apps/web/src/app/(admin)/admin/(app)/resilience/page.tsx:33` | `rupeesSpentMinor: number;` | `cashSpentMinor: number \| null;` |
| 12 | `resilience/page.tsx:258` | `formatMoney(a.rupeesSpentMinor)` | `a.cashSpentMinor === null ? t('costNotModelled') : formatMoney(a.cashSpentMinor)` |
| 13 | `docs/implementation/resilience-scalability/144-supply-chain-resilience-planning-engine.md:144–145` | the §3 sketch's `rupeesSpentMinor` and the `score` comment | updated **by the PR that lands WO-173.1**, with a dated note; not edited by this document set, which may not touch other documents |
| 14 | `docs/implementation/RETAIL-ERP.md` R22 heading "per rupee spent" | — | a wording change to the document of record — **the owner's decision**, flagged, not made here |

`grep -rn "rupeesSpentMinor" apps packages docs` (excluding `docs/index/`, which
regenerates, and this document set, which quotes it) returns exactly rows 1–4,
6–9 and 11–13 today — rows 5 and 10 carry only the word "paisa", row 14
only "rupee". After WO-173.1 it returns nothing outside those quotations.

**The API field is a contract.** `POST /admin/planning/propagate` returns
`rankedActions[]`, and `planning.propagation.view` is delegatable, so a
personal API key (doc 163) — an agent, a script — may already read
`rupeesSpentMinor`. Doc 37 §1: removing a field is a breaking change. So
WO-173.1 renames internally and in the web page, and the controller's response
carries **both** `cashSpentMinor` and a deprecated `rupeesSpentMinor` (same
value) for one release window, the deprecation recorded with a removal
criterion ("removed in the first release after <date>; zero personal-key calls
reading it in the trailing 30 days"), then drops the alias. Doc 37's
header mechanism is per-version, not per-field, so the deprecation is stated in
`SDK-CONTRACT.md`'s changelog, not a `Sunset` header.

### 3.4 A separate fix the rename exposes: unknown cost is not zero cost

`rankActions()` sets a transfer's cost to `0` because "No real freight-cost
model here yet… named honestly rather than assumed as zero-cost"
(`action-ranking.ts:79–82`) — and then scores it as if it were free
(`score: rupeesSpentMinor > 0 ? … : cashPreservedMinor`, `:89`). Honest in the
comment, not in the arithmetic: an unknown-cost transfer outranks a known,
cheap alternative. This is a behaviour change, so it is its **own** work order
(WO-173.2), never bundled into the mechanical rename:

- `cashSpentMinor: null` means "cost not modelled"; `0` means "costs nothing
  now" (delaying a payment).
- Candidates with a known cost are ranked by `cashPreservedMinor /
  cashSpentMinor` (and by `cashPreservedMinor` when the known cost is `0`);
  candidates with an unknown cost are ranked in **a separate band after them**,
  by `cashPreservedMinor`, and labelled "cost not modelled" everywhere they
  appear. The two bands are never interleaved, because no shared scale exists
  between them.
- Tie-break toward reversibility (`reversibilityRank`) is unchanged within
  each band.

## 4. Three correctness fixes the UAE surfaces in shipped code

### 4.1 AP amounts are summed across currencies

`SupplierBill.amount`/`amountPaid` are "in `currency` below — the supplier's
own invoiced amount, not necessarily the base currency" (`purchasing.prisma`),
and `baseAmountMinor` holds the base-currency figure "computed once at
creation". Two shipped expressions ignore it:

- the Obligation edge weight, `weight: bill.amount - bill.amountPaid`
  (`dependency-graph.ts:92`);
- the AP outflows, `amountMinor: b.amount - b.amountPaid`
  (`liquidity-forecast.service.ts:76–78`), and the DPO term's
  `averageApMinor` (`:90`).

A UAE trading SME with USD and CNY suppliers would have its cash position
summed in three currencies. The fix reads outstanding **in base**:
`outstandingBase = baseAmountMinor × (amount − amountPaid) / amount`, with the
rounding written once in `packages/shared` beside `convertToBase()`
(`pricing.ts:260`) — R16's own "rounding rule written once… called by API,
web and till alike". Both call sites use it; a spec with a USD bill proves the
edge weight and the outflow are in AED.

### 4.2 The AR leg reads a different source from the ledger's own aged receivables

`LiquidityForecastService.forecast()` reads AR inflows from `Invoice` rows with
`status: 'ISSUED'` (`:42–45`) — the trading-partner MVP — while the ledger's own
`agedReceivables()` reads `JournalLine` on account `1100` by `contactId`
(`gl-reports.service.ts:228–249`), and `receivables.prisma`'s header says the
real AR "keys off `Contact`/`Order`, not `Invoice`". Two screens, two AR
figures, no stated authority — the "click the number" lens's own failure.

The fix states the authority per tenant configuration, without a conditional on
anything but data: when `JournalLine` rows exist on account `1100` (a live
ledger), AR comes from them, aged by due date through the same FIFO the ledger
report uses — read by bare account code, exactly as the service already reads
`'4000'`/`'5000'` (`liquidity-forecast.service.ts:19–20`); otherwise from
`Invoice` (native trading-partner invoices and mirrored customer invoices, doc
169 §3.4). `Invoice` has `currency` but no R16 base columns, so a
non-base-currency `Invoice` is **excluded from the sum and reported as a named
figure** ("AR not converted: 2 invoices, USD") rather than added at 1:1 — until
`Invoice` gains R16's columns in doc 181's e-invoicing work.

### 4.3 "No cash data" is reported as zero cash

`currentCashMinor` is the sum of bank-account `JournalLine`s (`:38–41`, `:69`).
With `accounting` off — every connect-only tenant (doc 169 §5) — that sum is
`0`, and the forecast reports an SME with no ledger as an SME with no money.
The fix:

```ts
export interface LiquidityForecast {
  currentCashMinor: number | null;          // null: no source — never 0 standing in for "unknown"
  cashSource: 'LEDGER' | 'OBSERVED_BALANCE' | 'UNKNOWN';
  cashAsOf: Date | null;                    // the balance's own as-of time
  …
}
```

Source order: ledger bank lines when any exist; else the latest
`ObservedCashBalance` per `externalAccountRef` (doc 169 §6), summed in base
currency, with `cashAsOf` the oldest of them; else `null` with `UNKNOWN`. The
control center renders "cash position unknown — connect a bank feed", never
"0".

## 5. Revenue and margin at risk — the figures doc 144's prose promised

Doc 144 §2 shows each propagation row carrying `revenueAtRiskMinor`,
`marginAtRiskMinor` and `cashAtRiskMinor`. The shipped `SkuLocationRiskRow`
(`propagation.ts:27–34`) carries none of them — a deviation doc 144's own "two
honest deviations" does not list. The control center's third question ("how
much money") needs them. Added as pure arithmetic over inputs the orchestrator
already resolves:

- `revenueAtRiskMinor = unmetDemandUnitsPerDay × horizonDays × unitPriceMinor`,
  where `unitPriceMinor` is the variant's effective price the orchestrator
  already reads (`priceOverride ?? product.basePrice`,
  `planning.service.ts:94–106`) — passed in, never looked up inside
  `propagate()`.
- `marginAtRiskMinor` = the same units × the `marginMinor` `VariantEconomics`
  already carries.
- **`cashAtRiskMinor` is named and not computed.** Cash at risk differs from
  revenue at risk by *when* the revenue would have been collected, which
  depends on each channel's payment terms; no per-channel terms exist in the
  schema. The row carries `cashAtRiskMinor: null` with the reason in the type's
  doc comment, rather than a figure equal to revenue that would look computed.

## 6. Three more deviations of the shipped code from doc 144's prose

Recorded here because doc 144's status block lists two deviations and these are
not among them. None is a defect in what shipped; each is a place a reader of
doc 144 would expect something the code does not do.

1. **No `FxMove` shock.** Doc 144 §2's `Shock` union has
   `{ kind: 'FxMove'; currency; pctChange }`; the shipped union
   (`propagation.ts:3–9`) and `RunPropagationDto`'s `SHOCK_KINDS` omit it.
   It is buildable deterministically once §4.1 lands — AP obligations in the
   named currency, re-based at `(1 + pct)` — and is WO-173.8, sequenced after
   the currency fixes and outside the pilot (heavy FX is excluded, doc 177).
2. **`DemandShock` takes one `variantId`**, not doc 144's
   `scope: { skuId?, categoryId? }`. Kept as shipped; a category scope is a
   later, additive DTO field.
3. **No revenue/margin/cash at risk** — §5 above.

And one inherited, not new: `DependencyGraphService.build()` takes no
`organizationId` or location scope, while doc 144's own scope-lens text says
"`buildDependencyGraph()` never spans organizations". Under doc 39 every du SME
is its own database, so cross-SME isolation holds by construction; within a
multi-branch SME, branch-scoped reads are unenforced here exactly as
`ENTERPRISE-SCALE.md`'s L2 gap says they are everywhere else. Named, not fixed
by this program.

## 7. R22's nine action kinds — which gain a real source, honestly

Doc 144 and ADR-066 generate two kinds because "only two… this graph has real,
shipped data to back", and set the condition for the rest: "a future work
order extending it… needs a real data source for that kind first". The table
applies that condition kind by kind, under external ingestion. No kind is
added to `CandidateActionKind`.

| Kind | Generated today | Real source under this program | After this program |
|---|---|---|---|
| `TRANSFER_STOCK` | **Yes** | `VariantLocationStock` (now also from mirrored `STOCK_POSITION`s) + `StockTransfer` history | Unchanged. **Honest limit:** an ingested-only multi-branch SME has *no* `Location → Location` edges — doc 144's own rule is that a lateral edge exists only where stock has actually moved between two locations through this platform — so it gets no transfer candidates until it transfers on the platform. Ingesting an external POS's transfer history as edges is out of scope (doc 172), not faked |
| `DELAY_DISCRETIONARY_AP` | **Yes** | Unpaid `SupplierBill`s (now also mirrored AP from the accounting connector) | Generated, **and made less naive**: today every unpaid bill is proposed, because nothing marks a bill "discretionary". WO-173.6 excludes a bill whose supplier is the **only** Supplier→SKU edge for a variant that is itself at risk in this propagation — deterministic, from edges already in the graph. Delaying the one supplier who can refill a stock-out is the recommendation most likely to hurt |
| `SPLIT_PO_ALTERNATE_SUPPLIER` | No | **`SupplierProduct` already is the alternate-supplier map** — `@@unique([supplierId, variantId])` with `lastCost`, `leadTimeDays`, `isPreferred`, and the graph already carries every one as a Supplier→SKU edge. Ingested purchase invoices from several suppliers of the same item populate it further | **Generated (WO-173.7).** For a row short because its supplier is down or slipping: each *other* Supplier→SKU edge for the variant whose lead time (`SupplierResilienceService.leadTimeDistribution()` mean, else `SupplierProduct.leadTimeDays`, else `Supplier.leadTimeDays`) beats `stockoutInDays`; `cashPreservedMinor = units × marginMinor`; `cashSpentMinor = units × (alternate lastCost − preferred lastCost)` in base, or `null` if either cost is 0 ("never received", per `ProductVariant.costPrice`'s own doc comment). This fulfils ADR-066's stated condition with a source that was already shipped; it does not reopen ADR-066 |
| `MARKDOWN_TRAPPED_STOCK` | No | `MarkdownSuggestion` rows (WO-9.8, `inventory.prisma`) — a shipped, labelled estimate driven by the `MarkdownVelocityMultiplierPer10Pct` setting | **Not generated in this program.** The rows exist only where `VariantSalesStat` is computed from *native* sales; a connect-only tenant has none. Where they exist, their cash figure is an assumption-driven estimate unlike every other figure the engine emits — admissible under R21 only as a labelled input, which the tier model (§2) has no honest slot for yet. Named for a later work order with that slot designed first |
| `EXPEDITE_PO` | No | Open `PurchaseOrder`s with `expectedAt` exist natively; **no field anywhere says a supplier can deliver faster, or at what cost** | Not generated |
| `SUBSTITUTE_SKU` | No | None. `ProductCrossSell`'s kinds (`MANUAL`, `CO_OCCURRENCE`, `EMBEDDING`) are complements and similarity, not substitutes; reading them as substitutes would be inventing | Not generated |
| `REALLOCATE_ONLINE_BUFFER` | No | None by design: R26 has "no separate online reservation ledger"; reallocating an allotment *is* a transfer | Not generated (subsumed by `TRANSFER_STOCK`) |
| `DELIST_AT_LOCATION` | No | Needs an assortment/ranging table; `LocationAssortment` does not exist (doc 144's own omission) | Not generated |
| `RAISE_PRICE` | No | Needs price elasticity; no source | Not generated |

Net: **two kinds today, three after this program**, each with its source named.

## Scope lenses

The engine remains a read/recommendation layer, so most lenses keep doc 144's
own answers, restated only where this extension changes them. Ingestion-side
lenses are in doc 172.

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: no new actor; the engine runs under
`planning.propagation.view`.
**Whose rows, and which columns** — unchanged from doc 144 (tenant = database);
the new provenance fields expose `linkIds` only to holders of
`planning.propagation.view`, and the records behind them only through
`connectors.ingestion.review`.
**The threshold nobody approves alone** — n/a: the engine recommends; the
threshold sits on the owning module's own act (doc 174).
**The toxic pair, caught at grant or at act** — n/a: no new permission here
(doc 174 owns `planning.recommendations.decide`).
**Authority and blast radius** — the partition thresholds are doc 172's fixed
tiers, not a tunable; the worst misconfiguration available is none at runtime.
**Audience is a capability, not an address** — unchanged from doc 144.
**Request or record — classify every write** — n/a: no new write; the pure
functions write nothing.
**The movement with no address** — n/a: no movement.
**Four hours down, the counter stays open** — the engine down: no report, no
effect on trading (doc 144). The connectors down: the engine runs on the last
promoted data and says how old it is (§2.3, doc 172 §7).
**The unwritten posting rule / Every column or none / The period that already
moved / The second legal entity** — n/a: the engine posts nothing; §4 changes
which rows and which *base* amounts it reads.
**Dry run before live** — both runs are pure; the extension adds one pure
pre-partition step and keeps the "deciding function… holds no write" property.
**Click the number** — every row's `lowestTier` resolves through `linkIds` to
the records that set it; revenue at risk resolves to the units and the price
it multiplied; an AR figure states whether it came from the ledger or from
invoices (§4.2).
**Three silhouettes, and the day the tier above appears** — unchanged from doc
144.
**The absent collaborator** — `connectors` off: no edge has provenance, every
row is `NATIVE`, output is byte-identical to today's; `accounting` off: cash
from observed balances or `UNKNOWN`, never 0.
**The second copy of the write** — n/a: no write.
**The hundred-thousandth row** — provenance adds one indexed query per entity
type per build; two `propagate()` calls double the CPU of a pure function over
the same edge list (10,000 SKUs × 3 locations ≈ 30,000 stock edges: two linear
passes); `ObservedSale` demand reads are `[variantId, occurredOn]`-indexed.
**The adoption test** — n/a: no generated code.
**The reversal document / The undo fan-out** — n/a: nothing written to reverse.
**The version stamp** — a persisted run (doc 174) records the confidence policy
and mapping versions its provenance came from; re-running later on changed data
is a new run, never a recomputed old one.
**The erasure the ledger cannot obey** — n/a: suppliers, SKUs, locations and
amounts only.
**The failure path, and who is allowed to walk it** — a provenance query
failure fails the whole run closed with an error, never silently treating
ingested edges as native.

## Work orders

**WO-173.1 — The rename.** `rupeesSpentMinor` → `cashSpentMinor` at every call
site in §3.3's table; "paisa" removed from the prompt and the description;
citations built from `formatMoney()`; the response alias for one release window;
doc 144's §3 sketch updated in the same PR. Mechanical, behaviour-preserving,
specs updated.
**WO-173.2 — Unknown cost is not zero cost** (§3.4), with a spec in which a
known-cheap candidate outranks an unknown-cost one.
**WO-173.3 — AP in base currency** (§4.1): shared rounding helper, both call
sites, a USD-bill spec.
**WO-173.4 — AR authority and honest cash** (§4.2, §4.3): ledger-first AR,
excluded-currency reporting, `currentCashMinor: number | null` +
`cashSource`, `ObservedCashBalance` read.
**WO-173.5 — Provenance and the partitioned run** (§2): `EdgeProvenance`,
`build()`'s provenance queries, the two runs, `lowestTier`, demand bands from
`ObservedSale`, the extended determinism spec.
**WO-173.6 — Sole-source guard on `DELAY_DISCRETIONARY_AP`.**
**WO-173.7 — `SPLIT_PO_ALTERNATE_SUPPLIER` generation** from `SupplierProduct`
edges, with a spec proving no candidate appears where only one supplier edge
exists.
**WO-173.8 — `FxMove` shock** (after WO-173.3; outside the pilot).
**WO-173.9 — Revenue and margin at risk** (§5), `cashAtRiskMinor: null` with its
reason.

## Acceptance

- For a graph with no ingested data, `runPropagation()`'s output is
  byte-identical before and after WO-173.5 except for the added
  `lowestTier: 'NATIVE'` field — proven by spec.
- A stock edge built from a `WARNING`-tier snapshot appears in the headline run,
  is absent from the baseline run, and every row it touches has
  `lowestTier: 'WARNING'`.
- No code path multiplies a quantity or amount by a confidence value — asserted
  by a spec over `propagate()`'s inputs and outputs, and by review.
- `grep -rn "rupeesSpentMinor\|paisa" apps/api/src/modules/planning` returns
  nothing after WO-173.1 except the one deprecated response alias, which is
  gone after its window.
- A USD supplier bill contributes its AED `baseAmountMinor` share to both the
  Obligation edge and the AP outflow.
- With `accounting` off and no bank feed, `currentCashMinor` is `null` and
  `cashSource` is `UNKNOWN`.
- `rankActions()` generates `SPLIT_PO_ALTERNATE_SUPPLIER` only where a second
  Supplier→SKU edge exists whose lead time beats the stockout.

## Out of scope

A trained forecasting model (doc 144's own out-of-scope, unchanged).
`MARKDOWN_TRAPPED_STOCK`, `EXPEDITE_PO`, `SUBSTITUTE_SKU`, `DELIST_AT_LOCATION`,
`RAISE_PRICE` generation (§7, each with its reason). Cash at risk (§5).
Branch-scoped planning reads (ENTERPRISE-SCALE L2, inherited). Editing
`RETAIL-ERP.md` R22's wording (the owner's call).
