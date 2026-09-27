# 177 — Where the dependency graph is derivable from invoices and stock, and where it is not — on purpose

> **Status: proposed (2026-09-27), not yet built.** A scope decision, not a
> feature: it states which kinds of SME this program can model truthfully from
> the three things an SME can hand over — purchase invoices, sales invoices,
> and stock positions — and which it deliberately does not onboard in the
> pilot. The one buildable artifact is a derivability assessment computed from
> an SME's own promoted data (§4), so the decision is made per SME from
> evidence, not from a sector label. The rules it applies are already in the
> repository: `RETAIL-ERP.md` R20 ("the graph is whatever the enabled modules can
> express"), doc 144's refusal to project an edge with no real row behind it,
> and doc 172's refusal to invent one from ingested data.

## 1. The graph, edge by edge, against what ingestion can supply

`DependencyGraphService.build()` (`dependency-graph.ts:43–97`) projects exactly
five edge types; demand bands come from sales history. Each needs a specific
kind of source row, and "the SME's data" supplies some and not others:

| Edge / input | Projected from | Ingested record kind (doc 172) | Derivable from purchase invoices + sales invoices + stock? |
|---|---|---|---|
| Supplier → SKU | `SupplierProduct` | `SUPPLIER_ITEM` — from **item-level** purchase-invoice lines | **Yes, if** the SME's purchase invoices carry item lines. Many SMEs book supplier bills as totals against an expense account ("Purchases — 12,400"); a total names no item, so it yields a Supplier → Obligation edge and **no** Supplier → SKU edge |
| RawMaterial → SKU | `BomComponent` (`bom`) | **none** | **No.** A recipe is internal manufacturing knowledge; no invoice or stock export states which components make which product. R20: "If `bom` is off, recipe nodes simply do not exist"; doc 144's code reads `bomComponent` and simply finds no rows |
| SKU → Location | `VariantLocationStock` | `STOCK_POSITION` — a snapshot | **Yes, if** the SME tracks stock in a system that can export on-hand by location. **Not from invoices**: on-hand is never derived as purchases minus sales here — that would ignore shrinkage, returns and opening stock, and invent a figure R21 forbids |
| Location → Location | `StockTransfer` history | **none** (doc 172 out of scope) | **No.** Doc 144's rule: a lateral edge exists only where stock actually moved through this platform |
| Supplier → Obligation | unpaid `SupplierBill` | `SUPPLIER_BILL` | **Yes** — totals suffice |
| Demand (bands) | `StockMovement` `SALE`/`POS_SALE` + `ObservedSale` | `SALE_LINE`, `SALES_INVOICE` lines | **Yes, if** sales are recorded at item level; a POS daily total with no items yields revenue but no demand per SKU |
| Liquidity | `JournalLine` (bank), `Invoice` (AR), `SupplierBill` (AP), `PayRun` | `CASH_BALANCE`, `SALES_INVOICE`, `SUPPLIER_BILL` | **Yes**, with the doc 173 §4 fixes; payroll only if payroll is on the platform (it is not in this program) |

So the graph is derivable **to the extent that an SME's documents are
item-level and its stock is snapshot-able** — a property of the SME's own
record-keeping, which is why §4 measures it per SME instead of assuming it per
sector.

## 2. Where the pilot onboards

| Segment | Why the graph is derivable | What the engine answers for it | Conditions checked in §4 |
|---|---|---|---|
| **Distribution / wholesale** | Item-level purchase invoices are the norm (a distributor re-sells what it buys); stock is tracked because it *is* the business; customer invoices are item-level B2B documents | Supplier outage → stock-out date per SKU per warehouse; AP-delay options; liquidity with real AR | Supplier → SKU coverage; ≥ 1 stock snapshot source |
| **Retail** (single or few branches) | A POS records item-level sales and usually on-hand; purchases from distributors are item-level | Same, per branch; transfers only once they happen on the platform | POS exports item lines; purchase invoices item-level |
| **Trading** (import/resale, moderate FX) | As distribution; foreign suppliers' bills carry currency and — after WO-173.3 — are summed in base | Supplier/lead-time shocks; AP in base currency | Foreign-currency share of AP below the heavy-FX line (§3) |
| **Services** | No stock and no SKU demand by nature; subcontractor bills (Supplier → Obligation) and customer invoices (AR) are derivable | **Liquidity only** (R24) and obligation-level choices (`CashShock` → `DELAY_DISCRETIONARY_AP`). The stock-out half of the engine does not apply, and the screen says so rather than showing an empty table as "no risk" | AR and AP sources connected |

**A services-SME honesty note.** A services business's typical disruption is
"my largest customer pays 60 days late". There is no `CustomerPaysLate` shock
in the `Shock` union (`propagation.ts:3–9`), and this program does not add one
(doc 173 adds only what a real source backs). The honest expression is a
`CashShock` for that customer's outstanding amount, entered by the SME from the
AR list the forecast already shows — a manual input, labelled as such. A typed
AR-delay shock over `Invoice` due dates is a candidate for a later work order
with its source named (`Invoice.contactId`, doc 169 §3.4).

## 3. What the pilot does not onboard, and the evidence for each

| Excluded | Why — in this codebase's own terms | What would have to exist first |
|---|---|---|
| **Manufacturing with real bills of materials** | The graph's RawMaterial → SKU layer comes only from `BomComponent`, which no invoice or stock export supplies (§1). Onboarding a manufacturer anyway would show a component supplier's outage with **no downstream finished goods** — a graph that looks complete and is wrong, which is worse than no graph. The schema also has "no multi-level BOM, routing or BOM versioning" (the lens index's "Stock, place and time") | BOMs authored on the platform (`bom` module, built, single-level) or ingested from an MRP export with its own record kind, mapping and confidence rules — a separate program |
| **Multi-entity groups** | Intercompany elimination (R17) runs only in `accounting`'s consolidation; `FiscalPeriod` has no brand column, "so one close locks every brand" (the lens index); a group's presentation currency has no home (`Organization` has no currency; ruling 15's `FxRate` table does not exist). A du tenant is one legal entity (doc 169 §2) | Per-entity tenants linked at an Organization tier (RETAIL-ERP R14's Organization edition), which is not this pilot |
| **Heavy FX** — foreign-currency sales, multi-currency cash, hedging | No `FxRate` table and no revaluation (the lens index: "no rate source of any kind"); `lineData()` defaults `fxRateScaled` to 1:1; the `FxMove` shock is not built (doc 173 §6). The pilot line: foreign currency appears only on **supplier bills** (booked with their own rate, R16), and the share of AP in foreign currency is reported | ruling 15's `FxRate` table, WO-173.8's `FxMove`, and revaluation — later work |
| **Heavily customised legacy ERPs** | Bespoke fields whose meaning only the vendor or implementer knows cannot be mapped with confidence; frequent schema changes make every batch a drift hold (doc 172 §10); the confidence model would score most records `ADVISORY` and the SME would see a mostly-empty graph after weeks of mapping | An integration partner who owns that ERP's mapping, per system — outside a 10-pattern pilot |
| **SMEs that do not control their own data** — franchisees on a franchisor's system, marketplace sellers whose orders live in the marketplace, businesses whose stock is held by a 3PL without export rights | The SME cannot grant a read connection it does not own; ingesting data it has no right to share has no lawful basis under PDPL (doc 181). Technically possible is not the test | The data owner's own agreement to share, captured as a contract — a commercial matter, not a connector |

**This is scope control, stated before the pilot, not a limitation discovered
in it.** R20 already rules that the graph is "whatever the enabled modules can
express"; doc 144 omitted two illustrative edge types rather than project them
from rows that do not exist; doc 173 generates only action kinds with a named
source. Onboarding SMEs whose operations those rules cannot express would force
the program either to break those rules or to show graphs it knows to be
incomplete. It does neither.

## 4. The derivability assessment — decided per SME, from its own data

Sector labels are a poor proxy: a retailer that books purchases as totals is
less derivable than a well-kept services firm's AR. So after the first confirmed
batches (doc 172 §6), `DerivabilityAssessment` — a pure function in the
`planning` module over promoted data, read by bare Prisma read — computes:

| Measure | Formula (all amounts in base minor units, trailing 90 days) | Pilot threshold |
|---|---|---|
| **Item-level purchase coverage** | Σ `SupplierBill.baseAmountMinor` for bills whose supplier has ≥ 1 `SupplierProduct` edge ÷ Σ `SupplierBill.baseAmountMinor` | ≥ 60% |
| **Stock observability** | locations with a `STOCK_POSITION` promoted within 48 h ÷ locations with sales | ≥ 1 location, and ≥ 50% |
| **Item-level sales coverage** | Σ `ObservedSale.baseRevenueMinor` + native `OrderItem` revenue attributable to a variant ÷ total observed revenue | ≥ 80% |
| **Revenue-linked dependency coverage** | doc 180's definition | ≥ 80% (the program's own target) |
| **Foreign-currency share of AP** | Σ base amount of bills with `currency ≠ BRAND.locale.currency` ÷ Σ all bills | ≤ 40% (above it: heavy-FX exclusion) |
| **BOM dependence** | declared by the SME at onboarding (manufactures from components: yes/no) — the one input that cannot be derived | "no", or a native `bom` setup |

Outcome, shown to the SME in plain words and stored with the tenant's onboarding
milestones (doc 180): **derivable** (all thresholds met — full engine),
**partially derivable** (liquidity and obligations only, e.g. a services SME or
a totals-only bookkeeper — the screen states which half applies), or **not
derivable for this pilot** (an exclusion from §3 applies — the SME is told which
and why, and nothing is shown that implies a complete graph).

## Scope lenses

This document's one artifact is the derivability assessment; ingestion lenses
are in doc 172 and engine lenses in doc 173.

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: no new actor; the assessment runs under
`planning.propagation.view`.
**Whose rows, and which columns** — the assessment is shown to the tenant's own
`planning.propagation.view` holders; the control plane reads only the outcome
class (derivable / partial / not), never the SME's figures.
**The threshold nobody approves alone / The toxic pair / Authority and blast
radius** — the thresholds are program policy in code, versioned
(`derivability-policy-1`); nobody tunes them per tenant.
**Audience is a capability, not an address** — the outcome is shown in-app to
the SME and recorded as a milestone; no message.
**Request or record** — the assessment is a computation; storing its outcome
is a RECORD.
**The movement with no address** — n/a.
**Four hours down, the counter stays open** — n/a: a read.
**The unwritten posting rule / Every column or none / The period that already
moved / The second legal entity** — n/a: no money fact; §3 is where the second
legal entity is excluded.
**Dry run before live** — the assessment is pure; it can run on a prospect's
sample files through doc 172's front half with nothing promoted, before a pilot
slot is offered.
**Click the number** — each percentage links to the bills, locations and sales
it counted.
**Three silhouettes, and the day the tier above appears** — Solo and small
Chain SMEs are in scope; Organization is §3's multi-entity exclusion.
**The absent collaborator** — `connectors` off: the assessment has nothing to
assess and says so; `bom` on with native BOMs: RawMaterial edges exist and the
manufacturing exclusion is lifted for that tenant, by data, not by a flag.
**The second copy of the write** — the stored outcome is keyed per tenant and
policy version; re-running overwrites nothing (a new assessment is a new row).
**The hundred-thousandth row** — aggregate queries over indexed columns
(`SupplierBill [status, dueAt]`, `ObservedSale [variantId, occurredOn]`); run
on demand, not per request.
**The adoption test** — n/a.
**The reversal document / The undo fan-out** — n/a.
**The version stamp** — `derivability-policy-1` stored with each outcome; a
changed threshold is a new version, and old outcomes keep theirs.
**The erasure the ledger cannot obey** — no personal data.
**The failure path, and who is allowed to walk it** — an assessment that cannot
compute a measure (no sales yet) reports that measure as "insufficient data",
never as zero.

## Work orders

**WO-177.1 — `DerivabilityAssessment`** (pure, `planning`), its specs over
fixtures for each §2 segment and each §3 exclusion.
**WO-177.2 — Outcome record and screen**: the SME-facing statement on the
control center's overview (doc 174 question 1), stored with the tenant's
onboarding milestones (doc 180 WO-180.2).
**WO-177.3 — Pre-pilot sample run**: the assessment over a prospect's sample
files through doc 172's pure front half, used in Wave 0 selection (doc 179).
**WO-177.4 — Services mode wording**: when stock measures are empty by nature,
the control center hides the stock-out half and says why, instead of rendering
"no risk".

## Acceptance

- A totals-only bookkeeper's data yields item-level purchase coverage < 60% and
  the outcome "partially derivable — liquidity and obligations only".
- A fixture with component suppliers and no BOM rows is assessed "not derivable
  for this pilot" with the manufacturing reason, not "derivable".
- No screen shows a stock-out projection for an SME assessed "partially
  derivable" on the stock half.
- Every percentage drills down to the rows it counted.

## Out of scope

Ingesting BOMs, MRP data or external transfer history; multi-entity
consolidation; FX revaluation; mapping bespoke ERPs; a typed customer-late-payment
shock (named in §2 for a later work order).
