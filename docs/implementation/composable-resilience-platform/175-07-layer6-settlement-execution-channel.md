# 175 — Layer 6: payments as an execution channel — licensed third-party PSPs on `PaymentProvider`, doc 49's `SHORT` loop, and a custody boundary NEWAX never crosses

> **Status: proposed (2026-09-27), not yet built.** Both extension points this
> layer needs already exist: `PaymentProvider`
> (`apps/api/src/modules/sales/payments/payment-provider.ts`) for collection and
> `FinancialInstitutionConnector`
> (`apps/api/src/modules/money/settlements/settlement-connector.ts`) for settlement,
> and doc 49's `SettlementsService` — expected batch, reconcile, a named `SHORT`
> variance, a maker-checker write-off posting through
> `SettlementShortfallWrittenOff` — is built. This document specifies **one
> implementation of each interface per licensed third-party payment service
> provider (PSP) NEWAX integrates in a market** — the first being the PSP NEWAX
> selects for its own UAE entry — two fixes to shipped code that a live online
> rail makes mandatory (callback verification that fails closed; provider labels
> as translation rows), and the forecast change that stops un-settled gateway
> money being counted as cash in the bank. It states, call by call, how NEWAX
> never holds funds. It is the second genuinely new named capability in the
> program and carries a full scope-lens pass.
>
> **Revised (2026-09-28), ADR-072.** Earlier drafts assumed one specific
> telecom-owned rail as *the* rail and that party's licensed entities as the
> custody boundary. There is no such counterparty. NEWAX is a technology
> platform that integrates licensed PSPs through the existing extension point
> and never becomes a money transmitter or wallet-holder itself for this
> program; doc 155's wallet/stored-value/escrow model stays out of it (§4).

## Implementation plan

### Objective
Close the resilience loop with real money: a customer pays an SME's document
through a licensed third-party PSP's rail; the payment is verified, recorded
and posted; the
rail's payout is reconciled against it with a named, never-silent variance; and
the SME's resilience position (doc 173's liquidity forecast) reflects cash that
has actually arrived — while no money ever passes through a NEWAX account.

### Existing state
- `PaymentProvider` has six implementations (`providers/`): `cod` and
  `bank_transfer` live; `jazzcash` and `easypaisa` "written against their
  hosted-checkout flow and stay dark until the merchant credentials exist"
  (`payment-provider.ts:4–10`); `giftkarta`; `account` (doc 149). **None is a
  live online gateway today** — the first PSP this program integrates would be
  the first to run in production, which is why §3's verification fix is a
  precondition, not a polish.
- `FinancialInstitutionConnector` has **zero** implementations: "`this.connectors`
  is a permanently empty map until then" (doc 49 status); `reconcile()` and
  `pollExpectedBatches()` refuse when no connector is registered.
- `PaymentsService.handleCallback()` refuses only `result.verified === false`
  (`payments.service.ts:149`).
- `PaymentsService.refund()` records a refund; "moving the money itself… is a
  manual step staff take outside this system" (`payments.service.ts:368–373`).
- `onPaymentSucceeded()` posts Dr `1000 Cash & Bank` / Cr `1100 Accounts
  Receivable` at the moment of payment (`posting-rules.subscriber.ts:124–150`),
  R15's own table.
- `Payment.orderId` is required; `Payment.currency` defaults to `"PKR"` and
  `createForOrder()` never sets it (doc 170 §5).

### Required change
§2–§6.

### Files likely affected
New, per integrated PSP: `payments/providers/<psp>.provider.ts`,
`settlements/connectors/<psp>.connector.ts`; once: a settlement-expectation cron in
`settlements`. Changed: `payments.service.ts` (fail-closed check),
`payment-provider.ts` (labels → translation keys; `verified` documented as
required), `jazzcash.provider.ts`/`easypaisa.provider.ts` (return
`verified: true`), `liquidity-forecast.service.ts` (cash in transit),
`apps/web/messages/*.json` (provider labels).

### Dependencies (reused)
`SettlementsService` (doc 49), `EventBusService`, posting rules, `AuditService`,
`IdempotencyKey`, `secret-crypto`, doc 38 §2's `CircuitBreaker` (built by
WO-176.2), doc 162's `FileFormatHandler` for a camt.053/054 payout file where the
rail offers files rather than an API.

### Risks
Forged callbacks (§3); cash overstated between payment and payout (§5); a
refund recorded but never executed (§6); PKR-labelled AED rows (doc 170 §5,
a precondition); a regulatory characterisation of NEWAX as a payment
intermediary (§4 — why every flow is designed so that cannot be true).

### Acceptance criteria
See "Acceptance".

### Out of scope
See "Out of scope".

### Scope lenses
The full pass is `## Scope lenses` below.

## 1. Execution channel, never the product

The product is the resilience engine and the operational platform under it.
Payments appear only where they close the loop the engine reasons about:
**document → rails → reconciliation → updated position.** Three things are
therefore deliberately absent: lending or cash advances against sales (doc 49's
own out-of-scope), stored value or escrow (§4), and autonomous payment execution
(an engine that *pays* a supplier because a ranking said so — R23/Part 4's
"Accept creates drafts, it does not execute", and doc 174's decisions never
move money).

## 2. The loop, on real code

This layer applies from **Wave 2** (doc 179) — when the SME's sales documents
are issued on this platform. In Wave 1 (connect-only) the SME's own systems
collect and settle, and this platform only observes the result (a bank balance,
doc 169 §6).

| Step | What happens | Real code | New here |
|---|---|---|---|
| 1. Document | The SME's demand for payment | `Order` — the AR document of record (`receivables.prisma` header); `Payment.orderId` is required | Nothing. Invoice-keyed collection (`Payment.invoiceId`) is an R18 step that makes `orderId` nullable across every payment consumer — named as WO-175.9, sequenced after Wave 2's invoicing migration, not in the slice |
| 2. Rails | A hosted payment session at the licensed entity | `PaymentsService.createForOrder(tx, key, context)` → `provider.initiate(context)` returns `{ status: 'PENDING', reference, redirectUrl }`; `Payment` row with `reference @unique` | The PSP's provider (§3) |
| 3. Proof | The rail tells us the payment happened | `POST /payments/callback/:provider` → `PaymentsService.handleCallback()` → `provider.handleCallback(payload)` → `PAID`/`FAILED` + `PaymentSucceeded`/`PaymentFailed` via the outbox | Verification fails closed (§3) |
| 4. Books | The receipt posts | `onPaymentSucceeded()`: Dr `1000` / Cr `1100`, idempotent on `findPostedEntry(source, paymentId)` | Nothing — R15's rule, unchanged |
| 5. Payout | The rail pays the SME's bank, net of its fees, in a batch | `SettlementsService.createExpectedBatch()` → `SettlementBatch` (`EXPECTED`) with `SettlementBatchLine`s per `Payment` | A settlement-expectation cron that creates the expected batch per payout cycle (§5.1) |
| 6. Reconciliation | Expected vs. paid out | `reconcile()`/`pollExpectedBatches()` → `FinancialInstitutionConnector.reconcileBatch(externalBatchRef)` → `CONFIRMED` or **`SHORT`**; `SHORT` never auto-resolves; write-off above `FinanceSettlementWriteoffApprovalThresholdMinor` needs a second approver; posts Dr `5700` / Cr `1000` through `SettlementShortfallWrittenOff` | The PSP's settlement connector (§5.2) |
| 7. Position | The resilience engine sees real cash | `LiquidityForecastService.forecast()` | Cash in transit separated from cash in the bank (§5.3) |

## 3. A licensed PSP's `PaymentProvider`

NEWAX integrates with licensed third-party PSPs and payment gateways, market by
market, through the extension point that already exists —
`export interface PaymentProvider` at
`apps/api/src/modules/sales/payments/payment-provider.ts:73` — and never becomes a
money transmitter or wallet-holder itself for this program. Its own header
states the whole cost: "implement this interface, add the class to
`PaymentsService`'s constructor list, add its key to the allowlist. Nothing else
in the codebase changes." Each PSP is one class, `providers/<psp>.provider.ts`,
under a stable key naming that PSP, switched on per tenant by the
`PAYMENT_PROVIDERS` allowlist. Which PSP NEWAX integrates first in the UAE is
NEWAX's own commercial choice when it enters the market; a regional rail such
as Network International or du Pay is an illustration of what this extension
point could plug into, never an assumed or required rail. Because the
allowlist is a list, a market can have more than one PSP at once, and an SME
that already holds a merchant account with a supported PSP uses that one. Each
PSP's class implements:

| Member | Implementation |
|---|---|
| `key`, labels | See "labels" below |
| `feeFor(amount)` | `0`. The rail's merchant discount is netted from the payout by the rail and appears as the expected-vs-settled difference the SME agreed to (a configured fee rate on the `SettlementProvider`, §5.2) — never an extra charge added to the customer's total |
| `initiate(context)` | A server-to-server call to the licensed entity's payment-order API with the **SME's own merchant credentials** (encrypted in the tenant database with `secret-crypto`), returning the entity's hosted payment page as `redirectUrl` and our `reference` — the JazzCash/Easypaisa shape ("only ever prepare a redirect; the actual settlement arrives later, via `handleCallback`", `payment-provider.ts:106–108`) |
| `handleCallback(payload)` | Verifies the rail's own documented authentication (a signature over the raw body, a callback token, or mutual TLS — **whichever the licensed entity's API specifies, taken from its documentation when NEWAX's integration agreement with that PSP provides it, never assumed here**, doc 15's discipline); returns `verified: true` only on proof |
| `redeemCode` | not implemented |

Wrapped in doc 38 §2's `CircuitBreaker` (key `payment.<psp key>`), so a rail
outage hides the option at checkout instead of queuing doomed calls — doc 38's
degradation-matrix row for `PaymentProvider`, made real.

**Fix 1 — callback verification fails closed (WO-175.1, a precondition).**
`PaymentCallbackResult.verified` is optional (`payment-provider.ts:70`) and the
service refuses only `verified === false` (`payments.service.ts:149`). No provider
ever returns `verified: true` — JazzCash and Easypaisa return `false` on a bad
signature and leave the field *undefined* on success (`jazzcash.provider.ts:107`,
`:130`; `easypaisa.provider.ts:112`). So the guarantee today is "a provider that
notices a forgery must say so"; a provider that forgets the field is trusted. For
the first live online rail that is the wrong default. The change, in one PR:
`handleCallback()` refuses unless `result.verified === true`; JazzCash and
Easypaisa return `verified: true` on their proven path; `callback-verification.spec.ts`
gains the case "a provider returning no `verified` field is refused".

**Fix 2 — provider labels become translation rows (WO-175.2).** `labelEn`,
`labelUr`, `descriptionEn`, `descriptionUr` (`payment-provider.ts:76–80`) bake a
two-locale assumption into the interface; an Arabic build has nowhere to put
Arabic. ADR-006 ("customer-facing text is a row, not a column") already decides
the answer: each provider exposes stable message keys
(`payments.provider.<key>.label`, `.description`), resolved per locale by
`PaymentsService.listAvailable()` from the web app's message files
(`apps/web/messages/en.json`, `ur.json`, and the new `ar.json`). All six existing
providers move in the same change; none of their behaviour does.

**Currency (precondition, doc 170 WO-170.3).** `createForOrder()` must set
`currency: BRAND.locale.currency`; until it does, every AED payment is written
as PKR.

## 4. The custody boundary — concretely

NEWAX never holds, receives, pools, forwards or disburses a customer's or an
SME's money. Stated as the calls that exist and the calls that do not:

| Money moment | Who acts | The call | NEWAX's role |
|---|---|---|---|
| Customer pays | Customer → licensed entity | Card/wallet details entered on the **licensed entity's** hosted page (`redirectUrl`); no card or wallet credential ever reaches this platform's servers | None in the funds flow; holds the `reference` |
| Payment authorised | Licensed entity | Callback to the SME tenant's own endpoint, verified (§3) | Records status as data |
| Funds settle | Licensed entity → **the SME's own bank account** | The SME is the merchant of record, onboarded (KYB) by the licensed entity; payout goes to the account the SME registered *with the entity* | None; reconciles the payout report as data (§5) |
| Refund | SME → licensed entity | Executed in the entity's merchant portal or API by the SME; `PaymentsService.refund()` records it (§6) | Records the fact |
| NEWAX's own revenue | NEWAX ↔ SME | Billed as its own subscription invoice (`PlatformInvoice`, doc 50) from NEWAX's control plane and collected through NEWAX's own billing path (`AgencyStripeChargeCron`, ADR-039) — **never netted out of an SME's settlement**, never a split payment in which NEWAX receives a share of a customer's funds | A separate commercial relationship (doc 182) |

What this platform holds: payment references, statuses and amounts as data; the
SME's API credentials for the rail (encrypted, write-only); settlement reports
as data. What it never holds: funds, card numbers, wallet balances, or any
account into which a third party's money is paid.

**Doc 155's wallet is excluded from this program by design.** Doc 155's
revised structure has "customer payments settle into Newax's own bank account
only, in exchange for Newax-issued store credit" — a legitimate structure in its
own context, and exactly what this program must never do. The `wallet` module
stays out of every program tenant's `MODULES` (doc 171 manifest), and no program
tenant's Build Manifest may add it. Offering stored value, a wallet or escrow is
a separate, more heavily regulated business decision the owner has not made —
doc 155 carries its own legal gate (WO-155.0) — and this program does not make
it by the back door. If a licensed PSP's own stored-value product is ever offered
to SMEs, it is integrated as one more `PaymentProvider`, never as NEWAX's
ledger.

**Who the licensed party is** — which PSP NEWAX integrates in a market, and
under which Central Bank of the UAE licence category that PSP operates — is a
fact NEWAX's integration agreement with the PSP and the SME's own merchant
agreement with it state; this document does not assert it. The design's only
requirement is that every money-moving call in the table above terminates at a
licensed entity and never at NEWAX.

## 5. Settlement reconciliation — doc 49's pattern, reused, and one gap closed

### 5.1 Expected batches, created per payout cycle

`createExpectedBatch()` exists but is called by a person naming payments (doc 49's
first deviation). A rail that pays out daily needs the expectation created per
cycle: a `SettlementExpectationCron` in `settlements` groups `PAID` payments
for the rail's key by their expected payout date (`paidAt` + the rail's settlement
lag, a `SettlementProvider` configuration column), and calls the same
`createExpectedBatch()`. Idempotent: a batch per (provider, payout date) is keyed
by `externalBatchRef` once known, and by a deterministic expectation key
(`<provider>:<payout date>`) before it is.

### 5.2 The PSP's `FinancialInstitutionConnector`

`settlements/connectors/<psp>.connector.ts` implements
`reconcileBatch(externalBatchRef): Promise<{ settledAmountMinor; settledAt }>` —
from the rail's payout-report API, or, where the rail delivers files, from a
camt.053/camt.054 statement through doc 162's `FileFormatHandler` (the ISO 20022
map is doc 169 §9). "Never invented data: an amount this connector did not itself
receive from the institution is never written as `settledAmountMinor`"
(`settlement-connector.ts`) — unchanged. The rail's agreed fee rate is recorded
on `SettlementProvider` (new column `expectedFeeBps Int?`) so the expectation is
*net*: a batch short by exactly the agreed fee is `CONFIRMED`, and only a
shortfall beyond it is `SHORT`. That is not a tolerance that hides variance — it
is the SME's merchant agreement's own figure, versioned by the batch's own row
(the version-stamp lens).

`SHORT` is exactly doc 49 §3: "never auto-resolved: a `SHORT` batch surfaces on
a reconciliation screen (`finance.settlement.reconcile`), with the specific
`Payment` rows it could not fully match, and a human decides". This program
changes none of it.

Doc 49's WO-49.2 webhook path (a signed settlement notification) is unbuilt; it
is built here for a PSP only if that PSP offers one, fail-closed from the
start, and `@@unique([settlementProviderId, externalBatchRef])` already makes a
redelivery idempotent. Polling (WO-49.3, built) is the default.

### 5.3 Cash in transit is not cash in the bank

`onPaymentSucceeded()` debits `1000 Cash & Bank` when the payment is authorised
(R15's table: "`PaymentSucceeded` | Dr Bank · Cr AR"). For cash and bank
transfers that is when the money is in the bank. For a gateway that pays out at
T+1 or T+2, net of fees, and occasionally short, the ledger counts the money a
day or two early and at gross — and `LiquidityForecastService` reads that
account as "current cash". An SME asking "will I make payroll on Thursday" is
told about money that has not arrived.

The fix, read-only, in `LiquidityForecastService` (WO-175.5):
`currentCashMinor` subtracts the sum of `SettlementBatch`es still `EXPECTED`
(and the unresolved shortfall of `SHORT` batches), reports them as
`cashInTransitMinor`, and adds each `EXPECTED` batch as a scheduled inflow on its
expected payout date, source `SETTLEMENT`. The accounting-correct fix — a
clearing account per provider, debited at payment and cleared at payout — changes
R15's own posting table for every tenant and is **named for its own ADR**, not
made here.

## 6. Refunds, and the reversal they post

`PaymentsService.refund(actorId, paymentId, amount?, note?)` records a full or
partial refund; the money is returned by the SME through the rail (a portal
action, or an API call if the rail offers one — a future optional
`refund?()` on `PaymentProvider`, additive, named not built). Two honest gaps
this layer inherits and must not paper over:

- **The ledger reverses a partial refund in full.** `CLAUDE.md` names it:
  "`PaymentsService.refund()` takes a partial amount; `onPaymentRefunded()`
  ignores it and reverses receipt and sale in full, erasing the whole sale."
  For a live rail, where partial refunds are ordinary, WO-175.6 makes
  `onPaymentRefunded()` reverse `refundAmount` — the receipt and the sale in
  proportion — as its own posting-rule change with its own spec.
- **A recorded refund may never have been executed.** Nothing checks that the
  rail actually returned the money. The next payout report shows it: a refund
  executed at the rail reduces a later payout, and the settlement connector
  reports it; a recorded refund with no matching rail refund within the payout
  window becomes a named variance on the reconciliation screen (the settlement
  report carries refund lines; `SettlementBatchLine` gains a signed `amountMinor`
  for them — an additive meaning on an existing column, written down).

## Scope lenses

**The five shop-scale lenses first.**
*The transaction, start to finish* — document → hosted payment → verified
callback → receipt posted → payout reconciled → forecast updated (§2); every
step has code or a named work order. *The other side of the same transaction* —
the finance operator's reconciliation screen (`/admin/settlements`,
`finance.settlement.reconcile`) is the twin of the customer's payment page.
*What happens after "done"* — refunds and their reconciliation (§6), `SHORT`
batches, disputes (`SettlementBatchStatus.DISPUTED`, doc 49). *The integrations
a real business needs* — a real licensed rail for collection and a real payout
report for settlement, not a status enum. *The policy layer* — the write-off
threshold (`FinanceSettlementWriteoffApprovalThresholdMinor`) and the agreed fee
rate (`SettlementProvider.expectedFeeBps`), both data, both versioned by the rows
that used them.

**The actor with three tables** — the paying customer is a `Contact` on the
`Order`; the licensed entity is a `SettlementProvider` configuration row, not a
counterparty (doc 49's own answer); the SME is the tenant itself.
**The principal with no permission key** — the rail's callback: authenticated by
its own documented scheme, verified before trust, **refused unless proven**
(§3 Fix 1); the settlement webhook likewise. Neither holds a
`PERMISSION_CATALOG` key; each can only move one payment's or one batch's
status.
**The grant that ends itself** — the SME's rail credentials end when the rail
revokes them (calls fail, the circuit opens, the option hides); a
`SettlementProvider` set `isActive: false` stops new expectations.
**Whose rows, and which columns** — payment detail: `payments.approve` and
`orders.manage` holders as today; settlement: `finance.settlement.view`; the
rail credentials are write-only.
**The threshold nobody approves alone** — accepting a `SHORT` shortfall as a
loss above `FinanceSettlementWriteoffApprovalThresholdMinor` needs
`finance.settlement.approve_writeoff` held by someone other than the requester
(`SettlementsService.approveWriteoff()`, built); recording a refund above the
same threshold follows the credit-note maker-checker shape (WO-175.7).
**The toxic pair, caught at grant or at act** — `finance.settlement.reconcile` +
`finance.settlement.approve_writeoff`: refused at the act by
`approveWriteoff()`'s distinct-actor check (doc 49, built), the same enforcement
point, unchanged.
**Authority and blast radius** — who may enable the rail for a tenant: the
Build Manifest's `PAYMENT_PROVIDERS` (NEWAX hosting operations, doc 171) plus the SME's
own credential entry (`settings.manage`); who may change `expectedFeeBps`:
`finance.settlement.reconcile`, audited evidence-class with old and new value;
the worst value is a fee rate set so high every short batch reads `CONFIRMED` —
caught because the rate is compared on every batch against the rail's own
reported fee lines, and a mismatch is itself a named variance.
**Audience is a capability, not an address** — a `SHORT` batch notifies holders
of `finance.settlement.reconcile` (doc 49's own answer); zero holders → holders
of `finance.settlement.view`, then the tenant's `billingContactEmail`; many →
one action-hub item.
**Request or record — classify every write** — a payment initiation is a
REQUEST (refusable: rail down, amount invalid); a verified callback is a RECORD
(the rail says it happened; this platform classifies, never refuses a verified
one); an unverified callback writes nothing; a settlement confirmation is a
RECORD (doc 49); a write-off is a REQUEST above threshold.
**The movement with no address** — `Payment` has no `locationId`; the `Order` it
settles carries `locationId` (null for web orders, the brand's default by
reading). A payout report that names branches sets the batch's scope; one that
does not is recorded at the tenant level and named undimensioned (doc 49's own
answer).
**Four hours down, the counter stays open** — the rail down: the circuit opens,
the option is hidden, cash and bank transfer still work (doc 38's matrix row).
This platform down: the rail keeps settling to the SME's bank; callbacks the rail
retries arrive late and are applied idempotently ("Callbacks can arrive twice;
the first one wins", `payments.service.ts`); a callback the rail stops retrying
is recovered by polling the rail's payment status for `PENDING` payments older
than 30 minutes (WO-175.4), never lost.
**The unwritten posting rule** — `PaymentSucceeded` → Dr `1000` Cr `1100`
(existing, `findPostedEntry('payment.succeeded', paymentId)`);
`SettlementShortfallWrittenOff` → Dr `5700` Cr `1000` (existing,
`findPostedEntry('settlement.shortfall_written_off', batchId)`); a partial refund
→ proportional reversal (WO-175.6). The rail's agreed fee (expected shortfall) —
**today posts nothing**: a `CONFIRMED` net batch leaves the fee inside `1000`.
Named: a fee posting (Dr a payment-fees expense account — none of the 29 accounts
in `accounting/chart-of-accounts.ts` is one / Cr `1000`) is part of the clearing-account ADR (§5.3), not
invented here.
**Every column or none** — the write-off line sets `organizationId`/
`retailBrandId`/`branchNodeId` from the batch's own scope (doc 49); every pilot SME
is one brand, one node, so these default to the tenant's own; declared
undimensioned otherwise.
**The period that already moved** — a payout confirmed into a closed period
posts its write-off to the next open period with the original date retained
(doc 49, `resolveOpenPeriod()` behaviour).
**The second legal entity** — one tenant, one legal entity, one set of rail
credentials; a second entity is a second tenant.
**Dry run before live** — the connector's setup screen runs `reconcileBatch()`
against the rail's sandbox reference before `SettlementProvider.isActive` is set
(doc 49's own answer); the provider's `initiate()` is exercised against the
rail's sandbox in the demo (doc 178).
**Click the number** — a batch's figures link to its `SettlementBatchLine`s and
their `Payment`s (doc 49); the forecast's `cashInTransitMinor` links to the
`EXPECTED` batches that make it up.
**Three silhouettes, and the day the tier above appears** — Solo: one merchant
account. Chain: branches' takings pooled into one payout — the batch is
tenant-level. Organization: out of pilot scope.
**The absent collaborator** — `settlements` off (it is `offByDefault`): payments
still work and post; no reconciliation, and the forecast reports no in-transit
figure, saying so. `accounting` off: payments still record; nothing posts; the
forecast's cash comes from an observed bank balance (doc 173 §4.3). The rail
absent from `PAYMENT_PROVIDERS`: the option does not exist.
**The second copy of the write** — `Payment.reference @unique`;
"the first one wins" on a duplicate callback; `SettlementBatch
@@unique([settlementProviderId, externalBatchRef])`; `SettlementBatchLine
@@unique([batchId, paymentId])`; posting keyed by `findPostedEntry`.
**The hundred-thousandth row** — one `Payment` per paid document and one batch
per payout day: a busy SME ~50,000 payments/year, 365 batches; the reconciliation
report reads `SettlementBatchLine` by `[batchId]`.
**The adoption test** — `Payment.reference` is generated by the provider from the
order number, which `documentNumber()` already folds node identity into; no new
counter.
**The reversal document, not the reversal flag** — a refund is its own recorded
fact against the `Payment` (`refundAmount`, `refundedAt`) and posts a reversal,
never an edit of the receipt; a corrected settlement updates the same batch with
an audit trail of old and new `settledAmountMinor` (doc 49).
**The undo fan-out** — a refund fires `PaymentRefunded` → the ledger reversal
(automatic, WO-175.6), the customer notification (automatic, existing), the
rail-side money movement (human — the SME in the rail's portal), and the next
payout's netting (automatic, observed through the connector).
**The version stamp** — `expectedFeeBps` and the write-off threshold in force are
stored with each batch's reconciliation; a later rate change never reclassifies a
reconciled batch.
**The erasure the ledger cannot obey** — `Payment.meta` holds the rail's raw
callback payload, which may carry a payer name or masked card; on a `Contact`
erasure it is pseudonymised in place (ruling 1); `JournalLine.contactId` keeps
its tombstoned reference.
**The failure path, and who is allowed to walk it** — an unverified callback:
refused, logged, nothing written; a `PENDING` payment with no callback: the
status poll (WO-175.4) or `payments.approve` holders see it; an `EXPECTED` batch
past its window: listed on `/admin/settlements` (`finance.settlement.reconcile`)
with the poll's last error, retried by `pollExpectedBatches()`, which is safe by
the batch's unique key.

**Catalogue lenses this capability reaches:**
*Reconciliation with nothing to reconcile against* — answered for gateway
payouts by `SettlementBatch`; still open for bank statement lines (doc 169
§3.5).
*The receipt that doesn't find its bill* — a payment is tied to its `Order`
(`Payment.orderId`); to an `Invoice` only after WO-175.9.
*Which tier owns the credential* — the SME tenant's own database, encrypted;
never the control plane, never NEWAX's hosting operations.
*Delivery is a fact, not a hope* — a payout is a fact only when the connector
reports it; an expectation is never shown as settled.

## Work orders

**WO-175.1 — Fail-closed callback verification** (precondition): the service
check, JazzCash/Easypaisa returning `verified: true`, the new spec case.
**WO-175.2 — Provider labels as translation keys** across all six providers
and the storefront method picker; `ar.json` entries.
**WO-175.3 — The first PSP's `PaymentProvider`** — the PSP NEWAX selects for its
UAE entry — against that PSP's sandbox, behind the `CircuitBreaker`, credentials
entered by the SME (`settings.manage`), encrypted. Each further PSP is a repeat
of this work order, never a change to the interface.
**WO-175.4 — Pending-payment status poll** for callbacks that never arrive.
**WO-175.5 — Cash in transit** in `LiquidityForecastService` (§5.3).
**WO-175.6 — Partial-refund posting**: `onPaymentRefunded()` reverses
`refundAmount` proportionally; spec with a 30% refund.
**WO-175.7 — Refund maker-checker above threshold**, mirroring
`CreditNotesService.approve()`.
**WO-175.8 — The first PSP's `FinancialInstitutionConnector`**,
`SettlementProvider.expectedFeeBps`, the settlement lag column, and
`SettlementExpectationCron`; the signed settlement webhook if the PSP offers
one.
**WO-175.9 — `Payment.invoiceId`** (R18), sequenced after Wave 2's invoicing
migration; every payment consumer reviewed.
**WO-175.10 — ADR for a payment-clearing account** (named, §5.3): opened in
`DECISIONS.md`, not decided by this program.

## Acceptance

- A callback whose provider returns no `verified` field is refused and writes
  nothing; a forged PSP callback is refused; a genuine one marks the payment
  `PAID` exactly once even if delivered three times.
- An AED payment's row reads `currency: 'AED'`.
- A payout short by exactly `expectedFeeBps` is `CONFIRMED`; short by more is
  `SHORT` and appears on the reconciliation screen with its lines; nothing
  auto-resolves it.
- After a PAID gateway payment whose batch is still `EXPECTED`, the forecast's
  `currentCashMinor` excludes it and `cashInTransitMinor` includes it; after the
  batch is `CONFIRMED`, it moves into current cash.
- A 30% refund reverses 30% of the receipt and the sale in the ledger.
- No code path in this program writes a payment into, or reads funds from, any
  account the SME did not register with the licensed entity — reviewed against
  §4's table, and no `wallet` entry appears in any program tenant manifest.
- The PSP integrated first is reached only through `PaymentProvider` and
  `FinancialInstitutionConnector`: outside its own provider and connector
  classes, its key appears only as data (the `PAYMENT_PROVIDERS` allowlist, its
  `SettlementProvider` row, its message keys) — never in a conditional.

## Out of scope

Lending, cash advances and working-capital products (doc 49's own
out-of-scope). Stored value, wallets and escrow (§4) — NEWAX becoming a money
transmitter, payment institution or wallet issuer for this program in any form. Paying suppliers from this
platform (autonomous payment execution — a non-goal, doc 178; ISO 20022 pain.001
generation is named in doc 169 §9 and not built). Card data handling of any kind.
The clearing-account posting change (its own ADR). Choosing which licensed PSP(s)
to integrate per market, and their licence categories (NEWAX's commercial choice
and the PSP's own facts, not this document's).
