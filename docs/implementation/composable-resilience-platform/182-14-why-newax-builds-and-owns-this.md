# 182 — Why NEWAX builds and owns this directly, and the economics — on the pricing shapes this platform already has

> **Status: proposed (2026-09-27), not yet built.** A commercial rationale with a
> small engineering tail. It argues why NEWAX builds, owns and sells this product
> itself — directly to SMEs and enterprises, and through its own Agency-Managed
> hosting model (doc 11 §5) on its own control plane (doc 39) — in terms that can
> be checked against this repository. The economics reuse the four
> `PricingModel` shapes that already exist (`PER_SEAT`, `FLAT_MONTHLY`,
> `ONE_TIME_LICENSE`, `USAGE_BASED` — docs 50, 153, 154) and invent no fifth.
> Doc 155's wallet is **not** a pricing shape and is **not** used (§4). Every
> price here is **indicative**; final pricing is NEWAX's own decision, not
> fabricated here.
>
> **Revised (2026-09-28), ADR-072.** This document previously argued why a
> telecom operator should own and distribute the product, and compared that
> with a rival operator's marketplace. That premise was wrong — there is no
> telecom counterparty, partnership or distribution deal — and both arguments
> are removed rather than reworded. The file was renamed from
> `182-14-commercial-partnership-rationale.md` to match. §1's inventory and
> §4's four pricing shapes survive; everything else is rewritten.

## 1. What NEWAX already has — the strongest card, stated plainly

The case for NEWAX building this itself is not a plan. It is that the two
hardest parts of the product **already exist as shipped, tested code** in this
repository:

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
  is shaped as it is. A customer — or an engineer NEWAX hires — inherits a
  system that explains itself.
- **The ingestion design** (doc 172) — the one genuinely new capability — built
  on a connector architecture already specified to the column (docs 36, 132,
  160, 162).

What NEWAX does **not** yet have in its chosen second market, stated with equal
plainness: a UAE sales presence, UAE-region hosting, a UAE contracting and
billing entity, and a payment licence. The last it deliberately never acquires
for this program (doc 175 §4). §2.3 says how each of the others is covered by
NEWAX itself.

## 2. Why NEWAX builds and owns this directly

### 2.1 Against what an SME actually uses today

The realistic alternative for an SME is not another resilience platform. It is
one of three things, and each fails the same question — *"if my main supplier
slips three weeks, which of my products run out, where, when, how much revenue
and cash is at risk, and what is the cheapest reversible thing I can do today?"*
(doc 168 §1; `RETAIL-ERP.md` R24):

| What the SME has instead | What it can answer | What it cannot — and what this platform does instead |
|---|---|---|
| **A spreadsheet** — the most common resilience plan an SME has | Whatever someone last computed by hand, for the scenario they thought of | Propagating one supplier's slip through stock by location, AR, AP and cash; staying current as the source systems change; showing where a figure came from. This platform recomputes from promoted rows on every run (`DependencyGraphService.build()`, rebuilt per request), and every figure drills to its source record (doc 172 §7's provenance chain) |
| **A point-solution BI or dashboard tool** over the accounting package | What happened, in the one system it reads | Joining purchasing, stock by location, sales, AR, AP and cash in one arithmetic; simulating a shock; ranking actions. Those need one canonical model and a deterministic engine (`propagate()`, `rankActions()`), not a chart over one source — and a dashboard has no path from a finding to a draft purchase order (doc 174's Accept creates the drafts; it never executes) |
| **No resilience visibility at all** | Nothing until it happens | The stock-out is discovered at the shelf and the cash gap at payroll. This platform's connect-only posture (doc 179 Wave 1) gives the answer on the SME's *existing* systems, before any migration, and says honestly where it cannot (doc 177's derivability assessment) |

### 2.2 Why directly: NEWAX's own distribution is already built

A product like this could in principle reach SMEs through a large channel owner.
NEWAX does not need one, because the machinery a channel owner would otherwise
supply — hosting, a front door, billing, collection — already exists here as
NEWAX's own shipped code:

| NEWAX's own advantage | Real code | Doc |
|---|---|---|
| **A hosting business, already operated** — two delivery tracks from one codebase: Agency-Managed (NEWAX provisions, hosts and charges a monthly subscription) and Self-Hosted/extracted | `ProvisioningService.provisionTenant()`, `HostnameResolverService`, `SupportAccessGrant`, `TenantExportService`; `scripts/sync-client.mjs` | 11, 12, 39 |
| **A self-serve front door** — an SME can find, compare, try and buy without a sales call | `/pricing` (`PlansService.getPlanComparison()`), `SignupService`, `TenantStatus.TRIAL` | 51, 154 |
| **Its own billing and collection** — NEWAX invoices and collects its own subscription revenue, which is never an SME's customers' money (doc 175 §4) | `BillingService`, `PlatformInvoice`, `InvoiceDunningCron`, `AgencyStripeChargeCron` (ADR-039) | 14, 50, 153 |
| **An SME-facing billing view** | The managed-services "Hosting & Billing" dashboard in the tenant's own admin | 14 |
| **The engine itself** | §1 | 144 |

Owning the product directly also keeps the one asset that matters in NEWAX's
hands: the canonical operational model (§3). A channel owner would sit between
NEWAX and the SMEs whose feedback shapes the engine; direct ownership keeps that
loop — the pilot's metrics (doc 180), the decisions log (doc 174) — inside the
company that has to act on it.

### 2.3 What NEWAX must still obtain for the UAE, and how — without a channel owner

| Need | How NEWAX covers it itself | Status |
|---|---|---|
| UAE-resident hosting | NEWAX's own control plane and tenant fleet, deployed in a UAE region of an infrastructure provider NEWAX contracts as a sub-processor (doc 181 §1, §3.2) | Deployment choice; declarative definitions are WO-181.9 |
| Payment collection for an SME's own customers | Licensed third-party PSPs integrated through `PaymentProvider` (doc 175 §3); NEWAX never holds funds | Specified (WO-175.3, WO-175.8) |
| Identity for SME users and KYC | UAE PASS subject binding and an Emirates ID `IdentityVerificationProvider` (doc 170 §3.2–§3.3), NEWAX's own relying-party integrations | Specified (WO-170.4, WO-170.5) |
| A UAE contracting and billing entity | If different from NEWAX's home entity, it scopes its own `PlatformPlan`/billing (doc 39's "named here as a real possibility, not built until it's real") | Named, not built |
| A sales presence | NEWAX's own sales and onboarding team, Agency-Managed engagements, and the self-serve trial (§2.2) — the source of doc 179's Wave 0 nominations | Operational |

## 3. Why one owner of the canonical foundation beats a stack of point tools

No claim is made here about any named vendor's product — this document has no
basis for such claims. The argument is structural:

- **A stack of point tools keeps each fact in its own system.** An inventory
  app, an accounting package, a POS and a BI layer each hold a slice of the
  business in its own data model; none can reason across the others.
- **Resilience questions cross application boundaries.** "If this supplier slips
  three weeks, which products run out at which branch, how much revenue is at
  risk, and will I make payroll?" needs purchasing, stock by location, sales, AR,
  AP and cash in one arithmetic (`RETAIL-ERP.md` R24: "answerable only when the
  propagation core and the general ledger are the same arithmetic"). Across
  separate tools, that is an integration project per SME that nobody owns.
- **This product is the canonical data foundation itself.** The spine *is* the
  platform's own schema (doc 169), so the engine's answers span the SME's whole
  operation by construction. The connectors (doc 172) mean the SME can arrive
  with its existing tools and still get that foundation on day one — and move
  its system of record onto the platform later, only after parallel running
  proves it (doc 179 §5).

Point tools and this platform are not mutually exclusive; the connector layer
ingests from them like any other source. The point is where the canonical
foundation lives, and that NEWAX owns it.

## 4. Economics — the shapes that already exist, priced by NEWAX

`PlatformPlan.pricingModel` (`apps/platform/prisma/schema/platform.prisma`) has
four shapes; doc 154 packages three as headline plans. For SMEs on this
product, sold directly or through NEWAX's Agency-Managed track:

| Shape | Fields on `PlatformPlan` (built) | Use in this product |
|---|---|---|
| `FLAT_MONTHLY` | `monthlyPriceMinor` | **The default SME plan.** Indicatively **AED 49–99 per SME per month** in the UAE — a range for NEWAX's own pricing decision, not a price; the tiers (for example connect-only vs. invoicing-migrated vs. full engine, doc 179's postures) and their amounts are set by NEWAX |
| `USAGE_BASED` | `transactionFeeBps` (on `DELIVERED` orders), `usageRateCardMinor`, `includedAllowances` (doc 153) | Optional for transaction-heavy SMEs. **Deferred:** a transaction fee here would sit on top of the PSP's own merchant discount on the same sale (doc 175 §3); whether NEWAX charges one at all for this product is its own pricing decision, not a formula this document proposes |
| `PER_SEAT` | `perSeatPriceMinor` × `SeatCounterService.countBillableSeats()` | Larger SMEs and enterprises with many staff users — the "talk to us" door doc 154 already keeps |
| `ONE_TIME_LICENSE` | `oneTimeLicenseMinor`, `licenseDeploymentMode` | Not the default for hosted SMEs: its natural home is doc 48's offline desktop node, and this product's value depends on the control plane's connectors, releases and SLIs running. An enterprise customer on doc 11's Self-Hosted/extracted track is where it fits, through the same shape (doc 154's `ONLINE` variant) — never a separate licence mechanism |

**Doc 155's wallet is not a fifth shape and is not used.** It is a
stored-value structure in which "customer payments settle into Newax's own bank
account" — a custody posture doc 175 §4 excludes from this program. Stored
value, wallets and escrow are a separate, more heavily regulated business
decision the owner has not made.

**Who bills whom: NEWAX bills the SME directly.** The control plane prices each
tenant on a `PlatformPlan`, `BillingService` issues a version-stamped
`PlatformInvoice` per period (doc 50), `InvoiceDunningCron` chases it, and
`AgencyStripeChargeCron` collects it through Stripe for tenants linked to a
Stripe customer (ADR-039) — all built. This is NEWAX's own subscription
revenue, never an SME's customers' funds (doc 175 §4). Agency-Managed
engagements bill the same way, because under doc 11 the agency is NEWAX.
Whether Stripe or another processor collects NEWAX's UAE subscription revenue
is NEWAX's operational choice; the collection bridge sits beside
`BillingService`, never inside it, either way (ADR-039).

**Currency.** NEWAX's UAE control-plane deployment has its own `brand.ts` locale
block (AED); `PlatformPlan` amounts are minor units of that currency. One
currency word survives in the control plane's schema — the `usageRateCardMinor`
comment says "paisa-per-unit" (`platform.prisma:187`) and a billing spec's
comment repeats it — and joins doc 170 §5's ratchet.

**Left to NEWAX's own pricing decision, explicitly:** final prices; volume
tiers; whether a transaction fee applies; support and SLA credits; escrow costs
for an enterprise customer that contracts for escrow.

## 5. Commercial risks, and what already mitigates them

| Risk | Mitigation that exists or is specified |
|---|---|
| An SME or enterprise customer fears lock-in to NEWAX | Doc 181 §7's continuity package: data export at any time (built), doc 11's extraction path (built), source escrow with named triggers for an enterprise customer that contracts for it, runbook rights on the Self-Hosted track |
| NEWAX has no UAE sales presence on day one | The self-serve trial and `/pricing` (docs 51, 154), Agency-Managed engagements (doc 11), and a Wave 0 selected by integration pattern rather than volume (doc 179 §1) — sized to NEWAX's own reach |
| NEWAX key-person risk | The repository documents itself (index, ADRs, this set); escrow triggers include failure to support |
| The pilot shows lower value than hoped | Doc 177's derivability assessment tells each SME, before onboarding, which half of the engine applies; doc 180's funnel measures without claiming a target |
| A payment-regulation question lands on NEWAX | Doc 175 §4: every money-moving call terminates at a licensed PSP; the wallet is excluded |
| The UAE entry costs more than it returns | The UAE is a chosen second market, not a precondition: every UAE implementation sits behind an interface (doc 168 §5), so the entry can pause without a core change, and the preconditions it forced (the currency sweep, fail-closed callbacks) are correctness fixes worth having in any market |

## Scope lenses

This document is commercial; its engineering artifacts are the UAE plan rows
(data through the existing `PlansService`) and the control-plane currency-word
ratchet. Ingestion and money lenses are docs 172 and 175.

**The actor with three tables** — NEWAX is not a tenant; it is the control
plane's operator, represented by its hosting-operations staff (doc 170 §3.4).
The paying SME is a `PlatformTenant` (with `billingContactEmail`) in the control
plane and, for NEWAX's own books, a counterparty in NEWAX's own instance (doc
39's "Newax's own hosting revenue posts through this platform's own
`accounting`/`finance` modules").
**The principal with no permission key** — the Stripe collection bridge
authenticates with a credential held by the control plane only (built,
ADR-039).
**The grant that ends itself** — n/a for a person: no role or grant is
introduced (plan and rate-card changes reuse the existing
`platform.billing.manage`/`.approve` grants). The collection bridge's
credential belongs to no person; it ends by rotation, and a revoked one fails
the charge closed — the invoice stays uncharged and is retried, never dropped.
**Whose rows, and which columns** — an SME sees its own `PlatformInvoice` rows
through the managed-services billing dashboard (doc 14), never another
tenant's; the control plane holds plans, counts and amounts, never an SME's
business data.
**The threshold nobody approves alone** — a plan price or rate-card change on a
live plan follows `platform.billing.manage`/`.approve`'s existing split (doc 153).
**The toxic pair, caught at grant or at act** — unchanged: `approve()` refuses
the proposer (built).
**Authority and blast radius** — a plan price change never reprices past
invoices (`PlatformInvoice` snapshots, doc 50).
**Audience is a capability, not an address** — invoice notices go to the
tenant's `billingContactEmail` (built), the SME's own designated billing
contact — the one audience this document addresses, and it is the customer, not
a staff role.
**Request or record** — an issued `PlatformInvoice` is a RECORD of the plan and
usage in force for the period; a plan change is a REQUEST above its threshold.
**The movement with no address** — n/a: plans and platform invoices move no
stock or cash inside any tenant; a platform invoice is paid through NEWAX's own
collection path, outside every tenant ledger.
**Four hours down, the counter stays open** — the collection bridge down:
invoices issue and wait uncharged; nothing is lost (`AgencyStripeChargeCron`
re-scans rows with `stripeInvoiceId: null` every 15 minutes).
**The unwritten posting rule** — NEWAX's subscription revenue posts in NEWAX's
own instance (doc 39's own answer), never in any tenant's books.
**Every column or none / The period that already moved** — n/a beyond doc 39's
answer.
**The second legal entity** — NEWAX's contracting entity for the UAE, if
different from its home entity, scopes its own `PlatformPlan`/billing (doc 39's
"named here as a real possibility, not built until it's real").
**Dry run before live** — a plan's effect can be simulated against current
tenants' usage before it is offered (doc 39's own answer).
**Click the number** — a tenant's billed total drills to its `PlatformInvoice`
rows and, for `USAGE_BASED`, to the `PlatformUsageRecord`s behind them.
**Three silhouettes** — n/a: pricing shapes are edition-independent.
**The absent collaborator** — a tenant with no `stripeCustomerId`: its invoices
still issue and are simply not charged by the sweep (its query requires one);
they stay listed unpaid for manual collection and dunning; nothing breaks.
**The second copy of the write** — `PlatformInvoice @@unique([tenantId,
periodStart, periodEnd])` (built); the bridge charges a row once, keyed by
`stripeInvoiceId`.
**The hundred-thousandth row** — 50,000 tenants × 12 invoices/year = 600,000
rows/year, indexed `[tenantId, issuedAt]` (built).
**The adoption test** — n/a for the control plane: it is one central writer and
`PlatformInvoice` carries no human-readable number today (its keys are a cuid
and `(tenantId, periodStart, periodEnd)`). Where a tax invoice for NEWAX's
subscription revenue is required, it is issued from NEWAX's own instance (doc
39's answer), whose `documentNumber()` already folds the node into the series.
**The reversal document, not the reversal flag** — a billing dispute is a
`PlatformInvoiceCreditNote` (built).
**The undo fan-out** — n/a beyond the built billing module.
**The version stamp** — `PlatformInvoice`'s price snapshots (built).
**The erasure the ledger cannot obey** — billing records are retained under the
tax-record basis (doc 39's own answer).
**The failure path, and who is allowed to walk it** — a charge that fails is
logged per invoice by the sweep and retried on its next run, safe because
selection is by `stripeInvoiceId: null`; an invoice that stays unpaid is chased
by `InvoiceDunningCron`, and `platform.billing.manage` holders act on it.

## Work orders

**WO-182.1 — UAE plan rows**: `FLAT_MONTHLY` tiers per doc 179's postures (and
optional `USAGE_BASED` / `PER_SEAT`) created through the existing
`PlansService`, amounts set by NEWAX, in the UAE control plane's currency.
**WO-182.2 — withdrawn (ADR-072).** A wholesale statement for a channel owner
billing SMEs on its own bill; there is no such channel owner.
**WO-182.3 — withdrawn (ADR-072).** A billing bridge to a channel owner's
billing system; NEWAX bills directly through the built `BillingService` and
`AgencyStripeChargeCron`.
**WO-182.4 — Control-plane currency words** into doc 170's ratchet.

## Acceptance

- Every price in this product is a `PlatformPlan` row with one of the four
  existing `pricingModel` values; no fifth value is added.
- No program tenant's manifest includes `wallet`.
- A UAE tenant's subscription is invoiced by the control plane's own
  `BillingService` as a `PlatformInvoice`, with no bridge to any third party's
  billing system.

## Out of scope

Final prices and customer contract terms (NEWAX's own decisions). Any claim
about a named vendor's products. Market-size or customer-count figures (not
sourced here). Stored value, wallets and escrow as a NEWAX business (doc 155's
own decision, not this program's).
