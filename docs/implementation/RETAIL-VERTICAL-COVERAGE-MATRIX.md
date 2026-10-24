# Retail vertical coverage matrix

**What this is.** The strategic question behind this document: *if NEWAX
commits to retail/commerce as its one vertical before expanding to a second
(per `CLAUDE.md`'s "Scale: the three axes" and `RETAIL-ERP.md`), how close is
this codebase to the stated bar — a deployment that covers 90–95% of a retail
business's recurring operations well enough that it does not need to buy a
second platform for anything in that list?

This is not a feature-by-feature product comparison — two of those already
exist (`GAP-ANALYSIS-ERP-FEATURE-COMPARISON.md`,
`GAP-ANALYSIS-ODOO-APPS.md`) and are not repeated here. This document scores
the **architecture `RETAIL-ERP.md` itself commits to** — its 26 lettered
rulings (R1–R26) and the module list in its Part 5 — against what is actually
in the schema, the routes and the tests today, the same way
`ENTERPRISE-SCALE.md`'s "What is actually enforced today" table scores the
structural rules. Evidence is `docs/index/` (regenerated every commit) plus
direct reads of the Prisma schema and the module source for anything the
index doesn't settle on its own.

**A documentation-drift finding, first, because it changes how to read every
other gap doc in this folder.** Both existing gap-analysis docs are dated
2026-09-26 — nine days old at time of writing — and two of their claims are
already wrong:

- `GAP-ANALYSIS-ERP-FEATURE-COMPARISON.md` says lot/batch/FEFO tracking is
  "fully unbuilt... no `Lot`/`LotStock` model exists anywhere in the schema."
  `inventory.prisma` now has `Lot`, `LotStock`, `LotAllocation`, FEFO
  allocation (`lot-allocation.ts`), a lots controller/service, a recall
  endpoint, and 7 passing spec cases (`lots.service.spec.ts`).
- The same doc says "no multi-currency model at all." `accounting` now posts
  realised FX gain/loss on foreign-currency supplier bill payments
  (`purchasing.service.ts`), and R16 (multi-currency) is cited directly in
  the accounting module's own doc comments.

Nothing here blames either document — they did their job honestly on the day
they were written. The finding is that **a build-status doc in this repo has
a shelf life measured in days, not quarters**, because the codebase moves
that fast. Treat every "not built" claim anywhere in `docs/implementation/`,
including in this document the day it is read, as a claim to re-verify
against `docs/index/` before relying on it for a real decision — the index is
regenerated every commit; a prose doc is not.

## Method

For each item: **Built** (routes + tables + at least one passing spec exist,
verified by reading the module), **Partial** (real but narrower than
`RETAIL-ERP.md`'s own description), **Absent** (no schema, no routes, no
service — grep-confirmed). Route/table counts are from `docs/index/01-MAP.md`
and the per-module index pages; I did not re-run `pnpm test` in this
session — "a passing spec exists" means the index lists a `.spec.ts` with
cases, not that I re-executed it this turn. Treat the status column as
[Likely], not [Certain], until `pnpm test` is actually run.

## Scorecard — RETAIL-ERP.md's own architecture, as built today

| Domain | RETAIL-ERP.md ref | Module(s) | Routes | Tables | Status | Evidence |
|---|---|---|---|---|---|---|
| Org/brand/branch topology | R1, R10, R14 | `organization` | 15 | 5 | **Built** | `Organization`, `RetailBrand`, `BrandPolicy`, `AdminScope`, `Node` all in schema; three-level scope guard live |
| Facts up / policy down replication | R2, L6 | `core/replication` | — | 2 | **Built** | `ReplicationRecord`/`ReplicationCursor` in schema, 21 files in `core/replication/`, consumed by `catalog`, `finance`, `bom`, `purchasing` listeners |
| In-transit transfers | R4 | `transfers` | 5 | 5 | **Built** | `StockTransfer`, in-transit location, 25 test cases incl. brand-policy gating |
| Oversell-never-rejected sync | R5 | `inventory` (`postUnconditional`) | — | 1 | **Built** | `StockVariance` model, `StockVarianceService` — "a POS sale that already happened is never rejected" |
| Node-safe ids | R6 | core-wide | — | — | **Built** | Node-prefixed counters cited throughout (`PayRunNumberCounter`, `TransferNumberCounter`, etc.) |
| Box/branch/till hierarchy | R7 | `pos` | 20 | 7 | **Built** | `PosTerminal`, device-credential auth, shift lifecycle |
| Branch product proposal | R8 | `catalog` | 58 | 30 | **Partial** | De-dup gate referenced in roadmap (22.5); not independently re-verified this session |
| Policy switches as rows | R9 | `organization` | — | 1 | **Built** | `BrandPolicy` — `allowBranchProductCreation` etc. as editable rows, not code branches |
| Three admin levels, one app | R10, R19 | `organization` | 15 | — | **Built** | `AdminScope` levels + drill-down controller |
| Till sale = orders channel | R11 | `pos` | — | — | **Built** | `pos → orders` hand-off in `pos-sales.service.ts` |
| Inter-branch/brand money | R12 | `transfers` | — | 2 | **Built** | `InterBranchInvoice`, settlement modes |
| Tier-scoped purchasing | R13 | `purchasing` | 24 | 10 | **Built** | `scopeLevel`/`originNodeId` columns live, cited in 4 modules' replication listeners |
| Three sale scales, one build | R14 | registry-wide | — | — | **Built** | `pos`, `transfers`, `organization` all "off by default" via `MODULES`, not a fork |
| Double-entry GL | R15 | `accounting` | 19 | 8 | **Built** | `JournalEntry`/`JournalLine`, trial balance/P&L/BS/cash flow/aged AR&AP, 52-case posting-rules spec |
| Multi-currency | R16 | `accounting`, `purchasing` | — | — | **Built** | Realised FX gain/loss on supplier bill payment (contradicts the 9-day-old gap doc above) |
| Intercompany elimination | R17 | `accounting` | 2 | — | **Built** | `ConsolidationService` — group P&L with matched intercompany pairs eliminated, unmatched-pairs exception report |
| Billing/invoicing/quotes as documents | R18 | `tradingpartners`, `receivables` | 20 + 20 | — + 5 | **Built** | `Invoice`/`Quote`/`Offer` (B2B), `CreditNote`/`DebitNote` (AR/AP) |
| Drill-down dashboards | R19 | `organization` | — | — | **Built** | `/admin/o/[orgId]` → brand → branch per Part 6 |
| Dependency graph | R20 | `planning` | 6 (shared) | 0 | **Built** | `dependency-graph.ts` — "a projection, never a second model," 4 test cases |
| Propagation core | R21 | `planning` | — | — | **Built** | `propagation.ts` — pure arithmetic over the graph, demand bands with confidence intervals |
| Action ranking | R22 | `planning` | — | — | **Built** | `action-ranking.ts` — cash preserved per rupee spent, generated only from real graph edges |
| GenAI narration | R23 | `planning` + `core/ai` | — | — | **Built** | `NarrationService` — "narrates, cites, never computes," behind the `AiProvider` extension point |
| Liquidity/treasury | R24 | `planning` | — | — | **Built** | `LiquidityForecastService` — "a ledger query plus a schedule, never a new forecast model" |
| Lead-time distribution + scorecard | R25 | `purchasing`, `planning` | — | 1 | **Built** | `SupplierLeadTimeObservation` table + `SupplierResilienceService`, OTIF/price-variance computed from real PO history |
| Online stock = branch sum | R26 | `planning` | — | — | **Built** | `OnlineStockService` — no separate reservation ledger |
| BOM / manufacturing costing | Part 5 `bom` | `bom` | 22 | 6 | **Built** | Recipe cost rollup, lot-to-lot traceability, production runs through `InventoryService` |
| Apparel sector pack | pack `apparel` | `measurements`, `stitching` | 13 + 21 | 4 + 8 | **Built** | Tailor queue, design options, fabric-supplied bookings |
| Fiscal compliance (FBR, QR receipts) | Part 5 `fiscal`, Tranche 6 `26.1` | — | 0 | 0 | **Absent** | No `FiscalProvider` model, no FBR integration anywhere in `apps/api/src` |
| Editions & packaging | Tranche 9 | — | 0 | 0 | **Absent** | No `EDITION` preset, no Solo/Chain/Organization seed data; achievable manually today via `MODULES`+`NODE_ROLE`, but not packaged or tested as such |
| Pack-absence boot proof | S4 | — | — | — | **Gap** | `ENTERPRISE-SCALE.md`'s own table: "nothing proves a grocery deployment boots" |
| Branch-scoped reads | L2 | — | — | — | **Gap** | `ENTERPRISE-SCALE.md`'s own table: any inventory-capable user reads every location's stock |

**24 of 26 lettered rulings built, 1 partial, 2 explicitly tracked as gaps by
this repo's own `ENTERPRISE-SCALE.md`.** This reverses what I told you last
turn — I'd estimated pharma/freight had better document-standardization and
regulatory moats, true, but I also implied retail coverage was "plausible,
years out." That was wrong, and I'm correcting it now that I've actually read
the code instead of the roadmap doc: `RETAIL-ERP.md`'s Part 7 roadmap
(Tranches 1–7) reads as mostly unbuilt-and-planned. It is mostly **already
shipped** — the roadmap doc itself is one of the stale ones. Only Tranche 8's
fiscal/FBR piece and Tranche 9 (editions/packaging) are genuinely still open,
plus the two hardening gaps S4/L2 that were never roadmap items, they're
known holes.

## Sector-pack breadth — the one place coverage is not high

The three-axes model (`CLAUDE.md`) promises "adding a sector adds a folder."
Today:

| Sector pack | Status | Evidence |
|---|---|---|
| `apparel` (`measurements`, `stitching`) | **Built** | 2 modules, 34 routes, 12 tables |
| grocery (`batches`, perishables per `MULTI-SECTOR.md`'s own example) | **Absent** | No `batches` module anywhere in `modules.registry.ts` |
| pharmacy (`prescriptions` per the same doc) | **Absent** | No `prescriptions` module; **note** — this is a retail *pharmacy/drugstore* pack (POS + prescription record), unrelated to the pharmaceutical-manufacturing vertical from the earlier strategy conversation, which would be a different product line entirely, not this pack |

So "retail coverage" is really two separate numbers: the **universal
commerce core + apparel** is ~90%+ covered against `RETAIL-ERP.md`'s own
bar; a grocery or pharmacy deployment today would run on the core (inventory,
accounting, POS, CRM, purchasing — all sector-agnostic) but with **zero**
sector-specific capability, because those two packs are still just a line in
a planning document, not code.

## What's still really missing, prioritized by "blocks third-party independence"

Pulling the specific, still-credible items from the two existing gap docs
(not re-verified individually this session, flagged [Likely] not [Certain]
per the staleness finding above) and ranking by how much each one forces a
retail chain back onto outside software:

**Forces a second platform today:**
1. **Fiscal/FBR e-invoicing** — a Pakistani retailer legally needs this for
   POS compliance; its total absence is the single clearest case of "still
   needs a third-party/manual process" in the whole matrix.
2. **Bank reconciliation** — every business reconciles a bank statement;
   doing it outside the system means the GL is never actually the source of
   truth for cash.
3. **Opening balances** (customers/vendors) — blocks onboarding an existing
   business's books at all, which is the very first thing a new retail
   customer does.
4. **PDC/cheque lifecycle** — cheques remain common in Pakistani B2B trade;
   absence pushes this bookkeeping into a spreadsheet.

**Real but narrower-scope gaps (don't block go-live, limit growth):**
5. RFQ/compare-quotes before a PO (only direct PO today).
6. Budget vs. actual.
7. Bin-location granularity and real UoM conversion (e.g. "1 carton = 12").
8. Opportunity-stage CRM (lead converts straight to order today).

**Safety/isolation hardening, not a feature gap:**
9. S4 (pack-absence boot proof) and L2 (branch-scoped reads) — both already
   tracked in `ENTERPRISE-SCALE.md` as the two highest-priority closes.

## Bottom line

[Likely] The universal commerce core plus the apparel sector pack is close
to the 90–95% bar `RETAIL-ERP.md` itself sets, for a single-brand or
multi-branch apparel retailer specifically. [Certain] It is **not** yet
there for grocery or pharmacy retail — those packs don't exist as code yet,
regardless of how complete the shared core is. [Certain] The fiscal/FBR gap
is the one item on this list that is both completely unbuilt and legally
load-bearing for any live Pakistani retail deployment, and should be treated
as higher priority than it currently reads in `RETAIL-ERP.md`'s own Tranche
ordering (it's listed last, in Tranche 6 item `26.1`, behind several
capabilities that are already shipped).

This changes the earlier strategic framing: the question is no longer
"should NEWAX commit to retail before it's ready" — the core is ready, for
one sector. It's "finish fiscal compliance and the bank/cheque/opening-
balance trio for the apparel-retail wedge already built, prove S4/L2, then
decide whether sector pack #2 is grocery, pharmacy, or the next vertical
entirely (pharma manufacturing, freight) as a *separate* product line on the
same Core" — which is exactly the sequencing from the strategy conversation,
just with real numbers under it instead of an estimate.
