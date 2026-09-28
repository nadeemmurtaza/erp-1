# 168 — A composable, resilience-first SME platform for du: the program, and why it is built inside this repository

> **Status: proposed (2026-09-27), not yet built.** This document builds
> nothing. It frames docs 169–183 and records, in its own words, the argument
> behind `DECISIONS.md` ADR-071 (build inside erp-1 as new modules over
> shipped infrastructure — never a separate greenfield repository, never a
> fork). Most of what the program needs is **already built** and is cited
> here by file and function; what is genuinely new is named as new, and every
> place the program's own brief assumed something the code does not bear out
> is corrected in §3 below rather than carried forward.

## 1. The thesis

An SME does not experience "resilience" as a risk score. It experiences it as
three concrete questions: *if my main supplier slips three weeks, which of my
products run out, where, and when; how much revenue and cash does that put at
risk; and what is the cheapest reversible thing I can do about it today.*
`RETAIL-ERP.md` Part 4 already states this in its own words — "The question is
never 'what is my risk score'. It is *'will I make payroll if this supplier
slips three weeks'*" (R24) — and already names the pipeline that answers it:

```
SME modules (active manifest)   →  MODULES + MODULE_PACKS + GET /meta   ALREADY SHIPPED
Canonical business model        →  a module-agnostic node/edge vocabulary
Operational dependency graph    →  derived from rows that already exist — day one
Propagation core                →  graph arithmetic; computed, not predicted
Candidate action ranking        →  cash preserved per [unit of cash] spent
GenAI narration + contingency   →  AiProvider; drafts only, never figures
Resilience control center       →  Simulate / Accept / Modify
```

(The `RETAIL-ERP.md` original of the fifth line reads "per rupee spent". That
wording is itself the root of the currency-literal defect doc 173 fixes in
code; editing the document of record's own wording is left to the owner, see
§3 item 8.)

The program this document set specifies is that pipeline, offered by du to
50,000+ SMEs as a du-owned product, with **three additions the pipeline never
needed while it served one Pakistani retailer's own database**:

1. **An ingestion boundary** (Layer 3, doc 172). The SME's facts live in
   *other* systems — a spreadsheet, an accounting package, a POS — and must
   reach the canonical model read-only, with every record carrying a
   confidence score, a provenance trail and a freshness stamp, and with a
   human confirming that the data describes their business before any
   simulation is shown as trustworthy.
2. **A second-market proof of every country-specific extension point**
   (§5). Tax filing, identity verification, payment collection and locale all
   sit behind interfaces today; the UAE forces each one to take an unrelated
   implementation.
3. **A du-operated control plane** at 50,000-tenant scale (Layer 2, doc 171;
   doc 39's shipped control plane, extended with a per-tenant Build Manifest
   and a controlled Update Agent).

Payments are an execution channel for this product, never the product
(Layer 6, doc 175): du's own licensed entities move money; NEWAX never holds
funds.

## 2. Why this repository — the argument ADR-071 records

A greenfield repository was the alternative on the table. It loses on
evidence, not on taste: the two hardest pieces of this product already exist
here as shipped, tested code, and the third is specified to the column.

### 2.1 The resilience engine is already built (doc 144, ADR-066)

`apps/api/src/modules/planning/` is `RETAIL-ERP.md` R20–R26, built and spec'd:

| Capability | Real code | What it guarantees today |
|---|---|---|
| Dependency graph (R20) | `DependencyGraphService.build()` — `dependency-graph.ts:43` | A projection over five real edge types (`SupplierProduct`, `BomComponent`, `VariantLocationStock`, `StockTransfer`, unpaid `SupplierBill`), rebuilt per request, never a second maintained model |
| Shock propagation (R21) | `propagate()` — `propagation.ts:49` | A pure function: no `prisma.*`, no `publish(`; identical inputs give byte-identical output (`propagation.spec.ts`) |
| Action ranking (R22) | `rankActions()` — `action-ranking.ts:51` | Candidates generated only from real edges (`action-ranking.spec.ts`); two of nine kinds generated because only two have real data |
| Narration (R23) | `NarrationService.narrate()` / `assertNoOriginatedFigures()` — `narration.service.ts:29`, `:87` | A narration containing any number not handed to the model is refused, never shown uncited |
| Liquidity (R24) | `LiquidityForecastService.forecast()` — `liquidity-forecast.service.ts:33` | Current cash from bank-account `JournalLine`s, scheduled AR/AP/payroll, a real `cashConversionCycleDays` |
| Lead time as distribution (R25) | `SupplierResilienceService` + `GoodsReceivedLeadTimeListener` | Backfilled from `GoodsReceived`; `defectRatePct` honestly `null` |
| Online stock (R26) | `OnlineStockService` | Reassignment through `InventoryService.move()`, the one stock writer |
| UI + permission | `/admin/resilience`, `planning.propagation.view` | Seeded to `ADMIN`, reachable from the Stock nav group (`nav-registry.ts`, key `resilience`) |

A new repository would have to rebuild all of this and then re-earn the
determinism and non-invention guarantees its specs prove. Doc 173 extends this
engine; it does not replace one line of its contract.

### 2.2 The multi-tenant control plane is already built (doc 39 and its siblings)

`apps/platform` is a separate NestJS app with its own database, and it is
exactly the shape du needs to own: **shared compute, never shared data — a
tenant is a node with its own database** (doc 39 §"The one design decision";
`DECISIONS.md` rejects shared-schema multi-tenancy in writing).

| Capability | Real code (`apps/platform/`) | Doc |
|---|---|---|
| Tenant registry, isolated DB per tenant | `PlatformTenant`, `TenantDeploymentCredential` (AES-256-GCM connection string), `ProvisioningService.provisionTenant()`, `PostgresDatabaseProvisioner` (`CREATE DATABASE` + `prisma migrate deploy`) | 39 |
| Hostname routing | `HostnameResolverService`, `routing.controller.ts` | 39 WO-39.3 |
| Time-boxed support access | `SupportAccessGrant`, `SupportAccessService.issue()/approve()/recordAccess()`, `SupportAccessExpiryCron` | 39 WO-39.5 |
| Resource quotas | `ResourceTierQuota`, `ResourceQuotaAlert`, `ResourceQuotaAlertCron` | 39 WO-39.6 |
| Export + deprovisioning | `TenantDataExport`, `PgDumpExportRunner`, `TenantRetentionCron` | 39 WO-39.7 |
| Pricing shapes and invoicing | `PlatformPlan.pricingModel` (four shapes), `PlatformInvoice`, `BillingService`, `SeatCounterService` | 50, 153 |
| Headline plans and trials | `isHeadline`/`headlineOrder`, `/pricing`, `TenantStatus.TRIAL`, `SignupService` | 154, 51 |
| Usage metering across the isolation boundary | `UsageMeteringService` (reads each tenant's own outbox, connection-per-call, `UsageMeteringCursor`) | 153, ADR-038 |

### 2.3 The extension-point discipline exists and is machine-enforced

`scripts/check-module-boundaries.mjs` fails `pnpm lint` on any core→pack or
pack→pack import and on any module-to-module import not named in
`KNOWN_MODULE_COUPLINGS` (`check-module-boundaries.mjs:134`) — a short list of
approved same-transaction writes that its own comment says are "meant to stay
direct imports permanently", which still fails the build on a stale entry
(`:122–132`, `:435–442`), and to which "adding a fifth entry needs the same
same-transaction justification in the pull request". Every country-specific
integration already sits
behind an interface a second implementation plugs into — which is the whole
international argument, taken up in §5.

### 2.4 The connector architecture is specified to the column — and unbuilt

Docs 36, 132, 160 and 162 specify one connectivity system — `OutboundConnector`,
`InboundWebhookEndpoint`, `OAuthConnection`, `PollConnector`,
`ExternalRecordLink`, `FileConnector`/`FileConnectorRun`/`FileFormatHandler`.
**None of it exists in code**: no `connectors.prisma`, no model of those names
in `apps/api/prisma/schema/`, no `connectors` module under
`apps/api/src/modules/` (verified by grep while writing this document). The
design is still the strongest reason to build here — it is exactly the
ingestion substrate Layer 3 needs, already argued through its own scope lenses
— but doc 172 is honest that its first work orders **are** WO-160.x/WO-162.x,
built as specified, before anything ingestion-specific lands on top.

### 2.5 What a greenfield repository would have had to rebuild first

| Would need rebuilding | Already here |
|---|---|
| Deterministic propagation + non-inventive ranking + citation-checked narration | doc 144, nine spec files |
| Tenant provisioning, isolation, routing, support access, export, billing | doc 39/50/51/153/154/14 |
| PBAC with a permission catalogue, a role seed, non-delegatable keys, toxic pairs | `packages/shared/src/permissions.ts`, `api-keys.ts` |
| A transactional outbox with idempotent handlers | `EventBusService`, `outbox.dispatcher.ts` (2 s poll, 25/batch, 8 attempts, backoff `min(2^n s, 300 s)`) |
| A double-entry ledger that posts from events | `accounting` module (R15) |
| Settlement reconciliation with a named `SHORT` variance | `settlements` module (doc 49) |
| A feature-flag primitive with maker-checker on money/stock paths | `core/feature-flags/`, doc 37, ADR-068 |
| A generated repository index and a lint suite that enforces the architecture | `docs/index/` (`pnpm index`), and the eleven `scripts/check-*.mjs` guards the root `package.json` `lint` script chains after `turbo run lint` (module boundaries, hexagonal purity, rebrand, contrast, links, permission checks, rules, and four more) |

## 3. Premises corrected against the code

The program brief was written from the documents. Checking each premise
against the code while writing this set turned up the following. None
weakens the decision in ADR-071; several strengthen it; all of them change
what the program must actually build, so each is carried into the doc that
owns it.

1. **`FiscalComplianceProvider` has zero implementations, not one.** It is an
   interface *sketched* in `tax-compliance/15-tax-module.md` (WO-15.5,
   "field payload blocked on real FBR requirements"); no code under
   `apps/api/src/modules/tax/` declares it (grep: no match). A UAE
   Accredited-Service-Provider implementation would be its **first**
   implementation, not its second — and PINT AE, being a published
   specification, is the first fiscal regime concrete enough to build it
   against. The sketch is also order-shaped (`buildInvoicePayload(order:
   OrderWithTax)`), which PINT AE forces to change before anything is built
   (doc 181).
2. **The shipped identity provider is Newax's own nID platform, not NADRA.**
   `NidVerificationProvider` (`identity-verification/providers/nid.provider.ts`)
   calls nID's REST API as "any third-party tenant of nID would"
   (`18-identity-verification.md`). The README row calls it "NID/NADRA";
   erp-1 itself never talks to NADRA. The UAE implementation is still a second
   `IdentityVerificationProvider` — and it needs two additive interface
   changes (doc 170 §3.3).
3. **The connector system (docs 36/132/160/162) is specified, not built** —
   §2.4 above.
4. **Doc 38 is specified, not built.** `CircuitBreaker` exists only as a
   comment reference in `core/versioning/api-version-policy.service.ts:35`;
   no class implements it. The "real DR numbers" doc 38 §4 asks for were
   never measured (WO-38.4). The only real numbers are the backup timer's:
   `deploy/systemd/yaseen-backup.timer` fires `*-*-* 03:00:00` with
   `RandomizedDelaySec=300` and `Persistent=true`, and `deploy/backup.sh`
   keeps `RETAIN_DAYS=14` locally and ships off-site only when `S3_TARGET` is
   set. RPO is therefore bounded at roughly 24 h for the one stack that timer
   serves; RTO is unmeasured. Doc 176 states this rather than quoting
   numbers nobody measured.
5. **There are four pricing shapes, not three, and the wallet is not one of
   them.** `PricingModel` is `PER_SEAT | FLAT_MONTHLY | ONE_TIME_LICENSE |
   USAGE_BASED` (`apps/platform/prisma/schema/platform.prisma`; doc 153 added
   the fourth). Doc 155's wallet is Newax-issued store credit settling into
   *Newax's own bank account* — a custody posture this program must not use
   (doc 175, doc 182).
6. **"Tenant" is not a column.** The brief asked for a tenant column on every
   canonical record. This codebase's tenant boundary is the database itself —
   doc 39 ("a tenant is a node"), ADR-040/044 as restated in
   `idempotency.prisma`'s header, `receivables.prisma`'s header, doc 49's and
   doc 161's own deviations. A `tenantId` column would be the shared-schema
   design doc 39 rejects in writing. Doc 169 specifies what each record
   carries instead.
7. **No new `KNOWN_MODULE_COUPLINGS` entry is needed, and adding one would be
   refused.** The entry list is reserved for same-transaction writes
   (`check-module-boundaries.mjs:37–46`), and `RETAIL-ERP.md` Part 4 states the
   intelligence layer "add[s] zero module couplings". The ingestion boundary
   reaches owning modules through a new core extension point and reaches
   `planning` not at all — `planning` reads the ingested rows by bare Prisma
   read, as it reads everything else (doc 172 §9).
8. **`rupeesSpentMinor` is one instance of a currency-literal family.**
   Confirmed at `action-ranking.ts:31/82/88/89/106`, `narration.service.ts:63`
   (and the literal word "paisa" at `:75`, `action-ranking.ts:104`),
   `narration.service.spec.ts:16`, `resilience/page.tsx:33/258`, doc 144
   lines 144–145, and `RETAIL-ERP.md` R22's own heading. Its siblings:
   eight `@default("PKR")` schema defaults (`Order`, `Payment`, `Supplier`,
   `PurchaseOrder`, `SupplierBill`, `Expense`, `GiftCard`, `WalletAccount`),
   write paths that never set `currency` at all (`PaymentsService.createForOrder()`
   at `payments.service.ts:105–113`; `Order` placement), a literal `'PKR'`
   fallback at `finance.service.ts:234`, and 370 occurrences of "paisa" plus
   151 of "rupee" across `apps/*/src` and `packages/*/src`. `pnpm check:rebrand`
   cannot see any of this: it derives its terms from `brand.ts`'s *identity*
   fields, not its currency. Doc 173 renames the planning fields; doc 170
   owns the sweep.
9. **`PaymentProvider.handleCallback` verification fails open by omission.**
   `PaymentsService.handleCallback()` refuses only `result.verified === false`
   (`payments.service.ts:149`); `verified` is optional
   (`payment-provider.ts:70`) and no provider ever sets it `true`. A provider
   that forgets the field is trusted. Doc 175 tightens this before a du rail
   is wired.
10. **`SupportAccessGrant` is enforced in the control plane only.**
    `SupportAccessService.recordAccess()` checks liveness and appends to
    `accessedAt` (`support-access.service.ts:82`), but nothing in `apps/api`
    consults a grant — the tenant deployment has no idea one exists. Doc 170
    §5 specifies the tenant-side enforcement.
11. **The shipped liquidity forecast has three correctness gaps a UAE tenant
    would hit.** It sums `SupplierBill.amount - amountPaid` across bills in
    *any* currency (`liquidity-forecast.service.ts:76–78`; the same expression
    weights the Obligation edge at `dependency-graph.ts:92`) although
    `baseAmountMinor` exists for exactly this; its AR leg reads `Invoice`
    rows while the ledger's own aged receivables (`gl-reports.service.ts:228`)
    key off `Contact`/`JournalLine`; and it returns `currentCashMinor: 0` —
    indistinguishable from "no cash" — whenever `accounting` is off. Doc 173
    fixes all three.
12. **The shipped engine drifted from doc 144's own prose in three places
    doc 144 does not list** among its "two honest deviations": the `Shock`
    union has no `FxMove` (`propagation.ts:3–9`); `DemandShock` takes one
    `variantId`, not a scope; and `PropagationResult` rows carry no
    `revenueAtRiskMinor`/`marginAtRiskMinor`/`cashAtRiskMinor`
    (`propagation.ts:27–34`) although doc 144 §2 shows them. Doc 173 records
    them and adds the revenue-at-risk figure the control center needs.

## 3a. The one architectural decision this program does *not* get to make quietly

Two findings above reach past this program into decisions the repository has
deliberately left open or settled differently, and they are named here so
nobody discovers them in a pilot:

- **An SME's legal identity on its own tax invoice.** `brand.ts` is
  compile-time (Br1). At 50,000 tenants on one du image, the six identity
  fields a tax invoice prints — legal name, TRN, registration number,
  address, banking, logo — cannot be compiled per tenant. They already
  half-exist at runtime (`SettingKey.Store`, seeded *from* `BRAND` in
  `settings.defaults.ts:362`), but `apps/web/src/config/business-profile.ts`
  reads `BRAND.legal.*` and `BRAND.banking` directly. Doc 170 §6 specifies the
  bounded change (brand.ts keeps du's product identity and the UAE locale
  block; the SME's legal identity moves to its own runtime settings) and
  names it as needing its **own** ADR, because it touches Br1's wording.
- **Compute density at 50,000 tenants.** Doc 39 routes each tenant to "its
  own deployment (own app instance, own database)", and leaves the
  orchestrator out of scope. At this scale that implies either many idle
  processes or scale-to-zero instances — and a scaled-to-zero tenant runs no
  `@Cron`, which silently stops connector polls. Doc 176 names the failure
  mode; the density decision itself sits beside the still-open ADR-018 and is
  not taken here.

## 4. The seven layers, and what each reuses

| Layer | What it is | Reused unchanged | Extended | Genuinely new | Doc |
|---|---|---|---|---|---|
| 0 — Canonical data spine | Party / Relationship / Product / Commercial Document / Financial Event / Operational Event | `Party`, `Supplier`, `Contact`, `ProductVariant`, `Location`, `SupplierBill`, `JournalLine`, `StockMovement`, `Payment` | `Invoice` toward R18 (`contactId`, nullable `tradingPartnerId`); `Party.externalRef/externalSystem` finally written; doc 160's `ExternalRecordLink` gains provenance columns | `ObservedSale`, `ObservedCashBalance` — the only two facts with no native home while the SME's own systems remain the system of record | 169 |
| 1 — Stable core | Auth, PBAC, audit, events, module loader | `JwtAuthGuard`, `PermissionsGuard`, `PermissionsResolverService`, `AuditService`, `EventBusService`, `modules.registry.ts`, `GET /meta` | `PERMISSION_CATALOG` (+4 keys), `PLATFORM_PERMISSIONS` (+2), `SupportAccessGrant` (+purposes, tenant-side enforcement), `SsoConnection` (national-IdP binding mode) | A currency-neutrality sweep; runtime tenant legal identity (own ADR) | 170 |
| 2 — Versioned packs + Build Manifest | Which release and which `MODULES` a tenant runs; how it moves | `FeatureFlag` precedence and maker-checker, `DeploymentProvisioner`, `prisma migrate deploy`, `TenantExportService` | `PlatformTenant` gains a manifest; `stableBucket()` extracted to `packages/shared` | `PlatformRelease`, `TenantBuildManifest`, `ReleaseRollout`, `TenantUpdateAttempt`, the Update Agent | 171 |
| 3 — Ingestion boundary | Read-only connectors, confidence, provenance, human confirmation | Doc 160/162 designs; `csv-parse`; `ProductImportService`'s dry-run shape; `AiFeature.IMPORT_CLEANUP`; `StorageService`; the action hub | `FileTransport += UPLOAD`, `FileFormat += XLSX`, `ExternalRecordLink` provenance, doc 160's unique key corrected | `IngestionMapping`, `IngestionBatch`, `IngestionRecord`, `CanonicalRecordSinkRegistry`, the confidence scorer | 172 |
| 4 — Resilience engine | Doc 144, extended | `propagate()`/`rankActions()` purity, `assertNoOriginatedFigures()` | Confidence-partitioned graph; `cashSpentMinor`; revenue at risk; currency-safe AP weights; honest cash-unknown | Two action kinds with real sources named (§ doc 173) | 173 |
| 5 — Control center | Five questions; Simulate → Accept → Modify | `/admin/resilience`, `planning.propagation.view`, `AuditService.recordEvidence()` | Labels instead of raw ids; persisted runs | `ResilienceSimulation`, `ResilienceRecommendation`, `RecommendationDecision`, `planning.recommendations.decide` | 174 |
| 6 — Settlement execution channel | Invoice → rails → reconciliation → updated position | `PaymentProvider`, `FinancialInstitutionConnector`, `SettlementsService` (`SHORT`), posting rules | `handleCallback` fail-closed; provider labels as translation rows | A du-rail `PaymentProvider`, a du-rail settlement connector | 175 |

## 5. The international proof: every country-specific seam takes an unrelated second implementation

The platform's concrete implementations today are Pakistan-centric — nID
(Pakistani tenant #1), JazzCash/Easypaisa, an FBR regime sketched but
unbuilt, PKR as the one currency anyone has run it with, Urdu as the second
locale. That is not a gap to apologise for. It is what makes the UAE the
right proof: an interface that has only ever had one implementation has not
yet been shown to be an interface. The table below is the test, and it is
honest about where the second implementation needs an additive change.

| Seam | Where | Implementations today | UAE implementation | Honest delta |
|---|---|---|---|---|
| Payment collection | `PaymentProvider` — `payments/payment-provider.ts` | `cod`, `bank_transfer`, `jazzcash`, `easypaisa`, `giftkarta`, `account` | A du rail (du Pay and/or its acquirer) — doc 175 | `verified` must become mandatory-true (security fix); `labelUr`/`descriptionUr` (`payment-provider.ts:77/80`) move to translation rows (ADR-006) |
| Settlement | `FinancialInstitutionConnector` — `settlements/settlement-connector.ts` | none ("stays dark until credentials exist") | The du rail's payout report — doc 175 | none to the interface; the first real implementation |
| Fiscal filing | `FiscalComplianceProvider` — doc 15 sketch | **none** (WO-15.5 unbuilt) | A UAE Accredited Service Provider (PINT AE) — doc 181 | The sketch is order-shaped; must become document-shaped before its first build |
| Identity verification | `IdentityVerificationProvider` — `identity-verification/identity-verification-provider.ts` | `nid` | Emirates ID — doc 170 §3.3 | `IdentityVerificationStart` gains an optional `redirectUrl`; `submitOtp` becomes optional (both additive) |
| Staff sign-in | `SsoConnection` + `OidcProvider` (doc 161) | any OIDC workforce IdP | UAE PASS for SME users — doc 170 §3.2 | The `allowedEmailDomains` gate is wrong for a national IdP; a subject-binding mode is required |
| AI | `AiProvider` — `core/ai/ai-provider.ts` | `anthropic`, `openai` | An in-country provider, or none — doc 181 | none; narration already degrades to absent (`NarrationService.narrate()` returns `null`) |
| Locale | `brand.ts` `locale` block | `PKR`, `+92`, `Asia/Karachi`, `['en','ur']`, RTL `['ur']` | `AED`, `+971`, `Asia/Dubai`, `['en','ar']`, RTL `['ar']` | RTL already works (Urdu exercised it); every `*Ur` column name and `paisa` identifier is a named sweep (doc 170) |

A second implementation that needs an **additive, module-local** change is
still the architecture bending — `domain-events.ts`'s own rule is that adding
a field is never a version bump. What would disprove the architecture is a
second implementation needing a core edit or an `if (country === …)`. None of
the rows above does.

## 6. Relationship to the documents of record

- **`PRD.md`** — this program is a concrete instance of the "centrally
  connected ecosystem" and "AI-driven" claims, at the PRD's own 50,000-SME
  scale. The PRD's own "Success metrics: not yet defined" stands: doc 180
  defines metrics for *this program's pilot*, not the platform's KPIs, which
  remain the owner's decision.
- **`RETAIL-ERP.md`** — the document of record for Layers 0, 4 and 5 (Part 4,
  R20–R26), for the edition model (R14: every du SME is a `STANDALONE`, Solo-
  edition node), for "facts flow up" (R2), for invoicing as a document distinct
  from orders (R18 — doc 169 takes one real step toward it), and for Part 4's
  safety property ("read-only over the operational schema… zero module
  couplings… Accept creates drafts, it does not execute"), which docs 172–174
  obey.
- **`ENTERPRISE-SCALE.md`** — Br1 (one deployment, one brand) holds for every
  tenant; the second Br1 trigger ("per-deployment cost") is what doc 39
  answered and what §3a re-raises at 50,000 tenants. The L2 gap
  (branch-scoped reads unenforced) and S4 gap (no boot test per `MODULES` set)
  are both inherited and named where they bite (docs 171, 173).
- **`MULTI-SECTOR.md`** — "adding a sector adds a folder" is kept literally:
  nothing here is a sector pack. `module-packs.ts:28–29` says "a pack exists
  only where a vertical owns genuine domain data that core cannot express";
  connectors and resilience are cross-sector capabilities, so every new module
  is `'core'`-classified and `offByDefault`, the same classification
  `marketplace`, `managed-services` and `accounts` already use.

## 7. The document set

| Doc | Title | One line |
|---|---|---|
| [169](./169-01-layer0-canonical-data-spine.md) | Layer 0 — canonical data spine | The six canonical concepts mapped onto real models, provenance without a tenant column, UBL/PINT AE and ISO 20022 alignment |
| [170](./170-02-layer1-stable-core-deltas.md) | Layer 1 — stable-core deltas | What is reused untouched, the new principals and permission keys, the currency sweep, runtime legal identity |
| [171](./171-03-layer2-versioned-module-packs-build-manifest.md) | Layer 2 — Build Manifest and Update Agent | Per-tenant release pinning on doc 39's `PlatformTenant`, rollout on doc 37's `FeatureFlag` rules |
| [172](./172-04-layer3-ingestion-boundary-confidence-provenance.md) | Layer 3 — ingestion boundary | Read-only connectors on docs 160/162, the confidence tiers, provenance, human confirmation, every failure mode; full scope-lens pass |
| [173](./173-05-layer4-resilience-engine-extensions.md) | Layer 4 — engine extensions | Confidence-partitioned propagation, the `rupeesSpentMinor` rename, which action kinds gain real sources |
| [174](./174-06-layer5-control-center.md) | Layer 5 — control center | Five questions, Simulate → Accept → Modify, persisted and audited |
| [175](./175-07-layer6-settlement-execution-channel.md) | Layer 6 — settlement channel | A du rail on `PaymentProvider`, doc 49's `SHORT` loop, the custody boundary; full scope-lens pass |
| [176](./176-08-platform-resilience-failure-modes.md) | Platform resilience | Doc 38's matrix extended to connectors and tenancy, with SLOs computed from rows |
| [177](./177-09-graph-derivability-pilot-scope-control.md) | Graph derivability | Which sectors the graph is derivable for from invoices and stock, and which are excluded on purpose |
| [178](./178-10-competition-deliverable-vs-pilot-vertical-slice.md) | Competition slice | What ships for the submission, mapped to real screens, the demo journey, the non-goals |
| [179](./179-11-pilot-rollout-waves.md) | Pilot waves | Ten integration patterns, 40 → 150 → full engine, parallel running and cutover gates |
| [180](./180-12-metrics-success-criteria.md) | Metrics | Each metric as a query over real tables, or labelled NOT MEASURED |
| [181](./181-13-risk-compliance-continuity-uae.md) | Risk, compliance, continuity | PDPL/DIFC/ADGM/ISO 27001 mapped to real mechanisms; e-invoicing; residency; the continuity package; the IP boundary |
| [182](./182-14-commercial-partnership-rationale.md) | Commercial rationale | Why du, what NEWAX brings, economics on the existing pricing shapes |
| [183](./183-15-engineering-governance-two-agent-split.md) | Governance | The operating sequence with this program's gates, the two-agent split, modular monolith first |

## Scope lenses

This document builds nothing, so it owns no lens answer of its own: every
lens is answered where an artifact is introduced. The full 27-lens passes
live in **doc 172** (the ingestion boundary — the one genuinely new named
capability, and the one that handles untrusted external data) and **doc 175**
(the settlement channel — the one that moves money). Docs 169–171 and
173–174 answer each lens their own artifacts introduce and cite those two
passes where the analysis is shared. Docs 176–183 introduce no write path of
their own except where stated (doc 180's `TenantMilestone`, doc 179's
cutover evidence, doc 177's `DerivabilityOutcome`), and answer the lenses those
artifacts raise.

One line per lens follows all the same, in catalogue order, because a blank
line is not an answer: each says why this document itself owns nothing for that
lens and names where the program answers it.

**The actor with three tables** — n/a here: no actor is introduced. The
program's actors are placed in doc 169 §3 (counterparties as `Supplier`+`Party`
or `Contact`+`Party` CUSTOMER) and doc 170 §3 (a pushing POS as
`InboundWebhookEndpoint`, du staff as control-plane principals).
**The principal with no permission key** — n/a here; doc 170 §3 answers it for
the push source (fail-closed HMAC), UAE PASS subject binding and the support
session.
**The grant that ends itself** — n/a here; doc 170 §4 (≤ 15-minute support
tokens under purpose-scoped grants).
**Whose rows, and which columns** — n/a here: tenant = database (doc 169 §2);
per-artifact visibility is in docs 172, 174 and 180, where the control plane
never receives an SME's figures.
**The threshold nobody approves alone** — n/a here: nothing here commits money;
the thresholds are doc 171's two-person approval for a money/stock-path release
and doc 179 §5.2's three-signature cutover.
**The toxic pair, caught at grant or at act** — n/a here; doc 170 §2.1 reasons
each new key pair, doc 179 refuses one person signing twice at the act.
**Authority and blast radius** — this document's one authority is a decision:
ADR-071 and the two decisions WO-168.3 opens can be changed only by a new
`DECISIONS.md` entry, never inside an implementation PR (§3a).
**Audience is a capability, not an address** — n/a here: nothing is sent; doc
172 resolves every audience by key (`holdersOf`, WO-172.9).
**Request or record — classify every write** — n/a here: nothing is written;
each program write is classified in its own document (docs 172, 174, 175, 179).
**The movement with no address** — n/a here; ingestion names every stock write's
`locationId` from the source or `IngestionMapping.defaultLocationId` (doc 172),
so `InventoryService.defaultLocationId()` is reached on no new path.
**Four hours down, the counter stays open** — n/a here; doc 176 §2's degradation
matrix, one row per dependency this program adds.
**The unwritten posting rule** — n/a here; doc 175 (the du rail's postings and the
clearing-account ADR it names) and doc 179 (the opening-balance door).
**Every column or none** — n/a here; doc 175 and doc 179 set the dimensions on
every line they write.
**The period that already moved** — n/a here; doc 179 dates a cutover at a period
boundary; under doc 181 §5 a credit note is issued in the open period and
cites the original (IBT-025), which is never edited.
**The second legal entity** — the premise this document owns: one tenant is one
legal entity (doc 169 §2); the runtime legal identity a UAE tax invoice needs is
WO-168.3's Open decision (doc 170 §6).
**Dry run before live** — n/a here; doc 172's pure front half and doc 174's
runs, which are dry runs by construction.
**Click the number** — n/a here; doc 172 §7's provenance chain and doc 174's
drill-downs.
**Three silhouettes, and the day the tier above appears** — n/a here; each layer
answers it, and the Organization edition is outside the pilot (doc 177 §3).
**The absent collaborator** — this document's architectural claim: every new
module is survivably absent (`connectors` is `offByDefault`, §6), proven per
`MODULES` set by doc 171 §7's boot test.
**The second copy of the write** — n/a here; doc 172's keys per level, doc 175's
callback and settlement keys.
**The hundred-thousandth row** — n/a here; volumes are in doc 172
(`IngestionRecord`), doc 176 (`TenantSliSample`) and doc 180 (`TenantMilestone`).
**The adoption test** — n/a here: no code or number is generated; doc 172's
`EXT-<connector code>-…` and the existing node-folding `documentNumber()` cover
the program.
**The reversal document, not the reversal flag** — n/a here; doc 175 §6 (partial
refunds) and doc 172 (compensating rows, superseded links).
**The undo fan-out** — n/a here; docs 172, 174 and 179 each enumerate theirs.
**The version stamp** — this document's stamp is ADR-071 itself; the program's
are `cp-1`, mapping versions, `derivability-policy-1` and `PlatformRelease`.
**The erasure the ledger cannot obey** — n/a here; doc 181 §6's per-table
disposition.
**The failure path, and who is allowed to walk it** — n/a here; doc 172 §10 and
doc 176 §3.

## Work orders

**WO-168.1 — Record the decision.** `DECISIONS.md` ADR-071, and the
`docs/implementation/README.md` rows for 168–183. (Done by the change that
adds this document.)
**WO-168.2 — Sequence the preconditions before any UAE tenant exists.** The
currency-neutrality sweep (WO-170.3), the `handleCallback` fail-closed change
(WO-175.1) and the planning currency fixes (WO-173.1–173.4) are
preconditions of provisioning the first UAE tenant, not follow-ups, because
each writes a wrong fact the moment a non-PKR tenant transacts.
**WO-168.3 — Open the two decisions §3a names**, each as its own
`DECISIONS.md` entry with status **Open** until decided: runtime tenant legal
identity (Br1 wording) and per-tenant compute density / scale-to-zero (beside
ADR-018). Neither may be decided inside an implementation PR.
**WO-168.4 — Correct the stale README row** for `18-identity-verification.md`
("NID/NADRA") to name nID as Newax's own KYC platform, citing
`nid.provider.ts` — owned by whoever next edits that row, flagged here
rather than edited now (this set does not touch other docs' rows).

## Acceptance

- Every claim in §2 resolves to a file and function a reader can open; every
  correction in §3 cites the line it was found at.
- ADR-071 exists at the end of `DECISIONS.md` with Context, Options
  Considered, Decision, Reasoning, Consequences and Status.
- No document in 169–183 claims "built" for anything this document lists as
  unbuilt (connectors, doc 38, `FiscalComplianceProvider`).
- The two open decisions in §3a appear in `DECISIONS.md` as **Open** entries
  before the first pilot tenant is provisioned (WO-168.3).

## Out of scope

The du commercial contract itself (doc 182 names the economics shapes;
prices, revenue share and liability are negotiated, not specified). Any
change to `PRD.md`, `CLAUDE.md`, `RETAIL-ERP.md` or another document of
record — where this set finds one of them wrong or stale (R22's "per rupee"
wording; the NADRA row), it says so and leaves the edit to the owner. A
separate greenfield repository or a du fork (ADR-071 rejects both now; doc
181 keeps the fork door open through doc 11's handover model).
