# 155 — Wallet: one ledger primitive, two owners — customer stored value and merchant payout escrow

## Read this section first — a real regulatory question, not an engineering one

Before any of this ships: **holding a customer's payment and later paying
it out to an independent third-party merchant is, in Pakistan, very
plausibly a regulated activity** — functionally the definition of a
Payment System Operator / Payment Service Provider under SBP's PSO/PSP
Rules, or an e-money-issuance question, depending on exact structure.
This is the identical caution doc 15 already states for FBR's own
invoice payload — "get the actual requirements from an accountant or the
authority's own documentation before building" — applied here to a
licensing question whose wrong answer is not a bug, it is Newax operating
outside the law. **This document specifies the mechanism; it does not
authorize going live with it.** Two real paths exist and the choice
between them is a legal decision, not this document's to make:

1. **Newax becomes the fund custodian itself** — requires real
   authorization from SBP (or a partnership/sponsorship arrangement with
   an already-licensed bank or PSP that provides it), full compliance
   obligations (safeguarding customer funds, reporting, capital
   requirements) that are entirely outside this repository's own scope.
2. **Route the hold-and-disburse function through an already-licensed
   marketplace-payments intermediary** (the same problem Stripe
   Connect/Adyen for Platforms exist to solve for exactly this reason —
   a licensed party sits in the custody chain so the platform itself
   never needs its own PSO/PSP license) — a real, credible, and likely
   faster path to the same customer/merchant experience.

**WO-155.1, the schema and services below, ships as a build-ready design.
No `WalletAccount` holds real customer money in production, and no
payout releases to a real merchant bank account, until whichever path
above is confirmed with actual counsel and reflected in a `DECISIONS.md`
entry.** Everything else in this document is written so that decision
can be made with a concrete design in hand, not made blind.

## 1. One ledger primitive, never two competing ones

A customer's stored-value balance and a merchant's held-then-released
payout are the same underlying shape — an append-only ledger of credits
and debits against an account, with a running balance never stored
directly (always derived, so it can never drift) — the identical
"append-only, derived balance" discipline this repository already applies
to `AttendanceEvent`→`classifyDay()` and `StockMovement`→
`VariantLocationStock`. One model serves both owners; nothing here is
built twice.

```prisma
enum WalletOwnerType { CUSTOMER  MERCHANT }
enum WalletEntryType {
  TOPUP              // customer funds their own wallet (any tender, including card)
  ORDER_PAYMENT       // a customer's order payment lands here before settlement
  ORDER_PAYMENT_HOLD  // the merchant-side credit is HELD, not yet available
  ORDER_PAYMENT_RELEASE // the hold above becomes available (release trigger fired)
  SPEND               // a customer pays for an order FROM their own wallet balance
  PAYOUT              // a merchant withdraws an available balance to their bank
  PLATFORM_FEE        // doc 153's own transaction fee, netted at payout
  REFUND              // reverses a prior ORDER_PAYMENT/SPEND
  ADJUSTMENT          // a manual, always-approved, always-reasoned correction
}

model WalletAccount {
  id             String  @id @default(cuid())
  organizationId String
  ownerType      WalletOwnerType
  /// customerId (Party/Contact) when ownerType=CUSTOMER; the tenant's own
  /// organizationId's own merchant record when ownerType=MERCHANT — never
  /// the same id space, never confusable by type alone.
  ownerId        String
  currency       String  @default("PKR")
  status         WalletAccountStatus @default(ACTIVE)

  entries WalletEntry[]

  @@unique([organizationId, ownerType, ownerId])
}

enum WalletAccountStatus { ACTIVE  FROZEN  CLOSED }

/// Append-only. Never updated, never deleted — a correction is a new,
/// opposite-signed entry, the identical "a record is never erased, only
/// superseded" discipline every financial document in this repository
/// already follows.
model WalletEntry {
  id             String   @id @default(cuid())
  accountId      String
  type           WalletEntryType
  amountMinor    Int      // always positive; direction is implied by `type`, never a signed amount a reader must interpret
  /// HELD entries do not count toward the account's own AVAILABLE
  /// balance until a matching ORDER_PAYMENT_RELEASE entry exists — the
  /// entire escrow mechanism is this one distinction, never a second
  /// status field on the account itself.
  availability   WalletEntryAvailability @default(AVAILABLE)
  orderId        String?
  sourceRef      String   // the idempotency key — a Payment.id, a Refund.id, never a re-derived string
  createdAt      DateTime @default(now())

  account WalletAccount @relation(fields: [accountId], references: [id])

  @@unique([accountId, type, sourceRef])
  @@index([accountId, createdAt])
}

enum WalletEntryAvailability { AVAILABLE  HELD }
```

```ts
async availableBalance(accountId: string): Promise<number> {
  // Σ credits (AVAILABLE only) - Σ debits, for this account — computed
  // from WalletEntry every time, never a stored, driftable column,
  // identical to how VariantLocationStock is the sum of StockMovement
  // rather than a maintained counter that could disagree with it.
}
```

## 2. The customer side: ordinary stored value, the simpler and lower-risk half

```ts
async topUp(customerId: string, amountMinor: number, paymentId: string): Promise<void> {
  // A real Payment (any tender, INCLUDING card) settles through the
  // EXISTING payment path (payments.prisma, unchanged) — this creates
  // exactly one WalletEntry { type: TOPUP, availability: AVAILABLE,
  // sourceRef: paymentId }. @@unique([accountId, type, sourceRef])
  // makes a retried top-up call a no-op, never a double credit.
}

async spendFromWallet(customerId: string, orderId: string, amountMinor: number): Promise<void> {
  // Refuses if availableBalance() < amountMinor — never an overdraft.
  // Creates a SPEND entry; the order's own Payment row is created with
  // provider: 'wallet', reusing the EXISTING Payment model, never a
  // parallel payment-recording path.
}
```

A customer wallet is, deliberately, the lower-regulatory-risk half of
this document: it is closer to a gift card / store-credit balance
(already named as a real capability in doc 05) than to custody of a
third party's funds — a customer spending their own pre-funded balance
on their own future purchase does not raise the same licensing question
as the platform holding one party's money to pay a *different* party.
**doc 05's own "store credit" line item is this exact mechanism** —
this document generalizes it into `WalletAccount`/`WalletEntry` rather
than building store credit as a second, separate balance type later.

## 3. The merchant side: the actual escrow mechanism, and where the regulatory question bites

```ts
async captureOrderPayment(orderId: string, amountMinor: number, merchantOrgId: string, paymentId: string): Promise<void> {
  // One HELD entry on the merchant's own WalletAccount, sourceRef = paymentId.
  await this.credit(merchantAccountId, 'ORDER_PAYMENT_HOLD', amountMinor, { orderId, sourceRef: paymentId, availability: 'HELD' });
}

async releaseToMerchant(orderId: string): Promise<void> {
  const heldEntry = await this.findHeldEntry(orderId);
  const feeMinor = Math.round(heldEntry.amountMinor * plan.transactionFeeBps / 10_000); // doc 153, netted here
  await this.debit(merchantAccountId, 'PLATFORM_FEE', feeMinor, { orderId, sourceRef: `fee:${orderId}` });
  await this.credit(merchantAccountId, 'ORDER_PAYMENT_RELEASE', heldEntry.amountMinor - feeMinor, { orderId, sourceRef: `release:${orderId}`, availability: 'AVAILABLE' });
}

async releaseTrigger(orderId: string): Promise<'MERCHANT_CONFIRMATION' | 'CUSTOMER_RECEIPT_CONFIRMATION'> {
  const merchantVerified = await this.identityVerification.isApproved(merchantOwnerUserId); // doc 18's own IdentityVerification, unchanged, reused exactly
  return merchantVerified ? 'MERCHANT_CONFIRMATION' : 'CUSTOMER_RECEIPT_CONFIRMATION';
}
```

**The release trigger, exactly as specified**: a merchant whose own
account-owner `User` has an `APPROVED` `IdentityVerification` row (doc
18, unchanged, no new KYC mechanism built) releases funds the moment they
confirm the order — "because a small merchant may need that money to
fulfil it," in the owner's own words. A merchant with no `APPROVED`
verification holds funds until the *customer* confirms receipt — the
slower, safer default for an unvetted counterparty. Doc 153's own 1%
transaction fee (`transactionFeeBps`) is netted out of the release
amount, exactly as doc 153 itself named as the preferred collection path
for any payment that passes through a wallet rather than settling as
cash — **this document is the mechanism that makes that netting
possible**, closing the gap doc 153 named honestly as unsolved for card
tenders at the time it was written.

## Scope lenses

**The actor with three tables** — a `WalletAccount` with
`ownerType: CUSTOMER` belongs to a `Party`/`Contact`; one with
`ownerType: MERCHANT` belongs to an `Organization`/tenant — never a
`User` directly in either case, and never confusable, since `ownerType`
is a required, non-nullable discriminator on every row.
**The principal with no permission key** — n/a: every wallet action is
performed by an authenticated `Contact` (customer top-up/spend) or an
authenticated `User` (merchant-side confirmation, staff-initiated
adjustment).
**The grant that ends itself** — `WalletAccountStatus = FROZEN` stops all
debits immediately (a fraud hold, a dispute); `CLOSED` is terminal, its
own remaining `AVAILABLE` balance paid out or refunded before closure,
never simply zeroed.
**Whose rows, and which columns** — a customer sees only their own
`WalletAccount`'s own entries; a merchant sees only their own; no shared
visibility exists between the two ledgers beyond the `orderId` linking a
specific `ORDER_PAYMENT`/`ORDER_PAYMENT_HOLD` pair, and even that link
never exposes one party's own account balance to the other.
**The threshold nobody approves alone** — a manual `ADJUSTMENT` entry
above a configurable value requires `finance.wallets.adjust.approve`,
distinct from `.adjust` — the identical amount-band-and-role split every
other money-adjacent mechanism in this document set already requires; an
early release override (releasing a `HELD` entry before its own trigger
condition is actually met) is its own, even more tightly gated action,
`finance.wallets.release.override`, logged with the specific reason.
**The toxic pair** — the staff member who creates a manual `ADJUSTMENT`
is never its own approver, identical to every other self-approval
refusal in this document set (doc 63, 145, 149, 152).
**Authority and blast radius** — who may change a merchant's own
release-trigger eligibility (i.e., who decides a merchant counts as
"verified") is never a manual override — it reads doc 18's own
`IdentityVerification.status` directly, so the only way to change it is
through doc 18's own real verification flow, never a `Setting` a support
agent could flip to fast-track a merchant's own payouts.
**Audience is a capability, not an address** — a merchant is notified the
moment funds move from `HELD` to `AVAILABLE`, and a customer is notified
on every `TOPUP`/`SPEND`, both through doc 24's own existing
`NotificationsService`, resolved from the account owner's own contact
record, never a hardcoded address.
**Request or record** — `topUp()`/`spendFromWallet()` are REQUESTS
(refusable — insufficient balance, a frozen account); once a
`WalletEntry` is written, it is a RECORD, immutable, exactly like every
other financial fact in this document set — a correction is always a new,
opposite entry, never an edit.
**The movement with no address** — n/a: a wallet entry carries no stock
movement; every entry inherits its own account's `organizationId`, and
an `orderId`-linked entry inherits that order's own `locationId` where
relevant for reporting.
**Four hours down** — a wallet-funded order placed during an outage
degrades to the identical manual-fallback-then-reconciliation answer
every other physical-event document in this set already gives — a
till operator records the sale on paper, the wallet debit is entered
once systems return, `sourceRef`'s own idempotency key preventing a
double-debit if the same sale is somehow entered twice.
**Click the number** — a wallet's own transaction history shows every
entry, its type, its `orderId` link, and its availability state — never
an opaque running total with no drill-down to what produced it.
**The unwritten posting rule** — a `WalletEntry` is itself a sub-ledger,
not the general ledger — `TOPUP`/`SPEND` still post through the existing
`Payment`/`Order` posting rules unchanged; `PLATFORM_FEE` posts as
Newax's own revenue in `apps/platform`'s own books (doc 153's own
citation), keyed by `findPostedEntry('WalletFee', orderId)`, never a
second, competing posting path.
**Every column or none** — every `WalletEntry` sets `organizationId`
(via its account) and, for a merchant account, whatever `retailBrandId`
that merchant's own tenant record carries — never left undimensioned
where a real dimension already exists.
**The period that already moved** — n/a directly to the wallet ledger
itself (it is not a GL, per "The unwritten posting rule" above); the
fee's own GL posting follows the identical closed-period refusal every
other posting in this document set already states.
**The second legal entity** — a `MERCHANT` wallet is scoped to one
tenant's own `organizationId`; two brands under one Organization-edition
account each get their own wallet, never a shared balance, per doc 111's
own cascade-without-merge answer.
**Dry run before live** — `availableBalance()` is already a pure,
side-effect-free read; a "what would this order's fee/net payout look
like" preview calls the identical arithmetic `releaseToMerchant()` uses,
with no write.
**Three silhouettes** — Solo/Chain: a single-tenant deployment has no
"merchant wallet" to speak of at all (there is only one merchant — the
deployment's own owner), so only the customer-side wallet is relevant.
Organization/shared-hosting (doc 39): the merchant-side escrow becomes
real, one `WalletAccount` per tenant, exactly the scale this mechanism
exists for.
**The absent collaborator** — with the wallet module off, every order
settles through the existing direct payment path unchanged — this
mechanism is entirely additive, never a required dependency of ordinary
checkout.
**The second copy of the write** — `@@unique([accountId, type,
sourceRef])` is the entire idempotency guarantee: a retried top-up, a
redelivered `OrderStatusChanged` event, a re-run release attempt — all
become no-ops against an already-written entry, never a duplicate credit
or debit.
**The hundred-thousandth row** — `WalletEntry` is indexed by
`[accountId, createdAt]`; volume is bounded by real transaction count,
never unbounded, and `availableBalance()`'s own aggregation is exactly
the shape doc 01's own weighted-average-cost computation already proves
scales at this repository's real data volumes.
**The reversal document** — a `REFUND` entry is the reversal document
this lens requires: it names the specific `ORDER_PAYMENT`/`SPEND` entry
it corrects via `sourceRef`, issuable for part of an order (a partial
refund), never a blanket "zero this order's wallet activity" adjustment
— the exact fix doc 24's own observed gap already named for
`PaymentsService.refund()`, generalized here.
**The undo fan-out** — reversing a `RELEASE` after a merchant has already
withdrawn the funds to their own bank (a `PAYOUT` entry already exists)
does not claw back real bank money automatically — it creates a negative
balance the merchant owes back, surfaced to doc 145's own receivables/
dunning mechanism (this same batch) rather than assumed automatically
recoverable.
**The version stamp** — a change to `transactionFeeBps` (doc 153) applies
only to orders released after the change; an order already `HELD` under
the old rate releases at the rate that was in effect when it was
captured, never silently recalculated.
**The erasure the ledger cannot obey** — `WalletAccount.ownerId`
(customer side) holds a person; on that customer's deletion, follows the
same basis every other financial record in this document set already
states — retained as a financial record, pseudonymised where the basis
allows, the balance itself never simply deleted while still non-zero.
**The failure path** — a `releaseToMerchant()` call that fails partway
(the fee-debit succeeds, the release-credit fails) is wrapped in one
database transaction — both entries commit together or neither does,
never a state where a merchant is charged the fee but never credited the
release.

## Work orders

**WO-155.0 (blocking, not engineering) — resolve the regulatory
question** stated at the top of this document, with real counsel, before
any of the following handles real customer money. Record the outcome as
a `DECISIONS.md` entry.
**WO-155.1 — schema**: `WalletAccount`, `WalletEntry`,
`WalletOwnerType`, `WalletEntryType`, `WalletAccountStatus`,
`WalletEntryAvailability`, forward-only migration.
**WO-155.2 — `WalletService`**: `topUp()`, `spendFromWallet()`,
`captureOrderPayment()`, `releaseToMerchant()`, `releaseTrigger()`
(reading doc 18's `IdentityVerification` unchanged), `refund()`,
`adjustment()` (with its own approval split).
**WO-155.3 — wire `releaseTrigger()`'s two paths**: a merchant-confirms-
order event (an existing or new order-acceptance action) for the
verified path; the customer-portal's own "confirm receipt" action (doc
07) for the unverified path.
**WO-155.4 — permissions**: `finance.wallets.adjust/.adjust.approve`,
`finance.wallets.release.override`, seeded to real, narrow roles.
**WO-155.5 — UI**: a customer-facing wallet balance/top-up/history
screen (customer portal, doc 07); a merchant-facing payout dashboard
(pending/held vs. available balance, payout history, the specific orders
behind each figure per "Click the number" above).

## Acceptance

- No real production wallet activity occurs before WO-155.0's own
  regulatory decision is recorded in `DECISIONS.md`.
- `availableBalance()` never counts a `HELD` entry, proven by a spec.
- A merchant with an `APPROVED` `IdentityVerification` releases on their
  own order confirmation; one without releases only on customer receipt
  confirmation, proven by a spec exercising both paths.
- `releaseToMerchant()`'s own fee-debit and release-credit either both
  commit or neither does, proven by a spec that forces a mid-transaction
  failure.
- A retried `topUp()`/`captureOrderPayment()` call with the same
  `sourceRef` produces no duplicate entry, proven by a spec.

## Out of scope

Interest or any yield on a held/available wallet balance — a real
regulatory and product question of its own (paying yield on customer
funds is its own licensing conversation) not addressed here. Cross-
wallet transfers (a customer sending balance to another customer, or a
merchant to another merchant) — no named requirement for this exists;
not built speculatively.
