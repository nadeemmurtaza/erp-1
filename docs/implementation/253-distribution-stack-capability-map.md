# 253 — Distribution technology stacks: the master capability map

> **Status: Investigated (2026-10-11). A map, not a plan.** Nothing here is
> built, and nothing here is a brief. Every software capability found in the
> technology stacks of 15 large US distributors is listed once, put in one of
> four buckets, and checked against this repository and its documents of
> record. Per-capability briefs (schema, work orders, scope lenses) follow
> only after the owner approves the bucketing.
>
> **No ADR is written for this pass.** Bucketing is a research result, and
> nothing in it is yet an irreversible architectural decision. The eight
> decisions the roadmap waits on are listed in §8 as ADR candidates. Each
> gets its own ADR when its brief is written, in the same change as that
> brief.

## 1. What this is

### 1.1 The sources

- **The research.** An owner-commissioned "Technology Architecture &
  Enterprise Software Stack Analysis" of 15 priority US distributors
  (account ids NWX-US-001 to NWX-US-045; legend in Appendix B). It names
  each company's core ERP, CRM, WMS, finance, commerce, fleet, integration,
  HCM and specialised systems, and closes with three shared pain points:
  1. post-acquisition system fragmentation;
  2. the gap between digital ordering and physical dispatch;
  3. telemetry and edge-asset automation.

  Every product and feature it names is taken as input and categorised as
  given. Appendix A maps each named product to its rows, so none is
  dropped silently.

- **The NEWAX Ideal Customer Profile, v1.0.** Only its market definition and
  problem patterns are used. The primary segment is established wholesalers
  and distributors. The six priority problems are: disconnected systems,
  manual reconciliation, poor visibility, inventory discrepancies,
  infrastructure that does not scale, and limited visibility into physical
  operations. Its appendix defines **Connected Infrastructure** as
  "connected physical systems, devices, telemetry, monitoring, and data
  flows used to improve operational visibility and action". By the owner's
  instruction, its commercial-qualification sections set no engineering
  scope here.

### 1.2 The mandate, in engineering terms

The owner said: "We need everything ... there should be no duplication ...
once one feature or one function is made, it should not be made again ...
only one software, our one ERP, our one ecosystem ... seamless, automatic
data synchronization." As engineering rules:

1. **Native build by default.** Every business-workflow or data capability
   is a NEWAX capability, built once inside this architecture. NEWAX's own
   CRM must reach what Salesforce reaches for these companies. Integrating
   with Salesforce does not meet the bar.
2. **Integration point by exception, and only in three categories.** These
   are never rebuilt:
   - physical hardware and robotics;
   - external authorities and networks NEWAX should never become;
   - CAD/3D modelling and structural-engineering engines. This category is
     **pending the owner's decision**, Q1.
3. **Every integration point is invisible.** Staff work only in NEWAX.
   Data flows in and out automatically (§3).
4. **Zero duplication is checked, not asserted.** Each capability is looked
   up in the code and in the documents of record before it is counted as a
   gap. If it exists, it gets a one-line pointer. If a document already
   scopes it, it gets a pointer to that document, never a second brief.

### 1.3 Buckets

| Bucket     | Meaning                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NATIVE** | Built once, as a NEWAX module or an extension of one                                                                                                  |
| **HW**     | Physical equipment from another vendor. NEWAX integrates through a driver behind an extension point and never reimplements the device or its firmware |
| **AUTH**   | An external authority, network or data source NEWAX should never become (a bank, a tax authority, a VAN, mapping, weather, a credit bureau)           |
| **CAD**    | CAD/BIM modelling, takeoff or structural calculation. Pending Q1, and not scoped under NATIVE                                                         |

Some NATIVE rows carry an **integration leg**: an AUTH or HW connection
inside an otherwise native capability, such as the VAN behind EDI or the
customs authority behind trade documents. The row's notes name it.

### 1.4 Statuses

| Status      | Meaning                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BUILT**   | Schema, routes and service exist in code today (module cited)                                                                                        |
| **PARTIAL** | Built, with a named delta still needed. The delta extends the cited module and never becomes a second module                                         |
| **SCOPED**  | A brief already exists and nothing is built (document cited). It is not re-scoped here                                                               |
| **NAMED**   | A document of record already names it, with a reserved module name or a sequenced work order, but no brief exists. A future brief must use that name |
| **NEW**     | Nothing in code or in any document. A genuine gap                                                                                                    |
| **PENDING** | Waits on the owner's CAD decision (Q1)                                                                                                               |
| **N/A**     | No business data flow, so nothing to build. Confirm in §7                                                                                            |
| **Q**       | Cannot be bucketed from the research. The question is in §7                                                                                          |

### 1.5 Method, and how long it stays true

Each row was checked on 2026-10-11 against:

- `docs/index/` (current at `63205a1e51d6ee0e`, 221 pages);
- the full list of Prisma models;
- `module-packs.ts` and the module index pages;
- the documents of record:
  - `MULTI-SECTOR.md`'s capability taxonomy;
  - `RETAIL-ERP.md` Part 3 ("CRM, improved") and Part 5;
  - docs 236–252, `README.md`'s "Known gaps";
  - the two gap analyses and the retail coverage matrix.

`RETAIL-VERTICAL-COVERAGE-MATRIX.md` found that a build-status claim in this
folder stays accurate for days, not quarters. Re-verify any row against
`docs/index/` before acting on it.

### 1.6 Where it lives, and why it is numbered

This file sits at the root of `docs/implementation/` with the next free
number, 253.

- **Not a domain folder.** It spans every domain. Its nearest relatives,
  `RETAIL-VERTICAL-COVERAGE-MATRIX.md` and the two `GAP-ANALYSIS-*.md`
  files, are cross-domain coverage maps and sit at the root for the same
  reason.
- **Numbered.** Prose across this corpus cites documents by bare number
  (ADR-030's own reasoning). A number lets the per-capability briefs that
  follow cite "doc 253 row E9".
- **Not moved later.** Those briefs go in their own domain folders. This
  file stays the index they trace back to.

## 2. Results at a glance

**110 rows**, one per distinct capability across all 15 stacks. A capability
that appears at several companies is still one row.

| Status  | Rows    | What it means for the zero-duplication mandate                                                |
| ------- | ------- | --------------------------------------------------------------------------------------------- |
| BUILT   | 12      | Already covered. No work                                                                      |
| PARTIAL | 26      | Covered by a built module, which gains a named delta. No new module                           |
| SCOPED  | 12      | A brief exists. It is cited, never re-briefed                                                 |
| NAMED   | 19      | A document of record already reserves the name or sequences it. Needs a brief under that name |
| NEW     | 36      | Genuine gaps                                                                                  |
| PENDING | 3       | The CAD engines (Q1)                                                                          |
| N/A     | 1       | Network appliances (Q14)                                                                      |
| Q       | 1       | Municipal billing (Q9)                                                                        |
| **Sum** | **110** |                                                                                               |

**Zero-duplication proof.**

- 50 of 110 rows (BUILT + PARTIAL + SCOPED) are already in this repository
  as code or a brief, and add no new module.
- 19 more are NAMED. Their name, and often their boundary, is already
  decided in a document of record, so a brief reuses it rather than
  inventing a parallel one.
- 36 are new.

| Bucket                                                       | Rows |
| ------------------------------------------------------------ | ---- |
| NATIVE (including 1 native-pending, I6)                      | 87   |
| HW (Connected Infrastructure integration points)             | 10   |
| AUTH (authority, network and data-source integration points) | 9    |
| CAD (pending)                                                | 3    |
| Not bucketable (D11)                                         | 1    |

**The 55 rows that need a brief** (19 NAMED + 36 NEW) fall into the
13 tranches of §6. Of the 55:

- 42 are native capabilities;
- 8 are hardware integration points;
- 5 are authority integration points.

The 26 PARTIAL deltas are extension work on existing modules, not new
modules:

- 21 ride along in the `X` tranches;
- 5 amend briefs that are already scoped (§6.2).

## 3. The invisible-integration contract

This applies to every HW and AUTH row and to every integration leg. It is
the "no manual import, no re-typing" requirement made checkable. A brief for
an integration point fails review unless it states each item:

1. **Automatic both ways.**
   - Inbound data arrives on its own, by webhook, poll, file drop or device
     push, through the existing connectivity design: docs 36, 132, 160, 162
     and 172, or the device foundation L0.
   - Outbound data leaves through the transactional outbox (doc 188's
     per-subscriber delivery).
   - No person re-keys, imports or exports in routine operation.
2. **Never opened for routine work.** The vendor's or authority's own
   console is not part of any routine workflow. Exceptions surface in NEWAX,
   in an exception or review queue (the `StockVariance` / `SpotCheck` /
   `NEEDS_REVIEW` idiom), never as an email to go and look elsewhere.
3. **Behind an extension point.**
   - The integration has the shape `PaymentProvider` / `CourierProvider` /
     `EdiGateway` / `VideoConferenceProvider`, with an env allowlist. The
     module core never names a vendor.
   - Vendor identity is data (doc 236 §13's retailer-name grep, applied to
     every vendor).
4. **Resilient.** Each states its failure mode, its idempotency key and its
   recovery path (CLAUDE.md's "Resilience first"), wrapped in doc 38's
   built `CircuitBreakerService`. An absent provider degrades honestly: the
   feature hides. It never fails a sale.
5. **Provenance.** Every inbound fact records its source, when it was
   received and, where applicable, a confidence (doc 172).

**Honest limits.** Where an authority offers no machine interface, rule 2
cannot be fully met. Example: retailer deduction disputes submitted only
through a portal (doc 236 §10 item 6). NEWAX then records the obligation
and the deadline and tracks the outcome, while a person submits in the
portal. Each brief names its portal-only steps. None is hidden.

## 4. The master capability matrix

Codes for "Seen at" are in Appendix B. "Target" is the module that owns the
capability, or would own it, so no second owner appears later.

### A. Platform and core

| #   | Capability                                                                                    | Seen at                                      | Bucket | Status  | Target                                                                               | Notes                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Core distribution ERP backbone: order entry, purchasing, multi-location stock, GL, AR/AP, tax | all 15                                       | NATIVE | BUILT   | `orders`, `purchasing`, `inventory`, `accounting`, `receivables`, `finance`, `tax`   | The core-ERP column of every profile, from VAI S2K and SAP to Fastenal's and Ferguson's own engines (Appendix A). Scored against R1–R26 in `RETAIL-VERTICAL-COVERAGE-MATRIX.md`                                                                                                               |
| A2  | Multi-entity, multi-branch topology at chain scale (130 to 3,300+ sites, 50 countries)        | ID BR SRS ABC BFS WES UNV FAS MOT BEA FER PA | NATIVE | BUILT   | `organization`, `core/replication`, `transfers`                                      | Organization ▸ Brand ▸ Branch, with a branch as a node (R1–R14). Two hardening gaps are already tracked, not new: L2 branch-scoped reads and S4 pack-absence boot (`ENTERPRISE-SCALE.md`; doc 236 WO-236.4/236.5)                                                                             |
| A3  | Network-wide real-time availability and local stock check                                     | FAS BEA FER SRS                              | NATIVE | PARTIAL | `inventory`, `planning`, `orderrouting` (doc 238)                                    | Built: `VariantLocationStock` and R26 online stock. Scoped: per-line ATP and cross-node allocation (R28, doc 238). Delta: no measured lookup-latency target exists. Doc 238 must state one before build, under CLAUDE.md's exact-parameters rule. None is invented here                       |
| A4  | Intercompany trade and group consolidation                                                    | WES UNV ID                                   | NATIVE | PARTIAL | `accounting`, `transfers`                                                            | Built: `InterBranchInvoice` (R12) and `ConsolidationService` eliminations (R17). Delta: docs 238 and 250 refuse cross-brand fulfilment and fund transfers "until an intercompany brief exists". That brief is named and unwritten                                                             |
| A5  | Multi-currency trading                                                                        | FER UNV WES                                  | NATIVE | PARTIAL | `accounting`, `purchasing`                                                           | Built: integer FX on supplier bills, with realised gain or loss (R16). Delta, unverified: customer-side foreign-currency sales and period-end revaluation. Verify in code before scoping                                                                                                      |
| A6  | Legacy-ERP migration, coexistence and cutover after acquisitions (takeaway 1)                 | ID BR ABC WES MOT BEA                        | NATIVE | SCOPED  | connectors (docs 36, 132, 160, 162), ingestion boundary (doc 172), cutover (doc 179) | Built: CSV import of products and contacts (doc 72). Scoped: inbound connectors with provenance and confidence (172), and parallel running with a `SystemOfRecordCutover` record (179). Whether a permanent two-way bridge to a retained legacy ERP is in scope is Q2                         |
| A7  | Integration API for parent groups, customers and partners                                     | SRS MOT ABC                                  | NATIVE | PARTIAL | `core/auth` (doc 163), `tradingpartners` (doc 213), app platform (docs 184–195)      | Built: personal API keys (163), and doc 213's partner-fact inbox and buyer applier (WO-213.1/213.2). Scoped: organisation `ApiClient` (34/189), remote apps (184–195), outbound connectors (36/160)                                                                                           |
| A8  | Two-way CRM↔ERP synchronisation                                                               | MED                                          | NATIVE | BUILT   | —                                                                                    | Built by construction. CRM, orders and AR share one database and talk through domain events, so there is nothing to synchronise. The need disappears                                                                                                                                          |
| A9  | Workflow automation / RPA ("when X happens, do Y", with no clicks)                            | WES FER                                      | NATIVE | NAMED   | `automations` (README "Known gaps")                                                  | README names a generic automations engine and defers it. Doc 95 declined a generic rule engine. Doc 102 routes Zapier- or n8n-style flows through doc 36's connector. Doc 142's BPMN compiles to approvals only. The owner's mandate is new evidence; reopening doc 95 needs an ADR (§8 AD-3) |
| A10 | Cloud hosting substrate                                                                       | ABC BFS FAS MOT OM WES                       | AUTH   | PARTIAL | deployment, `core/storage`, hosting tier (doc 39)                                    | Infrastructure NEWAX runs on, never becomes. Built: Docker/compose deployment, `StorageDriver` with an S3 driver, doc 39's shared hosting tier. Named gap: declarative IaC (doc 124)                                                                                                          |

### B. Customers, sales and pricing

| #   | Capability                                                                                                | Seen at                            | Bucket | Status  | Target                                     | Notes                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------ | ------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | CRM: companies, contacts, activity timeline                                                               | ID BR BFS WES MOT BEA FER          | NATIVE | PARTIAL | `crm`, `accounts`, `parties`               | Built: `Contact`, `Lead`, `Interaction`, `FollowUpTask`, `Segment`, the mailbox inbox, RFM, WhatsApp. Delta: a B2B company account with several contacts, ship-to and job sites, and a parent hierarchy. This is `CustomerAccount`, NAMED in `RETAIL-ERP.md` Part 3. Today `B2BAccount` wraps one customer. Foundation X0.3 |
| B2  | Opportunity pipeline and sales forecast                                                                   | as B1                              | NATIVE | NAMED   | `crm` (`Opportunity`)                      | `RETAIL-ERP.md` Part 3. Today `Lead` has a flat status and converts straight to an order                                                                                                                                                                                                                                    |
| B3  | Quoting, CPQ and project-bid management (multi-line bids, BOM-style quotes, validity, acceptance)         | WES ABC BFS                        | NATIVE | NAMED   | R18 `invoicing` (the taxonomy's `quotes`)  | `MULTI-SECTOR.md` names `quotes`, and R18 gives `Quote` to `invoicing`. The existing `Quote` (`invoicing.prisma`) is keyed to `TradingPartner` only. Generalise it; never add a second quote model. This is the same decision as doc 236 OD-2 (§8 AD-7)                                                                     |
| B4  | Product configurator (configure-to-order doors, windows, millwork; guided selling)                        | BFS WES                            | NATIVE | NEW     | `quotes` + `bom`                           | Rules-based configuration produces a configured BOM and a production order (doc 242). 3D presentation is M3                                                                                                                                                                                                                 |
| B5  | Customer contract pricing (contract tiers, affiliations, effective dates, jobber levels)                  | MED PA ABC                         | NATIVE | PARTIAL | `pricing`, `agreements`                    | Built: price lists and quantity breaks per customer or tag (doc 146). Delta: no effective dating, and no tier assigned by affiliation. Negotiated terms belong to `agreements` (NAMED in `MULTI-SECTOR.md`)                                                                                                                 |
| B6  | Price governance and optimisation (margin floors, discount authority, branch discounting, price guidance) | ABC                                | NATIVE | PARTIAL | `pricing`, `pos`                           | Built: a price-list entry below base price needs a margin-decision permission. Delta: an authority matrix by role and branch, the till price override (named in `RETAIL-ERP.md` Part 5 `pos`, unbuilt), and price guidance. Any AI suggestion goes behind `AiProvider`                                                      |
| B7  | Negotiated buy- and sell-side agreements: supplier rebates, contract-pricing claims                       | PFG MED                            | NATIVE | NAMED   | `agreements`                               | `MULTI-SECTOR.md`: "negotiated terms governing a set of future orders: ceiling value, contracted rates". Rebate accruals post through `accounting`'s subscribers. Whether a first customer needs supplier chargeback or ship-and-debit claims must be verified, never assumed                                               |
| B8  | Sales commissions and incentive compensation                                                              | ABC                                | NATIVE | NAMED   | `commissions`                              | `MULTI-SECTOR.md` names `commissions` ("snapshotted onto the line at placement"). `payroll` already accepts a COMMISSION basis but takes the figure by hand: "Order carries no salesperson attribution" (`payroll.service.ts`). `commissions` computes and `payroll` pays. It needs salesperson attribution on order lines  |
| B9  | Marketing automation and campaigns                                                                        | MOT                                | NATIVE | BUILT   | `marketing`, `crm`, `core/notifications`   | Campaigns, segments, email/SMS/WhatsApp channels and replenishment reminders. Scoped extension: checkout abandonment (doc 251). A visual journey builder is A9                                                                                                                                                              |
| B10 | Customer events and seminar registration                                                                  | MOT                                | NATIVE | NEW     | new module (name to reserve)               | `GAP-ANALYSIS-ODOO-APPS.md` lists Events as absent. Registration and attendance, with follow-ups into `crm`                                                                                                                                                                                                                 |
| B11 | Leads from external signals (storm damage)                                                                | BEA                                | AUTH   | NEW     | weather-data provider → `crm` `Lead`       | The weather or hail feed is an external authority; creating the lead is native. Confirm the bucket (Q4)                                                                                                                                                                                                                     |
| B12 | Customer service case management and routing                                                              | ID SRS FER MOT                     | NATIVE | PARTIAL | `support`                                  | Built: internal and customer tickets, assignment, an SLA clock and action-hub registration (docs 64, 148). Delta: queue- and skill-based routing rules. Telephony is doc 159 (scoped)                                                                                                                                       |
| B13 | Customer jobs and projects (job accounts, project supply, job-site delivery)                              | WES SRS ABC BEA                    | NATIVE | NEW     | `accounts` (a job under `CustomerAccount`) | `GAP-ANALYSIS-ERP-FEATURE-COMPARISON.md`: "no `Project` concept anywhere". Whether customer jobs and internal projects (I2) are one concept or two is §8 AD-6                                                                                                                                                               |
| B14 | Construction lien rights (preliminary notices, deadlines, conditional and unconditional waivers)          | ABC; building products SRS BEA BFS | NATIVE | NEW     | pack or core (Q7)                          | Statutory, per jurisdiction. The rules are data with provenance and no defaults (doc 236 §10's posture). Needs B13, I7 and I8                                                                                                                                                                                               |

### C. Commerce and customer channels

| #   | Capability                                                                          | Seen at               | Bucket | Status  | Target                                                           | Notes                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------- | --------------------- | ------ | ------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | B2B ordering portal (24/7 ordering, account pricing, buyer approvals, history)      | ID BR PFG ABC BEA FER | NATIVE | BUILT   | storefront (`apps/web`), `accounts`, `pricing`, `cart`, `orders` | Docs 07, 146, 149                                                                                                                                                        |
| C2  | Contractor/customer mobile app (tracking, jobs, job-site photos)                    | SRS FER ABC           | NATIVE | PARTIAL | `apps/mobile`                                                    | Built: the Expo customer app. Delta: jobs (B13), and photo capture against an order or job (`StorageService`)                                                            |
| C3  | Faceted product search and indexing                                                 | WES BR FER            | NATIVE | BUILT   | `search`                                                         | Facets, synonyms, a zero-results log, and semantic and image search (doc 09). Latency at multi-million SKUs is not measured (the triggers in docs 122 and 136)           |
| C4  | Recommendations and reorder                                                         | BR                    | NATIVE | BUILT   | `recommendations`, storefront reorder, `marketing`               | Co-occurrence, related and personalised recommendations; reorder from the order page. Scheduled standing orders are `subscriptions` (NAMED in `MULTI-SECTOR.md`)         |
| C5  | Punchout catalogue sessions (cXML, OCI) and cart return to the buyer's eProcurement | FAS BR WES            | NATIVE | NAMED   | storefront + `edi` (doc 240)                                     | Doc 240 defers cXML "until a partner names one". The session and the cart transfer are NEWAX's storefront. The order and invoice documents are canonical `edi` documents |
| C6  | Procurement-network transport (SAP Ariba, Coupa, Oracle iProcurement)               | FAS                   | AUTH   | SCOPED  | `EdiGateway` (doc 240)                                           | Networks NEWAX should never become. One gateway implementation each, behind doc 240's extension point                                                                    |
| C7  | Ordering from customers' own business systems (repair-shop systems)                 | PA                    | AUTH   | PARTIAL | API keys (doc 163), apps (docs 184–195), C5                      | Each third-party shop system is an adapter. Built: scoped personal API keys                                                                                              |
| C8  | B2B marketplace                                                                     | UNV                   | NATIVE | PARTIAL | `marketplace`, `apps/platform` (doc 165)                         | The publish side is built. Discovery and transact wait on nID OIDC (doc 165). A multi-seller marketplace inside one deployment is `sellers` (NAMED)                      |
| C9  | Customer AR self-service: invoices, statements, pay online                          | ABC                   | NATIVE | PARTIAL | `receivables`, `invoicing`, `payments`                           | Built: statements, and card payment for orders (`PaymentProvider`). Delta: paying against an invoice (doc 248's receipts plus D1)                                        |
| C10 | Customer stock reservation (hold stock for a job or a quote)                        | SRS                   | NATIVE | NEW     | `quotes` / `orderrouting`                                        | Must keep one writer. A hold either moves stock to a non-promisable location (the R30 pattern) or is a derived allocation (R28). §8 AD-8                                 |
| C11 | Aerial job-site imagery and roof measurement                                        | SRS                   | AUTH   | NEW     | imagery provider → `StorageService`, `quotes`                    | Aircraft and satellites are an external network. NEWAX stores and uses the output (Q4)                                                                                   |
| C12 | Trade-counter and branch POS                                                        | FER                   | NATIVE | BUILT   | `pos`, `apps/pos`                                                | Offline till, shifts, cash and receipts (R7, R11, doc 31)                                                                                                                |

### D. Finance: order-to-cash and procure-to-pay

| #   | Capability                                                                             | Seen at            | Bucket | Status  | Target                                                                                 | Notes                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------- | ------------------ | ------ | ------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Customer tax invoice as a legal document; e-invoice delivery                           | ABC; all           | NATIVE | NAMED   | R18 `invoicing`                                                                        | R18, and doc 236 OD-2 (Tranche E's E0 brief, unwritten). Today's `Invoice` is keyed to a trading partner and posts nothing. Country clearance e-invoicing is `fiscal` (AUTH, `RETAIL-ERP.md` Part 5), not this |
| D2  | Cash application (bank lines and remittances matched to invoices)                      | ID UNV ABC         | NATIVE | SCOPED  | `receivables` (doc 248), file connector (doc 162)                                      | Scoped: receipts and allocation (248) and MT940/CAMT statement import (162). Delta: automatic matching of remittance advice and statement lines to open items, with an exception queue                         |
| D3  | Credit management (limits, holds, applications, scoring, monitoring)                   | ID UNV ABC FER SRS | NATIVE | PARTIAL | `receivables`                                                                          | Built: the `CustomerCreditTerm` limit, terms and hold, with a checkout check (doc 145). Delta: a credit-application workflow, an internal risk score and a review cadence. Bureau data is D4                   |
| D4  | External credit-bureau data                                                            | ID UNV             | AUTH   | NEW     | provider → `receivables`                                                               | A bureau is an authority NEWAX never becomes (Q4)                                                                                                                                                              |
| D5  | Collections management (worklists, disputes, promise-to-pay)                           | ID UNV ABC         | NATIVE | PARTIAL | `receivables`                                                                          | Built: the dunning policy and its nightly sweep (doc 145). Delta: a collector worklist, and dispute and promise records                                                                                        |
| D6  | AP invoice capture and three-way match (OCR, PO–receipt–bill, exceptions)              | PFG WES            | NATIVE | NEW     | `purchasing`                                                                           | No match exists: `SupplierBill` stands alone (`purchaseOrderId?`). OCR is an `AiProvider` feature (doc 09) over inbound mail (`InboundEmail`, built). Quantity matching needs E3                               |
| D7  | Supplier payment runs (select, approve, pay)                                           | ABC                | NATIVE | NAMED   | `treasury` (`PaymentRun`)                                                              | `RETAIL-ERP.md` Part 5 puts `PaymentRun` under `treasury`. Doc 249 (scoped) adds issued cheques. The rails are D8                                                                                              |
| D8  | Bank and payment rails (ACH, wire, card networks)                                      | ABC                | AUTH   | SCOPED  | file connector (doc 162), `FinancialInstitutionConnector` (doc 175), `PaymentProvider` | Networks NEWAX never becomes. Doc 175: NEWAX is never a money transmitter                                                                                                                                      |
| D9  | Budgeting and FP&A (budget vs actual, planning versions)                               | ID                 | NATIVE | NEW     | new module (name to reserve)                                                           | Absent per `GAP-ANALYSIS-ERP-FEATURE-COMPARISON.md`. Budgets are authored data, so they cannot live in `planning`, which is a read-only engine. Reads GL actuals                                               |
| D10 | International trade (import/export documents, letters of credit, customs, landed cost) | UNV WES            | NATIVE | NEW     | `purchasing` / `fulfilment` extension, or a new module (the brief decides)             | `GAP-ANALYSIS-ERP-FEATURE-COMPARISON.md`: import PO, L/C and export shipping detail are absent. Integration leg: customs filing (AUTH)                                                                         |
| D11 | Municipal billing                                                                      | FER                | —      | Q       | —                                                                                      | Cannot be bucketed from the research's two words (Q9)                                                                                                                                                          |

### E. Inventory, warehouse and handling

| #   | Capability                                                                                                                                              | Seen at                              | Bucket | Status  | Target                                               | Notes                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ | ------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Demand forecasting and replenishment planning                                                                                                           | PFG MOT OM                           | NATIVE | PARTIAL | `inventory`, `planning`                              | Built: `VariantForecast` (WO-9.3), reorder suggestions, and the supplier lead-time distribution (R25). Named: per-location `replenishment` and `forecasting` (`RETAIL-ERP.md` Part 5). Scoped: MRP (doc 242) and sourcing rules (doc 239)                                                          |
| E2  | Lot and serial traceability, expiry, recall                                                                                                             | UNV MED OM                           | NATIVE | BUILT   | `inventory` (lots, serialized units)                 | Docs 32 and 158, ADR-069. Named gap: the recall CSV export                                                                                                                                                                                                                                         |
| E3  | Units of measure and conversion (case/each, low-unit-of-measure picking, length, volume, weight)                                                        | OM PFG WES UNV                       | NATIVE | NAMED   | `catalog` + `inventory`                              | Item 7 of `RETAIL-VERTICAL-COVERAGE-MATRIX.md`, which doc 245 calls "sequenced". WO-245.5's `casePackQty` is an interim and must become a special case of this. Foundation X0.1: blocks E4, E5, E10, D6 and M4                                                                                     |
| E4  | Catch-weight (variable-weight units priced by weight)                                                                                                   | PFG                                  | NATIVE | NEW     | `catalog` + `inventory`                              | Needs E3                                                                                                                                                                                                                                                                                           |
| E5  | Continuous-measure selling and remnants (cut-to-length wire, cable reels)                                                                               | WES                                  | NATIVE | NAMED   | `cutting`                                            | `MULTI-SECTOR.md` lists `cutting` ("selling by continuous measure over an integer ledger, and accounting for the offcut") in the `home` pack. Electrical distribution is evidence that it belongs in core (§8 AD-4). Needs E3                                                                      |
| E6  | Warehouse management (RF receiving, bins, putaway, replenishment, waves, picking, packing, SSCC, loads, handhelds, outdoor yard bins)                   | ID BR PFG WES FAS MOT MED OM FER BFS | NATIVE | SCOPED  | `warehouse` (doc 237)                                | ADR-088. Outdoor lumber-yard stock is bins. Voice picking, pick-to-light and automation are L1 and L2                                                                                                                                                                                              |
| E7  | Cross-docking as its own flow                                                                                                                           | BR BFS OM                            | NATIVE | NAMED   | `warehouse`                                          | Doc 237 §10: a putaway rule today; a distinct flow is out of scope                                                                                                                                                                                                                                 |
| E8  | Cold chain: temperature-controlled zones, temperature-logged moves and shipments, excursion handling                                                    | PFG MED                              | NATIVE | NEW     | `warehouse`, `quality`                               | Nothing in docs 237 or 243 models temperature. An excursion becomes a quality hold (R30, doc 243). The sensors are L6                                                                                                                                                                              |
| E9  | Vendor-managed and customer-site inventory (par levels, two-bin kanban, onsite hubs, consignment, point-of-use, automated restock, consumption billing) | BR FAS OM                            | NATIVE | NEW     | new module (name to reserve)                         | The only trace is a code comment saying the digest is "not a vendor-managed-inventory platform" (`supply-chain-digest.cron.ts`). Customer sites become `Location` rows, and consumption becomes an order and an invoice (D1). Devices are L3 and L4. Restock rounds are a field workflow (§8 AD-5) |
| E10 | Bulk liquid inventory (tanks, terminals)                                                                                                                | UNV                                  | NATIVE | NEW     | `inventory` / `warehouse`                            | A tank is a bin or location with a capacity in volume units (E3). Gauge readings reconcile through the observed-count path (L0)                                                                                                                                                                    |
| E11 | Core charges and returnable deposits                                                                                                                    | PA                                   | NATIVE | NEW     | `pricing`, `fulfilment` returns, `receivables`       | A charge line at sale and a credit when the core comes back. Drums, cylinders and pallets have the same shape                                                                                                                                                                                      |
| E12 | Hazardous materials (product hazard data, SDS, shipping papers, hazmat routing)                                                                         | UNV                                  | NATIVE | NEW     | `catalog` attributes, `documents` (I8), `fulfilment` | Regulatory content must be verified (Q8)                                                                                                                                                                                                                                                           |
| E13 | Supplier certificates and certificates of analysis                                                                                                      | UNV                                  | NATIVE | NAMED   | `credentials`, `quality`                             | Doc 243 §5 calls CoA capture "a later `credentials`-style document", and `MULTI-SECTOR.md` names `credentials`. That document also says "may never be needed ... until a stated requirement arrives"; CoA by EDI is such a requirement, for the owner to confirm. The CoA arrives through doc 240  |
| E14 | Quality inspection and holds                                                                                                                            | MED UNV                              | NATIVE | SCOPED  | `quality` (doc 243)                                  | R30: a hold is a `Location`                                                                                                                                                                                                                                                                        |
| E15 | Regulated healthcare compliance (UDI, 21 CFR Part 11 records, tissue tracking)                                                                          | MED OM                               | NATIVE | NEW     | pack or core (Q10)                                   | Doc 243 §5 names Part 11 as a compliance regime of its own. The ICP puts healthcare second (Q10)                                                                                                                                                                                                   |
| E16 | Kit and procedure-tray assembly                                                                                                                         | MED                                  | NATIVE | BUILT   | `catalog` bundles, `bom`, `inventory` lots           | Docs 150 and 71. Multi-level BOMs are doc 242                                                                                                                                                                                                                                                      |
| E17 | Light manufacturing and assembly (components, millwork, blending, packaging)                                                                            | BFS PFG UNV                          | NATIVE | PARTIAL | `bom`, `manufacturing` (doc 242)                     | Built: recipes, runs, cost snapshots, genealogy. Scoped: routings, work centres and multi-level BOMs (doc 242)                                                                                                                                                                                     |
| E18 | EDI (850/855/856/810/997, healthcare EDI, retailer compliance)                                                                                          | UNV MED FAS                          | NATIVE | SCOPED  | `edi`, `vendorcompliance` (docs 240, 241)            | Integration leg: VAN or AS2 transport (AUTH) behind `EdiGateway`                                                                                                                                                                                                                                   |
| E19 | Inter-branch transfers and cross-branch DC staging                                                                                                      | MOT                                  | NATIVE | BUILT   | `transfers`                                          | R4's in-transit location                                                                                                                                                                                                                                                                           |
| E20 | Order routing and omnichannel fulfilment (will-call, ship-from-branch, branch order staging)                                                            | FER FAS                              | NATIVE | SCOPED  | `orderrouting` (doc 238)                             | Pickup handover is doc 238's `PickupHandover`. Locker hardware is L9                                                                                                                                                                                                                               |
| E21 | Railcar tracking                                                                                                                                        | UNV                                  | NATIVE | NEW     | asset register (J1) + in-transit `Location`          | Integration leg: railroad car-location data (AUTH). Whether it is in scope at all is Q12                                                                                                                                                                                                           |

### F. Delivery and fleet

| #   | Capability                                                                                                                       | Seen at            | Bucket | Status  | Target                                                 | Notes                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------ | ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Order-to-staging-to-dispatch pipeline (delivery fleet staging, delivery tickets, yard dispatch; takeaway 2)                      | ABC FER BFS SRS    | NATIVE | PARTIAL | `orderrouting` → `warehouse` → dispatch → `fulfilment` | Made of already-scoped work: fulfilment requests (238), pick, pack and `ShipmentLoad` (237), and delivery runs (WO-246.10). Delta: staging by route and truck, and delivery tickets                                                                                      |
| F2  | Own-fleet dispatch and route planning (multi-stop routes, vehicle capability and capacity, boom trucks, hot-shot on-demand runs) | PFG BEA PA MED ABC | NATIVE | NAMED   | `fieldforce` (doc 245 OD-F8)                           | WO-246.10 sketches delivery runs inside `fieldsales`. OD-F8 sets the trigger for extracting `fieldforce`, and this research meets it (§8 AD-5). Route optimisation is out of doc 247's scope; the solver is Q6. Capacity needs `dimensions` (NAMED in `MULTI-SECTOR.md`) |
| F3  | Proof of delivery (photo, signature, SMS, partial refusal)                                                                       | PFG BEA            | NATIVE | NAMED   | `fieldforce`, `fulfilment`                             | WO-246.10: position, photo, and partial refusal becoming a `fulfilment` return. The signature is I7, storage is I8, and the SMS channel is built                                                                                                                         |
| F4  | Customer-facing delivery tracking and ETA                                                                                        | BEA SRS            | NATIVE | NEW     | `fulfilment` tracking + F2                             | Doc 247 never tracks recipients. This shows the customer where their truck is and when it will arrive. Positions come from doc 247 or from telematics (L7)                                                                                                               |
| F5  | Driver location while on duty                                                                                                    | PFG BEA PA         | NATIVE | SCOPED  | `fieldtracking` (doc 247)                              | Doc 247 is independent of `fieldsales` so that "delivery riders or service" staff can use it                                                                                                                                                                             |
| F6  | Maps, geocoding, distance and travel time                                                                                        | PFG BEA PA MED     | AUTH   | NEW     | provider seam (name to reserve)                        | Mapping infrastructure is an authority. Today there is only haversine (doc 246) (Q4)                                                                                                                                                                                     |

### G. Product information

| #   | Capability                                                                                                                                                              | Seen at  | Bucket | Status  | Target                                            | Notes                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | PIM/MDM: category attribute schemas, completeness, de-duplication and merge, supplier content onboarding, catalogue normalisation across acquired branches (takeaway 1) | MOT; all | NATIVE | PARTIAL | `catalog`, `marketplace` (doc 166)                | Built: options, category presets, CSV import, custom fields, EAV, and the cross-tenant product reference (doc 166). Delta: attribute templates per category, data-quality scoring, merge. Core `Product` still carries apparel columns (`fabric`, `season`, `pieceCount`, `fabricMeters`). A PIM must not extend them |
| G2  | Product documents (spec sheets, SDS, manuals)                                                                                                                           | FER UNV  | NATIVE | NEW     | `catalog` + `documents` (I8)                      | Only `ProductImage` exists. `rag` indexes spec sheets for retrieval, not for the storefront                                                                                                                                                                                                                           |
| G3  | Vehicle fitment (ACES/PIES, parts lookup by vehicle)                                                                                                                    | PA       | NATIVE | NAMED   | `fitment` (core) + `vehicles` (`automotive` pack) | Named in `MULTI-SECTOR.md`, and by `module-packs.ts` ("a vehicle tree"). ACES/PIES import is new. Integration leg: the licensed reference databases (AUTH, Q4)                                                                                                                                                        |

### H. People

| #   | Capability                                               | Seen at     | Bucket | Status | Target                        | Notes                                                                      |
| --- | -------------------------------------------------------- | ----------- | ------ | ------ | ----------------------------- | -------------------------------------------------------------------------- |
| H1  | Recruiting (ATS)                                         | ID          | NATIVE | SCOPED | `hr` (doc 28)                 | No candidate model exists in code yet                                      |
| H2  | Core HR, payroll, absence                                | PFG ABC FER | NATIVE | BUILT  | `hr`, `payroll`, `attendance` | Docs 19–22 and 79. Itemised deductions are doc 40 (scoped)                 |
| H3  | Performance and learning                                 | ABC FER     | NATIVE | SCOPED | `hr` (docs 26, 27, 80)        | Docs 27 and 80 both define `TrainingCourse` (§9 finding 1)                 |
| H4  | Payroll tax tables and statutory filing outside Pakistan | PFG         | AUTH   | NEW    | provider (name to reserve)    | Tax authorities are AUTH. Whether NEWAX maintains the tables itself is Q11 |

### I. Collaboration, work and documents

| #   | Capability                                                                                              | Seen at         | Bucket           | Status  | Target                                         | Notes                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- | --------------- | ---------------- | ------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Knowledge base (wiki)                                                                                   | SRS ABC         | NATIVE           | NEW     | `content` (internal audience) + `rag`          | Absent per `GAP-ANALYSIS-ODOO-APPS.md`. Reuse the CMS block model and RAG retrieval. A new module only if an ADR finds a real boundary                |
| I2  | Project and work management (projects, milestones, boards, request intake)                              | SRS ABC MOT FER | NATIVE           | PARTIAL | `tasks` + projects                             | Built: tasks assigned to positions (doc 23). Delta: projects and milestones. §8 AD-6                                                                  |
| I3  | IT service management (incident, problem, change, configuration items)                                  | OM              | NATIVE           | PARTIAL | `support` + asset register (J1)                | Built: the helpdesk. Delta: incident, problem and change records. Configuration items are assets (J1)                                                 |
| I4  | Internal chat and channels                                                                              | BR ABC          | NATIVE           | NEW     | new module (name to reserve)                   | Absent per `GAP-ANALYSIS-ODOO-APPS.md`. Built neighbours: bulletins (doc 61) and meetings (doc 24)                                                    |
| I5  | Email, calendar and video meetings                                                                      | BR ABC          | NATIVE           | PARTIAL | `core/notifications`, `notify`, doc 205        | Built: self-hosted mail (doc 13), the mailbox inbox, and meetings (doc 24). Scoped: video (doc 205). A full mail and calendar client is Q3            |
| I6  | Office documents and spreadsheets                                                                       | BR ABC          | NATIVE (pending) | NEW     | —                                              | Q3, the largest scope question in this map                                                                                                            |
| I7  | Electronic signature                                                                                    | MOT ABC         | NATIVE           | NEW     | new module (name to reserve), over `documents` | Simple e-signature is native. Qualified signatures need a trust service (AUTH) (Q13)                                                                  |
| I8  | Enterprise document management (capture, index to records, retention, search: BOLs, lien waivers, PODs) | ABC             | NATIVE           | NEW     | `documents` (new)                              | Reuse `StorageService` and `rag`'s `DocumentSource`. Doc 28's vault and doc 54's expiry watcher become its consumers, never siblings. Foundation X0.6 |

### J. Assets and maintenance

| #   | Capability                                                                                  | Seen at    | Bucket | Status  | Target                         | Notes                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------- | ---------- | ------ | ------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J1  | Unified asset register (equipment, vehicles, tanks, racks, IT items)                        | UNV OM PFG | NATIVE | PARTIAL | `Asset` (in `hr` today)        | Built: `Asset`/`AssetAssignment` (doc 79) and depreciation (doc 147). But `Asset` models only an employee's custody. Who owns it is §8 AD-2. Foundation X0.5      |
| J2  | Maintenance (CMMS): preventive plans, work orders, meter readings, spare parts, calibration | UNV        | NATIVE | NEW     | `maintenance` (new)            | Absent per `GAP-ANALYSIS-ODOO-APPS.md`; doc 243 §5 names calibration out of scope. Spare parts move through `InventoryService.move()`                             |
| J3  | Installed base and predictive part failure (customer equipment)                             | MOT        | NATIVE | PARTIAL | `inventory` serials, `core/ai` | Built: `SerializedUnit` for sold units and `warrantyMonths`. Delta: an installed-base view per customer, failure prediction behind `AiProvider`, and sensors (L8) |

### K. Analytics and AI

| #   | Capability                                                                                        | Seen at         | Bucket | Status  | Target                 | Notes                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------- | --------------- | ------ | ------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Self-service BI (dashboards, pivots, report builder; KPIs such as fill rate, route profitability) | PFG MED WES MOT | NATIVE | PARTIAL | `analytics`, `reports` | Built: 26 analytics routes and 12 CSV exports. Named: a general report builder (doc 89). Grafana-style operational monitoring is ADR-017 (open) |
| K2  | Data warehouse / external data platform                                                           | WES MOT OM      | NATIVE | NAMED   | doc 122                | Doc 122 calls a data lake premature and states a measurable trigger. The vector store is doc 121                                                |
| K3  | Predictive analytics (replenishment scheduling, failure prediction, case-supply forecasting)      | MOT OM          | NATIVE | PARTIAL | `core/ai`, `planning`  | Built: `AiProvider`, `VariantForecast`, propagation (R21). Named: `forecasting`. Surgical-case forecasting waits on Q10                         |

### L. Connected Infrastructure

The hardware bucket, under the ICP's own term. Every driver sits over the
foundation in L0, never in a module of its own.

| #   | Capability                                                                                                                        | Seen at                     | Bucket       | Status | Target                                    | Notes                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------ | ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0  | Connected-infrastructure foundation: one device principal, telemetry intake, thresholds and alerts, observed-count reconciliation | FAS UNV MED PA (takeaway 3) | NATIVE       | NEW    | core (name to reserve)                    | Five device shapes exist or are planned today: `AttendanceDevice` and `PosTerminal` (built), and `FieldDevice` (246), handheld credentials (237) and `RfidReader` (244) (scoped). One foundation (§8 AD-1). Alerts reuse `notify` (built) |
| L1  | Material-handling automation: ASRS, AMRs, WES/put-to-light, conveyors, sortation, auto-boxing, print-and-apply, yard robots       | MED PA FAS MOT BFS          | HW           | NAMED  | `warehouse` extension point over L0       | Doc 236 §14 and doc 237 §10 name automated storage and pick-to-light out of scope. Wave release and task orchestration stay native in `warehouse`                                                                                         |
| L2  | Voice-picking headsets                                                                                                            | PFG BR                      | HW (pending) | NAMED  | `warehouse`                               | Named out of scope in doc 237 §10. The alternative is native voice through doc 135 (Q5)                                                                                                                                                   |
| L3  | Dispensing, vending and smart bins (weight, scan)                                                                                 | FAS                         | HW           | NEW    | driver over L0 → E9                       |                                                                                                                                                                                                                                           |
| L4  | RFID readers                                                                                                                      | OM FAS                      | HW           | SCOPED | `rfid` (doc 244)                          | `RfidReaderDriver`. Generalise its observed count into L0 (§8 AD-1)                                                                                                                                                                       |
| L5  | Tank-level and process sensors                                                                                                    | UNV                         | HW           | NEW    | driver over L0 → E10                      |                                                                                                                                                                                                                                           |
| L6  | Temperature loggers                                                                                                               | PFG MED                     | HW           | NEW    | driver over L0 → E8                       |                                                                                                                                                                                                                                           |
| L7  | Vehicle telematics and ELD                                                                                                        | PFG UNV BEA MED PA          | HW           | NAMED  | telematics provider over L0 → F2, F4      | Doc 247 §10: "a vehicle GPS device is a different principal, sequenced if a customer names one". An ELD is a certified device                                                                                                             |
| L8  | Equipment condition sensors and meters                                                                                            | MOT UNV                     | HW           | NEW    | driver over L0 → J2, J3                   |                                                                                                                                                                                                                                           |
| L9  | Pickup lockers                                                                                                                    | FER                         | HW           | NEW    | driver over L0 → doc 238 `PickupHandover` |                                                                                                                                                                                                                                           |
| L10 | Network security appliances (firewalls, SD-WAN)                                                                                   | WES                         | HW           | N/A    | —                                         | No business data flows through them (Q14)                                                                                                                                                                                                 |

### M. CAD and engineering

| #   | Capability                                                                                    | Seen at | Bucket | Status  | Target          | Notes                                                                                                |
| --- | --------------------------------------------------------------------------------------------- | ------- | ------ | ------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| M1  | CAD/BIM modelling and structural design (truss engineering, extracting data from blueprints)  | BFS     | CAD    | PENDING | —               | The owner decides (Q1). Not scoped                                                                   |
| M2  | Blueprint takeoff and estimating                                                              | SRS     | CAD    | PENDING | —               | Q1                                                                                                   |
| M3  | 3D visualisation and digital sales presentation                                               | ABC BFS | CAD    | PENDING | —               | Q1. The rules-based configurator is B4 (native)                                                      |
| M4  | Ingesting CAD and takeoff output (extracted BOM, quantities) into quotes, BOMs and production | BFS SRS | NATIVE | NEW     | `quotes`, `bom` | Native whichever way Q1 goes: NEWAX stores the output and the extracted BOM as data. Needs E3 and B3 |

## 5. Zero-duplication rulings this map carries into every future brief

Each line is a place where the research would tempt a second
implementation. The first brief to touch it must honour it.

1. **One device principal.** Vending machines, smart bins, tank gauges,
   temperature loggers, telematics units, lockers, RFID readers and
   handhelds all register through L0. No vendor or device class gets its
   own registry or credential table. Doc 244's `RfidReader` and doc 246's
   `FieldDevice` fold into L0 before they are built (§8 AD-1).
2. **One observed-count path.** A sensor reading that disagrees with book
   stock raises a suspect for a human: an RFID count, a bin weight or a tank
   gauge. Doc 244's `RfidObservedCount` → `inventory` suspect is the
   pattern, generalised over the source rather than repeated per sensor.
3. **One asset register.** Equipment, vehicles, tanks, railcars and IT
   configuration items extend the one `Asset`. Maintenance (J2), dispatch
   (F2), ITSM (I3) and railcars (E21) never create `Equipment`, `Vehicle`
   or `ConfigurationItem` tables (§8 AD-2).
4. **One commercial-document family.** Quotes, invoices and credit notes
   follow R18's `Quote → Order → Invoice` chain. The partner-only
   `Quote`/`Invoice` in `invoicing.prisma` is generalised, never shadowed
   by a customer copy (§8 AD-7).
5. **One unit-of-measure engine.** Catch-weight, continuous measure, bulk
   volume, case packs and low-unit-of-measure picking are all conversions
   over E3. WO-245.5's `casePackQty` becomes one case of it.
6. **One document store.** Bills of lading, PODs, lien waivers, CoAs, SDS,
   spec sheets and employee documents all live in `documents` (I8). Doc
   28's vault, doc 54's expiry watcher and `rag`'s `DocumentSource` consume
   it.
7. **One negotiated-terms engine.** Rebates, contract tiers and special
   pricing claims are `agreements`. `pricing` still resolves "what does this
   buyer pay". `promotions` stays the consumer-discount engine. None of the
   three absorbs another's job.
8. **One commission computation.** `commissions` produces the figure and
   `payroll`'s existing COMMISSION basis pays it. Payroll never computes
   commission itself.
9. **One field-force substrate.** Delivery runs, VMI restock rounds and
   field sales share devices, days, custody and stops (doc 245 OD-F8).
10. **One mapping seam.** Route planning, delivery ETA, geofencing and
    check-in verification all call F6. Haversine stays the offline fallback.

## 6. Roadmap for the 55 rows that need a brief

These are tranches in doc 236 §12's sense: a dependency graph, not a
priority list.

- **Which tranche starts first** is the owner's call from the first real
  customer, as it is for docs 236 and 245.
- **Prefixes.** Tranche ids use an `X` prefix so they never collide with
  doc 236's SC0, W, O, E, Q, M, R and N or doc 245's F.
- **What is built here.** Nothing: the next artefact for each row is its
  brief.

### 6.1 The graph

```
Already-scoped programs this map depends on (not re-scoped here)
  SC0 ─┬─ W (237) ─┬─ E (240/241; its E0 is the R18 invoicing brief, doc 236 OD-2)
       ├─ O (238/239)       Q (243)   M (242)   R (244)   N (site nodes)
  T  = treasury (249/250) ── F (245–248, incl. WO-246.10 delivery runs)
  CN = connectors (36/132/160/162/172)    AP = app platform (184–195)
  HR = docs 26/27/28/80

X0  Foundations: ADRs first (§8), then shared primitives
    X0.1 UoM (E3) ................................. needs SC0
    X0.2 invoicing (D1) = E0, pulled forward ...... needs nothing new
    X0.3 CustomerAccount (B1 delta) ............... needs nothing new
    X0.4 device foundation (L0) ................... needs ADR AD-1 (+ R31, doc 245 OD-F7)
    X0.5 asset register (J1 delta) ................ needs ADR AD-2
    X0.6 documents (I8) ........................... needs nothing new
    X0.7 automations (A9) ......................... ADR AD-3; gates nothing below

X0.1 ─┬─ XI  E4 catch-weight · E5 cutting (ADR AD-4) · E10 bulk
      ├─ XF  D6 three-way match
      └─ XM  M4 takeoff quantities
X0.2 ─┬─ XS  B3 quotes · B7 agreements · B8 commissions
      ├─ XF  D2 auto-match (+F/doc 248) · C9 pay-by-invoice · D7 payment runs (+T)
      └─ XI  E11 core charges
X0.3 ─┬─ XS  B13 jobs ─→ B14 lien rights (+X0.6, +I7)
      └─ XV  E9 VMI (+X0.1, +X0.2; telemetry optional via X0.4)
X0.4 ─┬─ XL  L1 (+W) · L2 · L3 (+XV) · L5 (+E10) · L6 (+E8) · L7 (+XD) · L8 (+XA) · L9 (+O)
      └─ XD  F4 customer ETA
X0.5 ─┬─ XA  J2 CMMS · J3 installed base
      ├─ XC  I3 configuration items
      └─ XD/XI vehicles (F2), railcars (E21)
X0.6 ─┬─ XC  I7 e-signature · I1 knowledge (content + rag)
      ├─ XP  G2 product documents (+G1)
      ├─ XI  E13 CoA (+Q, +E) · E12 SDS (+G1)
      └─ XD  F3 POD (+F2)
F + W ─── XD  F2 dispatch (ADR AD-5: fieldforce) ─→ F3 POD ─→ F4 ETA; F6 mapping seam
G1 delta ─ XP  G3 fitment + vehicles pack
XK: K2 only on doc 122's trigger      XH: H4 after Q11
XM: M4 after B3 and bom; M1–M3 wait on Q1
```

### 6.2 The tranches

| Tranche                                 | Rows that need a brief                                                                                                                                                                | Count  | Needs                                    | Extension deltas riding along (PARTIAL rows)                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **X0** Foundations                      | E3 UoM, D1 invoicing (doc 236 tranche E0), L0 device foundation, I8 documents, A9 automations                                                                                         | 5      | SC0; ADRs AD-1, AD-2, AD-3, AD-7         | B1 → `CustomerAccount`, J1 → asset register                                                                                                          |
| **XS** Sell side                        | B2 opportunities, B3 quotes/CPQ, B4 configurator, B7 agreements, B8 commissions, B10 events, B11 external leads, B13 jobs, B14 lien rights, C5 punchout, C10 reservation, C11 imagery | 12     | X0.1, X0.2, X0.3, X0.6; E (C5); bom (B4) | B5 contract tiers, B6 price governance, C2 jobs in app, C7 shop-system ordering                                                                      |
| **XF** Finance automation               | D4 credit bureau, D6 AP capture and match, D7 payment runs, D9 budgeting, D10 international trade                                                                                     | 5      | X0.1, X0.2; T; CN (doc 162); F (doc 248) | A4 intercompany brief, A5 customer FX, C9 pay-by-invoice, D3 credit applications, D5 collections; plus D2 auto-match, an amendment to scoped doc 248 |
| **XI** Inventory specialities           | E4 catch-weight, E5 cutting, E7 cross-dock, E8 cold chain, E10 bulk, E11 core charges, E12 hazmat, E13 CoA, E15 healthcare, E21 railcars                                              | 10     | X0.1, X0.2, X0.5, X0.6; W, Q, E          | E1 per-location replenishment                                                                                                                        |
| **XV** Customer-site inventory          | E9 VMI                                                                                                                                                                                | 1      | X0.1, X0.2, X0.3; R (observed counts)    | —                                                                                                                                                    |
| **XD** Delivery                         | F2 dispatch, F3 POD, F4 customer ETA, F6 mapping seam                                                                                                                                 | 4      | F (246/247), W (loads), X0.5, X0.6       | F1 staging by route and truck                                                                                                                        |
| **XP** Product information              | G2 product documents, G3 fitment                                                                                                                                                      | 2      | X0.6                                     | G1 attribute templates, quality scoring, merge                                                                                                       |
| **XC** Collaboration and work           | I1 knowledge, I4 chat, I6 office (if Q3 says yes), I7 e-signature                                                                                                                     | 4      | X0.5 (I3), X0.6                          | B12 routing, I2 projects (ADR AD-6), I3 ITSM, I5 mail/calendar                                                                                       |
| **XA** Assets and maintenance           | J2 CMMS                                                                                                                                                                               | 1      | X0.5                                     | J3 installed base                                                                                                                                    |
| **XK** Analytics                        | K2 data platform                                                                                                                                                                      | 1      | doc 122's trigger                        | K1 report builder (doc 89), K3 predictive                                                                                                            |
| **XH** People                           | H4 payroll tax                                                                                                                                                                        | 1      | Q11                                      | —                                                                                                                                                    |
| **XL** Connected-infrastructure drivers | L1 MHE, L2 voice, L3 dispensing, L5 tank sensors, L6 temperature, L7 telematics, L8 condition sensors, L9 lockers                                                                     | 8      | X0.4 plus the owning capability (graph)  | —                                                                                                                                                    |
| **XM** CAD outputs                      | M4 ingestion                                                                                                                                                                          | 1      | X0.1, B3; Q1 for M1–M3                   | —                                                                                                                                                    |
| **Total**                               |                                                                                                                                                                                       | **55** |                                          | **21** of the 26 PARTIAL deltas; 5 more below                                                                                                        |

H1 and H3 need no brief: docs 28, 26, 27 and 80 already scope them.

Five PARTIAL deltas ride on programs that are already scoped, not on an
`X` tranche. They are amendments to those briefs:

- A3's latency target goes into doc 238 (O).
- A7's organisation API is docs 34/189 and 184–195 (AP).
- A10's infrastructure-as-code is doc 124.
- C8's discovery and transact are doc 165.
- E17's routings and work centres are doc 242 (M).

### 6.3 How the tranches answer the research and the ICP

| Problem                                                 | Where it is answered                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Research 1 / ICP 1: fragmented and disconnected systems | A6 (CN, docs 172/179), G1 (catalogue normalisation), K1 (one reporting surface), X0 |
| Research 2: digital ordering to physical dispatch       | O → W → XD (F1–F4), plus E20                                                        |
| Research 3 / ICP 6: telemetry and physical visibility   | X0.4 → XL, XV (automated restock reconciliation), XI (E8, E10)                      |
| ICP 2: manual reconciliation and repetitive work        | XF (D2, D6, D7), A9                                                                 |
| ICP 3: poor visibility                                  | K1, and the drill-down dashboards already built (R19)                               |
| ICP 4: inventory and transaction discrepancies          | R (doc 244) generalised by L0's observed-count path, XV, E2 (built)                 |
| ICP 5: infrastructure that does not scale               | A2's tracked gaps (L2 reads, S4 boot), which SC0 already schedules                  |

## 7. Could not bucket: questions for the owner

Each is a real ambiguity. None is guessed. Resolutions below are dated and
sourced — owner decisions are the owner's own call; engineering calls are
this session's, made because getting them wrong costs nothing to reverse
and leaving them open would block §6's tranches for no reason.

1. **Q1 — CAD/BIM, takeoff and 3D engines (M1–M3).**
   - Is the modelling engine itself a native build or an integration point?
   - The coordinator's working default, not yet confirmed: NEWAX stores and
     references the CAD output and the extracted BOM as data (M4), and
     never rebuilds the modelling or structural-calculation engine.
   - **Resolved (engineering call, 2026-10-11): confirmed.** CAD/BIM/takeoff
     stay CAD/PENDING (M1–M3); M4 (ingestion) is native regardless of how
     Q1 ultimately lands, per its own row.
2. **Q2 — Legacy ERPs after an acquisition (A6).**
   - Option (a): migrate, run in parallel, then cut over (doc 179's
     `SystemOfRecordCutover`).
   - Option (b): also support a long-lived two-way bridge to a division's
     retained legacy ERP.
   - "Only one software" suggests (a); the research's "without multi-year
     rip-and-replace" suggests (b) as a transition. The answer decides
     whether connectors must write back.
   - **Resolved (owner decision, 2026-10-11): both.** Migration and cutover
     (doc 179) stays the default path. In addition, NEWAX supports a
     long-lived two-way bridge to a retained legacy ERP for a division that
     is not cutting over on the acquisition timeline. This is new, durable
     scope on every inbound connector (docs 36, 132, 160, 162, 172): each
     must support bidirectional write-back, not just inbound ingestion, as
     a first-class mode rather than a transition artifact. Doc 172's
     ingestion-boundary brief must be revised before any A6 connector is
     built under this mode; record this as its own ADR when that brief is
     written, since it changes doc 172's own stated boundary.
3. **Q3 — Office productivity (I6, and the client side of I5).**
   - Option (a): "everything" includes a native word processor, spreadsheet,
     presentation editor and mail/calendar client replacing Microsoft 365.
   - Option (b): NEWAX stops at business documents (generated, stored,
     signed, searched) and messaging.
   - This one answer moves the scope more than any other in the map.
   - **Resolved (owner decision, 2026-10-11): option (a), full Office
     replacement.** I6 (office documents and spreadsheets) and the client
     side of I5 (mail and calendar) are in scope as native capabilities, not
     gated by anything further. This is the single largest scope item in
     this map — a word processor, spreadsheet, presentation editor and
     mail/calendar client are each their own multi-tranche program, not a
     row inside XC. **Not scoped here.** XC's I6/I5 entries in §6.2 name
     the rows; a program of this size needs its own doc-of-record and its
     own tranche breakdown before a brief is written, the same way docs 236
     and 245 exist before their work orders do. That doc is future work,
     named here so it is not silently assumed into XC's existing scope.
4. **Q4 — Third-party data feeds as AUTH.** Confirm that these are
   authorities or networks NEWAX should never become:
   - weather and storm data (B11);
   - aerial imagery (C11);
   - credit bureaus (D4);
   - maps and geocoding (F6);
   - licensed vehicle-configuration reference data behind ACES/PIES (G3);
   - railroad car-location data (E21).

   The alternative is NEWAX operating sensor networks, aircraft or a credit
   bureau.

   **Resolved (engineering call, 2026-10-11): confirmed, all six are AUTH.**
   None of the alternatives (NEWAX as a weather service, an aerial survey
   operator, a credit bureau, a mapping authority, a licensed data
   publisher, or a railroad) is this product.

5. **Q5 — Voice picking (L2).** Integrate a voice-picking vendor's headset
   system, or deliver voice natively through doc 135's intent router on
   NEWAX's own handheld app? Speech recognition then becomes an `AiProvider`
   dependency.
   - **Resolved (engineering call, 2026-10-11): integrate a vendor's headset
     system first** (L2 stays HW, as doc 237 §10 already has it). Native
     voice through doc 135 is a named future upgrade if volume or cost ever
     justifies it, not a precondition for L2 to ship.
6. **Q6 — The route-optimisation solver (F2).** A native solver (a
   vehicle-routing heuristic in `packages/shared`), or a routing provider
   behind an extension point? The map data itself is Q4.
   - **Resolved (engineering call, 2026-10-11): a routing provider behind an
     extension point.** Vehicle routing is a research problem, not
     line-of-business software; haversine (doc 246) stays the offline
     fallback per §5 ruling 10.
7. **Q7 — Construction lien rights (B14).**
   - Is it in scope for a first market that may not be the US?
   - If so, is it a sector pack or core?
   - Who supplies the statutory content (deadlines, notice forms per
     jurisdiction)? It cannot be invented here.
   - **Still open — owner input needed.** This is jurisdiction-specific
     statutory content, not an engineering judgment call; it cannot be
     answered from this repository. B14 stays NEW/blocked until the first
     target jurisdiction is named.
8. **Q8 — Hazardous materials (E12).** Which regimes apply to the first
   customers (for example US DOT, GHS safety data sheets, European road
   rules, air and sea codes)? Content is verified, never invented.
   - **Still open — owner input needed**, for the same reason as Q7.
9. **Q9 — Municipal billing (D11).** The research gives only these two
   words, for Ferguson. Is it:
   - (a) public-sector invoicing rules (tax-exempt, PO-mandatory, progress
     billing);
   - (b) metered utility billing (like housing-society doc 230's utility
     line);
   - (c) something else?
   - **Still open — owner input needed.** D11 cannot be bucketed past this
     until the owner says which of (a)/(b)/(c), or confirms it is not worth
     pursuing for one mention at one company.
10. **Q10 — Regulated healthcare (E15, the surgical-case forecasting in K3,
    and Owens & Minor's patient-direct line).** The ICP sequences healthcare
    second.
    - Build UDI, Part 11 records and tissue tracking into the distribution
      core now, or wait for the healthcare market gate?
    - Where an authority database is involved (device identifiers,
      pharmaceutical traceability), it is AUTH.
    - **Resolved (owner decision, 2026-10-11): wait for the healthcare
      market gate.** E15, K3's surgical-case forecasting, and Owens &
      Minor's patient-direct line are deferred — not scoped, not briefed —
      until a named healthcare customer makes the requirement real. Device
      identifier and pharmaceutical-traceability databases are AUTH
      whenever this is revisited.
11. **Q11 — Payroll tax outside Pakistan (H4).** Use a tax-table and filing
    provider (AUTH), or have NEWAX maintain statutory tables per
    jurisdiction?
    - **Still open — owner input needed.** Depends on which jurisdictions
      are actually targeted; cannot be guessed.
12. **Q12 — Railcar tracking (E21).** Only one of the 15 needs it. Is it in
    scope?
    - **Resolved (engineering call, 2026-10-11): out of scope for now.** One
      customer in fifteen does not justify an AUTH integration leg to
      railroad car-location data. Revisit if a second distributor profile
      needs it.
13. **Q13 — Electronic signature level (I7).** Simple electronic signatures
    are native. Do target jurisdictions need qualified signatures, which
    need a trust service provider (AUTH)?
    - **Still open — owner input needed**, for the same reason as Q7/Q11:
      jurisdiction-dependent. Simple e-signature proceeds as native
      regardless (I7's NEW status is unaffected).
14. **Q14 — Network appliances (L10).** Confirm they are out of scope. An
    optional extension: should Connected Infrastructure watch branch WAN
    health as an input to POS-offline and replication health?
    - **Resolved (engineering call, 2026-10-11): confirmed out of scope**,
      including the WAN-health extension. No business fact flows through a
      firewall or SD-WAN appliance; L10 stays N/A.

## 8. Decisions the roadmap waits on (ADR candidates, not written here)

| #    | Decision                                                                                                                                                                                                                           | Blocks           | Recommendation in brief                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| AD-1 | One connected-infrastructure foundation. It folds doc 244's `RfidReader`/`RfidObservedCount`, doc 246's `FieldDevice` and doc 237's handheld credentials into one device principal and one observed-count path before any is built | X0.4, XL, XV     | Yes, after R31 (doc 245 OD-F7), whose "a device is not a node" it builds on                             |
| AD-2 | Who owns `Asset`. Extract it from `hr` into a core asset register that `hr` (custody), `accounting` (depreciation), maintenance, dispatch and ITSM consume                                                                         | X0.5, XA, XC, XD | Extract. Keeping it in `hr` would force several new couplings into a people module                      |
| AD-3 | A generic automations engine. This reopens doc 95's decline, with the owner's mandate as the new evidence                                                                                                                          | A9               | Decide explicitly. README's own trigger ("two or three one-off automations") is now met many times over |
| AD-4 | `cutting` from the `home` pack to core                                                                                                                                                                                             | E5               | Core. Electrical and building-materials distribution use it, which is `MULTI-SECTOR.md`'s own test      |
| AD-5 | Extract `fieldforce` now. Doc 245 OD-F8's trigger is "a second non-sales field workflow"; delivery runs and VMI restock rounds are two                                                                                             | XD, XV           | Extract before WO-246.10 is built                                                                       |
| AD-6 | One `Project` concept (internal work, customer job) or two                                                                                                                                                                         | B13, I2          | Open; actors and lifecycles differ, so the brief must argue it                                          |
| AD-7 | R18 `invoicing`: generalise the partner-only `Quote`/`Invoice`. This is already doc 236 OD-2; the map adds B3, B7, B8, C9, D2's matching, E9's consumption billing and E11 as dependants                                           | X0.2, XS, XF     | Doc 236's own option (a)                                                                                |
| AD-8 | What a stock reservation is: a move into a non-promisable location (the R30 pattern) or a derived allocation (R28)                                                                                                                 | C10              | Open                                                                                                    |

## 9. Findings made while checking (not matrix rows)

1. **Docs 27 and 80 both define `TrainingCourse`.** Doc 27 adds `TrainingSession` and
   `TrainingEnrollment`; doc 80 adds `TrainingCompletion`. Doc 80 says no
   training model exists "anywhere in this repository", which is true of
   the code but not of the documents. Reconcile them before either is
   built.
2. **Core `Product` still carries apparel columns** (`fabric`, `season`,
   `pieceCount`, `fabricMeters`). They matter for G1: a distributor's
   attribute model must not grow from them.
3. **`GAP-ANALYSIS-ODOO-APPS.md` calls IoT "out of scope".** That was true
   for its scope on its date. The owner's mandate and the ICP's Connected
   Infrastructure capability supersede it. The same holds for its VOIP
   line, which doc 159 has since scoped. The snapshot is left unedited,
   like its sibling (`RETAIL-VERTICAL-COVERAGE-MATRIX.md`'s own practice).
4. **Five device-credential shapes** exist or are planned (L0). This is the
   largest latent duplication the research would multiply: one more per
   hardware vendor.

## 10. Documents this changes

**Made in this change:** `docs/implementation/README.md` gains doc 253's
entry.

**Proposed, not made.** Each waits for the owner's approval of the
bucketing or of the §8 decision named:

| Document                             | Amendment                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `MULTI-SECTOR.md`                    | `cutting` moves to core (AD-4). `credentials` and `commissions` gain the stated requirements recorded in rows E13 and B8 |
| `RETAIL-ERP.md`                      | Part 5 gains the module names the briefs reserve. Part 3's `CustomerAccount` gains job sites (B13)                       |
| Doc 237                              | §10 gains pointers to E7, E8, L1 and L2                                                                                  |
| Doc 243                              | §5's CoA line points to E13                                                                                              |
| Doc 244                              | Its reader and observed-count model generalise into L0 (AD-1)                                                            |
| Docs 245/246                         | OD-F8 is recorded as triggered and WO-246.10 moves to `fieldforce` (AD-5)                                                |
| Doc 240                              | Its cXML deferral points to C5                                                                                           |
| `RETAIL-VERTICAL-COVERAGE-MATRIX.md` | Gains a pointer to this map for distribution                                                                             |

## 11. The five pillars

| Pillar              | How this map protects it                                                                                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proper architecture | Every row names one owner module. Every integration point sits behind an extension point (§3). §5's ten rulings stop the second implementation before it is written. No pack is proposed except where `MULTI-SECTOR.md` already places one (`vehicles`) or the owner decides (Q7, Q10) |
| Scalable systems    | Where scale is claimed but unmeasured (A3, C3), the map says so and requires a number in the brief. It invents none                                                                                                                                                                    |
| Secure by design    | Device and vendor principals converge on one credential model (L0) rather than five. Authority credentials stay behind providers                                                                                                                                                       |
| Stable & reliable   | §3 requires a failure mode, an idempotency key and a recovery path for every integration leg, with doc 38's circuit breaker                                                                                                                                                            |
| Observable          | Exceptions surface in NEWAX queues (§3 rule 2). Operational monitoring stays ADR-017's open decision; no APM is claimed                                                                                                                                                                |

## Appendix A. Every product the research names, and its rows

| Company                      | Product or system named in the research → rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imperial Dade (ID)           | VAI S2K Enterprise → A1, A6 · DDI Inform, Epicor P21 → A1, A6 · Salesforce Sales Cloud → B1, B2 · Salesforce Service Cloud → B12 · VAI S2K WMS, HighJump (Körber) → E6 · HighRadius RadiusOne AR Suite → D2, D3, D5 · Planful → D9, A4 · Imperial Dade B2B Order Portal → C1 · iCIMS Recruit → H1                                                                                                                                                                                                                                        |
| BradyIFS / Envoy (BR)        | VAI S2K → A1 · Epicor P21, Infor SX.e, NetSuite → A1, A6 · Salesforce CRM → B1, B2 · Optimizely Configured Commerce → C1, C3, C5 · Optimizely Data Platform → C4 · Infor WMS/HighJump (bins, cross-docking, pick-to-voice) → E6, E7, L2 · VMI Gateway → E9 · Microsoft 365/Teams → I4, I5, I6                                                                                                                                                                                                                                            |
| SRS Distribution (SRS)       | DMSI Agility (multi-yard inventory, credit terms) → A1, D3 · Home Depot Pro-Integration Layer → A7 · Salesforce Service Cloud (inquiry routing, cases, yard dispatch) → B12, F1 · Roof Hub (order tracking, aerial job-site photos, live reservation) → C2, C11, C10, F4 · STACK Construction Technologies → M2, M4 · Atlassian Jira & Confluence → I2, I1                                                                                                                                                                               |
| Performance Food Group (PFG) | SAP ECC 6.0/S/4HANA (ledger, procurement forecasting, rebate contracts) → A1, E1, B7 · Infor Supply Chain (food manufacturing, packaging) → E17 · Blue Yonder WMS (cold storage, pick-to-voice, wave replenishment) → E6, E8, L2 · Manhattan WMS (Vistar) → E6 · Omnitracs (multi-temp telematics, route optimisation, ELD, POD) → L7, L6, F2, F3 · OpenText VIM → D6 · Power BI (catch-weight, route profitability, fill rate) → K1, E4 · PerformanceNet / Vistar portal → C1 · ADP Enterprise / Total Absence Management → H2, H4      |
| ABC Supply (ABC)             | DMSI Agility (branch inventory, delivery fleet staging, contractor accounts) → A1, F1, B1 · Oracle JD Edwards, Epicor Eclipse → A1, A6 · FIS Integrated Payables / GetPaid → D7, D8, D5 · Billtrust (e-invoicing, trade credit, contractor statements) → D1, D3, C9 · Vendavo → B6, B5 · SAP Commissions → B8 · Hyland OnBase (BOLs, lien waivers, PODs) → I8, B14, F3 · AWS (eCommerce, API order gateway, mobile apps) → A10, A7, C2 · Pictureit → M3 · Workday → H2, H3 · Microsoft 365/Teams → I4, I5, I6 · Jira/Confluence → I2, I1 |
| Builders FirstSource (BFS)   | Epicor BisTrack (yard inventory, delivery ticketing) → A1, E6, F1 · Paradigm Nexus ERP (component manufacturing, pre-hung doors, millwork) → E17, B4 · SAP EWM (component staging, robotic yard inventory, cross-docking) → E6, E7, L1 · Paradigm CAD/BIM Suite (blueprint extraction, truss fabrication, BOM generation) → M1, M4 · Paradigm Vendo → M3, B4 · Salesforce Sales Cloud → B1 · Azure & AWS (portal, BI) → A10, K1                                                                                                          |
| Wesco (WES)                  | Oracle Cloud ERP & EBS (GL, intercompany procurement, project supply) → A1, A4, B13 · Oracle JDE EnterpriseOne → A1, A6 · Salesforce Sales Cloud & CPQ (quoting, project bids, BOM) → B1, B3, B4 · Infor WMS/HighJump (wire cutting, cable reels, bin replenishment) → E6, E5 · Google BigQuery → K2, K1 · Microsoft Power Automate → A9, D6 · Algolia → C3 · Fortinet firewalls & SD-WAN → L10                                                                                                                                          |
| Univar (UNV)                 | SAP ECC/S/4HANA (chemical lots, hazmat documents, railcar tracking, GL) → A1, E2, E12, E21 · Oracle Cloud ERP (subsidiaries, international trading) → A1, D10, A5 · MaintainX → J2, J1 · FIS GETPAID → D3, D5 · Geotab (tanker tracking, driver safety, hazmat routing) → L7, E12 · ChemCentral Digital Marketplace → C8 · OpenText Business Network (POs, ASNs, CoA) → E18, E13                                                                                                                                                         |
| Fastenal (FAS)               | Proprietary core ERP (sub-second lookups across 3,300+ locations) → A1, A3 · Oracle Cloud WMS + Intellinum FlexiPro (mobile scanning, FASTVend restocking) → E6, E9 · Manhattan/Blue Yonder modules (sortation) → E6, L1 · FMI telemetry stack (bin weight, RFID, dispensing events) → L0, L3, L4, E9 · Fastenal Punchout Gateway (cXML/EDI into Ariba, Coupa, Oracle iProcurement) → C5, C6, E18 · Azure → A10                                                                                                                          |
| Motion Industries (MOT)      | IBM iSeries custom core → A1, A6 · GPC modernisation API layers → A7 · Manhattan WMS (conveyor routing, cross-branch DC staging) → E6, L1, E19 · Stibo STEP MDM → G1 · BigQuery & Grafana → K1, K2 · MongoDB & Vertex AI (part-failure prediction, replenishment scheduling) → K2, K3, J3, E1 · HubSpot & Salesforce (engagement, service routing, seminars) → B1, B9, B12, B10 · Wrike → I2 · DocuSign → I7                                                                                                                             |
| Medline (MED)                | SAP S/4HANA (FDA compliance, lot traceability, kit assembly, contract pricing) → A1, E2, E15, E16, B5, B7 · Manhattan WMS → E6 · AutoStore ASRS → L1 · MedTrans fleet routing (refrigerated trucks, temperature logging) → F2, L6, E8 · Tableau & Power BI → K1 · Stacksync / two-way healthcare EDI (850, 856, 810) → A8, E18                                                                                                                                                                                                           |
| Owens & Minor (OM)           | Infor CloudSuite / Oracle Financials → A1 · QSight (point-of-use inventory, RFID, tissue tracking, automated reorder) → E9, L4, E15 · QSight Kanban two-bin → E9 · Google Cloud (predictive hospital inventory, case forecasting) → K3, A10 · Blue Yonder WMS (cross-dock, low-unit-of-measure ward delivery) → E6, E7, E3 · ServiceNow → I3                                                                                                                                                                                             |
| Beacon (BEA)                 | Infor M3 / custom core → A1 · QXO modernisation stack → A6 · Beacon PRO+ (ordering, local inventory, truck tracking, storm leads) → C1, A3, F4, B11 · Descartes / Omnitracs (boom-truck dispatch, rooftop routing, SMS and photo POD) → F2, F3, L7 · Salesforce Sales Cloud → B1                                                                                                                                                                                                                                                         |
| Ferguson (FER)               | Oracle Cloud ERP (multi-currency, municipal billing) → A1, A5, D11 · Custom core distribution engine (trade-counter POS, contractor credit, branch order staging) → A1, C12, D3, F1, E20 · Blue Yonder WMS → E6 · Salesforce Sales & Service Cloud → B1, B12 · Adobe Workfront → I2 · Workday → H2, H3 · Ferguson.com / Pro app (parts lookup, spec sheets, pickup lockers) → C1, C2, C3, G2, L9                                                                                                                                         |
| Parts Authority (PA)         | Epicor Vision (multi-store distribution, core returns, jobber billing) → A1, E11, B5 · Epicor Eagle → A1 · AutoStore, Geekplus AMRs, KPI Solutions WES/put-to-light → L1 · ACES & PIES → G3 · Web-Cat / Parts Square portal → C7 · GPS fleet telematics, hot-shot dispatch → L7, F2                                                                                                                                                                                                                                                      |
| Research takeaways           | 1 fragmentation → A6, G1, K1 · 2 ordering-to-dispatch → F1–F4, E20 · 3 telemetry → L0–L9, E9                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Appendix B. Company legend

| Code | Company                                | Research id |
| ---- | -------------------------------------- | ----------- |
| ID   | Imperial Dade                          | NWX-US-025  |
| BR   | BradyIFS / Envoy Solutions (BradyPLUS) | NWX-US-030  |
| SRS  | SRS Distribution                       | NWX-US-023  |
| PFG  | Performance Food Group                 | NWX-US-033  |
| ABC  | ABC Supply Co.                         | NWX-US-017  |
| BFS  | Builders FirstSource                   | NWX-US-018  |
| WES  | Wesco International                    | NWX-US-006  |
| UNV  | Univar Solutions                       | NWX-US-045  |
| FAS  | Fastenal                               | NWX-US-001  |
| MOT  | Motion Industries                      | NWX-US-003  |
| MED  | Medline Industries                     | NWX-US-009  |
| OM   | Owens & Minor                          | NWX-US-012  |
| BEA  | Beacon Building Products               | NWX-US-016  |
| FER  | Ferguson Enterprises                   | NWX-US-019  |
| PA   | Parts Authority                        | NWX-US-043  |
