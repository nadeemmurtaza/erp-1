# Gap analysis: a pasted ERP feature list vs. this repo

**What this is.** A roadmap reference, not a work order: a line-by-line
check of a feature-comparison list (Setup, CRM, Sales, Purchase, Inventory,
Production, Financial Management) against this repository's actual schema
and code, done 2026-09-26. It records **what is missing today**, so a
future scoping pass has a starting inventory instead of re-discovering
these gaps from scratch. Nothing here is built, scheduled, or even fully
scoped — each bullet is a candidate for its own future numbered document
in the matching `docs/implementation/<domain>/` folder, carrying its own
Work Orders and Scope Lenses when someone actually picks it up, per
`CLAUDE.md`'s own "Feature scope: build the whole capability" discipline.

Checked against the live schema and code, not against the other product's
own X marks (those describe *their* tiers, not our build status). Only
what is **missing or partial here** is listed; anything not mentioned is
already covered, usually by a more general mechanism than the pasted
list's own named screen (e.g. their "Colour"/"Style" fields are covered by
our generic `ProductOption`, not by two dedicated columns).

## Setup

- **Currencies** — no multi-currency model at all. This deployment is
  single-currency (PKR) by design (`packages/shared/src/brand.ts`); adding
  multi-currency is a real, non-trivial capability (FX rates, translation
  gain/loss postings), not a quick add.
- **Project Setup** — no `Project` concept anywhere; nothing in this
  system is organized by project.
- **Terms & Condition** (configurable, per-document-type legal text) — no
  dedicated model; the storefront has static legal pages (`content`
  module), not a configurable per-transaction-type terms mechanism.
- **Customer Rating** — no rating field/model on `Contact`/`Party`.
- **Work Flow Configuration** — partially: `ApprovalChain`/`BpmnWorkflowDefinition`
  exist as a generic engine, not a no-code "configure any workflow" screen
  the way the phrase usually implies.
- **Pivot Report Designer** — not built; every report here is a named,
  purpose-built screen, not an ad hoc pivot-table builder.
- **Cities / Countries** as master-data tables — not built; addresses use
  free-text city/province fields (`BRAND.locale.regions`), not a
  City/Country reference table.

## CRM

- **Lead Type / Rating / Priority / Probability / Prognosis** as their own
  rows or fields — `Lead` has a plain `status` enum and a `quotedValue`;
  none of these five exist.
- **Opportunities** — no separate `Opportunity` model at all; a `Lead`
  converts straight to an `Order` (`convertedOrderId`), with nothing
  between them.
- **Campaign Group / Target / Type** as master-data — `Campaign` has a
  fixed `channel` enum and targets a `Segment`; no separate
  group/target/type taxonomy.
- **Leads Report / Campaign Report / Opportunity Report** — no dedicated
  reports; Opportunity has nothing to report on since it doesn't exist.

## Sales Management

- **Customer Charges Setup** — not built.
- **Customer Opening Invoices** (opening balances at go-live) — **no
  opening-balance mechanism exists anywhere in this system**, for
  customers or vendors. This is a real gap for any migration from an
  existing set of books.
- **Customer L/C** (letter of credit) — not built.
- **Export Shipping Detail** — not built; nothing here models an export
  shipment's own paperwork.
- **Delivery Order** (as a distinct pre-invoice document) — not built as
  its own document; `Shipment`/`Delivery Challan`-equivalent exists via
  `fulfilment`.
- **Sales Target / Sales Forecast / Sales Pool** — none of the three
  exist; no quota, forecast, or lead-pool-assignment mechanism.
- **Target Vs Actual Sales / Pool Wise Outstanding** — follow from the
  above; not built.
- **Customer ABC Classification** — not built.

## Purchase Management

- **Vendor Charges Setup** — not built.
- **Request For Quotation (RFQ) / Compare RFQ** — not built. `Requisition`
  (doc 152, built this session) covers internal purchase requisition and
  its approval chain, but nothing solicits or compares competing supplier
  quotes before a PO.
- **Vendor Opening Invoices** — same opening-balance gap as customers,
  above.
- **Purchase Order (Import)** / **Vendor L/C** / **Import Shipping
  Detail** — not built; nothing here models an import-specific PO,
  letter of credit, or shipment paperwork.
- **Purchase Requisition List / RFQ List** — the requisition list exists
  (doc 152); the RFQ list doesn't, since RFQ itself doesn't exist.
- **Vendor ABC Classification** — not built.

## Inventory Management

- **Item Batch** (lot/batch tracking with expiry, FEFO) — **fully
  unbuilt**. `docs/implementation/lots-serials-traceability/32-lots-batch-expiry-fefo.md`
  and its two dependent documents are sketches only; no `Lot`/`LotStock`
  model exists anywhere in the schema (confirmed this session, ADR-055).
- **Supplementary Item** — not built.
- **Inventory Configuration** (a dedicated settings screen) — generic
  `Setting` rows exist; no consolidated inventory-config screen.
- **Item Charges Group / Item Charges Codes** — not built.
- **Bin Location** (sub-location granularity inside one store) — not
  built; `Location` is the finest granularity today.
- **Units of Measurement** as a real conversion system (e.g. "1 carton =
  12 pieces") — not built; quantities are unit-less integers.
- **Transfer Order** as its own 3-step document (issue against TO,
  receive against TO) — `StockTransfer` exists but as a single
  dispatch/receive flow, not this specific three-document shape.
- **Item Requisition / Store Issuance** (internal stock request separate
  from a purchase requisition) — not built as a distinct concept; only
  `PurchaseRequisition` (external, doc 152) exists.
- **MRP Process / MRP Order Recommendation** — not built. Reorder
  suggestions exist (`inventory/reorder`, a simpler reorder-point
  calculation) but there is no true multi-level MRP explosion.
- **Item ABC Classification** — not built.

## Production Module

- **Production Parameters / Documents** (dedicated config screens) — BOM
  configuration exists generically via `Setting`/`Recipe`, not as its own
  named parameters screen.
- **Production Routing / Production Order (Routing)** — not built; `BOM`
  records what a run consumed and produced, but not an operations
  sequence/routing (station-by-station steps with their own times).
- **Production MRP** — not built (see MRP above).

## Financial Management

- **Financial Parameters** (dedicated screen) — generic `Setting` rows
  exist; no consolidated screen.
- **Budgeting / Budget Vs Actual** — not built at all.
- **PDC Entry** (post-dated cheque tracking), **Move PDC to Bank
  Receipt/Payment**, **Cheque Bounce Entry**, **Cheque Return** — none
  built. No post-dated-cheque lifecycle exists anywhere in this system.
- **Bank Reconciliation** — not built.
- **Customer Advance Adjustment / Vendor Advance Adjustment** — not
  built as a distinct ledger mechanism (wallet/store-credit exists for a
  different purpose — customer-facing prepaid balance, doc 155 — not an
  accounting advance-against-invoice workflow).
- **Intra Party Adjustment** — not built.
- **Vendor Payment Request** (a distinct approval-gated payment-request
  document, separate from just paying a PO) — not built as its own
  document.
- **Financial Reporting Templates** (build a custom statement layout) —
  not built; Balance Sheet/Income Statement/Trial Balance/GL are
  fixed-format reports, not templated.
- **Distinct voucher-type entry screens** (Bank Receipt Voucher, Bank
  Payment Voucher, Cash Receipt Voucher, Cash Payment Voucher, Journal
  Vouchers as four/five separate document types) — the underlying
  capability exists (`JournalEntry`/`Payment`), but not as four distinct,
  named voucher-entry screens; everything posts through one generalized
  journal-entry/payment path today.
- **Posted Dated Cheque Report** — not built (follows from no PDC
  tracking).
- **Withhold Statement** — `TaxAuthority`/`TaxRate` exist generically, but
  no dedicated withholding-tax statement report.
- **Month Wise / Plant Wise GL Activity** — the GL itself exists and is
  filterable, but no report specifically pre-shaped as "month-wise" or
  "plant-wise GL activity" exists as its own named screen.

## What's already covered, not repeated above

Everything else in the pasted list matches something real here, usually
under a more general name: Dashboard, User Administration, SMS
configuration, Departments/Business Units (`OrgUnit`/`OrgUnitType`),
Customer/Vendor Category and Master (`Contact`/`Party`, `Supplier`),
Customer Credit Limit and Payment Terms (`receivables`, doc 145), Price
Lists/Discount Lists (`pricing`, doc 146; `promotions`), Sales
Quotation, Sales Order, Sales Return, Sales/Purchase Invoices
(GST/Non-GST covered by the generic `TaxRate` mechanism, not a
GST-specific document type), Customer/Vendor Debit and Credit Notes (doc
145), Purchase Order, Goods Receipt, Item Types/Categories/Master
(`catalog`), Item Colour/Style (generic `ProductOption`), Stock Count,
Location Transfer, Chart of Accounts, Fiscal Year, Tax Authority/Tax
Setup, Journal Entries, Cash/Bank Book equivalents, General Ledger, Trial
Balance, Balance Sheet, Income Statement, and essentially every
"X List"/"X Report" whose underlying transaction exists.
