# 155 — Wallet: Newax-issued store credit, settling merchants as an ordinary trade payable, never third-party fund custody

> **Status: shipped (2026-09-25), WO-155.1–155.5. WO-155.0 remains an open
> item — see DECISIONS.md.** Schema (`apps/api/prisma/schema/wallet.prisma`,
> additive — `invoicing.prisma` untouched, since doc 145's own `CreditNote`/
> `DebitNote` was being built in that same file by a different agent in
> parallel), `WalletService`/`MerchantPayableService`
> (`apps/api/src/modules/wallet/`), permissions
> (`finance.wallets.adjust`/`.adjust.approve`,
> `finance.merchant-payables.dispute`, seeded to `STAFF`/`ADMIN`), full
> spec coverage (`wallet.service.spec.ts`, `merchant-payable.service.spec.ts`,
> `wallet-credit-note.port.spec.ts`,
> `apps/api/src/modules/accounting/wallet-posting-rules.subscriber.spec.ts`),
> and UI (`/account/wallet`, `/admin/wallet`, `/admin/merchant-payables`)
> all exist and are tested. **Shipped module-off**: `wallet` is registered
> in `modules.registry.ts` with `offByDefault: true` and is in no
> deployment's `MODULES` — WO-155.0's own legal confirmation (closed-loop
> design, merchant-agreement characterisation) has not been recorded, per
> the owner's own explicit instruction not to make this live without it.
> `WalletService.placeOrderWithWalletCredit()` is built and directly
> tested but is **not** wired into `orders`/`cart`'s live checkout path —
> the connection point is named in the service's own header comment, for
> a human to wire once WO-155.0 clears. §3's REDEEM-branch refund
> correction runs against a `CreditNoteService` port
> (`wallet-credit-note.port.ts`) bound to a real, tested interim
> implementation (`MerchantPayableAdjustmentCreditNoteService`) rather
> than doc 145's own `CreditNote` model, which did not exist in
> `invoicing.prisma` when this was built — rebind it once doc 145 ships.
> See `docs/implementation/DECISIONS.md`'s ADR-034 for the full record,
> including every deliberate deviation from this document's own literal
> Prisma snippets.

## Read this section first — the structure changed, and here is exactly why that matters

The original design (still visible in this document's own git history) had
customers pay into a per-merchant *escrow* balance the platform held and
later released to that specific merchant — functionally custody of a
third party's money, which is why it opened with a hard block on going
live before SBP-style licensing was resolved. **The owner revised the
structure directly: customer payments settle into Newax's own bank
account only, in exchange for Newax-issued store credit; a merchant is
then paid what Newax owes them as an ordinary trade payable, not as a
release of money that was always theirs.** This is a real, materially
different, and commonly-used structure — it is closer to how a shopping
mall's own gift card works (redeemable at any store in the network,
issued and sold by the mall operator itself, with the mall settling each
store separately out of its own funds) than to a marketplace escrow.

**Why this genuinely reduces the specific risk named before:** the first
transaction (customer buys credit, pays Newax) is an ordinary sale of a
company-issued product — money customer pays *to* Newax *for* Newax's own
credit, not money Newax holds *on behalf of* someone else. The second
transaction (Newax pays a merchant what it owes them for redeemed
credit) is an ordinary trade payable — the identical legal shape as
`SupplierBill` (doc 145) paying any other vendor for goods received,
already a normal, unregulated part of running a business. Neither leg,
on its own, is "holding a third party's funds in trust for disbursement,"
which was the specific activity that raised the PSO/PSP question.

**What does not disappear, and needs a lighter-touch confirmation rather
than a full block:** (1) whether this credit is *closed-loop enough* —
redeemable only within Newax's own merchant network, never convertible
back to cash by the customer, never transferable between customers — to
sit outside SBP's own definition of a regulated prepaid instrument (many
frameworks, including SBP's, treat a genuinely closed-loop, non-cashable
voucher differently from open-loop e-money, but "genuinely closed-loop"
is a real design constraint this document must actually honor, not just
assert); and (2) whether Newax's own relationship to each merchant is
correctly documented (a merchant agreement stating Newax buys/facilitates
on these terms) so the trade-payable characterization holds up, which
also has its own tax/invoicing "who is the seller of record" question
distinct from the payments question. **These are real but narrow
questions a lawyer can confirm quickly against a concrete design — this
document is written to make that confirmation fast, not to declare it
already settled.** `DECISIONS.md` should still record the outcome before
this handles real money, per this repository's own standing rule for a
decision of this weight — a lighter WO-155.0 than before, not a removed
one.

## 1. One wallet type now, not two — money never sits in a per-merchant balance

```prisma
enum WalletEntryType {
  PURCHASE             // customer buys credit — real money into Newax's own bank account, booked as deferred revenue
  RESERVE              // credit earmarked against a specific order at checkout — not yet spent
  REDEEM               // the earmark converts to an actual spend, exactly when the merchant confirms the order
  RELEASE_RESERVATION  // the merchant does not confirm (rejects, expires) — the earmark returns to available, unspent
  REFUND               // reverses a PURCHASE or a REDEEM
  ADJUSTMENT           // a manual, always-approved, always-reasoned correction
}

model WalletAccount {
  id             String  @id @default(cuid())
  organizationId String
  customerId     String   // Party/Contact — the ONLY owner type now; no merchant-side wallet exists
  currency       String  @default("PKR")
  status         WalletAccountStatus @default(ACTIVE)

  entries WalletEntry[]

  @@unique([organizationId, customerId])
}

enum WalletAccountStatus { ACTIVE  FROZEN  CLOSED }

/// Append-only, exactly as before — a correction is a new, opposite
/// entry, never an edit.
model WalletEntry {
  id           String   @id @default(cuid())
  accountId    String
  type         WalletEntryType
  amountMinor  Int      // always positive; direction implied by `type`
  orderId      String?
  sourceRef    String   // idempotency key — a Payment.id, an Order.id, never a re-derived string
  createdAt    DateTime @default(now())

  account WalletAccount @relation(fields: [accountId], references: [id])

  @@unique([accountId, type, sourceRef])
  @@index([accountId, createdAt])
}
```

```ts
async availableBalance(accountId: string): Promise<number> {
  // PURCHASE - RESERVE + RELEASE_RESERVATION - REFUND(on PURCHASE) ± ADJUSTMENT
  // — REDEEM does not further reduce availableBalance beyond what its own
  // RESERVE already did; it only converts an already-reserved amount from
  // "earmarked" to "actually spent," which is exactly why REDEEM needs no
  // separate availability flag the way the old design's HELD/AVAILABLE
  // split did — a reservation already removed the amount from what a
  // customer could double-spend.
}
```

`PURCHASE` is real money landing in Newax's own bank account through the
existing `Payment` model, unchanged (`provider: 'jazzcash' | 'easypaisa' |
'card' | ...` — any tender). It is booked in `accounting` as **deferred
revenue** (a liability — Newax owes the customer either goods or a
refund, not yet earned revenue), the identical accounting treatment any
gift-card issuer already uses, converting to recognized revenue only as
the customer's credit is actually redeemed — never recognized as Newax's
own income at the moment of purchase, which would misstate Newax's own
P&L for money it may still owe back.

## 2. Checkout: reserve at order placement, redeem only at merchant confirmation

```ts
async placeOrderWithWalletCredit(customerId: string, orderId: string, amountMinor: number): Promise<void> {
  // Refuses if availableBalance() < amountMinor — never an overdraft.
  // Creates a RESERVE entry. The customer's own available balance drops
  // immediately (so they cannot spend the same credit twice on two
  // orders), but nothing is yet owed to any merchant — this is still
  // entirely Newax's own liability to the customer at this point.
}

async onMerchantConfirmed(orderId: string): Promise<void> {
  // Converts the RESERVE into a REDEEM (same amount, sourceRef = orderId
  // — @@unique prevents a double-redeem of one reservation). THIS is the
  // exact moment named in the owner's own words: "deducted upon merchant
  // confirmation." It ALSO creates the MerchantPayable (§3) — the two
  // happen in one transaction, since a redeemed credit and a merchant's
  // own earned payable are the same fact viewed from two sides.
}

async onMerchantDeclinedOrExpired(orderId: string): Promise<void> {
  // Creates a RELEASE_RESERVATION for the same amount — the customer's
  // own available balance is restored exactly as if the order had never
  // been placed, since the merchant never actually earned anything.
}
```

## 3. Merchant settlement — an ordinary trade payable, generalizing doc 145's own `SupplierBill`, never an escrow release

```prisma
// additive — invoicing.prisma or a new merchant-settlement.prisma
enum MerchantPayableStatus { OPEN  SCHEDULED  PAID  DISPUTED }

/// The exact mirror of doc 145's own AP side (SupplierBill) — a merchant
/// selling through this platform is, for settlement purposes, a vendor
/// Newax owes money to, never a party whose own money Newax was ever
/// holding.
model MerchantPayable {
  id             String  @id @default(cuid())
  organizationId String  // the MERCHANT's own tenant id — what Newax owes THIS merchant
  orderId        String  @unique
  grossMinor     Int     // the REDEEM amount from §2
  platformFeeMinor Int   // doc 153's own transaction fee, computed at redemption
  netPayableMinor  Int   // grossMinor - platformFeeMinor — what Newax actually owes
  status         MerchantPayableStatus @default(OPEN)
  scheduledPayoutAt DateTime?
  paidAt         DateTime?

  @@index([organizationId, status])
}
```

```ts
async createMerchantPayable(orderId: string, grossMinor: number, merchantOrgId: string): Promise<void> {
  const feeMinor = Math.round(grossMinor * plan.transactionFeeBps / 10_000); // doc 153, netted here — unchanged intent
  await this.merchantPayables.create({
    organizationId: merchantOrgId, orderId, grossMinor,
    platformFeeMinor: feeMinor, netPayableMinor: grossMinor - feeMinor,
  });
}

async schedulePayoutRun(merchantOrgId: string): Promise<Date> {
  const verified = await this.identityVerification.isApproved(merchantOwnerUserId); // doc 18, unchanged
  // Verified: the NEXT payout run (as soon as operationally possible —
  // "a small merchant may need that money to fulfil it," the owner's own
  // original reasoning, preserved exactly, just triggering a scheduled
  // AP payment run instead of an instant wallet release.
  // Unverified: held until the CUSTOMER's own doc 07 "confirm receipt"
  // action fires, per the owner's own original fallback.
}
```

This is doc 145's own `SupplierBill`/AP-aging mechanism, reused rather
than reinvented — `MerchantPayable` is paid out through whatever batch
payment-run mechanism this repository's own AP side already uses
(a bank transfer batch, per doc 145's own aging/payment-terms design),
never a real-time, per-order money movement. The owner's own original
"verified merchants get paid faster" intent survives intact — it now
controls *how soon a payable enters a payment run*, not *whether an
escrow balance unlocks*.

## Scope lenses

**The actor with three tables** — `WalletAccount.customerId` is a
`Party`/`Contact`; `MerchantPayable.organizationId` is a merchant tenant,
never a `User` in either case.
**The principal with no permission key** — n/a: every action is by an
authenticated `Contact` (purchase/spend) or `User` (payout-run
processing, adjustment).
**The grant that ends itself** — `WalletAccountStatus = FROZEN` stops all
new `RESERVE`s immediately; `MerchantPayableStatus = DISPUTED` pauses a
specific payable's own inclusion in the next payout run without touching
any other payable.
**Whose rows, and which columns** — a customer sees only their own
wallet; a merchant sees only their own `MerchantPayable` rows, scoped by
`organizationId` exactly like `SupplierBill` already is — no cross-
visibility exists between a customer's wallet and any merchant's own
payable rows beyond the `orderId` linking one `REDEEM` entry to one
`MerchantPayable`.
**The threshold nobody approves alone** — a manual wallet `ADJUSTMENT`
above a configurable value requires `finance.wallets.adjust.approve`,
distinct from `.adjust`, identical to the prior design; marking a
`MerchantPayable` `DISPUTED` (pulling it from a payout run) requires
`finance.merchant-payables.dispute`, logged with the specific reason.
**The toxic pair** — the staff member creating a manual `ADJUSTMENT` or
resolving a `DISPUTED` payable is never its own approver, identical to
every other self-approval refusal in this document set.
**Authority and blast radius** — who counts as "verified" for payout-run
speed is never a manual override — it reads doc 18's own
`IdentityVerification.status` directly, unchanged from the prior design's
own answer to this exact lens.
**Audience is a capability, not an address** — a customer is notified on
every `PURCHASE`/`REDEEM`; a merchant is notified when a `MerchantPayable`
is created and again when it's actually paid — both through doc 24's
existing `NotificationsService`.
**Request or record** — `placeOrderWithWalletCredit()` is a REQUEST
(refusable — insufficient balance); once a `WalletEntry`/`MerchantPayable`
is written, both are RECORDS, immutable — a correction is always a new
entry or a status transition, never an edit to an existing row.
**The movement with no address** — n/a: no stock movement; every entry/
payable inherits its own account's/order's `organizationId`.
**Four hours down** — a wallet-funded order placed during an outage
degrades to the same manual-fallback-then-reconciliation answer every
physical-event document in this set already gives, `sourceRef`'s own
idempotency key preventing a double-entry on re-entry.
**Click the number** — a merchant's own payout screen shows every
`MerchantPayable`, its own `orderId`, gross/fee/net breakdown, and status
— never an opaque lump-sum deposit with no per-order trace.
**The unwritten posting rule** — `PURCHASE` posts Dr Cash/Bank, Cr
Deferred Revenue (a liability); `REDEEM` posts Dr Deferred Revenue, Cr
Recognized Revenue *and* Dr Cost of Goods Sold-equivalent/Cr Accounts
Payable for the `MerchantPayable` amount — the identical
`findPostedEntry(source, sourceRef)` idempotent-posting discipline every
other document in this set already requires, applied to a two-sided
entry (revenue recognition + a new payable) instead of one.
**Every column or none** — every entry/payable sets `organizationId`
(and, for `MerchantPayable`, whatever `retailBrandId` the merchant's own
tenant record carries) — never undimensioned where a real dimension
exists.
**The period that already moved** — a `REDEEM`/`MerchantPayable` dated
into a `CLOSED` fiscal period posts into the current open period instead,
identical to every other posting rule's own answer.
**The second legal entity** — a `MerchantPayable` is scoped to one
merchant tenant's own `organizationId`; Newax's own deferred-revenue
liability lives in Newax's own books (`apps/platform`), never mixed into
any tenant's own chart of accounts.
**Dry run before live** — `availableBalance()` and a payout-run preview
(what would this run actually pay, to whom, net of fees) are both pure
reads with no write, called before a real payment run executes.
**Three silhouettes** — Solo/Chain: a single-tenant deployment has no
"merchant payable to a different merchant" concern at all — this
mechanism is meaningful only where Newax's own multi-tenant platform
mediates payment between a customer and an independent merchant tenant
(doc 39's own shared-hosting scale). Organization/shared-hosting: the
real case this document exists for.
**The absent collaborator** — with the wallet module off, every order
settles through the existing direct payment path (a merchant's own
payment gateway account, untouched by any of this) — entirely additive.
**The second copy of the write** — `@@unique([accountId, type,
sourceRef])` and `MerchantPayable.orderId @unique` are the entire
idempotency guarantee — a retried purchase, a redelivered confirmation
event, a re-run payout-scheduling call all become no-ops against an
already-written row.
**The hundred-thousandth row** — both tables indexed for their own real
query patterns (`[accountId, createdAt]`, `[organizationId, status]`),
bounded by real transaction volume, never unbounded.
**The reversal document** — a `REFUND` entry reverses a `PURCHASE` (the
customer gets real money back, reversing Newax's own deferred-revenue
liability) or, if already `REDEEM`ed, requires a corresponding
`CreditNote`-style correction against the `MerchantPayable` it already
created (doc 145's own `CreditNote`/`DebitNote` mechanism, reused here
rather than invented twice) — named explicitly rather than left
implicit.
**The undo fan-out** — reversing a `MerchantPayable` already `PAID` (real
bank money already sent) does not claw back automatically — it creates a
negative balance the merchant owes back, surfaced to doc 145's own
receivables/dunning mechanism, identical to the prior design's own answer
to this lens.
**The version stamp** — a `transactionFeeBps` (doc 153) change applies
only to payables created after the change; an already-`PAID` payable is
never recalculated under a new rate.
**The erasure the ledger cannot obey** — `WalletAccount.customerId` holds
a person; on deletion, follows the same basis every other financial
record in this document set states — retained as a financial record,
pseudonymised where the basis allows, never deleted while a non-zero
balance or an open `MerchantPayable` still references it.
**The failure path** — `onMerchantConfirmed()`'s own two writes (the
`REDEEM` entry and the `MerchantPayable` creation) are wrapped in one
transaction — both commit or neither does, never a redeemed credit with
no corresponding payable, or a payable with no corresponding redemption.

## Work orders

**WO-155.0 (a lighter confirmation, not a block)** — confirm with real
counsel that (a) the store credit as designed is genuinely closed-loop
(never cash-out-able, never customer-to-customer transferable) and (b)
the merchant agreement correctly documents Newax's own buyer/facilitator
role for the trade-payable characterization to hold, then record the
outcome in `DECISIONS.md`.
**WO-155.1 — schema**: `WalletAccount`, `WalletEntry`,
`WalletEntryType`, `WalletAccountStatus`, `MerchantPayable`,
`MerchantPayableStatus`, forward-only migration.
**WO-155.2 — `WalletService`**: `purchaseCredit()`,
`placeOrderWithWalletCredit()`, `onMerchantConfirmed()`,
`onMerchantDeclinedOrExpired()`, `refund()`, `adjustment()`.
**WO-155.3 — `MerchantPayableService`**: `createMerchantPayable()`,
`schedulePayoutRun()` (reading doc 18's `IdentityVerification` for
timing, unchanged), `processPayoutRun()` reusing doc 145's own AP
payment-run mechanism.
**WO-155.4 — permissions**: `finance.wallets.adjust/.adjust.approve`,
`finance.merchant-payables.dispute`, seeded to real, narrow roles.
**WO-155.5 — UI**: a customer-facing wallet balance/purchase/history
screen (doc 07); a merchant-facing payable/payout screen (doc 145's own
supplier-bill-style screen, generalized).

## Acceptance

- `availableBalance()` correctly drops on `RESERVE`, is unaffected by
  `REDEEM`, and is restored by `RELEASE_RESERVATION`, proven by a spec
  covering all three transitions.
- `onMerchantConfirmed()`'s own `REDEEM` entry and `MerchantPayable`
  creation either both commit or neither does, proven by a spec forcing
  a mid-transaction failure.
- A verified merchant's `MerchantPayable` enters the next payout run
  immediately on order confirmation; an unverified merchant's waits for
  the customer's own receipt confirmation, proven by a spec exercising
  both paths.
- A retried `purchaseCredit()`/`onMerchantConfirmed()` call with the same
  `sourceRef`/`orderId` produces no duplicate entry or payable.

## Out of scope

Interest or yield on a wallet balance — its own separate regulatory
question, not addressed here. Cross-wallet transfers between customers —
would also work against the closed-loop, non-transferable characterization
WO-155.0 depends on, so deliberately not built. Real-time, per-order
merchant payout (paying a merchant the instant their payable is created)
— named in §3 as a deliberate change from the prior design; settlement is
batched through doc 145's own existing AP payment-run cadence.
