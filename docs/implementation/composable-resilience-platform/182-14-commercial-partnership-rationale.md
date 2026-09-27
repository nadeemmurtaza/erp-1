# 182 — Why du, why NEWAX, and the economics — on the pricing shapes this platform already has

> **Status: proposed (2026-09-27), not yet built.** A commercial rationale with a
> small engineering tail. It states what each party brings in terms that can be
> checked — for NEWAX, against this repository; for du, as operator capabilities,
> never as figures this document cannot source. The economics reuse the four
> `PricingModel` shapes that already exist (`PER_SEAT`, `FLAT_MONTHLY`,
> `ONE_TIME_LICENSE`, `USAGE_BASED` — docs 50, 153, 154) and invent no fifth.
> Doc 155's wallet is **not** a pricing shape and is **not** used (§4). Every
> price here is **indicative**; transaction economics and final pricing are
> deferred to negotiation with du, not fabricated.

## 1. What NEWAX brings — the strongest card, stated plainly

The leverage in this partnership is not a plan. It is that the two hardest parts
of the product **already exist as shipped, tested code** in this repository:

- **The resilience engine** — `RETAIL-ERP.md` R20–R26 built as the `planning`
  module (doc 144, ADR-066): a dependency graph projected from real rows,
  deterministic shock propagation proven byte-identical by spec, action ranking
  that never proposes an action without a real edge, AI narration that is refused
  if it states a number it was not given, a ledger-based liquidity forecast with a
  real cash-conversion cycle, lead time as a distribution, and a control-center
  screen with its own permission. Most "AI for SMEs" pitches promise this; this
  one can be run.
- **The multi-tenant control plane** — `apps/platform` (doc 39 and docs 14, 50,
  51, 153, 154): isolated database per tenant, provisioning, hostname routing,
  expiring support access, resource quotas, export and deprovisioning with a
  retention window, four pricing shapes, invoicing with credit notes and
  maker-checker discounts, trials, usage metering read from each tenant's own
  outbox.
- **An architecture that proves it bends.** Every country-specific integration
  sits behind an interface (doc 168 §5), module boundaries are enforced by `pnpm
  lint` on every commit, and 68 numbered architectural decisions (`DECISIONS.md`,
  ADR-001 to ADR-068, plus ADR-031's own §9 addendum) explain why the system
  is shaped as it is. du inherits a system that explains
  itself.
- **The ingestion design** (doc 172) — the one genuinely new capability — built
  on a connector architecture already specified to the column (docs 36, 132,
  160, 162).

What NEWAX does **not** bring, stated with equal plainness: a UAE sales force, a
UAE payment licence, UAE-resident infrastructure, UAE customer due diligence,
or a billing relationship with UAE SMEs. That is exactly §2.

## 2. Why du — and not NEWAX building this alone

Each row is a capability du holds as an operator that NEWAX, building internally,
would need years to replicate — none is quantified here, because this document
has no source for du's numbers and will not invent them.

| du capability | What it does for this product | What NEWAX alone would have to build or obtain |
|---|---|---|
| **Distribution** — an existing business sales channel into UAE SMEs | Puts the product in front of SMEs du already serves, through account teams those SMEs already deal with — the Wave 0 nominations of doc 179 come from here | A UAE sales organisation and a customer base, from nothing |
| **Business-plan bundling** | A software subscription added to a monthly relationship the SME already has, instead of a new vendor, a new contract and a new payment decision | No equivalent — bundling needs the existing relationship |
| **Sovereign cloud** | UAE-resident hosting for tenant databases, storage and backups — doc 181 §3.2's residency, answered by where the infrastructure already is | A UAE data-centre footprint and the assurances around it |
| **Identity** | du already identifies its own subscribers; UAE PASS integration experience. (Whether du's own subscriber identification can be *reused* for platform onboarding is a consent and contract question, not assumed here) | Customer due diligence from scratch; the UAE PASS relying-party arrangement |
| **Billing** | A monthly bill the SME already pays — the platform fee can appear on it (§4, Option A), so collections, dunning and payment-method management in the UAE are du's solved problem | A UAE collections operation, on top of doc 50's invoicing |
| **Payment rails** | du Pay and its acquiring relationships — licensed, which is what lets doc 175 keep NEWAX entirely outside the funds flow | A payment licence, or a partnership only a licensed party can offer |
| **Enterprise trust** | An SME putting its books on a cloud trusts a regulated operator it already contracts with more readily than a foreign software vendor | Years of local reputation |

## 3. Versus a marketplace of third-party applications

No claim is made here about what e& or any other operator offers or cannot do —
this document has no basis for such claims. The argument is structural and holds
for *any* marketplace model, whoever operates it:

- **A marketplace distributes other vendors' products.** Each application keeps
  its own data model in its own system. The operator earns distribution, but
  does not own — and cannot reason across — the SME's operational data.
- **Resilience questions cross application boundaries.** "If this supplier slips
  three weeks, which products run out at which branch, how much revenue is at
  risk, and will I make payroll?" needs purchasing, stock by location, sales, AR,
  AP and cash in one arithmetic (`RETAIL-ERP.md` R24: "answerable only when the
  propagation core and the general ledger are the same arithmetic"). Across a
  marketplace's separate applications, that is an integration project per SME
  that the operator does not control.
- **This product gives du the canonical data foundation itself.** The spine *is*
  the platform's own schema (doc 169), so the engine's answers span the SME's
  whole operation by construction — and du, as operator of that platform, holds
  a unified operational foundation rather than a shelf of other vendors'
  products. The connectors (doc 172) mean the SME can arrive with its existing
  systems and still get that foundation on day one.

A marketplace and this platform are not mutually exclusive; the connector layer
can ingest from marketplace applications like any other source. The point is
where the canonical foundation lives.

## 4. Economics — the shapes that already exist

`PlatformPlan.pricingModel` (`apps/platform/prisma/schema/platform.prisma`) has
four shapes; doc 154 packages three as headline plans. For du's SMEs:

| Shape | Fields on `PlatformPlan` (built) | Use in the du product |
|---|---|---|
| `FLAT_MONTHLY` | `monthlyPriceMinor` | **The default SME plan.** Indicatively **AED 49–99 per SME per month** — a range for discussion, not a price; the tiers (for example connect-only vs. invoicing-migrated vs. full engine, doc 179's postures) and their amounts are set with du |
| `USAGE_BASED` | `transactionFeeBps` (on `DELIVERED` orders), `usageRateCardMinor`, `includedAllowances` (doc 153) | Optional for transaction-heavy SMEs. **Deferred:** a transaction fee here may overlap du Pay's own merchant economics on the same sale; how the two relate is a negotiation, not a formula this document proposes |
| `PER_SEAT` | `perSeatPriceMinor` × `SeatCounterService.countBillableSeats()` | Larger SMEs with many staff users — the "talk to us" door doc 154 already keeps |
| `ONE_TIME_LICENSE` | `oneTimeLicenseMinor`, `licenseDeploymentMode` | Not offered to du's SMEs: its natural home is doc 48's offline desktop node, and du's value is hosting. (The du↔NEWAX platform licence is a contract between the two companies, **outside** `PlatformPlan`, which prices tenants) |

**Doc 155's wallet is not a fifth shape and is not used.** It is a
stored-value structure in which "customer payments settle into Newax's own bank
account" — a custody posture doc 175 §4 excludes from this program. If du offers
stored value, it is du Pay's licensed product.

**Who bills whom — two options, decided in the contract:**

- **Option A (recommended): du bills the SME** on du's own bill, through du's
  billing system; NEWAX invoices du wholesale — per active tenant per month, or a
  revenue share, as negotiated. The counts such an agreement references already
  exist in the control plane: active tenants (`PlatformTenant.status = 'ACTIVE'`),
  seats (`SeatCounterService`), usage (`UsageMeter`, `PlatformUsageRecord`).
  `PlatformPlan`/`PlatformInvoice` still price and record each tenant (the
  version-stamped per-tenant invoice doc 50 builds), and a wholesale statement to
  du is a report over them (WO-182.2). Pushing each tenant's charge into du's
  billing system is a bridge beside `BillingService`, never inside it — the
  decoupled shape `AgencyStripeChargeCron` already uses to push `PlatformInvoice`s
  to Stripe (ADR-039).
- **Option B: the control plane bills SMEs directly** — `PlatformInvoice` plus a
  collection bridge onto the du rail. Possible with what exists; it rebuilds a
  billing relationship du already has, which is why A is recommended.

**Currency.** The du control plane is its own deployment with its own
`brand.ts` locale block (AED); `PlatformPlan` amounts are minor units of that
currency. One currency word survives in the control plane's schema — the
`usageRateCardMinor` comment says "paisa-per-unit" (`platform.prisma:187`) and a
billing spec's comment repeats it — and joins doc 170 §5's ratchet.

**Deferred to negotiation, explicitly:** final prices; the wholesale formula;
any share of payment-rail economics; volume tiers; the licence fee for the
platform; support and SLA credits; escrow costs.

## 5. Commercial risks, and what already mitigates them

| Risk | Mitigation that exists or is specified |
|---|---|
| du fears lock-in to NEWAX | Doc 181 §7's continuity package: data export (built), source escrow with named triggers, IaC, runbooks, doc 11's extraction path (built), du's perpetual rights to runbooks |
| NEWAX depends on one channel partner | The platform stays generic (doc 181 §8's IP boundary); nothing du-specific enters core |
| NEWAX key-person risk | The repository documents itself (index, ADRs, this set); escrow triggers include failure to support |
| The pilot shows lower value than hoped | Doc 177's derivability assessment tells each SME, before onboarding, which half of the engine applies; doc 180's funnel measures without claiming a target |
| A payment-regulation question lands on NEWAX | Doc 175 §4: every money-moving call terminates at a licensed entity; the wallet is excluded |

## Scope lenses

This document is commercial; its engineering artifacts are the du plan rows
(data through the existing `PlansService`), the wholesale statement report, and
an optional billing bridge. Ingestion and money lenses are docs 172 and 175.

**The actor with three tables** — du is not a tenant; it is the control plane's
operator, represented by staff principals (doc 170 §3.4) and, for invoicing, a
`Party` in NEWAX's own instance (doc 39's "Newax's own hosting revenue posts
through this platform's own `accounting`/`finance` modules").
**The principal with no permission key** — a billing bridge to du's system
authenticates with a credential held by the control plane only.
**The grant that ends itself** — n/a for a person: no role or grant is
introduced (plan and rate-card changes reuse the existing
`platform.billing.manage`/`.approve` grants). The one standing credential, the
billing bridge's to du's system (WO-182.3), belongs to no person; it ends by
rotation, and a revoked one fails the push closed into the retry list below
rather than dropping an invoice.
**Whose rows, and which columns** — du sees per-tenant billing rows; NEWAX's
wholesale statement to du shows counts and amounts, never an SME's business data.
**The threshold nobody approves alone** — a plan price or rate-card change on a
live plan follows `platform.billing.manage`/`.approve`'s existing split (doc 153).
**The toxic pair, caught at grant or at act** — unchanged: `approve()` refuses
the proposer (built).
**Authority and blast radius** — a plan price change never reprices past
invoices (`PlatformInvoice` snapshots, doc 50).
**Audience is a capability, not an address** — invoice notices go to the tenant's
`billingContactEmail` (built) or, under Option A, nowhere from this platform —
du's bill is the notice.
**Request or record** — a wholesale statement is a RECORD derived from issued
invoices.
**The movement with no address** — n/a: plans, statements and platform
invoices move no stock or cash inside any tenant; a platform invoice is paid
through Stripe or, under Option A, through du's own bill, outside every tenant
ledger.
**Four hours down, the counter stays open** — the billing bridge down: invoices
issue and queue for push; nothing is lost (the `AgencyStripeChargeCron`
precedent re-scans unpushed rows).
**The unwritten posting rule** — NEWAX's wholesale revenue posts in NEWAX's own
instance (doc 39's own answer), never in any tenant's books.
**Every column or none / The period that already moved** — n/a beyond doc 39's
answer.
**The second legal entity** — NEWAX's contracting entity for the UAE, if
different from its home entity, scopes its own `PlatformPlan`/billing (doc 39's
"named here as a real possibility, not built until it's real").
**Dry run before live** — a plan's effect can be simulated against current
tenants' usage before it is offered (doc 39's own answer).
**Click the number** — a wholesale statement line drills to the `PlatformInvoice`
rows it sums.
**Three silhouettes** — n/a: pricing shapes are edition-independent.
**The absent collaborator** — no du billing bridge configured: Option B's direct
invoices still issue; nothing breaks.
**The second copy of the write** — `PlatformInvoice @@unique([tenantId,
periodStart, periodEnd])` (built); the bridge pushes a row once, keyed by its
external id (the `stripeInvoiceId` precedent).
**The hundred-thousandth row** — 50,000 tenants × 12 invoices/year = 600,000
rows/year, indexed `[tenantId, issuedAt]` (built).
**The adoption test** — n/a for the control plane: it is one central writer and
`PlatformInvoice` carries no human-readable number today (its keys are a cuid
and `(tenantId, periodStart, periodEnd)`). The tax invoice NEWAX issues to du
for the wholesale statement is issued from NEWAX's own instance (doc 39's
answer), whose `documentNumber()` already folds the node into the series.
**The reversal document, not the reversal flag** — a billing dispute is a
`PlatformInvoiceCreditNote` (built).
**The undo fan-out** — n/a beyond the built billing module.
**The version stamp** — `PlatformInvoice`'s price snapshots (built).
**The erasure the ledger cannot obey** — billing records are retained under the
tax-record basis (doc 39's own answer).
**The failure path, and who is allowed to walk it** — an invoice that fails to
push to du's system is listed for `platform.billing.manage` with the error and a
retry safe by its external-id key.

## Work orders

**WO-182.1 — du plan rows**: `FLAT_MONTHLY` tiers (and optional `USAGE_BASED` /
`PER_SEAT`) created through the existing `PlansService`, amounts set by the
contract.
**WO-182.2 — Wholesale statement**: a control-plane report over `PlatformTenant`,
`PlatformInvoice`, `UsageMeter` per period, for NEWAX→du invoicing.
**WO-182.3 — du billing bridge** (Option A only, if chosen): a decoupled cron
beside `BillingService`, mirroring `AgencyStripeChargeCron`.
**WO-182.4 — Control-plane currency words** into doc 170's ratchet.

## Acceptance

- Every price in the du product is a `PlatformPlan` row with one of the four
  existing `pricingModel` values; no fifth value is added.
- No du tenant's manifest includes `wallet`.
- A wholesale statement for a period equals the sum of the period's
  `PlatformInvoice` rows for du's tenants, line by line.

## Out of scope

Final prices, revenue shares and contract terms (negotiation). Any claim about
a competitor's products. Market-size or customer-count figures for du (not
sourced here).
