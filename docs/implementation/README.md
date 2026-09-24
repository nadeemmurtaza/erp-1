# Implementation briefs

Build instructions for turning yaseen.pk from a clothing-and-stitching store into
a full commerce platform, written to be executed by an engineer or an AI agent
who has not seen this codebase before.

## Read in this order

| File | What it is |
|---|---|
| **[`00-HOUSE-RULES.md`](./00-HOUSE-RULES.md)** | **The contract. Read it first, every session.** Eleven rules, the definition of done, and how to write a migration that cannot lose data. |
| [`MULTI-SECTOR.md`](./MULTI-SECTOR.md) | How one repository serves clothing, grocery, pharmacy and the rest: packs, the `MODULES` allowlist, branch naming, and why there is no master branch per sector |
| [`01-inventory-purchasing-cost.md`](./01-inventory-purchasing-cost.md) | Suppliers, purchase orders, goods receipts, the unified stock ledger, cost price, COGS, reorder points, slow movers, stock counts |
| [`02-admin-shell.md`](./02-admin-shell.md) | Shared admin primitives — DataTable, PageHeader, Modal, FilterBar — plus the command palette and error states |
| [`03-variants-sku-seo.md`](./03-variants-sku-seo.md) | Custom variant options, SKU templates, the sectioned product editor, enforced alt text, the SEO publish gate, JSON-LD, sitemap, hreflang, redirects |
| [`04-finance.md`](./04-finance.md) | Expenses, order economics, profit and loss, cash flow, month-end close |
| [`05-promotions-giftcards.md`](./05-promotions-giftcards.md) | Discount rules engine, promo codes, gift cards, store credit |
| [`06-shipping-fulfilment-returns.md`](./06-shipping-fulfilment-returns.md) | Shipping zones and rates, courier providers, shipments and manifests, tracking automation, returns/RMA, RTO |
| [`07-customer-portal.md`](./07-customer-portal.md) | Portal shell, tracking timeline, self-service returns, reviews, wishlist, loyalty, mobile parity |
| [`08-content-marketing-search.md`](./08-content-marketing-search.md) | CMS, collections and merchandising, full-text search, campaigns, abandoned cart |
| [`09-ai-layer.md`](./09-ai-layer.md) | Alt text and SEO generation, size recommendation, forecasting, COD risk, semantic search, WhatsApp assistant |
| [`10-admin-dashboard.md`](./10-admin-dashboard.md) | The admin master dashboard rebuild: registry-driven card grid, the analytics page tree, the `finance` module (expenses, order economics) and the `bom` module (raw materials, recipes, production runs) |

**Numbers 11–25** cover, in order: client handover, the extractor script,
email service, managed services, `tax`, PBAC row-scoping, inventory
locations, identity verification, the trading-partner network, org
structure (offices/departments), payroll, people/positions/ranks, access
over the org tree, attendance/shifts/leave, task tracking, internal
notifications, and advance salary/payroll posting. See each file's own
header for status; `payroll` (19) and `tax`/`identity-verification` (15, 18)
are built, the rest are specified but not yet built as of this table.

| File | What it is |
|---|---|
| [`26-performance-reviews.md`](./26-performance-reviews.md) | Performance cycles, reviews, goals — signals from tasks (23) and notifications (24) feed a review, never become one automatically |
| [`27-training-skill-development.md`](./27-training-skill-development.md) | Course scheduling, enrollment, certification, skill requirements a `Position` (20) can gate rostering on |
| [`28-recruitment-onboarding-document-vault.md`](./28-recruitment-onboarding-document-vault.md) | Requisition → candidate pipeline → offer → conversion to `Employee` (20); digital onboarding checklist; the employee document vault (contracts, IDs, compliance records) over `StorageService` |
| [`29-company-asset-tracking.md`](./29-company-asset-tracking.md) | Company-owned hardware/asset register, assignment history, condition events, write-off posting into `accounting` |
| [`30-field-attendance-biometric-geofencing.md`](./30-field-attendance-biometric-geofencing.md) | Extends doc 22: CCTV face-match as a verification signal (never a refusal), geofence variance as a new exception reason, field-staff clock-in with no fixed branch |
| [`31-sector-pos-hardware-integration.md`](./31-sector-pos-hardware-integration.md) | Barcode/receipt-printer/cash-drawer driver extension points; order-type + park/retrieve for tabs/tables; item modifiers — extends `pos`, does not replace it |
| [`32-lots-batch-expiry-fefo.md`](./32-lots-batch-expiry-fefo.md) | `lots`: the core (not pack) batch/expiry/FEFO-allocation/recall-lookup sub-ledger `MULTI-SECTOR.md` already ruled on |
| [`33-sms-whatsapp-channels.md`](./33-sms-whatsapp-channels.md) | Outbound SMS/WhatsApp `NotificationChannel` implementations — the send path WO-9.7's WhatsApp assistant will depend on, not that assistant itself |
| [`34-partner-developer-api-access.md`](./34-partner-developer-api-access.md) | Generic scoped API-key principal (`ApiClient`) for third-party integrations, generalizing the `TradingPartner`/`Node` key-hash pattern |
| [`35-scalable-rag-document-retrieval.md`](./35-scalable-rag-document-retrieval.md) | RAG over millions of PDFs (doc 28's vault, supplier catalogs, business documents, a knowledge base): ingestion, `pgvector` retrieval scoped per organization, a named escalation trigger to a dedicated vector store, built entirely on `09-ai-layer.md`'s existing `AiProvider` interface |
| [`36-universal-connectivity-integration-framework.md`](./36-universal-connectivity-integration-framework.md) | The one pattern every existing provider interface already follows, named once; a generic outbound HTTP connector + OAuth2 for the systems that need it, mirroring doc 34's inbound `ApiClient` |
| [`37-scalability-future-upgrades.md`](./37-scalability-future-upgrades.md) | API version/deprecation policy on top of the existing URI versioning, a `FeatureFlag` primitive for staged rollout, and the published contract (`SDK-CONTRACT.md`) a pack built outside this repository would need |
| [`38-resilience-engineering.md`](./38-resilience-engineering.md) | A degradation matrix synthesizing every module's own "four hours down"/"absent collaborator" answers into one table, circuit breakers generalized from the outbox's existing backoff, SLOs/error budgets on the three paths that matter, and real DR numbers on top of `deploy/backup.sh` |
| [`39-shared-cross-tenant-hosting-tier.md`](./39-shared-cross-tenant-hosting-tier.md) | Exercises the trigger `ENTERPRISE-SCALE.md`'s Br1 already named and deferred: a hosting control plane sharing infrastructure across tenants while every tenant keeps its own isolated database — see `DECISIONS.md`'s entry on why shared-schema multi-tenancy was rejected |

**Numbers 40–49** fill in the granular micro-features a high-level feature
list generalizes over — each checked against what already exists first:

| File | What it is |
|---|---|
| [`40-itemized-payroll-deductions.md`](./40-itemized-payroll-deductions.md) | Promotes `PayRunLine.deductions: Json` (doc 19's own deliberate placeholder) into real `DeductionType`/`PayRunLineDeduction` rows — statutory tax, insurance, penalties — while advance-salary recovery stays doc 25's own, unmerged |
| [`41-pending-vs-disbursed-payroll-tracking.md`](./41-pending-vs-disbursed-payroll-tracking.md) | Adds the one status this repo is missing between "posted" and "paid" (`PayRunStatus.DISBURSED`) — the pending/disbursed dashboard is then a query, not a new table |
| [`42-timesheet-approval-chains.md`](./42-timesheet-approval-chains.md) | The "real timesheet... capability" doc 19 named as future work: submission, multi-level approval over doc 20's `Position`/rank chain, feeding payroll's hourly calculation |
| [`43-visual-attendance-heatmap.md`](./43-visual-attendance-heatmap.md) | A pure, no-new-write calendar-grid read over doc 22's own `AttendanceEvent` data |
| [`44-manager-action-hub.md`](./44-manager-action-hub.md) | One aggregated approvals/to-do queue over registered, optional sources (leave, timesheets, advances, expiring documents) — never a second way to act on any of them |
| [`45-order-count-tracking-coverage-note.md`](./45-order-count-tracking-coverage-note.md) | Order-count tracking is already built (`AnalyticsService.summary()` et al.) — cited with exact line references; the one real gap (`totalUnits`) is a one-line addition |
| [`46-fbr-verification-qr-codes.md`](./46-fbr-verification-qr-codes.md) | Prints doc 15's fiscal reference as a QR on the till receipt (doc 31) once one actually exists — never a fabricated payload before doc 15's provider is real |
| [`47-preconfigured-sector-taxonomy.md`](./47-preconfigured-sector-taxonomy.md) | Starter `Category` trees per vertical as seed data an admin applies once — data, not a module, per `MULTI-SECTOR.md`'s own ruling |
| [`48-native-desktop-deployment.md`](./48-native-desktop-deployment.md) | A desktop install as a real `RETAIL-ERP.md` node (embedded Postgres + unmodified `apps/api`) for businesses with no continuous connectivity at all, not a thicker PWA wrapper |
| [`49-financial-institution-settlement-partnerships.md`](./49-financial-institution-settlement-partnerships.md) | The merchant-settlement mirror of `PaymentProvider`: did the bank/gateway's payout actually match what was owed, with a named, never-silent `SHORT` variance |

**Numbers 50–58** cover commercial licensing, staff-facing granular
features and dashboard widgets, again checked against existing coverage
first — two are coverage notes, one unifies a pattern two earlier docs
each separately deferred to "the other one":

| File | What it is |
|---|---|
| [`50-commercial-pricing-licensing-models.md`](./50-commercial-pricing-licensing-models.md) | Extends doc 39's `PlatformPlan` (one flat-fee field) into three real commercial shapes: per-seat, flat-monthly, one-time licence — a billable seat count read across the isolation boundary, never stored across it |
| [`51-free-demo-sandbox-onboarding.md`](./51-free-demo-sandbox-onboarding.md) | A trial is a `PlatformTenant` with an expiry, provisioned on identical infrastructure to a paying one — never a stripped-down demo that misrepresents what's being sold |
| [`52-staff-self-service-mobile-app.md`](./52-staff-self-service-mobile-app.md) | An installable PWA (apps/pos's own proven pattern) over self-service routes already required to work at every width — clock-in, schedule, announcements — not a third native mobile stack |
| [`53-new-hire-joiner-tracking.md`](./53-new-hire-joiner-tracking.md) | A recent-hires-vs-headcount tile, one query over doc 20/28's existing rows |
| [`54-employee-document-lifecycle-alerts.md`](./54-employee-document-lifecycle-alerts.md) | The ONE nightly expiry watcher docs 27 and 28 each already named and deferred to each other — built once, both register into it |
| [`55-anti-proxy-verification-coverage-note.md`](./55-anti-proxy-verification-coverage-note.md) | Already fully specified in doc 30's `FaceMatchProvider`/`FaceMatchVerification` — cited, not rebuilt |
| [`56-overdue-invoices-counter.md`](./56-overdue-invoices-counter.md) | Computed at read time from doc 18's existing `Invoice.dueDate`/`status` — deliberately never a stored, driftable column |
| [`57-multiday-category-velocity.md`](./57-multiday-category-velocity.md) | The per-category **daily** series `productsCategories()` doesn't produce today — reuses its exact filters, adds the missing dimension |
| [`58-live-operational-feed.md`](./58-live-operational-feed.md) | A read-model over `Order`/`PurchaseOrder`/`Payment`, honestly polled rather than claiming push-based "real time" this repo has no infrastructure for yet |

**Numbers 59–73** cover workforce analytics/admin, hardware repurposing,
granular financial/operational analytics, and industry-specific process
automation — five are coverage notes citing exact existing mechanisms
(doc 30, doc 31 ×2, doc 39/`RETAIL-ERP.md` R14, core architecture), one
generalizes a chain-approval pattern into a reusable mechanism, and one
(doc 68) traces a real, previously-undiscovered bug: POS sales never fire
the event that computes `OrderEconomics`, so till sales get no gross-profit
row today:

| File | What it is |
|---|---|
| [`59-workforce-attendance-ratios.md`](./59-workforce-attendance-ratios.md) | Present/on-leave/absent as a percentage of headcount — one aggregation over doc 43's existing `classifyDay()`, never a second classification scheme |
| [`60-headcount-growth-metrics.md`](./60-headcount-growth-metrics.md) | The month-over-month joiner/leaver trend doc 53 explicitly named and deferred — built here from the identical `joinedOn`/`leftOn` columns |
| [`61-policy-communications-bulletin.md`](./61-policy-communications-bulletin.md) | A persistent, browsable `Bulletin` record with acknowledgement tracking — doc 24 is delivery only, never a bulletin board; this is the missing record, doc 24 fires the ping |
| [`62-document-expiration-compliance.md`](./62-document-expiration-compliance.md) | Coverage note: doc 54's `ExpiringRecordSource` + doc 28's `EmployeeDocument` already deliver this; the one real work order opens `type` from a closed enum to a data-driven `DocumentType` row |
| [`63-multi-tier-approval-hierarchies.md`](./63-multi-tier-approval-hierarchies.md) | Generalizes doc 42's `TimesheetApproval` into one `ApprovalChain`/`ApprovalStep` mechanism keyed by subject type, upgrading `LeaveRequest`'s single `decidedById` into a real chain |
| [`64-help-desk-support-ticketing.md`](./64-help-desk-support-ticketing.md) | A genuinely new internal support-ticket module — no prior ticketing/lifecycle mechanism existed anywhere in this repository |
| [`65-cctv-camera-repurposing.md`](./65-cctv-camera-repurposing.md) | Coverage note: doc 30's `FaceMatchProvider` already takes a vendor-agnostic `imageRef`, never a proprietary appliance handle — an existing camera is already a valid frame source |
| [`66-multi-form-factor-pos.md`](./66-multi-form-factor-pos.md) | Coverage note: Law 4's seven screens + the 48×48 POS touch-target rule already bind `apps/pos`; the one open question is whether `check:overflow`'s sweep already covers it |
| [`67-secure-cash-drawer-triggering.md`](./67-secure-cash-drawer-triggering.md) | Coverage note: doc 31's own words already specify "once, per completed cash tender — never on a card tender, never twice" |
| [`68-realtime-gross-profit.md`](./68-realtime-gross-profit.md) | Traces a real bug: POS sales are created directly at `DELIVERED` and never publish `OrderStatusChanged`, so `FinanceListener` never computes their `OrderEconomics` row — the fix is one missing event publish, not a new profit engine |
| [`69-order-lifecycle-status-dashboard.md`](./69-order-lifecycle-status-dashboard.md) | A Pending/Completed/Voided count tile — a genuine small gap; a `GROUP BY` over `Order.status`, mapped to three display buckets |
| [`70-realtime-stock-depletion.md`](./70-realtime-stock-depletion.md) | Coverage note: `InventoryService.postUnconditional()` already deducts stock in the same transaction as a POS sale — "one writer per invariant" already is the real-time mechanism |
| [`71-recipe-batch-traceability.md`](./71-recipe-batch-traceability.md) | Connects `bom`'s `BomProductionRun`/`BomProductionLine` (confirmed to have zero relationship to lots today) to doc 32's `Lot`/`LotAllocation` for full input-to-output batch genealogy |
| [`72-fragmented-tool-consolidation-import.md`](./72-fragmented-tool-consolidation-import.md) | Extends the existing `ProductImportService` CSV pattern (never rebuilt) to two more entities a spreadsheet-run business actually needs onboarded: contacts and expenses |
| [`73-multi-entity-multi-company-configuration.md`](./73-multi-entity-multi-company-configuration.md) | Coverage note: `Organization`/`RetailBrand`/`Location` and `RETAIL-ERP.md`'s R14 editions already are this capability; names honestly that adding a second brand is a deployment-time operator action, not yet a self-service screen |

**Numbers 74–91** cover granular dashboard widgets, pricing/licensing
positioning, administrative automation claims, and localization/support
infrastructure — the highest coverage-note ratio of any batch so far
(eleven of eighteen), because most of these bullets restate a mechanism
already built earlier in this same document set from a new marketing
angle. Two genuinely new HR capabilities (Assets, Training) surfaced only
because the nav-consolidation pass (doc 78) checked all twelve requested
tabs against what actually exists:

| File | What it is |
|---|---|
| [`74-hr-dashboard-financial-overview.md`](./74-hr-dashboard-financial-overview.md) | Paid This Month / Pending Salaries / Total Deductions / Net Payout — one aggregation over `PayRun`/`PayRunLine`, no new payroll fact |
| [`75-managerial-todo-widget-coverage-note.md`](./75-managerial-todo-widget-coverage-note.md) | Coverage note: doc 44's action hub already is this widget, verbatim, down to its own worked examples |
| [`76-pos-mobile-dashboard.md`](./76-pos-mobile-dashboard.md) | Low Stock / Total Customers / Daily Sales figures already exist in `AnalyticsService.summary()`; the missing piece is a screen inside `apps/pos` itself — a sixth route, not a new query |
| [`77-sales-category-breakdown-coverage-note.md`](./77-sales-category-breakdown-coverage-note.md) | Coverage note: Apparel/Beverages/Medicine are `Category` rows, not a mechanism — doc 47's presets and doc 57's `productsCategories()` already serve any category name |
| [`78-hr-navigation-consolidation.md`](./78-hr-navigation-consolidation.md) | Ten of twelve requested HR nav tabs already have a real backend with no nav entry; consolidates them under one `hr` section and names the two that don't exist yet |
| [`79-employee-asset-management.md`](./79-employee-asset-management.md) | Genuinely new: no `Asset`/equipment-issuance model existed anywhere — `Asset` + `AssetAssignment`, gated into offboarding |
| [`80-employee-training-certification.md`](./80-employee-training-certification.md) | Genuinely new: no training/certification-completion model existed — `TrainingCourse` + `TrainingCompletion`, registered against doc 54's existing expiry watcher |
| [`81-transparent-flat-rate-pricing.md`](./81-transparent-flat-rate-pricing.md) | Coverage note: doc 50's `FLAT_MONTHLY` already is this; confirms no per-invoice/overage metering exists anywhere in the billing path |
| [`82-tiered-capex-licensing.md`](./82-tiered-capex-licensing.md) | Coverage note: doc 50's `licenseDeploymentMode` (OFFLINE/ONLINE) + doc 48/39 + the `MODULES` allowlist already is Basic-vs-Standard; documents the module mapping rather than building a second runtime entitlement gate |
| [`83-entry-level-pos-deployment.md`](./83-entry-level-pos-deployment.md) | Coverage note: the Solo edition (`RETAIL-ERP.md` R14) with a minimal `MODULES` allowlist already is this |
| [`84-micro-saas-hr-per-user-pricing.md`](./84-micro-saas-hr-per-user-pricing.md) | Coverage note: doc 50's `PER_SEAT` shape already is this; only new content is an HR-only `MODULES` allowlist convention |
| [`85-ai-face-detection-proxy-attendance.md`](./85-ai-face-detection-proxy-attendance.md) | Coverage note: the third citation this batch set of doc 30's `FaceMatchProvider`, from a third marketing phrasing |
| [`86-ai-ml-edi-business-automation.md`](./86-ai-ml-edi-business-automation.md) | Coverage note: `AiProvider` (doc 09) and `EdiTranslator` (doc 18) already are the named extension points; "end-to-end automation" is the sum of every module already shipped, not a discrete capability |
| [`87-corporate-attendance-automation.md`](./87-corporate-attendance-automation.md) | Coverage note that also flags a real risk: the mechanism is doc 22/30/43/59's own combination; a client-requested product *name* must resolve through `brand.ts`, never a hardcoded literal, per Law 1 |
| [`88-pral-fbr-pra-tax-compliance.md`](./88-pral-fbr-pra-tax-compliance.md) | Coverage note: doc 15's `FiscalComplianceProvider` already generalizes over `authority: string`; a third/fourth authority is a new provider implementation, blocked on real requirements exactly as doc 15 already states for FBR/PRA |
| [`89-rapid-onboarding-customizable-reports.md`](./89-rapid-onboarding-customizable-reports.md) | Coverage note: doc 51's "minutes" provisioning and `ReportsController`'s eight date-range-filterable exports already deliver this; names a general report-builder as real, distinct, unbuilt future work |
| [`90-automatic-backups-local-support.md`](./90-automatic-backups-local-support.md) | Coverage note: `deploy/backup.sh` (doc 38) is real, restore-tested infrastructure; "local support you can trust" is named honestly as a business commitment, not a code capability |
| [`91-staff-portal-mobile-access.md`](./91-staff-portal-mobile-access.md) | Coverage note that also flags a risk: doc 52's one responsive PWA already is both the "mobile app" and the "Staff Portal" — building a second, desktop-only surface would be a duplicate implementation |

## Dependency order

Phases are ordered by dependency, not by appeal. Do not reorder them without
understanding what breaks.

```
1  Inventory, Purchasing & Cost   ──┬──> 4  Finance ──┐
   (cost price is the keystone)     │                 │
                                    ├──> 6  Shipping & Returns ──┐
                                    │                            │
2  Admin shell ──> 3  Variants & SEO ──┬──> 5  Promotions ───────┼──> 7  Portal
                                       │                         │
                                       └──> 8  Content & Search ─┴──> 9  AI
```

**Phase 1 is first because cost price is the keystone.** Without a cost per unit
there is no margin, no P&L, and no way to know whether a discount is profitable.
Phase 4 is impossible without it and Phase 5 is dangerous without Phase 4.

**Phase 10 sits alongside, not after.** It depends on Phase 1 (merged) and
carries its own minimal subset of the Phase 2 primitives, built to the Phase 2
spec so that Phase 2 later continues rather than rewrites. It also delivers the
expense half of Phase 4 ahead of the rest of it — the P&L, cash flow and
month-end close in `04-finance.md` still stand, and build on the `Expense` and
`OrderEconomics` models Phase 10 creates.

Phase 2 is pure leverage with no features. It is worth doing before thirty new
screens arrive rather than after.

## The two module groups

The platform is organised into a **universal commerce core** — what clothing,
shoes, grocery, medicine, hardware, software, electronics, phones, laptops and
home appliances all need — and an **apparel & boutique pack** that makes this
particular shop what it is.

The seam that keeps them honest: **a universal module may never import an
apparel module, and may never name a garment concept.** Apparel modules
subscribe to universal events, not the other way round.

`pnpm lint` enforces both halves of that seam. **Depth:** no module may reach
into another's internals. **Direction:** `apps/api/src/modules/module-packs.ts`
declares each module's pack, and `scripts/check-module-boundaries.mjs` fails on a
core-imports-pack or pack-imports-pack dependency, or on a module that has not
been classified at all. One pre-existing violation (`cart` → `measurements`) is
recorded as a burn-down entry and must be paid off before a second sector ships —
see [`MULTI-SECTOR.md`](./MULTI-SECTOR.md). The naming rule is a review
convention.

Universal: `catalog` `variants` `pricing` `inventory` `purchasing` `orders`
`payments` `shipping` `fulfilment` `returns` `promotions` `giftcards` `loyalty`
`crm` `finance` `reviews` `content` `seo` `marketing` `search` `analytics`
`reports` `tax` `ai`

Apparel: `measurements` `stitching` `fabric` `fit` `styling` `alterations`

`bom` was listed here and has been **reclassified as universal**: a bakery, a
pharmacy compounding lab and a furniture workshop all turn raw materials into
finished goods, so raw-material → recipe → production run belongs to the core.
Phase 10 builds it that way.

That seam is also the extensibility proof: a grocery pack would be `batches` and
`perishables`, pharmacy adds `prescriptions`, electronics adds `serials` and
`warranty`, software adds `licences`. Each is a folder plus one registry line,
and none of them touch the universal core.

## How a work order runs

1. Read `00-HOUSE-RULES.md`. Then read the whole phase brief before writing code.
2. Take **one work order**. It is one branch.
3. Work orders inside a phase are ordered by dependency. Do not start WO-3 before
   WO-2 has landed on `main` unless the brief says they are independent.
4. Meet the work order's acceptance criteria. They are the tests the reviewer
   will run — write them as real tests where you can.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` must all pass.
6. Push your branch straight to `main`. `main` deploys `test.yaseen.pk`, not
   the live shop, so this needs no PR-and-wait step.

**`production` is different — never push to it, and never merge into it.**
It deploys the live shop, and promoting `main` to `production` is the
owner's decision, not yours: only the owner pushes, merges or opens a PR
into `production`, or asks you to. This holds even when CI is green and
even when the change is trivial.

## Known gaps not yet owned by a phase

Found reading the code, not called out as a work order anywhere above. Pick
these up under the phase they land closest to rather than inventing a new one:

- **`STORAGE_DRIVER=local` in every env file, including production** —
  uploads live on the VPS disk. The `s3`/R2 driver already exists
  (`s3-storage.driver.ts`, validated in `env.validation.ts`), so this is a
  config-plus-bucket change, not a rewrite — worth doing before Phase 3's
  media library raises the volume of uploads. (`deploy/backup.sh` now ships
  the uploads volume off-site alongside the database, so this is no longer
  an unbacked-up single point of failure — just still a single VPS disk.)
- **A generic automations rules engine** (`when <event> and <conditions>
  then <actions>`, edited under Settings) — Part D of the original roadmap
  proposed this as the long-term home for the inventory/purchasing/finance
  automations that Phases 1, 4 and 6 each build one-off. Not a work order
  anywhere yet; worth deciding on explicitly once two or three of those
  one-off automations exist, rather than building the engine speculatively
  first.
- **Two AI ideas with no work order**: churn/RFM segmentation (feeds `crm`
  segments) and virtual try-on — both lowest priority in the original
  roadmap's payoff ordering, absent from `09-ai-layer.md`'s WO-9.1–9.10.
- **`deploy/backup.sh`** is wired up via `deploy/systemd/yaseen-backup.service`
  (not orphaned, contrary to an earlier read of it) — worth confirming the
  unit is actually enabled on the production host and that its restore-test
  step still passes, since that's the part that makes a backup trustworthy.

## When a brief is wrong

These were written against the codebase at a point in time. Code moves.

- **If a brief contradicts `00-HOUSE-RULES.md`, the house rules win.** Say so in
  the commit message (or the PR, for anything going into `production`).
- **If something cannot be built as described — stop and say so.** Do not
  improvise a different architecture and hand it back. A short "this does not
  work because X, I suggest Y" is worth far more than a large pull request that
  has to be unwound.
- If a brief describes a file that has changed, trust the code and flag the
  drift.

## Scope, honestly

This is nine phases and roughly thirty new modules. It is not one month and it is
not one engineer. Each phase is independently shippable and independently
useful — if only Phases 1 and 2 are ever built, the shop is meaningfully better
off, and nothing later has to be rebuilt because of it.
