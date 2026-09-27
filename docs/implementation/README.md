# Implementation briefs

Build instructions for turning yaseen.pk from a clothing-and-stitching store into
a full commerce platform, written to be executed by an engineer or an AI agent
who has not seen this codebase before.

**Files live in domain subfolders** (`inventory-purchasing/`,
`finance-accounting/`, `architecture-patterns/`, and so on) — every filename,
including its number, is unchanged, so citing a document by number or by full
filename (`05-promotions-giftcards.md`) is still unambiguous; only the path
gained a folder. The five documents below with no domain — the house rules,
the three cross-cutting architecture briefs, and this decision log — stay at
this tree's root because they are the contract every domain brief is read
against, not a domain brief themselves. See `DECISIONS.md` ADR-030 for why.

## Read in this order

| File | What it is |
|---|---|
| **[`00-HOUSE-RULES.md`](./00-HOUSE-RULES.md)** | **The contract. Read it first, every session.** Eleven rules, the definition of done, and how to write a migration that cannot lose data. |
| [`MULTI-SECTOR.md`](./MULTI-SECTOR.md) | How one repository serves clothing, grocery, pharmacy and the rest: packs, the `MODULES` allowlist, branch naming, and why there is no master branch per sector |
| [`01-inventory-purchasing-cost.md`](./inventory-purchasing/01-inventory-purchasing-cost.md) | Suppliers, purchase orders, goods receipts, the unified stock ledger, cost price, COGS, reorder points, slow movers, stock counts |
| [`02-admin-shell.md`](./admin-platform/02-admin-shell.md) | Shared admin primitives — DataTable, PageHeader, Modal, FilterBar — plus the command palette and error states |
| [`03-variants-sku-seo.md`](./catalog-variants-pricing/03-variants-sku-seo.md) | Custom variant options, SKU templates, the sectioned product editor, enforced alt text, the SEO publish gate, JSON-LD, sitemap, hreflang, redirects |
| [`04-finance.md`](./finance-accounting/04-finance.md) | Expenses, order economics, profit and loss, cash flow, month-end close |
| [`05-promotions-giftcards.md`](./promotions-giftcards/05-promotions-giftcards.md) | Discount rules engine, promo codes, gift cards, store credit |
| [`06-shipping-fulfilment-returns.md`](./shipping-fulfilment-returns/06-shipping-fulfilment-returns.md) | Shipping zones and rates, courier providers, shipments and manifests, tracking automation, returns/RMA, RTO |
| [`07-customer-portal.md`](./customer-portal-loyalty/07-customer-portal.md) | Portal shell, tracking timeline, self-service returns, reviews, wishlist, loyalty, mobile parity |
| [`08-content-marketing-search.md`](./content-marketing-search/08-content-marketing-search.md) | CMS, collections and merchandising, full-text search, campaigns, abandoned cart |
| [`09-ai-layer.md`](./ai-layer/09-ai-layer.md) | Alt text and SEO generation, size recommendation, forecasting, COD risk, semantic search, WhatsApp assistant |
| [`10-admin-dashboard.md`](./admin-platform/10-admin-dashboard.md) | The admin master dashboard rebuild: registry-driven card grid, the analytics page tree, the `finance` module (expenses, order economics) and the `bom` module (raw materials, recipes, production runs) |

**Numbers 11–25** cover client handover through advance salary. Two number
collisions predate this table and are called out inline rather than hidden:
**18** and **19** are each claimed by two unrelated documents, and both are
cited elsewhere in this corpus by bare number — always cite the full
filename for these four, never "doc 18" or "doc 19" alone.

| File | What it is |
|---|---|
| [`11-client-handover-model.md`](./commercial-licensing-agency/11-client-handover-model.md) | The two-track agency model — a Master Blueprint repo vs. per-client distribution — and how one codebase serves both |
| [`12-extractor-script-spec.md`](./commercial-licensing-agency/12-extractor-script-spec.md) | `scripts/sync-client.mjs` — generating and upgrading stripped-down client repos from the Master Blueprint, no regex, no overwriting client customizations |
| [`13-email-service-plan.md`](./integrations-connectivity/13-email-service-plan.md) | Self-hosted, white-labeled email infrastructure on a Coolify VPS, replacing third-party mail services |
| [`14-managed-services-module.md`](./commercial-licensing-agency/14-managed-services-module.md) | Agency billing/hosting dashboard over doc 11's client model — status: scoped, not built |
| [`15-tax-module.md`](./tax-compliance/15-tax-module.md) | Tax rates and calculation, `tax.enabled` off-by-default gate — **built**, WO-15.1–15.4 |
| [`16-pbac-row-scoping.md`](./access-control-identity/16-pbac-row-scoping.md) | `assertCanManage()` row-level permission scoping — **built**, WO-16.1/16.2 |
| [`17-inventory-locations.md`](./inventory-purchasing/17-inventory-locations.md) | The stock `Location` dimension over Phase 1's stock ledger, without weakening its concurrency guarantee |
| [`18-identity-verification.md`](./access-control-identity/18-identity-verification.md) | NID/NADRA identity verification (`IdentityVerification`) — **built, off by default**. **Shares number 18 with `18-trading-partner-network.md` below** — cite the full filename |
| [`18-trading-partner-network.md`](./integrations-connectivity/18-trading-partner-network.md) | `TradingPartner`/canonical-JSON EDI network so a PO or invoice isn't re-keyed at each hop — **built**, WO-18.1–18.3. **Shares number 18 with `18-identity-verification.md` above** — cite the full filename |
| [`19-payroll.md`](./payroll/19-payroll.md) | Compensation, leave balances, pay runs — **built**, WO-19.1–19.7. **Shares number 19 with `19-org-structure-offices-departments.md` below** — cite the full filename |
| [`19-org-structure-offices-departments.md`](./hr-people-org/19-org-structure-offices-departments.md) | One org tree (`OrgUnit`), not a second `OFFICE`/`DEPARTMENT` enum. **Shares number 19 with `19-payroll.md` above** — cite the full filename |
| [`20-people-positions-ranks.md`](./hr-people-org/20-people-positions-ranks.md) | The employee record, `Position`, and the rank ladder — everything after this needs all three |
| [`21-access-over-the-org-tree.md`](./access-control-identity/21-access-over-the-org-tree.md) | Who may see and do what, scoped to an office or department in the org tree, extending the existing `PermissionsGuard` |
| [`22-attendance-shifts-leave.md`](./attendance-workforce/22-attendance-shifts-leave.md) | Attendance as a record, not a request — shifts and leave, the first "the system does not get a vote" module |
| [`23-tasks-allotment-tracking.md`](./tasks-notifications-support/23-tasks-allotment-tracking.md) | **Built.** Task assignment, status and tracking that survives a person leaving the org — `Task`/`TaskTransition`/`TaskStageDefinition`, assigned to a `Position` with an optional `User` assignee, a generic event-intake registry (`purchasing.requisition_created` wired as the proof), and unclaiming (never auto-reassigning) on the new `hr.posting_ended` event. ADR-050 |
| [`24-internal-notifications-meetings-escalation.md`](./tasks-notifications-support/24-internal-notifications-meetings-escalation.md) | Meetings and escalation over the existing `NotificationChannel` interface |
| [`25-advance-salary-and-payroll-posting.md`](./payroll/25-advance-salary-and-payroll-posting.md) | An advance against salary is a loan to the employee, never a wage payment — the GL posting that keeps that distinction |

| File | What it is |
|---|---|
| [`26-performance-reviews.md`](./hr-people-org/26-performance-reviews.md) | Performance cycles, reviews, goals — signals from tasks (23) and notifications (24) feed a review, never become one automatically |
| [`27-training-skill-development.md`](./hr-people-org/27-training-skill-development.md) | Course scheduling, enrollment, certification, skill requirements a `Position` (20) can gate rostering on |
| [`28-recruitment-onboarding-document-vault.md`](./hr-people-org/28-recruitment-onboarding-document-vault.md) | Requisition → candidate pipeline → offer → conversion to `Employee` (20); digital onboarding checklist; the employee document vault (contracts, IDs, compliance records) over `StorageService` |
| [`29-company-asset-tracking.md`](./hr-people-org/29-company-asset-tracking.md) | Company-owned hardware/asset register, assignment history, condition events, write-off posting into `accounting` |
| [`30-field-attendance-biometric-geofencing.md`](./attendance-workforce/30-field-attendance-biometric-geofencing.md) | Extends doc 22: CCTV face-match as a verification signal (never a refusal), geofence variance as a new exception reason, field-staff clock-in with no fixed branch |
| [`31-sector-pos-hardware-integration.md`](./pos-hardware/31-sector-pos-hardware-integration.md) | Barcode/receipt-printer/cash-drawer driver extension points; order-type + park/retrieve for tabs/tables; item modifiers — extends `pos`, does not replace it |
| [`32-lots-batch-expiry-fefo.md`](./lots-serials-traceability/32-lots-batch-expiry-fefo.md) | `lots`: the core (not pack) batch/expiry/FEFO-allocation/recall-lookup sub-ledger `MULTI-SECTOR.md` already ruled on |
| [`33-sms-whatsapp-channels.md`](./integrations-connectivity/33-sms-whatsapp-channels.md) | Outbound SMS/WhatsApp `NotificationChannel` implementations — the send path WO-9.7's WhatsApp assistant will depend on, not that assistant itself |
| [`34-partner-developer-api-access.md`](./integrations-connectivity/34-partner-developer-api-access.md) | Generic scoped API-key principal (`ApiClient`) for third-party integrations, generalizing the `TradingPartner`/`Node` key-hash pattern — **deferred** (the organisation-level service account ADR-037 postpones); personal keys shipped as doc 163 |
| [`35-scalable-rag-document-retrieval.md`](./ai-layer/35-scalable-rag-document-retrieval.md) | RAG over millions of PDFs (doc 28's vault, supplier catalogs, business documents, a knowledge base): ingestion, `pgvector` retrieval scoped per organization, a named escalation trigger to a dedicated vector store, built entirely on `09-ai-layer.md`'s existing `AiProvider` interface |
| [`36-universal-connectivity-integration-framework.md`](./integrations-connectivity/36-universal-connectivity-integration-framework.md) | The one pattern every existing provider interface already follows, named once; a generic outbound HTTP connector + OAuth2 for the systems that need it, mirroring doc 34's inbound `ApiClient` |
| [`37-scalability-future-upgrades.md`](./resilience-scalability/37-scalability-future-upgrades.md) | API version/deprecation policy on top of the existing URI versioning, a `FeatureFlag` primitive for staged rollout, and the published contract (`SDK-CONTRACT.md`) a pack built outside this repository would need |
| [`38-resilience-engineering.md`](./resilience-scalability/38-resilience-engineering.md) | A degradation matrix synthesizing every module's own "four hours down"/"absent collaborator" answers into one table, circuit breakers generalized from the outbox's existing backoff, SLOs/error budgets on the three paths that matter, and real DR numbers on top of `deploy/backup.sh` |
| [`39-shared-cross-tenant-hosting-tier.md`](./commercial-licensing-agency/39-shared-cross-tenant-hosting-tier.md) | Exercises the trigger `ENTERPRISE-SCALE.md`'s Br1 already named and deferred: a hosting control plane sharing infrastructure across tenants while every tenant keeps its own isolated database — see `DECISIONS.md`'s entry on why shared-schema multi-tenancy was rejected |

**Numbers 40–49** fill in the granular micro-features a high-level feature
list generalizes over — each checked against what already exists first:

| File | What it is |
|---|---|
| [`40-itemized-payroll-deductions.md`](./payroll/40-itemized-payroll-deductions.md) | Promotes `PayRunLine.deductions: Json` (doc 19's own deliberate placeholder) into real `DeductionType`/`PayRunLineDeduction` rows — statutory tax, insurance, penalties — while advance-salary recovery stays doc 25's own, unmerged |
| [`41-pending-vs-disbursed-payroll-tracking.md`](./payroll/41-pending-vs-disbursed-payroll-tracking.md) | Adds the one status this repo is missing between "posted" and "paid" (`PayRunStatus.DISBURSED`) — the pending/disbursed dashboard is then a query, not a new table |
| [`42-timesheet-approval-chains.md`](./hr-people-org/42-timesheet-approval-chains.md) | The "real timesheet... capability" doc 19 named as future work: submission, multi-level approval over doc 20's `Position`/rank chain, feeding payroll's hourly calculation |
| [`43-visual-attendance-heatmap.md`](./attendance-workforce/43-visual-attendance-heatmap.md) | A pure, no-new-write calendar-grid read over doc 22's own `AttendanceEvent` data |
| [`44-manager-action-hub.md`](./admin-platform/44-manager-action-hub.md) | One aggregated approvals/to-do queue over registered, optional sources (leave, timesheets, advances, expiring documents) — never a second way to act on any of them |
| [`45-order-count-tracking-coverage-note.md`](./analytics-reporting/45-order-count-tracking-coverage-note.md) | Order-count tracking is already built (`AnalyticsService.summary()` et al.) — cited with exact line references; the one real gap (`totalUnits`) is a one-line addition |
| [`46-fbr-verification-qr-codes.md`](./tax-compliance/46-fbr-verification-qr-codes.md) | Prints doc 15's fiscal reference as a QR on the till receipt (doc 31) once one actually exists — never a fabricated payload before doc 15's provider is real |
| [`47-preconfigured-sector-taxonomy.md`](./catalog-variants-pricing/47-preconfigured-sector-taxonomy.md) | **Built, including its own admin UI.** Starter `Category` trees per vertical as seed data an admin applies once — data, not a module, per `MULTI-SECTOR.md`'s own ruling. Five real starter trees (apparel, pharmacy, grocery, paint-shop, beverages), additive and idempotent apply, gated by the real `catalog.manage` permission. "Start from a template" on the categories screen shows the dry run before committing. ADR-049, ADR-061 |
| [`48-native-desktop-deployment.md`](./resilience-scalability/48-native-desktop-deployment.md) | A desktop install as a real `RETAIL-ERP.md` node (embedded Postgres + unmodified `apps/api`) for businesses with no continuous connectivity at all, not a thicker PWA wrapper |
| [`49-financial-institution-settlement-partnerships.md`](./finance-accounting/49-financial-institution-settlement-partnerships.md) | The merchant-settlement mirror of `PaymentProvider`: did the bank/gateway's payout actually match what was owed, with a named, never-silent `SHORT` variance |

**Numbers 50–58** cover commercial licensing, staff-facing granular
features and dashboard widgets, again checked against existing coverage
first — two are coverage notes, one unifies a pattern two earlier docs
each separately deferred to "the other one":

| File | What it is |
|---|---|
| [`50-commercial-pricing-licensing-models.md`](./commercial-licensing-agency/50-commercial-pricing-licensing-models.md) | Extends doc 39's `PlatformPlan` (one flat-fee field) into three real commercial shapes: per-seat, flat-monthly, one-time licence — a billable seat count read across the isolation boundary, never stored across it |
| [`51-free-demo-sandbox-onboarding.md`](./commercial-licensing-agency/51-free-demo-sandbox-onboarding.md) | A trial is a `PlatformTenant` with an expiry, provisioned on identical infrastructure to a paying one — never a stripped-down demo that misrepresents what's being sold |
| [`52-staff-self-service-mobile-app.md`](./hr-people-org/52-staff-self-service-mobile-app.md) | An installable PWA (apps/pos's own proven pattern) over self-service routes already required to work at every width — clock-in, schedule, announcements — not a third native mobile stack |
| [`53-new-hire-joiner-tracking.md`](./hr-people-org/53-new-hire-joiner-tracking.md) | A recent-hires-vs-headcount tile, one query over doc 20/28's existing rows |
| [`54-employee-document-lifecycle-alerts.md`](./hr-people-org/54-employee-document-lifecycle-alerts.md) | The ONE nightly expiry watcher docs 27 and 28 each already named and deferred to each other — built once, both register into it |
| [`55-anti-proxy-verification-coverage-note.md`](./attendance-workforce/55-anti-proxy-verification-coverage-note.md) | Already fully specified in doc 30's `FaceMatchProvider`/`FaceMatchVerification` — cited, not rebuilt |
| [`56-overdue-invoices-counter.md`](./finance-accounting/56-overdue-invoices-counter.md) | Computed at read time from doc 18's existing `Invoice.dueDate`/`status` — deliberately never a stored, driftable column |
| [`57-multiday-category-velocity.md`](./analytics-reporting/57-multiday-category-velocity.md) | The per-category **daily** series `productsCategories()` doesn't produce today — reuses its exact filters, adds the missing dimension |
| [`58-live-operational-feed.md`](./analytics-reporting/58-live-operational-feed.md) | A read-model over `Order`/`PurchaseOrder`/`Payment`, honestly polled rather than claiming push-based "real time" this repo has no infrastructure for yet |

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
| [`59-workforce-attendance-ratios.md`](./attendance-workforce/59-workforce-attendance-ratios.md) | Present/on-leave/absent as a percentage of headcount — one aggregation over doc 43's existing `classifyDay()`, never a second classification scheme |
| [`60-headcount-growth-metrics.md`](./hr-people-org/60-headcount-growth-metrics.md) | The month-over-month joiner/leaver trend doc 53 explicitly named and deferred — built here from the identical `joinedOn`/`leftOn` columns |
| [`61-policy-communications-bulletin.md`](./tasks-notifications-support/61-policy-communications-bulletin.md) | **Built.** A persistent, browsable `Bulletin` record with acknowledgement tracking, inside the `notify` module (reuses `AudienceService` directly) — doc 24 is delivery only, never a bulletin board; this is the missing record, doc 24's own `NotificationsService` fires the ping. `hr.bulletins.view` seeded broadly, `hr.bulletins.publish` scoped to the publisher's own reach. ADR-062 |
| [`62-document-expiration-compliance.md`](./hr-people-org/62-document-expiration-compliance.md) | Coverage note: doc 54's `ExpiringRecordSource` + doc 28's `EmployeeDocument` already deliver this; the one real work order opens `type` from a closed enum to a data-driven `DocumentType` row |
| [`63-multi-tier-approval-hierarchies.md`](./hr-people-org/63-multi-tier-approval-hierarchies.md) | Generalizes doc 42's `TimesheetApproval` into one `ApprovalChain`/`ApprovalStep` mechanism keyed by subject type, upgrading `LeaveRequest`'s single `decidedById` into a real chain |
| [`64-help-desk-support-ticketing.md`](./tasks-notifications-support/64-help-desk-support-ticketing.md) | A genuinely new internal support-ticket module — no prior ticketing/lifecycle mechanism existed anywhere in this repository |
| [`65-cctv-camera-repurposing.md`](./attendance-workforce/65-cctv-camera-repurposing.md) | Coverage note: doc 30's `FaceMatchProvider` already takes a vendor-agnostic `imageRef`, never a proprietary appliance handle — an existing camera is already a valid frame source |
| [`66-multi-form-factor-pos.md`](./pos-hardware/66-multi-form-factor-pos.md) | Coverage note: Law 4's seven screens + the 48×48 POS touch-target rule already bind `apps/pos`; the one open question is whether `check:overflow`'s sweep already covers it |
| [`67-secure-cash-drawer-triggering.md`](./pos-hardware/67-secure-cash-drawer-triggering.md) | Coverage note: doc 31's own words already specify "once, per completed cash tender — never on a card tender, never twice" |
| [`68-realtime-gross-profit.md`](./finance-accounting/68-realtime-gross-profit.md) | Traces a real bug: POS sales are created directly at `DELIVERED` and never publish `OrderStatusChanged`, so `FinanceListener` never computes their `OrderEconomics` row — the fix is one missing event publish, not a new profit engine |
| [`69-order-lifecycle-status-dashboard.md`](./analytics-reporting/69-order-lifecycle-status-dashboard.md) | A Pending/Completed/Voided count tile — a genuine small gap; a `GROUP BY` over `Order.status`, mapped to three display buckets |
| [`70-realtime-stock-depletion.md`](./inventory-purchasing/70-realtime-stock-depletion.md) | Coverage note: `InventoryService.postUnconditional()` already deducts stock in the same transaction as a POS sale — "one writer per invariant" already is the real-time mechanism |
| [`71-recipe-batch-traceability.md`](./lots-serials-traceability/71-recipe-batch-traceability.md) | Connects `bom`'s `BomProductionRun`/`BomProductionLine` (confirmed to have zero relationship to lots today) to doc 32's `Lot`/`LotAllocation` for full input-to-output batch genealogy |
| [`72-fragmented-tool-consolidation-import.md`](./admin-platform/72-fragmented-tool-consolidation-import.md) | Extends the existing `ProductImportService` CSV pattern (never rebuilt) to two more entities a spreadsheet-run business actually needs onboarded: contacts and expenses |
| [`73-multi-entity-multi-company-configuration.md`](./b2b-wholesale-multientity/73-multi-entity-multi-company-configuration.md) | Coverage note: `Organization`/`RetailBrand`/`Location` and `RETAIL-ERP.md`'s R14 editions already are this capability; names honestly that adding a second brand is a deployment-time operator action, not yet a self-service screen |

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
| [`74-hr-dashboard-financial-overview.md`](./hr-people-org/74-hr-dashboard-financial-overview.md) | Paid This Month / Pending Salaries / Total Deductions / Net Payout — one aggregation over `PayRun`/`PayRunLine`, no new payroll fact |
| [`75-managerial-todo-widget-coverage-note.md`](./admin-platform/75-managerial-todo-widget-coverage-note.md) | Coverage note: doc 44's action hub already is this widget, verbatim, down to its own worked examples |
| [`76-pos-mobile-dashboard.md`](./pos-hardware/76-pos-mobile-dashboard.md) | Low Stock / Total Customers / Daily Sales figures already exist in `AnalyticsService.summary()`; the missing piece is a screen inside `apps/pos` itself — a sixth route, not a new query |
| [`77-sales-category-breakdown-coverage-note.md`](./analytics-reporting/77-sales-category-breakdown-coverage-note.md) | Coverage note: Apparel/Beverages/Medicine are `Category` rows, not a mechanism — doc 47's presets and doc 57's `productsCategories()` already serve any category name |
| [`78-hr-navigation-consolidation.md`](./hr-people-org/78-hr-navigation-consolidation.md) | Ten of twelve requested HR nav tabs already have a real backend with no nav entry; consolidates them under one `hr` section and names the two that don't exist yet |
| [`79-employee-asset-management.md`](./hr-people-org/79-employee-asset-management.md) | Genuinely new: no `Asset`/equipment-issuance model existed anywhere — `Asset` + `AssetAssignment`, gated into offboarding |
| [`80-employee-training-certification.md`](./hr-people-org/80-employee-training-certification.md) | Genuinely new: no training/certification-completion model existed — `TrainingCourse` + `TrainingCompletion`, registered against doc 54's existing expiry watcher |
| [`81-transparent-flat-rate-pricing.md`](./commercial-licensing-agency/81-transparent-flat-rate-pricing.md) | Coverage note: doc 50's `FLAT_MONTHLY` already is this; confirms no per-invoice/overage metering exists anywhere in the billing path |
| [`82-tiered-capex-licensing.md`](./commercial-licensing-agency/82-tiered-capex-licensing.md) | Coverage note: doc 50's `licenseDeploymentMode` (OFFLINE/ONLINE) + doc 48/39 + the `MODULES` allowlist already is Basic-vs-Standard; documents the module mapping rather than building a second runtime entitlement gate |
| [`83-entry-level-pos-deployment.md`](./commercial-licensing-agency/83-entry-level-pos-deployment.md) | Coverage note: the Solo edition (`RETAIL-ERP.md` R14) with a minimal `MODULES` allowlist already is this |
| [`84-micro-saas-hr-per-user-pricing.md`](./commercial-licensing-agency/84-micro-saas-hr-per-user-pricing.md) | Coverage note: doc 50's `PER_SEAT` shape already is this; only new content is an HR-only `MODULES` allowlist convention |
| [`85-ai-face-detection-proxy-attendance.md`](./attendance-workforce/85-ai-face-detection-proxy-attendance.md) | Coverage note: the third citation this batch set of doc 30's `FaceMatchProvider`, from a third marketing phrasing |
| [`86-ai-ml-edi-business-automation.md`](./ai-layer/86-ai-ml-edi-business-automation.md) | Coverage note: `AiProvider` (doc 09) and `EdiTranslator` (doc 18) already are the named extension points; "end-to-end automation" is the sum of every module already shipped, not a discrete capability |
| [`87-corporate-attendance-automation.md`](./attendance-workforce/87-corporate-attendance-automation.md) | Coverage note that also flags a real risk: the mechanism is doc 22/30/43/59's own combination; a client-requested product *name* must resolve through `brand.ts`, never a hardcoded literal, per Law 1 |
| [`88-pral-fbr-pra-tax-compliance.md`](./tax-compliance/88-pral-fbr-pra-tax-compliance.md) | Coverage note: doc 15's `FiscalComplianceProvider` already generalizes over `authority: string`; a third/fourth authority is a new provider implementation, blocked on real requirements exactly as doc 15 already states for FBR/PRA |
| [`89-rapid-onboarding-customizable-reports.md`](./commercial-licensing-agency/89-rapid-onboarding-customizable-reports.md) | Coverage note: doc 51's "minutes" provisioning and `ReportsController`'s eight date-range-filterable exports already deliver this; names a general report-builder as real, distinct, unbuilt future work |
| [`90-automatic-backups-local-support.md`](./resilience-scalability/90-automatic-backups-local-support.md) | Coverage note: `deploy/backup.sh` (doc 38) is real, restore-tested infrastructure; "local support you can trust" is named honestly as a business commitment, not a code capability |
| [`91-staff-portal-mobile-access.md`](./hr-people-org/91-staff-portal-mobile-access.md) | Coverage note that also flags a risk: doc 52's one responsive PWA already is both the "mobile app" and the "Staff Portal" — building a second, desktop-only surface would be a duplicate implementation |

**Numbers 92–103** cover a generic enterprise-architecture buzzword list
(MACH, a business-rules engine, API-first integration, omnichannel
automation) rather than product features. Several of these bullets
describe an architecture this repository's own `CLAUDE.md` explicitly and
deliberately did **not** choose (a literal microservices mesh, a separate
API-gateway process, a generic rules engine) — those documents state the
decision plainly, citing `CLAUDE.md`/`ENTERPRISE-SCALE.md` verbatim,
rather than building against it. Every other bullet in this batch maps
onto a mechanism already specified earlier in this document set:

| File | What it is |
|---|---|
| [`92-microservices-module-decoupling.md`](./architecture-patterns/92-microservices-module-decoupling.md) | Not built: `CLAUDE.md`'s own words, "a deliberate modular monolith... not a microservice mesh, that choice is already made and is not reopened." Names the module-independence mechanism that delivers the actual outcome (independent upgrade/scale/replace) without the microservices cost |
| [`93-headless-frontend-architecture.md`](./architecture-patterns/93-headless-frontend-architecture.md) | Coverage note: four separate frontends (`apps/web`, `apps/pos`, `apps/mobile`, doc 52's staff PWA) already draw from one versioned API; the one correction is that the frontend framework is fixed (Next.js/React), never "any framework" |
| [`94-cloud-native-container-scalability.md`](./architecture-patterns/94-cloud-native-container-scalability.md) | Coverage note: Dockerfiles and five compose files already exist; names "automatic provisioning on demand spikes" honestly as unbuilt autoscaling, distinct from containerization itself |
| [`95-externalized-rule-logic.md`](./architecture-patterns/95-externalized-rule-logic.md) | Not built as a generic engine: tax rates, pricing tiers, and every named "operational policy" are already externalized as data rows (`TaxRate`, `PlatformPlan`, `LeaveType`, `DeductionType`, `ApprovalChain`) — a single generic rule-evaluation engine is named as the wrong abstraction for shapes this stable |
| [`96-version-controlled-policy-execution.md`](./architecture-patterns/96-version-controlled-policy-execution.md) | Coverage note: `TaxRate`'s effective-dating and doc 63's tier-count-as-policy-row already deliver no-deploy policy changes; a visual chain *designer* is doc 63's own already-named, still-deferred boundary |
| [`97-realtime-validation-single-source-of-truth.md`](./architecture-patterns/97-realtime-validation-single-source-of-truth.md) | Coverage note: the global `ValidationPipe`/`PermissionsGuard`, House Rule 10's predicate-on-write, and snapshot-at-write-time already deliver this at three layers — never a separate validation service |
| [`98-contract-first-api-development.md`](./architecture-patterns/98-contract-first-api-development.md) | Names the honest distinction: this repository is code-first (OpenAPI generated from `@nestjs/swagger` decorators), not contract-first by sequence; names one real gap doc 38 doesn't cover — no automated HTTP-contract-diff check |
| [`99-centralized-api-gateway.md`](./architecture-patterns/99-centralized-api-gateway.md) | Coverage note: `CLAUDE.md`'s own "API Gateway → the single NestJS entrypoint's own hardening... Not a separate gateway process," quoted verbatim |
| [`100-event-driven-architecture.md`](./architecture-patterns/100-event-driven-architecture.md) | Coverage note: the transactional outbox (`EventBusService`/`OutboxDispatcher`), already `CLAUDE.md`'s own "Stable & reliable" pillar, cited by name across ten-plus documents this session |
| [`101-agnostic-notification-webhooks.md`](./integrations-connectivity/101-agnostic-notification-webhooks.md) | Self-hosted email already ships (`EmailChannel`'s own raw SMTP); SMS/WhatsApp are doc 33's own fully-specified, not-yet-built `NotificationChannel` implementations, blocked on picking a real gateway provider |
| [`102-hyperautomation-workflow-integration.md`](./integrations-connectivity/102-hyperautomation-workflow-integration.md) | Coverage note: doc 36's `OutboundConnector` schema literally uses `"Zapier webhook"` as its own worked example — n8n is the identical class of target, already served by the same generic, template-driven connector |
| [`103-semantic-data-contracts.md`](./architecture-patterns/103-semantic-data-contracts.md) | Coverage note: doc 18's canonical-JSON/`EdiTranslator` boundary already exists specifically to prevent trading-partner vendor lock-in; the internal DTO layer delivers the identical principle between modules |

**Numbers 104–126** cover a second, larger wave of generic enterprise-
architecture buzzwords (EAV, FSM/BPMN, event sourcing/CQRS, hexagonal
architecture, agentic/MCP integration, zero-trust, pluggable crypto) —
23 documents for the largest single batch so far. As with 92–103, several
of these bullets ask for architecture this repository's own `CLAUDE.md`
deliberately did not choose; those documents state the trade plainly
(and, where a real evidence-backed alternative already exists, cite it)
rather than building against a settled decision. A few bullets named
features or examples with no basis anywhere in this codebase (a "3D
globe," a MongoDB geospatial index) — those are named honestly as
fictional rather than silently built or silently ignored:

| File | What it is |
|---|---|
| [`104-jsonb-eav-extensibility.md`](./architecture-patterns/104-jsonb-eav-extensibility.md) | Declines a general EAV model as unindexable/unreviewable; scopes the real need (a client adds a custom field) as a bounded, per-entity JSONB overlay with a code-known entity list |
| [`105-metadata-driven-ui-rendering.md`](./architecture-patterns/105-metadata-driven-ui-rendering.md) | Declines a general metadata-driven rendering engine (it would rebuild the design system's own enforcement inside an interpreter); builds only the narrow form-section renderer doc 104's custom fields actually need |
| [`106-finite-state-machines-registry.md`](./architecture-patterns/106-finite-state-machines-registry.md) | `ALLOWED_TRANSITIONS` (orders.service.ts) already is this; declines making transition tables administrator-editable, since they are structural invariants other code depends on, not policy |
| [`107-visual-bpmn-workflow-modeling.md`](./architecture-patterns/107-visual-bpmn-workflow-modeling.md) | Declined for a third time in this document set — doc 63 and doc 96 already named and deferred a visual chain designer; BPMN doesn't change that answer |
| [`108-event-triggered-side-effects.md`](./architecture-patterns/108-event-triggered-side-effects.md) | The "Fulfillment Complete → 3PL webhook" example is doc 36's `OutboundConnector` subscribed to the existing `OrderStatusChanged` event — no new mechanism |
| [`109-immutable-event-ledger.md`](./architecture-patterns/109-immutable-event-ledger.md) | `AuditLog` + the domain-event catalogue already deliver a real, append-only audit trail; full event sourcing (state derived by replaying events) is named as a deliberate, larger commitment not made here |
| [`110-cqrs-read-write-separation.md`](./architecture-patterns/110-cqrs-read-write-separation.md) | `OrderEconomics`/`VariantSalesStat`-style same-database projections already deliver CQRS's actual benefit; states plainly that the bullet's own "3D globe"/MongoDB example describes a feature that does not exist in this product |
| [`111-hierarchical-entity-isolation.md`](./b2b-wholesale-multientity/111-hierarchical-entity-isolation.md) | Coverage note: `Organization`→`RetailBrand`→`Location` (doc 73) plus `BrandPolicy`'s existing cascade-with-override already is the Holding-Company→Subsidiary→Franchise model |
| [`112-pluggable-fiscal-engines.md`](./tax-compliance/112-pluggable-fiscal-engines.md) | Coverage note: a fourth citation of doc 15's `FiscalComplianceProvider` |
| [`113-micro-frontend-embedding.md`](./architecture-patterns/113-micro-frontend-embedding.md) | Declines full micro-frontend/module-federation architecture (doc 93's reasoning, restated); scopes the bullet's own real example (embedding a third-party dashboard) as a narrow, scoped iframe/embed-token pattern |
| [`114-sandboxed-scripting-runtime.md`](./architecture-patterns/114-sandboxed-scripting-runtime.md) | Declines a general WASM/scripting sandbox as oversized attack surface; recommends a restricted expression evaluator for the bullet's own named examples (commission/shipping formulas), deferred until a real requirement exists and routed through the `security` subagent when it does |
| [`115-hexagonal-architecture-ports-adapters.md`](./architecture-patterns/115-hexagonal-architecture-ports-adapters.md) | Names the existing correspondence: every `*Provider`/`*Driver`/`*Channel` extension point already is a Port; every implementation already is an Adapter |
| [`116-agentic-integration-mcp.md`](./ai-layer/116-agentic-integration-mcp.md) | Scopes a real MCP tool-adapter pattern reusing existing services/`PermissionsGuard`/`ApiClient` unchanged — a fourth adapter kind over services that already exist, not a new capability surface; deferred until a real AI-agent integration names its tools |
| [`117-event-driven-choreography-immutability.md`](./architecture-patterns/117-event-driven-choreography-immutability.md) | Choreography and immutability are already real (doc 100/109); explains why idempotency here keys off real business invariants (`orderId`, unique constraints) rather than a generic processed-event-ID ledger |
| [`118-headless-composable-api-capabilities.md`](./architecture-patterns/118-headless-composable-api-capabilities.md) | Ties doc 93/98/99/115/116 together; names the one real open question doc 116 doesn't answer — an agent acting *as* a specific human user, not under its own scoped permissions — as deliberately unbuilt |
| [`119-containerized-workload-portability.md`](./resilience-scalability/119-containerized-workload-portability.md) | Strengthens doc 94 with doc 48's own strongest evidence: the identical, unmodified `apps/api` already runs both containerized and as an offline desktop node |
| [`120-decoupled-integration-engines.md`](./integrations-connectivity/120-decoupled-integration-engines.md) | A third citation of doc 36; explains specifically why `payloadTemplate` isolates this repository from a vendor's own breaking API changes |
| [`121-vector-multimodel-databases.md`](./ai-layer/121-vector-multimodel-databases.md) | Coverage note: doc 35's `VectorStore` extension point already is this |
| [`122-data-lake-cold-storage-architecture.md`](./architecture-patterns/122-data-lake-cold-storage-architecture.md) | Named premature at this repository's current documented scale; states a concrete, measurable trigger condition for when to revisit rather than a vague "not needed yet" |
| [`123-automated-degradation-resilience.md`](./resilience-scalability/123-automated-degradation-resilience.md) | Collects the evidence that "The absent collaborator" — already a mandatory scope lens in every document this repository requires — is actually followed, across five cited examples |
| [`124-infrastructure-as-code.md`](./resilience-scalability/124-infrastructure-as-code.md) | Version-controlled deploy scripts and compose files are real; names honestly that no declarative provisioning tool (Terraform/Pulumi) exists |
| [`125-zero-trust-networking.md`](./access-control-identity/125-zero-trust-networking.md) | Separates the principle (already real, at the one HTTP boundary that exists) from the mesh it's usually built for (not applicable — there are no internal microservices to secure between, per doc 92) |
| [`126-pluggable-cryptography.md`](./access-control-identity/126-pluggable-cryptography.md) | Declines a dedicated crypto microservice; scopes a real, narrow, in-process `PasswordHasher` interface for rotation-on-next-login, deferred until a real reason to move off bcrypt exists — this remains the standing position; see ADR-027 |

**Numbers 127–139** answer two direct questions the owner asked after
reviewing the 92–126 batches' own pushback: concrete features to increase
*flexibility* (bending with policy changes, new integrations,
communication channels) and concrete features to extend *resilience*
against future interaction paradigms and backend technology this
repository cannot yet name (voice, video, a new database, a new payment
method). Two real gaps were found by grepping the actual codebase, not
assumed — no SSO/identity port and no shipping-carrier port exist
anywhere:

| File | What it is |
|---|---|
| [`127-policy-as-data-completeness-sweep.md`](./architecture-patterns/127-policy-as-data-completeness-sweep.md) | A repeatable script finding any remaining hardcoded threshold/bracket not yet converted to a data row, triaged rather than blindly enforced |
| [`128-extension-point-coverage-audit.md`](./architecture-patterns/128-extension-point-coverage-audit.md) | Confirmed by grep: no `IdentityProvider`/SSO port and no `ShippingCarrier` port exist today — both scoped as new extension points, additive, degrading to today's exact behavior with nothing registered |
| [`129-channel-abstraction-audit.md`](./integrations-connectivity/129-channel-abstraction-audit.md) | `NotificationChannel`'s interface checked for a hidden text-channel assumption; found one real gap (no way to express "this expects a reply") and added an optional, backward-compatible `correlationId` |
| [`130-machine-readable-capability-manifest.md`](./architecture-patterns/130-machine-readable-capability-manifest.md) | A live, generated (never hand-maintained) manifest of what's actually registered in a deployment — what a new integration partner or an agent needs to discover capability without reading source |
| [`131-versioned-domain-events.md`](./architecture-patterns/131-versioned-domain-events.md) | A naming convention (additive by default, a new `*V2` event name for a genuine break) for the one moment doc 100/38 didn't name: what happens when an event's shape must change |
| [`132-generic-inbound-webhook-receiver.md`](./integrations-connectivity/132-generic-inbound-webhook-receiver.md) | The inbound mirror doc 36's own table left empty — a registered, verified, templated receiver for a third party's own webhook shape before a typed adapter is worth writing |
| [`133-reusable-dry-run-harness.md`](./architecture-patterns/133-reusable-dry-run-harness.md) | A naming convention (`preview()`/`apply()`), not a shared runtime, so the next policy-as-data mechanism gets dry-run for free |
| [`134-hexagonal-purity-ci-check.md`](./architecture-patterns/134-hexagonal-purity-ci-check.md) | Turns doc 115's observed pattern ("no service knows its caller") into a checked CI invariant, the same treatment `check-module-boundaries.mjs` already gives module independence |
| [`135-intent-router-voice-video-agent.md`](./ai-layer/135-intent-router-voice-video-agent.md) | The direct answer to "what if there's no dashboard tomorrow" — an `Intent` shape every future modality (voice, video, an agent) converges on, routed to the identical service call an HTTP controller already makes. WO-135.1 **built**: `IntentRouterService` (`core/intent/`), proven against one real registered intent (`InventoryService`'s `check_inventory_chain_status`); WO-135.2/WO-135.3 stay deferred, blocked on doc 116's own still-unbuilt MCP adapter and an unnamed voice/video parser respectively. ADR-041 |
| [`136-database-cache-portability-audit.md`](./architecture-patterns/136-database-cache-portability-audit.md) | Audits every `$queryRaw`/`$executeRaw` escape hatch for a justified reason; states honestly that no cache technology exists yet to be resilient against changing |
| [`137-payment-method-resilience-audit.md`](./finance-accounting/137-payment-method-resilience-audit.md) | Checked `PaymentContext`/`PaymentInitiation` against wallet/BNPL/CBDC shapes — found no gap: the existing redirect-based design already generalizes correctly |
| [`138-technology-substitution-playbook.md`](./architecture-patterns/138-technology-substitution-playbook.md) | One short, honest swap-path note per core dependency not already behind a provider interface (Postgres, the outbox, the runtime) |
| [`139-second-front-door-websocket-gateway.md`](./architecture-patterns/139-second-front-door-websocket-gateway.md) | A second real transport (WebSocket/SSE) for session-oriented agent/voice callers specifically, sharing the identical `PermissionsGuard`/service layer — never a general real-time replacement of the REST API |

**Numbers 140–143** are **ADR-026** (`DECISIONS.md`): after two rounds of
engineering pushback (docs 92–126), the owner reviewed the reasoning
twice and explicitly instructed that seven declined mechanisms be built
anyway, for near-term flexibility, each narrowed by the exact guardrail
its own predecessor document identified as the real risk. **Three of the
original seven — a general WASM sandbox, a service mesh, and a dedicated
crypto microservice — were withdrawn and deleted by the owner's own
follow-up decision, recorded as ADR-027, after reconsidering the actual
security exposure each one carried.** Docs 114, 125, and 126 each state
that their own original recommendation is this repository's current,
standing position again, with a pointer to ADR-027 for the history. Only
the four lower-risk items remain built:

| File | What it is |
|---|---|
| [`140-general-eav-extensibility-model.md`](./architecture-patterns/140-general-eav-extensibility-model.md) | A true `EntityAttribute` EAV table, coexisting with doc 104's bounded overlay; doc 104's own named risks (no cascade-delete, no indexed value search, typo-prone entity names) made explicit, mitigated where possible, named where not |
| [`141-general-metadata-driven-ui-engine.md`](./architecture-patterns/141-general-metadata-driven-ui-engine.md) | A general form-metadata renderer, with doc 105's own named risk (a second, uninspected component library) closed by a mandatory, CI-enforced rule: the renderer may only ever compose `@newax/shared`'s own primitives |
| [`142-bpmn-visual-workflow-engine.md`](./architecture-patterns/142-bpmn-visual-workflow-engine.md) | A BPMN diagram editor that compiles into doc 63's own `ApprovalChain`/`ApprovalStep` rows — a visual authoring layer, never a second execution runtime; an unsupported BPMN construct is rejected at compile time, not silently ignored |
| [`143-micro-frontend-architecture.md`](./architecture-patterns/143-micro-frontend-architecture.md) | Module federation added as an opt-in, per-fragment layer alongside doc 93's single-app convention, with a mandatory design-law compliance attestation at registration and a `SUSPENDED` kill switch |

**Numbers 144–153** answer "find gaps," this time cross-checked against
`RETAIL-ERP.md`'s own numbered rules (R1–R26) and the actual schema
rather than re-reading the 143 existing docs. Two large findings turned
up nowhere else in this document set: an entire seven-rule resilience-
planning architecture (R20–R26) fully designed in prose with zero code
and zero implementation doc, and R18's own named receivables scope
(credit limits, dunning, statements, `CreditNote`/`DebitNote`) confirmed
missing by grep. The rest are smaller, some already self-named as
out-of-scope by an earlier document, some newly found by checking common
ERP domains against the schema directly. Doc 153 also designs the fourth
commercial `PricingModel` (usage-based + a GMV transaction fee) the
owner proposed, refined against three real problems in the original
idea and one hard dependency on doc 68's own fix:

| File | What it is |
|---|---|
| [`144-supply-chain-resilience-planning-engine.md`](./resilience-scalability/144-supply-chain-resilience-planning-engine.md) | `RETAIL-ERP.md`'s own R20–R26, entirely unbuilt: a derived dependency graph, typed shock propagation, one cash-preservation ranking formula, citation-only GenAI narration, ledger-based liquidity forecasting, supplier lead-time as a distribution, and R26's own online-stock-as-branch-allotment model — confirmed by grep that none of it exists beyond three unrelated nightly digest emails |
| [`145-receivables-credit-limits-dunning.md`](./finance-accounting/145-receivables-credit-limits-dunning.md) | R18's own named scope — `CreditNote`/`DebitNote`, customer credit limits, dunning, statements — confirmed missing; dunning reuses doc 54's existing expiry watcher, never a second scheduler |
| [`146-wholesale-tiered-pricing.md`](./b2b-wholesale-multientity/146-wholesale-tiered-pricing.md) | **Built.** The `pricing` module `MULTI-SECTOR.md` already named as not built — price lists and quantity breaks replacing the inline `priceOverride ?? basePrice` fallback in cart/orders, byte-identical behavior when no price list is assigned. ADR-049 |
| [`147-fixed-asset-depreciation.md`](./finance-accounting/147-fixed-asset-depreciation.md) | Doc 79's own named, unbuilt gap — a depreciation schedule and monthly GL posting over doc 79's existing `Asset` model, idempotent via the existing `findPostedEntry()` key |
| [`148-external-customer-support-portal.md`](./tasks-notifications-support/148-external-customer-support-portal.md) | Doc 64's own named, unbuilt gap — customer-facing ticketing keyed to `Contact`/`Party`, never `User`, sharing doc 64's own staff-side queue and permissions |
| [`149-b2b-accounts-approvals-sector-packs.md`](./b2b-wholesale-multientity/149-b2b-accounts-approvals-sector-packs.md) | **Built.** The `accounts`/`approvals` sector packs `MULTI-SECTOR.md` names but never scopes — `AccountProvider` reuses doc 145's own credit check unchanged; a `B2BOrderRequest` (REQUEST, never an Order) gates on-account orders at or above threshold through doc 63's existing `ApprovalChain`, generalized to a set of the buyer's own contacts as approvers, converting via the identical `OrdersService.place()` once approved. Off by default; checkout byte-identical with it off. ADR-053 |
| [`150-product-kitting-bundles.md`](./catalog-variants-pricing/150-product-kitting-bundles.md) | **Web checkout + returns + admin UI built; POS and storefront display not yet wired.** Genuinely new: no bundle/kit model existed — a sellable shell over existing variants, decremented atomically through the unchanged `InventoryService.move()`, never conflated with `bom`'s own recipe/production model. Never backorder-eligible. The bundle-builder admin screen (Catalogue → Bundles) is reachable now — `BundlesService` gained a label-enrichment step so no raw variant id ever reaches it. ADR-049, ADR-061 |
| [`151-layby-installment-sales.md`](./finance-accounting/151-layby-installment-sales.md) | Genuinely new, and a real gap in this market specifically — a payment schedule against one order, fulfilment gated on completion for layby, unaffected for instalment, feeding doc 145's own aging unchanged |
| [`167-bank-facility-management.md`](./finance-accounting/167-bank-facility-management.md) | **Built, including its own admin UI.** The mirror concern to receivables (doc 145): what the business itself owes a bank against a facility limit, not what it is owed. `Bank`/`BankFacility`, computed (never stored) utilization, a drawdown maker-checker mirroring `CreditNotesService`, a monthly markup-accrual cron mirroring `AssetDepreciationCron`. Promoted from `GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md`, now superseded. ADR-063 |
| [`152-purchase-requisition.md`](./inventory-purchasing/152-purchase-requisition.md) | Genuinely new: no pre-PO internal request step existed — reuses doc 63's generic approval chain rather than a bespoke mechanism, converts to an ordinary `PurchaseOrder` through the unchanged existing path |
| [`153-usage-based-pricing-model.md`](./commercial-licensing-agency/153-usage-based-pricing-model.md) | A fourth `PricingModel` (doc 50's three plus this one): the owner's own per-feature-plus-1%-of-sales idea, refined to meter actions never things-at-rest, consolidate messages into one meter, and ship as an optional tier alongside flat-rate rather than replacing it — depends on doc 68's own POS-event fix so till sales aren't silently unmetered, and reuses doc 145's own receivables design one level up for Newax's own AR from tenants |
| [`154-three-headline-commercial-plans.md`](./commercial-licensing-agency/154-three-headline-commercial-plans.md) | Pure packaging, no new `PricingModel`: exactly three customer-facing plans (Lifetime License / Per Month / Pay As You Grow) mapped onto doc 50/153's own existing `ONE_TIME_LICENSE`/`FLAT_MONTHLY`/`USAGE_BASED` rows via one new `isHeadline` flag; `PER_SEAT` stays fully available, reachable through a "talk to us" link, never shown as a fourth tile |
| [`155-wallet-stored-value-merchant-escrow.md`](./commercial-licensing-agency/155-wallet-stored-value-merchant-escrow.md) | Revised from an escrow design to Newax-issued store credit (a customer buys credit, paid into Newax's own bank account, booked as deferred revenue) plus ordinary trade-payable merchant settlement generalizing doc 145's own `SupplierBill`/AP — a materially lower-risk structure than the original, still with a lighter, named WO-155.0 confirmation (closed-loop characterization, the merchant-agreement basis) rather than a full block. Credit is reserved at checkout and deducted ("redeemed") exactly at merchant confirmation, per the owner's own words; doc 18's existing `IdentityVerification` still controls payout-run speed, not an escrow release; doc 153's own 1% fee nets out of each `MerchantPayable` |

**Number 156** answers a direct fraud-prevention question: a single-
employee branch can sell stock with no record, or substitute/steal
product, and the owner has no way to know. Honest up front that no
software prevents a lone, unsupervised employee with physical custody
from doing this — the document builds only what's real: faster
detection, attributable accountability, and a closed self-dealing gap
found by reading the actual code, never a "fraud-proof" claim:

| File | What it is |
|---|---|
| [`156-single-employee-branch-loss-prevention.md`](./inventory-purchasing/156-single-employee-branch-loss-prevention.md) | Links `StockVariance` to the `PosShift` that had custody when it occurred; closes a real, confirmed gap in `StockVarianceService.resolve()` where the same employee could cause and write off their own shrinkage; adds unpredictable small spot-checks over the existing `StockCount` mechanism instead of only infrequent, predictable full counts; and a camera-foot-traffic-vs-POS-transaction-count correlation report over doc 30's existing camera integration, named explicitly as a signal for a human to review, never an automated accusation |

**Number 157** answers the owner's own follow-up on preventing a
"double transaction": doc 117 already specifies this repository's real
idempotency strategy for internal event handlers (domain keys on an
already-existing row), but that mechanism structurally cannot protect
the one moment there is no existing row yet — creating a brand new
order. Confirmed by code read that `POST /orders` has no client-supplied
dedupe of any kind:

| File | What it is |
|---|---|
| [`157-client-request-idempotency-keys.md`](./architecture-patterns/157-client-request-idempotency-keys.md) | A client-supplied `Idempotency-Key` header + `IdempotencyKey` table, checked before a guarded route's handler ever runs; the `@@unique([organizationId, scope, key])` constraint is the actual race guard, a failed request deletes its own row so it stays retryable, and a nightly purge keeps the table small. Opt-in per route (`orders.create`, POS sale creation, doc 155's wallet purchase) via one decorator, never a global `POST` behaviour change; doubles as the fix for doc 48's offline-sync-replay risk once the client generates the key at the moment of the original action |

**Number 158** answers a direct request for a serial-numbering system.
`MULTI-SECTOR.md` already names this exact gap and leaves it unbuilt —
"electronics adds `serials` and `warranty`" is listed among the future
packs a new sector would add, confirmed by grep to be entirely unbuilt:

| File | What it is |
|---|---|
| [`158-serialized-unit-tracking.md`](./lots-serials-traceability/158-serialized-unit-tracking.md) | `SerializedUnit` — one row per physical unit, the sub-ledger pattern doc 32's `Lot` already proved, reused for the per-unit case; opt-in per variant (`tracksSerials`), attached to the unchanged `InventoryService.move()` via `stockMovementId`, never a second stock model. A return is refused unless the scanned serial was actually sold on that exact order — a direct instance of doc 156's own toxic-pair discipline. Strengthens doc 156 for free: a `StockVariance` on a serial-tracked unit can name the exact missing unit, not just the SKU |

**Number 159** answers a request for "seamless," "maximum flexibility"
integration with VoIP/call, SMS, WhatsApp and business-email providers.
Three of the four are already answered by existing mechanisms, cited
rather than rebuilt (doc 33's `NotificationChannel` for SMS/WhatsApp;
`EmailChannel`'s own plain-SMTP design, confirmed provider-agnostic by
reading the code, for business email). Voice calling had no extension
point anywhere — confirmed by grep — and is the one genuinely new piece:

| File | What it is |
|---|---|
| [`159-telephony-provider-integration.md`](./integrations-connectivity/159-telephony-provider-integration.md) | `TelephonyProvider` — the identical provider-swap shape `PaymentProvider`/`NotificationChannel` already use, generalized over any VoIP/SIP/call-center vendor; `CallLog` as a RECORD once a provider webhook confirms a call happened, an unverified webhook refused outright per doc 155's own payment-callback discipline; recordings pulled into the existing `StorageService` rather than left as a provider-hosted link; click-to-call attaches to doc 06/64's existing `Contact`/`SupportTicket`, never a second contact or ticket system |

**Number 160** answers the direct follow-up on doc 159's own gap survey:
"a dynamic flexible system that can connect to any of them," not eight
separate integrations. Walked every named category (e-signature,
marketplaces, accounting software, bank feeds, calendars) against doc
36/132's own existing generic connectors and found three genuinely
missing, general-purpose pieces — not eight vendor-specific ones:

| File | What it is |
|---|---|
| [`160-dynamic-external-system-connectivity.md`](./integrations-connectivity/160-dynamic-external-system-connectivity.md) | Three additions completing doc 36/132's own connectivity system: `OAUTH2_AUTHORIZATION_CODE` + `OAuthConnection` for per-merchant "Connect your account" flows (QuickBooks, Google, Shopify); `PollConnector` as the scheduled-pull sibling to doc 132's passive webhook receiver (marketplace order feeds, bank statement APIs); `ExternalRecordLink` as one generic our-entity↔their-id mapping table every stateful sync reuses, reusing doc 157's own idempotency discipline against an external system's own records. Hardware integration stays correctly separate (doc 31); a file/SFTP connector kind is named honestly as unbuilt, not stubbed speculatively |

**Numbers 161–162** are the two follow-ups the owner picked from doc
160's own "what's next" survey — SSO and the file/SFTP connector kind
doc 160 itself named and deliberately left unbuilt:

| File | What it is |
|---|---|
| [`161-sso-identity-federation.md`](./access-control-identity/161-sso-identity-federation.md) | The full, security-reviewed design behind doc 128's own `IdentityProvider` sketch: `SsoConnection` per organization, a mandatory email-domain allowlist checked *before* any user lookup (the one control that makes account linking safe), JIT provisioning via the existing `assignByNameIfExists()` pattern self-registration already uses — deliberately never publishing `UserRegistered`, since that event's own CRM subscriber would wrongly create a customer contact for a staff login |
| [`162-file-based-connector-integration.md`](./integrations-connectivity/162-file-based-connector-integration.md) | The fourth connector shape doc 160 named and left out: `FileConnector` (SFTP, scheduled or event-triggered) + `FileFormatHandler` (one parser/generator class per format family — MT940/CAMT.053/CSV/fixed-width — never one per bank), idempotent by file checksum (doc 157's own discipline applied to a file instead of a request). Reuses `PayrollRunPosted` to trigger a bank disbursement file and doc 04's existing ledger for statement reconciliation — no second bookkeeping system. Names the one new dependency (an SFTP client) explicitly, per `.claude/rules/dependencies.md`'s own required template, for the owner's approval before install |
| [`163-personal-api-keys.md`](./access-control-identity/163-personal-api-keys.md) | Personal API keys, **built**: a signed-in person mints a key carrying a subset of their own access for an AI agent, script or integration — admin API and storefront API, one `ApiKey` lifecycle with two scope catalogues. Effective access is `scopes ∩ owner's live permissions`, recomputed per request; `NON_DELEGATABLE_PERMISSIONS` and a new `CUSTOMER_SCOPE_CATALOG` in `packages/shared`; both guards fail closed; `@SessionOnly()` on every credential-minting route. ADR-037 |
| [`164-department-permission-role-duty-control.md`](./hr-people-org/164-department-permission-role-duty-control.md) | Department dynamics, **not built** — depends on docs 19/20/21/23's own unbuilt schemas and adds nothing to them. `OrgUnitControlProfile` (a standing, nearest-ancestor-inherited permission ceiling and role allow-list per `OrgUnit`, defaulting to fully unrestricted so the feature is purely additive) and `OrgUnitDuty` (a department's declared charter/duty list, copied — never referenced — onto the first `Posting`'s starter `Task` rows). Enforced at two existing writers, `RolesService.assign()` and doc 21's `GrantService.issue()`, never a third mechanism |

**Number 165** answers the owner's own follow-up request to "centralize
everything shared by different clients... like a Facebook," clarified over
two rounds of questions into: separate, isolated tenants exactly as doc 39
already built, plus an opt-in publish/discover layer a tenant controls by
audience type, with both discovery and transaction available per listing.
Read literally the request would have merged tenant business data, which
doc 39 already rejected in writing; the owner's own clarification ruled
that reading out:

| File | What it is |
|---|---|
| [`165-cross-tenant-marketplace-directory.md`](./b2b-wholesale-multientity/165-cross-tenant-marketplace-directory.md) | **Partially built.** A new `apps/platform` module (`MarketplaceListing`/`MarketplacePublisherCredential`/`MarketplaceViewerProfile`/`MarketplaceEngagement`), never a shared `Product` table — a tenant explicitly publishes a listing, tagged with the audience (retailer/distributor/supplier/direct customer) allowed to see it and a per-listing discovery-only-or-transact mode. Built: the full schema, the platform's own publish API (upsert-not-duplicate, auto-delist on credential revocation), erp-1's server-to-server proxy module and its admin "Publish to marketplace" screen, and the `SsoConnection.enforceSso` column with erp-1's staff password-login guard and its admin toggle. Deviation: the publisher credential is ops-issued (`OpsAuthGuard`), not self-service as the doc's own §2 describes — the mechanism doc 166 already built. Still blocked, honestly: discovery, transact, and the platform-side nID login client (and its `oidc-client.ts` extraction) all wait on nID exposing an OIDC surface, which cannot be confirmed or built from this repository — `nadeemmurtaza/nID` is a separate repo not attached to this session. `MarketplaceViewerProfile`/`MarketplaceEngagement` exist as schema only, with no service yet. ADR-047, ADR-058 |

**Number 166** answers the owner's direct follow-up, naming Apple's
unified-memory principle by request: the same physical product's name,
description and photographs are re-entered from scratch by every business
in a supply chain — manufacturer, then each distributor, supplier and
retailer — because nothing reads `ProductVariant.barcode` as proof two
tenants describe the same object. Lives in `architecture-patterns/`, not
`b2b-wholesale-multientity/`, because it is a general write-once/
reference-many pattern applied to product data, built on the same platform
module doc 165 introduced rather than a second cross-tenant mechanism:

| File | What it is |
|---|---|
| [`166-unified-product-reference-registry.md`](./architecture-patterns/166-unified-product-reference-registry.md) | **Platform-side schema + API, and every erp-1-side piece, built.** `GlobalProductReference` (keyed by barcode, `attributes Json` for every other sector-varying detail) in `apps/platform/prisma/schema/marketplace.prisma`, migrated against a real Postgres. A tenant's own product editor looks a barcode up on blur and offers to autofill name/description/care/photographs from a match (`BarcodeReferencePreview` — nothing writes until "Fill from shared listing" is clicked); a genuinely new barcode is registered silently after save — GS1's own GTIN-registry pattern, sized to this codebase. `ProductTranslation`/`ProductImage` gained a `sourcedFromGlobalReferenceId` provenance marker so a later hand-edit is a deliberate override a future sync never clobbers. `ProductReferenceSyncService` has two write paths (`adopt()` for the tenant's own explicit autofill accept, `apply()` for an inbound push once the platform's own dispatcher exists) rather than one, since they answer different questions. Revised same-day per a direct follow-up to centralize everything non-commercial (not just images) and split sync by connectivity: a cloud-connected tenant stays synced by push in near-real time; an offline-capable deployment pulls a full local snapshot — text, attributes, and the image bytes themselves — via the `bulk-lookup`/`export` endpoints (WO-166.6). `MarketplacePublisherCredential` (ops-issued, mirroring `AgencyClientsService`'s exact precedent) authenticates every route both directions, including the inbound webhook; only the registering tenant may edit a canonical record, every other tenant's write path is a reviewed flag. Still not built, honestly: the moderation screen (platform staff — `apps/platform` has no frontend of any kind, a separate decision from this document's own scope) and the platform's own outbound sync dispatcher (needs outbox infrastructure `apps/platform` doesn't have). ADR-048, ADR-059 |

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

## Gap-analysis roadmap references

Not work orders — a check of this repository against a third-party
feature list, recording what is genuinely missing today so a future
scoping pass starts from an inventory instead of a blank page:

- **[`GAP-ANALYSIS-ERP-FEATURE-COMPARISON.md`](./GAP-ANALYSIS-ERP-FEATURE-COMPARISON.md)**
  — a generic ERP's own Setup/CRM/Sales/Purchase/Inventory/Production/
  Financial Management feature list.
- **[`GAP-ANALYSIS-ODOO-APPS.md`](./GAP-ANALYSIS-ODOO-APPS.md)** — Odoo's
  own published app catalog.
- **[`finance-accounting/GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md`](./finance-accounting/GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md)**
  — a single capability named as entirely unbuilt in both lists above,
  written up on its own since it needs a new actor (`Bank`) this
  repository has no equivalent of today. **Superseded**: built as
  [`finance-accounting/167-bank-facility-management.md`](./finance-accounting/167-bank-facility-management.md).
