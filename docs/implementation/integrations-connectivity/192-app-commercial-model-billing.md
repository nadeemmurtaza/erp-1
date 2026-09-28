# 192 — Paid apps and revenue share: one more line on the invoice NEWAX already issues, never a second billing system

> **Status: proposed, not yet built.** No `AppPricePlan`, `AppSubscription`,
> `PlatformInvoice.addOnLinesSnapshot` or `AppPublisherPayable` exists (grep,
> `main` at `642b2831`). The rails this reuses are built and shipped:
> `PricingModel`, `SubscriptionStatus`, `PlatformInvoice` and
> `PlatformInvoiceCreditNote`, and `BillingService.computeCharge()`,
> `previewInvoice()`, `issueInvoiceForPeriod()` and `issueCreditNote()`
> (`apps/platform/src/modules/billing/billing.service.ts`, docs 50/153/154),
> plus doc 155's trade-payable shape. **Two findings gate this document**
> (§5.2, §6.1): app charges must be billed in arrears because the billing run
> issues a month's invoice at its start, and revenue share cannot be paid
> out on a cash basis until a general "invoice paid" record exists — today
> only Stripe-linked agency tenants have one. Part of [doc 184](./184-app-platform-overview-and-remote-only-decision.md)'s
> program (ADR-073).

## 1. The principle

A tenant already receives exactly one NEWAX invoice per billing period:
`PlatformInvoice`, `@@unique([tenantId, periodStart, periodEnd])`, every
price snapshotted at issue. **An app subscription is one more line on that
same invoice**, computed by the same service, previewed by the same
`previewInvoice()`, corrected by the same `PlatformInvoiceCreditNote`,
collected by whatever path already collects that tenant's invoice (dunning
per doc 153; `AgencyStripeChargeCron` for Stripe-linked tenants).

It is never a second invoice stream, a second subscription engine, a second
dunning job, or a checkout inside the app.

**NEWAX is the seller to the tenant.** The tenant owes NEWAX. NEWAX owes the
publisher its share as an **ordinary trade payable**, in the exact legal
shape doc 155 chose for merchants: "money customer pays *to* Newax *for*
Newax's own credit … then paid what Newax owes them … not as a release of
money that was always theirs". NEWAX never holds a publisher's money in
trust. Whether that characterisation holds for resale of a third party's
service, in each market, is WO-192.0's legal confirmation — the doc 155
WO-155.0 discipline, not assumed settled here.

## 2. How a publisher prices an app

```prisma
// apps/platform/prisma/schema/app-directory.prisma

model AppPricePlan {
  id                 String       @id @default(cuid())
  listingId          String
  key                String       // "free", "standard", "pro" — referenced from the manifest's pricing.planKeys (doc 185 §2)
  /// The reused enum. v1 accepts FLAT_MONTHLY only (a free plan is
  /// FLAT_MONTHLY at 0). PER_SEAT and USAGE_BASED for apps are named later
  /// work (§8): each needs a meter the platform can read without new
  /// cross-boundary access.
  pricingModel       PricingModel @default(FLAT_MONTHLY)
  monthlyPriceMinor  Int          // in the platform's billing currency — PlatformPlan carries no currency column either (§8)
  /// The publisher's share in basis points, set by NEWAX ops from the signed
  /// partner agreement (platform.billing.manage), never by the publisher.
  /// 0 for a first-party app.
  publisherShareBps  Int          @default(0)
  /// Public copy, following ADR-042's columns-not-JSON decision for
  /// PlatformPlan's own pricing-page text.
  displayName        String
  priceDescription   String
  isActive           Boolean      @default(true)
  createdAt          DateTime     @default(now())

  listing       AppListing        @relation(fields: [listingId], references: [id])
  subscriptions AppSubscription[]

  @@unique([listingId, key])
}
```

- **The publisher proposes** plans through its API. They are reviewed with the
  version that first references them — doc 186 §3.3's "pricing clarity".
  **NEWAX ops sets `publisherShareBps`**, gated by the existing
  `platform.billing.manage`, because the share is the agreement's term, not
  the publisher's choice.
- **A live plan's price is never edited.** A price change is a new plan row
  plus a manifest version referencing it. That version carries
  `requiresReconsent = true` (doc 185 §5), and each tenant accepts it as a
  `PRICE_CHANGE` consent (doc 187 §5.4). Until it is accepted, the tenant
  stays on the plan it consented to, at the price it consented to.
- **A plan with live subscribers cannot be deactivated.** The publisher's only
  way to stop serving an old price is to remove the listing, which is
  terminal and visible (doc 191 §3). That is deliberate: a price a tenant
  agreed to never changes underneath them.

## 3. Subscriptions — created when the install is real, ended when it is gone

```prisma
enum AppSubscriptionEndReason {
  UNINSTALLED            // the tenant's decision
  LISTING_REMOVED        // NEWAX removed the app
  PUBLISHER_TERMINATED
  PLAN_CHANGED           // superseded by the tenant's PRICE_CHANGE acceptance — a new subscription row starts the same day
  TENANT_DEPROVISIONED   // the tenant itself left the platform (doc 39)
}

model AppSubscription {
  id                   String                    @id @default(cuid())
  tenantId             String
  listingId            String
  installationRecordId String
  pricePlanId          String
  status               SubscriptionStatus        // reused: ACTIVE | PAST_DUE | CANCELLED
  /// The plan's price AT START — the version stamp. Proration and every
  /// invoice line read this, never the plan's current row.
  priceMinorSnapshot   Int
  publisherShareBpsSnapshot Int
  startedOn            DateTime
  endedOn              DateTime?
  endedReason          AppSubscriptionEndReason?
  /// Platform-side suspension windows during which no charge accrues (§4).
  chargePausedFrom     DateTime?

  tenant       PlatformTenant        @relation(fields: [tenantId], references: [id])
  pricePlan    AppPricePlan          @relation(fields: [pricePlanId], references: [id])
  installation AppInstallationRecord @relation(fields: [installationRecordId], references: [id])

  @@index([tenantId, status])
  @@index([listingId, status])
}
// Hand-written partial unique index: one live subscription per installation —
//   CREATE UNIQUE INDEX "AppSubscription_one_live" ON "AppSubscription" ("installationRecordId") WHERE "endedOn" IS NULL;
```

**Created** by the platform's lifecycle handler when an
`app_installation.installed` notice moves the `AppInstallationRecord` to
`ACTIVE` (doc 187 §3 step 5), for a non-zero plan only, in the same platform
transaction. It is never created at preflight: a preflight whose tenant
transaction failed must never be billable.

**Ended** by the lifecycle handler on `app_installation.uninstalled`
(`endedOn` = the event's `occurredAt`, not the time the platform heard of it
— the tenant's clock is authoritative for its own act); by the moderation
service on removal or termination; by doc 39's deprovisioning; or by §5's
reconciliation when a notice never arrived.

## 4. What suspension, removal and termination do to the bill

| Event | Charge | Why |
|---|---|---|
| Tenant suspends the app (doc 187 §5.3) | **Continues** | The tenant paused a service still available to it — the tenant's choice, like a paused subscription it keeps |
| NEWAX suspends the listing (doc 191 §3) | **Stops accruing** from the suspension (`chargePausedFrom`), resumes on reinstatement | The tenant must not pay for an app NEWAX made unavailable |
| NEWAX removes the listing, or terminates the publisher | **Ends** at removal (`endedOn`); no further charge | Nothing left to pay for |
| Tenant uninstalls | **Ends** at `occurredAt` | — |
| The installation's first token never minted ("Waiting for the app to connect", doc 187 §3) | **Accrues** | The service was available; the tenant's decision to connect it is theirs. The screen says the app is billing |
| A period already invoiced turns out wrong (a notice delayed past invoicing, a disputed suspension) | **`PlatformInvoiceCreditNote`** against that invoice, via `BillingService.issueCreditNote()` | Doc 50's "the reversal document, not an edited invoice line", unchanged |

Because app lines are billed in arrears (§5.2), most of these land before
the line is computed and need no credit note at all.

## 5. On the invoice

### 5.1 The line

`PlatformInvoice` gains one column, beside doc 153's `usageLinesSnapshot`:

```prisma
/// Doc 192 — app subscription lines for the PREVIOUS period (§5.2):
/// [{ subscriptionId, listingId, listingName, planKey, priceMinor,
///    daysCharged, daysInPeriod, amountMinor, publisherShareBps }]
/// Snapshotted at issue — "click the number" for every app line, and the
/// version stamp: a later plan or share change never re-reads into it.
addOnLinesSnapshot Json?
```

`amountMinor` becomes *the plan charge `computeCharge()` already returns* +
*the sum of `addOnLinesSnapshot[].amountMinor`*. The four existing snapshot
fields and `pricingModel` are unchanged, so every existing invoice still
reads as it did.

### 5.2 Why the previous period — billed in arrears

`BillingCron` runs daily at 04:00 for `currentCalendarMonthPeriod()`
(`billing-period.ts`), and `@@unique([tenantId, periodStart, periodEnd])`
stops a second issue. A month's invoice is therefore issued **on its first
day**. An app installed on the 12th cannot be added to that already-issued
invoice, and computing the month's app charge on day 1 would charge for days
that have not happened. So `AppChargeService.computeAddOnLines(tenantId,
previousPeriod)` — a pure function over `AppSubscription` rows (no write) —
prices each subscription for the days it was chargeable in the previous
month:

```
daysCharged = overlap(startedOn..endedOn, previousPeriod) − days inside [chargePausedFrom..reinstatement]
amountMinor = round(priceMinorSnapshot × daysCharged / daysInPeriod)
```

It is exact, never estimated. A mid-month install, uninstall or NEWAX
suspension is priced to the day, with no credit note. The first month of a
new app appears on the next invoice.

### 5.3 The run, in order

`BillingService.issueInvoiceForPeriod(tenantId, period)` gains two steps
before it writes:

1. **Reconcile** — `AppInstallationReconciliationService.reconcile(tenantId)`
   (doc 191 §5): one read-only query of the tenant's live installations,
   converging the platform records toward the tenant's truth and ending any
   subscription whose uninstall notice never arrived. If the tenant's
   database is unreachable, **that tenant's invoice is deferred**, never
   issued on unreconciled data. It is the same "a seat-count failure defers
   only that tenant's invoice, never the whole run" rule doc 50 WO-50.3
   already applies.
2. **Price the lines** — `computeAddOnLines()`, snapshotted to
   `addOnLinesSnapshot`.

`previewInvoice()` calls both read-only, so the "this month so far" preview
doc 153 built shows app lines too. That makes it the dry run, with the same
function behind both callers.

**One change to the `ONE_TIME_LICENSE` branch.** Today a Lifetime License
tenant is "billed exactly once, ever": `issueInvoiceForPeriod()` returns
null once any invoice with `pricingModel: 'ONE_TIME_LICENSE'` exists. With a
paid app installed it must still receive monthly app lines. The check
becomes "a licence charge was ever issued" (`oneTimePriceMinorSnapshot IS
NOT NULL`). A later period issues an invoice whose plan charge is zero, with
`oneTimePriceMinorSnapshot = null` and `addOnLinesSnapshot` set — and only
when there are add-on lines. A Lifetime License tenant with no paid apps
still never receives a second invoice. An `OFFLINE` licence (doc 48's
desktop node) cannot reach the directory at all (doc 185 §6), so this never
applies to it.

## 6. Revenue share — a trade payable, created on collection, paid in runs

### 6.1 The gate: NEWAX pays out only what it collected

A publisher's share of an invoice NEWAX never collected is not owed on the
terms this program proposes. The partner agreement (WO-192.0) must say so,
and the code must be able to tell. **Today it cannot, for most tenants.**
`InvoiceStatus` is `ISSUED | CREDITED` with no paid state, and the only
collection fact in the schema is `stripePaymentStatus = PAID`, set by the
Stripe webhook for **agency-linked** tenants (doc 14, ADR-039).

So revenue share to **external** publishers waits for a general
collection record on `PlatformInvoice` — `paidAt` and `paymentReference`,
written by the Stripe webhook and by an ops "record payment" action
(`platform.billing.manage`) for bank-transfer tenants (WO-192.6). This is
named as a prerequisite, not assumed. Until then (Phases 1–3, doc 195), paid
apps are **NEWAX's own first-party apps**, whose `publisherShareBps` is 0,
so no payable arises.

### 6.2 The payable

```prisma
enum AppPublisherPayableStatus { OPEN  SCHEDULED  PAID  HELD  VOIDED }

/// Doc 155's MerchantPayable shape — "the exact mirror of doc 145's own AP
/// side (SupplierBill)" — for a publisher: what NEWAX owes, never money
/// NEWAX holds for them.
model AppPublisherPayable {
  id                String                    @id @default(cuid())
  publisherId       String
  invoiceId         String                    // the PlatformInvoice collected
  subscriptionId    String
  grossMinor        Int                       // the add-on line's amountMinor
  publisherShareMinor Int                     // round(grossMinor × publisherShareBps / 10_000)
  status            AppPublisherPayableStatus @default(OPEN)
  scheduledPayoutAt DateTime?
  paidAt            DateTime?
  heldReason        String?                   // a suspension under investigation (§6.3)
  createdAt         DateTime                  @default(now())

  publisher AppPublisher @relation(fields: [publisherId], references: [id])

  @@unique([invoiceId, subscriptionId])       // a redelivered "invoice paid" creates no second payable
  @@index([publisherId, status])
}
```

It is created when an invoice becomes paid (§6.1): one row per add-on line
with a non-zero share. It is **voided** by a credit note on that line — a
credit note naming the subscription voids the payable, or reduces it by a
matching negative row if already paid, never an edit. It is paid in a
monthly run proposed by `platform.billing.manage` and approved by
`platform.billing.approve`. That is the maker-checker split doc 153 already
uses for rate cards (`CustomQuoteService.approve()` refusing the requester);
no new key.

### 6.3 When a publisher is suspended or terminated

| Event | Open payables | Future lines |
|---|---|---|
| Listing suspended for investigation | `HELD` with the reason until resolved | None accrue (§4) |
| Listing reinstated | Released to `OPEN` | Resume |
| Removed or publisher terminated **for cause** | Stay `HELD`; offset against credit notes issued to affected tenants; the balance per the partner agreement's termination clause (WO-192.0) | None |
| Terminated without cause (e.g. the publisher's own exit) | Paid in the next run | None |

## 7. NEWAX's own books

The invoice is NEWAX's revenue, posted through NEWAX's own operating
instance (doc 39: "a `PlatformSubscription` charge is a `Sale`/`Invoice` in
Newax's own operating instance, never mixed into any tenant's own books").
Whether NEWAX recognises an app line **gross** (as principal) with the
publisher share as cost of sales, or **net** (as agent), is an accounting
judgement under the partner agreement's terms (IFRS 15's principal/agent
test). It belongs in WO-192.0 with the legal questions, not decided in code.
The tenant's books are unaffected: the tenant receives one NEWAX invoice
with more lines.

## 8. Deliberately later

- **Per-seat and usage-based app pricing.** Pricing either needs a meter. For
  the platform to read one, it must either cross the boundary again (a new
  read-only query per metric, `SeatCounterService`-style, which is a decision
  per metric) or trust the app's own report (a publisher billing a tenant
  through NEWAX on its own numbers — a dispute surface). Both need their own
  design.
- **Multi-currency.** `PlatformPlan` has no currency column, so the platform
  bills in one currency. App prices inherit that. A second billing currency
  is the platform's own open question (doc 181/182's UAE market), not
  this program's.
- **Publisher payouts across borders**: withholding tax, the payout rail and
  the publisher's tax documentation are WO-192.0.

## Scope lenses

Installation and revocation lenses are in docs 187 and 191. Lines below
cover what money adds.

**The five shop-scale lenses.** *Start to finish* — plan proposed → reviewed
→ share set by ops → consented at install → subscription on `ACTIVE` →
priced in arrears → invoiced → collected → payable → payout run approved.
*The other side* — NEWAX finance's payout run and the tenant's invoice.
*After "done"* — credit notes, held payables, termination. *Real
integrations* — the invoice NEWAX already collects, not a separate checkout.
*Policy* — the share (agreement), the no-edit price rule, collection-gated
payouts.
**The actor with three tables** — the tenant as payer (`PlatformTenant`); the
publisher as payee (`AppPublisher`), never a `TradingPartner` or `Party` in
any tenant database, because NEWAX owes it, not the tenant.
**The principal with no permission key** — n/a: no new principal; payouts are
ops acts under existing `PLATFORM_PERMISSIONS`.
**The grant that ends itself** — a subscription ends with its installation,
by the lifecycle notice or, failing that, by reconciliation before the next
invoice; it is never left to a human to remember.
**Whose rows, and which columns** — a tenant sees its own invoice lines; a
publisher sees its own payables and never which tenants they came from
beyond an opaque line id, since installer identity is private (doc 191
§4.4).
**The threshold nobody approves alone** — a payout run needs
`platform.billing.approve` from someone other than its proposer; the share
change goes through `platform.billing.manage`, as an audited plan-row
change.
**The toxic pair, caught at grant or at act** — proposer ≠ approver of a
payout run, refused at the act, reusing `CustomQuoteService.approve()`'s
comparison.
**Authority and blast radius** — the worst value is a wrong
`publisherShareBps`. It is snapshotted per subscription at start, so a
mistaken change affects only subscriptions started after it, and each change
is an audited old→new.
**Audience is a capability, not an address** — invoices go to
`PlatformTenant.billingContactEmail`, the existing rule. Publisher payout
notices go to `AppPublisher.contactEmail`.
**Request or record** — a price change is a REQUEST (review, then each
tenant's consent). A line priced in arrears is a RECORD of days actually
used. A payable is a RECORD of collected money.
**The movement with no address** — n/a: no stock; the money is NEWAX's own
receivable and payable.
**Four hours down** — the tenant's database unreachable at billing defers
only that tenant's invoice (§5.3); the platform down delays billing, and
arrears pricing makes a late run exact rather than wrong.
**The unwritten posting rule** — NEWAX's own instance: Dr Accounts Receivable
/ Cr Revenue (gross) or Cr Revenue + Cr Payable to publisher (net), decided
by WO-192.0, keyed by `findPostedEntry('PlatformInvoice', invoiceId)` in
NEWAX's own accounting. It is never a posting in a tenant's ledger.
**Every column or none** — nothing reaches a tenant's `JournalLine`. In
NEWAX's own instance, app revenue is declared **undimensioned**: NEWAX's
books are one legal entity until doc 39's "second legal entity" note becomes
real. The report allowed to break it down is the invoice-line report by
listing, read from `addOnLinesSnapshot`.
**The period that already moved** — a line for a closed month is billed in
the next open month by design (arrears). A credit note against a closed
invoice is dated today and names the original, doc 50's rule.
**The second legal entity** — if NEWAX bills from a second entity (doc 181's
possible UAE contracting entity), `AppPricePlan` and payouts scope per
entity with the platform's own billing — named with doc 39's identical note,
not built.
**Dry run before live** — `computeAddOnLines()` is pure, and
`previewInvoice()` is its second caller; the payout run has a preview that
lists payables before approval.
**Click the number** — every app line drills to its `AppSubscription` and its
day-count inputs; every payable drills to its invoice line.
**Three silhouettes** — a Solo tenant sees "Apps: 1 line"; an Organization
with many nodes is many `PlatformTenant`s, each invoiced for its own
installations, never pooled.
**The absent collaborator** — no paid apps means `addOnLinesSnapshot` is null
and every invoice is byte-identical to today's. `app-directory` off means
billing never calls reconciliation.
**The second copy of the write** — `@@unique([tenantId, periodStart,
periodEnd])` (unchanged); `AppSubscription_one_live`;
`AppPublisherPayable @@unique([invoiceId, subscriptionId])`.
**The hundred-thousandth row** — subscriptions are hundreds of thousands at
full scale, read per tenant by `@@index([tenantId, status])` once a month.
**The adoption test** — n/a: platform-generated ids from a single writer.
**The reversal document, not the reversal flag** — `PlatformInvoiceCreditNote`
against the specific invoice, naming the subscription, partial and
repeatable. The payable is voided or offset by a negative row, never
edited.
**The undo fan-out** — uninstall ends the subscription (automatic); an
over-charge is credit-noted (human, `platform.billing.manage`); a payout
already sent is recovered by offset against the next run (automatic), never
clawed back by editing.
**The version stamp** — `priceMinorSnapshot` and `publisherShareBpsSnapshot`
per subscription; `addOnLinesSnapshot` per invoice.
**The erasure the ledger cannot obey** — no person on any row here;
`AppPublisher` business contacts are doc 186's; invoice history is retained
under the tax-record basis doc 39 names.
**The failure path, and who is allowed to walk it** — a deferred invoice
(reconciliation failed) is listed on the ops Usage/Billing tab with the
reason, retried on the next daily run; a held payable is on the ops Apps tab
with its reason, under `platform.billing.manage`.

## Work orders

**WO-192.0 — legal and accounting confirmation, before any external payout**:
NEWAX as seller of record for a third party's service in each market;
the trade-payable characterisation (doc 155 WO-155.0's discipline); VAT/GST
on the add-on line; withholding tax and the payout rail for cross-border
publishers; principal-versus-agent recognition. Recorded in `DECISIONS.md`
before Phase 4.
**WO-192.1 — schema**: `AppPricePlan`, `AppSubscriptionEndReason`,
`AppSubscription` + partial unique index, `PlatformInvoice.addOnLinesSnapshot`.
**WO-192.2 — lifecycle-driven subscriptions**: create on `ACTIVE`, end on
uninstall, removal, termination or deprovisioning; `chargePausedFrom` on
platform suspension and reinstatement.
**WO-192.3 — `AppChargeService.computeAddOnLines()`** (pure) and its
use in `issueInvoiceForPeriod()` and `previewInvoice()`, reconciliation first,
deferral on failure.
**WO-192.4 — the `ONE_TIME_LICENSE` branch change** (§5.3) with a spec proving
that a Lifetime License tenant with no paid apps still gets exactly one
invoice, ever.
**WO-192.5 — publisher plan API and ops share-setting**, reviewed with the
version.
**WO-192.6 — a general collection record**: `PlatformInvoice.paidAt`,
`paymentReference`, written by the Stripe webhook and an ops "record
payment" action. Prerequisite for WO-192.7.
**WO-192.7 — `AppPublisherPayable`**, payout-run propose/approve, hold and
release, and credit-note voiding. Phase 4 only (doc 195).
**WO-192.8 — surfaces**: app lines on the tenant's invoice view (through
`GET /agency/clients/me/invoices`'s existing path where it applies), app
prices on listing cards and the consent screen (doc 187 §2 item 6).

## Acceptance

- A tenant with no paid apps receives invoices byte-identical to today's.
- An app installed on the 12th and uninstalled on the 20th of a 30-day month
  is billed exactly 8/30 of its price on the next month's invoice, and
  nothing after.
- A NEWAX suspension from the 5th to the 15th removes those days from the
  line.
- A preflight whose tenant transaction failed never produces a subscription
  or a charge.
- An uninstall notice lost for a week still ends the subscription before the
  next invoice (reconciliation), priced to the tenant's uninstall date.
- A redelivered "invoice paid" fact creates no second payable.
- A Lifetime License tenant with one paid app receives one app-lines-only
  invoice per month and never a second licence charge.

## Out of scope

Tenant-to-publisher direct billing — the publisher charging the tenant
outside NEWAX. Nothing stops a publisher from running its own subscription
for a free-listed app, but NEWAX does not broker it, and the directory
policy requires the listing to say so (doc 186 §4 item 8). Coupons and
trials for apps. Per-seat and usage-based app pricing (§8).
