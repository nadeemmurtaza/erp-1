# 178 — The competition deliverable and the pilot's vertical slice, mapped to screens that exist and to what is genuinely new

> **Status: proposed (2026-09-27), not yet built.** Most of the vertical slice
> **already ships**: the canonical models, the deterministic graph and
> propagation (doc 144), the control center screen and its permission, the
> liquidity forecast, supplier/customer/inventory/invoice screens, the payment
> and settlement extension points, and the multi-tenant control plane. What is
> genuinely new for the slice is the ingestion boundary (doc 172), confidence
> scoring, the du-rail sandbox provider and connector (doc 175), the control
> center's persistence and decisions (doc 174), and the correctness
> preconditions (currency, callback verification). This document maps each
> slice component to the real screen or service, walks the demo journey step by
> step, and lists the non-goals with the reason each one is out.

## 1. The slice, component by component

| Slice component | Already built — the real screen / service | New for the slice | Where specified |
|---|---|---|---|
| Canonical model | `Party`/`Supplier`/`SupplierProduct`/`SupplierBill`, `Contact`, `Product`/`ProductVariant`, `Location`/`VariantLocationStock`/`StockMovement`, `Invoice`, `Payment`, `JournalLine` | `ExternalRecordLink` provenance, `ObservedSale`, `ObservedCashBalance`, `Invoice.contactId`, `Contact.partyId` | doc 169, WO-169.1–169.5 |
| CSV/Excel connector | `csv-parse`; `ProductImportService`'s dry-run pattern (WO-72.3) | `FileConnector` (`UPLOAD`), `CsvHandler`, `XlsxHandler` (pending dependency approval — the slice ships CSV-only without it) | doc 172 §3, WO-172.1/172.3 |
| One accounting-system connector | — | `OAuthConnection` + `PollConnector` against the chosen vendor's sandbox | doc 172 §3, WO-172.3 |
| One POS connector | — | `FileConnector` for the POS's export (or `InboundWebhookEndpoint` if it pushes) | doc 172 §3 |
| Mapping, scoring, confirmation, promotion | — | the whole pipeline | doc 172 §4–§8 |
| Customers | `/admin/contacts` (`crm`); `ContactImportService` | the `CUSTOMER` sink | WO-172.6 |
| Suppliers | `/admin/suppliers` (`purchasing`) | the `SUPPLIER`, `SUPPLIER_ITEM`, `SUPPLIER_BILL` sinks | WO-172.6 |
| Invoicing | `/admin/invoices` (`tradingpartners`' `InvoiceService`) | customer invoices as mirrored `Invoice`s (connect-only); one native `Order` flow for the payment demo | doc 169 §3.4 |
| Light inventory | `/admin/inventory`, stock by location, `InventoryService.postUnconditional()` | the `LOCATION` and `STOCK_POSITION` sinks | WO-172.6 |
| Cash | `/admin/resilience` liquidity tab, `LiquidityForecastService.forecast()` | `cashSource`, `ObservedCashBalance`, cash in transit, AP in base currency | doc 173 §4, doc 175 §5.3 |
| Deterministic graph + propagation | `DependencyGraphService.build()`, `propagate()`, `rankActions()`, specs | provenance partition, `cashSpentMinor`, revenue at risk, `SPLIT_PO_ALTERNATE_SUPPLIER` | doc 173 |
| Control center | `/admin/resilience` (simulate-only), `planning.propagation.view` | persisted runs, Accept/Modify/Dismiss, pickers by name, decisions log | doc 174 |
| Sandbox payment flow | `PaymentProvider`, `PaymentsService`, `SettlementsService` (`SHORT`), `/admin/payments`, `/admin/settlements` | fail-closed callbacks; the du-rail provider and settlement connector against the rail's sandbox — **or**, if sandbox access is not granted by submission, a signed test-double rail implementing the same two interfaces, labelled as such on screen and absent from every production `PAYMENT_PROVIDERS` value | doc 175 |
| Tenancy | `apps/platform`: `ProvisioningService`, `HostnameResolverService`, `SupportAccessGrant` | none — two demo tenants are provisioned through the existing path | doc 39 |
| Documentation | this set (168–183), ADR-069 | — | — |
| Live failure demonstration | — | the fault-injection suite and a demo harness whose fault toggles exist only when `DEMO_FAULTS_ENABLED=true` (refused in any production template by a rule WO-178.4 adds to `scripts/check-env-templates.mjs`, which today checks only `MODULES` discoverability) | doc 176 §3, WO-176.3 |

**Preconditions, before any of the above is shown to anyone as UAE-ready:**
the currency sweep (WO-170.3) and fail-closed callback verification (WO-175.1).
A demo that records an AED payment as PKR, or accepts an unsigned callback, is
not a demo of this architecture.

**Not in the slice** (in the pilot, later waves): the Build Manifest and Update
Agent (doc 171 — two demo tenants do not need them), the SLI sampler (doc 176
§5), UAE PASS and Emirates ID (doc 170 §3), submitting PINT AE invoices to a
live ASP (doc 181; the slice may *generate and validate* a PINT AE document from
an `Invoice` if the specification is available, and says so if it is not).

## 2. The demo journey

Two tenants, provisioned through `ProvisioningService.provisionTenant()` on the
control plane and routed by `HostnameResolverService`: **alpha-trading**, a
distributor (connect-only: `connectors` on, `accounting` off), and
**beta-retail**, a two-branch retailer (Wave 2 posture: `accounting` and
`settlements` on, a native transfer made during setup so a lateral edge exists).
AI is off for both (residency, doc 181), so the "narration unavailable" state is
part of the demo, not hidden.

| # | What the audience sees | The real screen / service that does it |
|---|---|---|
| 1 | alpha's admin signs in | `auth.service.ts` (JWT), `JwtAuthGuard`, `PermissionsGuard` |
| 2 | Uploads a spreadsheet of supplier invoices | `/admin/connections` → `FileConnector` (`UPLOAD`) → `FileConnectorRun` with checksum → `StorageService` |
| 3 | Sees a suggested mapping and a preview: counts per tier, sample rows with reasons, "matched / new" decisions | the pure `parse`/`map`/`scoreRecord()` front half; the deterministic alias table (AI off) |
| 4 | Confirms the mapping | `connectors.ingestion.confirm`; `AuditService.recordEvidence()` in the same transaction; batch promotes through the `purchasing` sinks |
| 5 | Opens Suppliers — the suppliers are there, each showing its source | `/admin/suppliers`; `ExternalRecordLink` (`sourceSystem`, confidence) |
| 6 | Connects the accounting sandbox ("Connect your account") | `ConnectorOAuthController` start/callback → `OAuthConnection` → `PollConnector` first run → `CUSTOMER`, `SALES_INVOICE`, `SUPPLIER_BILL` |
| 7 | Uploads the POS export | `FileConnector` → `LOCATION`, `STOCK_POSITION` (via `InventoryService.postUnconditional()`, reason `COUNT`), `SALE_LINE` → `ObservedSale` |
| 8 | Reviews held data: two `WARNING` items matched only by name, one `ADVISORY` stale snapshot — resolves one | `/admin/connections/review`; re-score under `cp-1` |
| 9 | Control center overview (question 1): single-source items, supplier concentration, coverage %, freshness per kind; the derivability outcome | `/admin/resilience`; `ExposureSummary`; `DerivabilityAssessment` (doc 177) |
| 10 | Simulates: the top single-source supplier down for 21 days | `POST /admin/planning/propagate` → `build()` with provenance → `propagate()` twice → `rankActions()`; a `ResilienceSimulation` row |
| 11 | Sees stock-out day per SKU per location, revenue at risk, the rows that depend on `WARNING` data, and liquidity with **"cash position unknown — connect a bank feed"** (alpha has no ledger and no bank feed) | the headline/baseline toggle; `LiquidityForecastService` with `cashSource: 'UNKNOWN'` |
| 12 | Recommendations: `SPLIT_PO_ALTERNATE_SUPPLIER` (an alternate supplier appears in the invoices), `DELAY_DISCRETIONARY_AP` on a non-sole-source bill; the sole-source supplier's bill is *not* proposed | `rankActions()` with WO-173.6/173.7 |
| 13 | Accepts the split (acknowledging the one `WARNING` record it rests on) → a pre-filled requisition opens → creates it | `planning.recommendations.decide`; `/admin/requisitions` (`purchasing.requisitions.create`) |
| 14 | Links the requisition to the decision; the decision shows `EXECUTED` | doc 174 §3.4 (bare-read proposal, confirmed by a holder) |
| 15 | Switches to beta-retail; runs a `LocationDown` on one branch; a `TRANSFER_STOCK` recommendation appears (the setup transfer created the lateral edge) | `rankActions()` over `StockTransfer` history |
| 16 | beta issues an order to a B2B customer and pays it through the du-rail sandbox | `PaymentsService.createForOrder()` → provider `initiate()` → the rail's hosted page |
| 17 | The callback arrives, is verified, the payment is `PAID`, the receipt posts | `PaymentsService.handleCallback()` (fail-closed) → `PaymentSucceeded` → `onPaymentSucceeded()` Dr 1000 / Cr 1100 |
| 18 | The liquidity forecast shows the amount as **cash in transit**, not cash | WO-175.5 |
| 19 | The sandbox payout arrives short by more than the agreed fee: the batch is `SHORT`, listed with its lines; nobody can resolve it silently | `SettlementExpectationCron` → connector `reconcileBatch()` → `SettlementsService.reconcile()` → `/admin/settlements` |
| 20 | **Live failure demonstration** — each toggled on stage: | the demo harness (`DEMO_FAULTS_ENABLED`) over WO-176.3's fault injectors |
| 20a | The accounting sandbox returns 503: the circuit opens after 5 failures; the banner reads "accounting data as of 10:02"; a simulation still runs, on the last promoted data | `CircuitBreaker` (`connector.<id>`), doc 172 §10 |
| 20b | The same spreadsheet is uploaded again: "0 new, 212 already imported" | `FileConnectorRun @@unique([connectorId, fileChecksum])` |
| 20c | A column in the POS export is renamed: the batch is held for schema drift; the mapping asks for review; yesterday's data stays in use and ages | `HELD_SCHEMA_DRIFT`, `IngestionHeld` |
| 20d | The promotion worker is killed mid-batch: the screen shows "600 of 2,000 applied"; on restart it resumes with no duplicates | `promotedThroughOrdinal` |
| 20e | A forged payment callback is sent: refused, nothing written | WO-175.1 |
| 20f | A request on alpha's hostname cannot read beta's data under any session | doc 39's isolation test |
| 21 | The decisions log (question 5): every decision with its run, its assumptions, its confidence, its decider and its execution | `/admin/resilience/decisions` |

The journey is also an end-to-end test (WO-178.3): every row above is an
assertion, so the demo cannot drift from the code.

## 3. Non-goals — each out for a reason in this codebase

| Non-goal | Why it is out of the slice — not "because it doesn't exist" |
|---|---|
| **Payroll** | A full payroll module is already built (`19-payroll.md`, WO-19.1–19.7; `PayRun`/`PayRunLine`); the liquidity forecast already reads approved pay runs. Out of the slice because an SME's payroll lives in another system during connect-only, and ingesting it touches employee personal data the pilot does not need |
| **HR** | Built across docs 20/22/26–29 (people, positions, attendance, reviews, assets). Not a resilience input for the slice |
| **A full ledger for the SME** | `accounting` is built (R15: double entry, immutable, balanced, posting from events). In connect-only the SME's own accounting system stays the system of record (doc 169 §5); running a second ledger in parallel is Wave 2's decision after parallel running (doc 179), not a demo feature |
| **Lending** | Doc 49's own out-of-scope ("a materially larger, separately-scoped capability with its own regulatory and risk-lens questions"). Doc 167's bank facilities are the business's own borrowing, not a lending product |
| **Autonomous payment execution** | `RETAIL-ERP.md` Part 4: "Accept creates drafts, it does not execute"; doc 144 "recommends, it does not act"; doc 174's decisions never move money; doc 175 §4's custody boundary |
| **Manufacturing planning** | `bom`/`production` exist, but BOMs are not derivable from invoices (doc 177 §3) — a manufacturer's graph would be missing its component layer |
| **Marketplace** | Doc 165's cross-tenant directory is partially built and unrelated to resilience; it would add a cross-tenant surface to a demo whose point is isolation |
| **ML models in phase 1** | R21: "Prediction is an input to [propagation], never a substitute"; `computeDemandForecast()` is a seasonal heuristic and the ±30% band is labelled a heuristic (`propagation.ts:11–20`); doc 144's out-of-scope excludes a trained forecasting model. The slice's credibility is determinism and traceability, which a model would weaken before it strengthened anything |

## 4. Competition submission vs pilot

| | Competition submission | Pilot (doc 179) |
|---|---|---|
| Tenants | Two, provisioned by hand through the existing path | 10 → 40 → 150 → full, through the Build Manifest |
| Connectors | Spreadsheet + one accounting sandbox + one POS export | Ten integration patterns, real vendor accounts |
| Payment rail | du-rail sandbox (or a labelled test double) | du's production rail, under contract |
| Measurement | The demo's own assertions | Doc 180's metrics, doc 176's SLIs |
| Releases | One build | Rings, canary, auto-halt (doc 171) |
| DR | Not demonstrated | Measured RTO before Wave 1 (doc 176 §6) |

## Scope lenses

The slice introduces no capability that docs 169–176 do not already specify and
pass through the lenses; the full passes are in doc 172 (ingestion) and doc 175
(money). This document's own artifacts are the demo harness and the end-to-end
test.

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — the demo tenants' users are ordinary seeded `User`s;
the harness acts as no principal and exists only when `DEMO_FAULTS_ENABLED` is
true.
**Whose rows, and which columns** — step 20f is this lens, demonstrated.
**The threshold nobody approves alone** — step 19's `SHORT` batch demonstrates
that a shortfall cannot be written off above the threshold by one person
(`approveWriteoff()`).
**The toxic pair / Authority and blast radius** — the harness's toggles are the
widest authority introduced; they are compiled in but refused unless the env var
is set, and the rule WO-178.4 adds to `check-env-templates` fails any
production template that sets it.
**Audience is a capability, not an address** — n/a: no messages beyond those the
underlying features send.
**Request or record** — n/a beyond docs 172/175.
**The movement with no address** — step 7's stock true-ups name their
locations (doc 172 lens).
**Four hours down, the counter stays open** — step 20a demonstrates it.
**The unwritten posting rule / Every column or none / The period that already
moved / The second legal entity** — step 17's posting is doc 175's; nothing new.
**Dry run before live** — steps 3 and 8 are the dry run, shown.
**Click the number** — every figure on steps 9–12 drills to its rows.
**Three silhouettes, and the day the tier above appears** — alpha is Solo, beta
a two-branch Chain; the demo shows the same screens at both.
**The absent collaborator** — alpha runs without `accounting` and shows cash as
unknown; both run without AI and show narration as unavailable.
**The second copy of the write** — step 20b demonstrates it.
**The hundred-thousandth row** — n/a for a demo; the pilot's volumes are in doc
179.
**The adoption test** — n/a: the demo generates no code of its own; the
`EXT-<connector code>-…` numbers its ingested invoices and locations receive are
doc 172's, already collision-free across sources.
**The reversal document / The undo fan-out / The version stamp** — n/a beyond
docs 172–175.
**The erasure the ledger cannot obey** — demo data is synthetic; no real person.
**The failure path, and who is allowed to walk it** — steps 20a–20e walk it.

## Work orders

**WO-178.1 — Slice assembly**: the work orders named in §1's right-hand column,
in dependency order (preconditions first).
**WO-178.2 — Demo fixtures**: synthetic but realistic data for alpha and beta —
item-level supplier invoices with one alternate supplier, a POS export for two
branches, an accounting sandbox seeded to match — with no real person in it.
**WO-178.3 — The journey as an end-to-end test**: every §2 row an assertion, run
in CI against a real Postgres and the rail's sandbox (or the labelled double).
**WO-178.4 — The demo harness**: fault toggles behind `DEMO_FAULTS_ENABLED`,
refused in production templates by a new rule in
`scripts/check-env-templates.mjs` (which today checks only `MODULES`
discoverability and reference completeness), with a `--self-test` case.

## Acceptance

- The end-to-end test passes from a clean database: every step in §2 asserts
  its screen state or row.
- No production env template enables `DEMO_FAULTS_ENABLED` or includes the
  test-double rail in `PAYMENT_PROVIDERS` — enforced by WO-178.4's new
  `check-env-templates` rule.
- Every "already built" cell in §1 names a screen or service that exists at the
  commit the submission is cut from, verified by `docs/index/cross/ui-routes.md`
  and `docs/index/cross/routes.md`.

## Out of scope

Everything in §3. Production du rails, live ASP submission, UAE PASS, and the
release machinery — pilot, not submission.
