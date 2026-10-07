# ADR-034 — The wallet module (doc 155) built in full, shipped module-off and checkout-disconnected pending WO-155.0's own legal confirmation

[← Decision log](../DECISIONS.md)


### Context

`docs/implementation/commercial-licensing-agency/155-wallet-stored-value-merchant-escrow.md`
specifies Newax-issued store credit (`WalletAccount`/`WalletEntry`,
PURCHASE → RESERVE → REDEEM/RELEASE_RESERVATION) settling a merchant as an
ordinary trade payable (`MerchantPayable`) — a structure the doc's own
opening section explains was deliberately revised from an earlier
per-merchant *escrow* design specifically to avoid the PSO/PSP question a
platform holding a third party's funds in trust would raise. The revised
structure genuinely reduces that specific risk (neither leg is "holding
someone else's money"), but the doc's own WO-155.0 still asks for a real
lawyer's confirmation, before this handles real money, that (a) the credit
is genuinely closed-loop and (b) the merchant agreement documents Newax's
own buyer/facilitator role. No agent can provide that confirmation. The
task that produced this entry carried an explicit, separate instruction
from the owner: build the full mechanism, but do not make it live.

Two further facts shaped the build:

- `apps/api/prisma/schema/invoicing.prisma` was being extended with
  `CreditNote`/`DebitNote` (doc 145) by a different, concurrent agent.
  Checked directly at build time: neither model existed yet in that file.
- This codebase has no separate `PaymentRun` batch-settlement entity —
  `PurchasingService.recordSupplierBillPayment()` settles one
  `SupplierBill` at a time. "The batch payment-run mechanism this
  repository's own AP side already uses" (doc 155 §3) has no literal
  batch-entity precedent to reuse.

### Options Considered

- **Build nothing until WO-155.0 clears.** Rejected — the owner asked for
  the mechanism built now, with the legal step tracked as the one
  remaining gate, not for the whole feature to wait on it.
- **Build everything and enable it by default.** Rejected outright — this
  is the one thing WO-155.0 exists to prevent; shipping it live would
  make a regulatory judgement call an agent has no standing to make.
- **Build everything, gate it behind the existing `MODULES` allowlist,
  off by default, with the checkout integration point named but not
  wired.** Adopted — the mechanism this repository already uses for
  every other "not ready for every deployment yet" capability
  (`transfers`, `pos`, `identity-verification`, `accounting`), applied
  here for a regulatory rather than a product-maturity reason.
- **For the REDEEM-branch `refund()` correction, block on doc 145.**
  Rejected — `CreditNote` not existing yet is exactly the kind of
  cross-agent timing gap CLAUDE.md's own instructions for this task
  anticipated; blocking would leave "the undo fan-out" lens's own
  required answer unhandled, which the doc treats as a defect, not an
  acceptable gap.

### Decision

Build WO-155.1 through WO-155.5 in full — schema, both services, every
method named in the doc, permissions seeded to real roles, tests, and UI —
and ship it exactly the way this repository already ships a capability
that is real but not yet appropriate for every deployment:

1. **`wallet` is a new, independent module**
   (`apps/api/src/modules/sales/wallet/`), registered in `modules.registry.ts`
   with `offByDefault: true` and classified `core` in `module-packs.ts`.
   It is listed on the `# Available:` line of all three `.env*.example`
   templates and enabled in none of them. No deployment's `MODULES`
   includes it today.
2. **Its own schema file** — `apps/api/prisma/schema/wallet.prisma`
   (`WalletAccount`, `WalletEntry`, `WalletAdjustmentRequest`,
   `MerchantPayable` and their enums) — additive, touching
   `invoicing.prisma` nowhere, so the concurrent doc-145 agent's own work
   in that file never conflicts. Migration:
   `20260925170000_add_wallet_merchant_payable`.
3. **`WalletService.placeOrderWithWalletCredit()` is built, tested
   directly, and not called from `orders.service.ts` or `cart`.** The
   live checkout flow's only payment options today are the ones already
   wired before this task; the wallet tender is a named, working method a
   human wires in once WO-155.0's confirmation is recorded — not an
   unreachable stub, a real method with a full spec suite that nothing in
   the live request path currently calls.
4. **The REDEEM-branch refund correction is a port, not a hard
   dependency on doc 145.** `wallet-credit-note.port.ts` defines
   `CreditNoteService` (one method, `issueForMerchantPayable`) and binds
   it, in `wallet.module.ts`, to
   `MerchantPayableAdjustmentCreditNoteService` — a real, tested default
   that reduces the `MerchantPayable` before payout, or records the
   amount owed back (via `AuditService`) when it is already `PAID`,
   exactly the answer "the undo fan-out" lens requires, never a throw or
   a silent no-op. The PURCHASE-branch refund (`refundPurchase()`) needed
   no such port — it is an ordinary `REFUND` entry against Newax's own
   Deferred Revenue liability, and a real posting-rule reversal
   (`WalletPostingRulesSubscriber.onWalletCreditRefunded`).
5. **`identity-verification` (also off by default) is read through a new
   extension point, not imported.** `schedulePayoutRun()`'s own
   verified/unverified timing branch needs `IdentityVerification.status`;
   rather than a direct cross-module import (which the doc's own words —
   "reads doc 18's own `IdentityVerification.status` directly" — could be
   misread as licensing), this adds
   `core/extension-points/identity-verification-status.registry.ts`, the
   same `register()`-from-`onModuleInit()` idiom `CameraPeopleCountRegistry`
   already uses. With `identity-verification` off, `isApproved()` resolves
   `false` — every merchant treated as unverified, never fast-tracked by a
   module that was never asked.
6. **Accounting posts through a new subscriber, not a direct call.**
   `WalletPostingRulesSubscriber` (in the `accounting` module, also off by
   default) subscribes to `WalletCreditPurchased`/`WalletCreditRedeemed`/
   `WalletCreditRefunded`, matching `PostingRulesSubscriber`'s own R15
   idiom exactly — `accounting` still imports nothing and knows nothing
   about `wallet`. One new chart-of-accounts entry, `2400 — Deferred
   Revenue — Wallet Credit` (`LIABILITY`), added to `CHART_OF_ACCOUNTS`
   (seeded unconditionally by `seed.ts`, as every account already is).

### Reasoning

Gating on `MODULES` rather than, say, a feature flag or a commented-out
route, is the mechanism this repository already has for exactly this
shape of problem — "real, tested, not appropriate for every deployment
yet" — and reusing it means no new on/off mechanism exists for a reviewer
to learn, and `scripts/check-env-templates.mjs`/`check-module-boundaries.mjs`
already enforce that it stays honestly off (a template that quietly
enabled `wallet` would fail `check-env-templates.mjs`'s own discoverability
rule the same way it would for `transfers` or `pos`). Splitting the
REDEEM-branch refund into its own port rather than either blocking on
doc 145 or writing directly against the model doc 145 might land keeps
both agents' work independent: this module ships complete and correct
today, and swapping the port's binding for a `CreditNote`-backed
implementation later is a one-line change in `wallet.module.ts`, not a
rewrite of `WalletService.refund()`.

### Consequences

- Every acceptance criterion in doc 155's own "Acceptance" section is
  proven by a spec that calls the real service directly:
  `availableBalance()`'s three transitions, `onMerchantConfirmed()`'s
  atomic two-write (including a forced mid-transaction failure),
  the verified/unverified payout-timing branch, and idempotency of a
  retried `purchaseCredit()`/`onMerchantConfirmed()` call —
  `wallet.service.spec.ts`, `merchant-payable.service.spec.ts`,
  `wallet-credit-note.port.spec.ts`,
  `wallet-posting-rules.subscriber.spec.ts` (60 wallet-specific tests;
  1528 passed, 0 failed, across the full `apps/api` suite after this
  change).
- The UI is real and reachable the moment a deployment turns the module
  on: `/account/wallet` (customer balance/history, gated in
  `dashboard-nav.tsx` by the same `/meta`-driven module check the admin
  shell already uses), `/admin/wallet` and `/admin/merchant-payables`
  (+ `[id]`) with `nav-registry.ts` entries carrying `module: 'wallet'`,
  so they are simply absent from the sidebar and command palette on every
  deployment today, per PRM-5/MOD-1, not a broken link.
- Three permissions — `finance.wallets.adjust`, `.adjust.approve`,
  `finance.merchant-payables.dispute` — are in `PERMISSION_CATALOG` **and**
  seeded through `ROLE_PERMISSION_SEED` (`.adjust` to `STAFF`, all three to
  `ADMIN`), avoiding the `seedPermissions()`-vs-`seedRoles()` gap
  `permissions.ts` itself warns against.
- **Until this entry's Status changes, `wallet` must not be added to any
  deployment's `MODULES`, and `placeOrderWithWalletCredit()` must not be
  called from `orders`/`cart`.** Both are one-line changes once WO-155.0's
  own confirmation is recorded here or in a superseding entry — this ADR
  is that gate, not a description of a permanent limitation.
- **Deviations from the doc's own literal text, each with its reason
  where it lives in code:**
  1. `WalletAccount.customerId` names `User`, not the doc's own literal
     `Party`/`Contact` — matches this codebase's existing sibling ledger
     (`StoreCreditService`/`StoreCreditTransaction`), which already keys
     an identical customer-balance concept to `User.id`. Documented on
     the model itself (`wallet.prisma`).
  2. `@@unique([customerId])`, not the doc's own
     `@@unique([organizationId, customerId])` — `organizationId` is
     nullable at Solo/Chain tier (RETAIL-ERP.md R14), and Postgres does
     not treat two `NULL`s as equal in a unique constraint, so the doc's
     own literal compound key would not actually enforce "one wallet per
     customer" outside the Organization tier. Documented on the model.
  3. `refund()` is a thin dispatcher over two internal methods
     (`refundPurchase()`, `refundRedeemedOrder()`) rather than one method
     branching at runtime on which id it received — each keeps its own
     precondition checks (which id, what it may exceed) as a compile-time
     guarantee. The doc's own single `refund()` name is still the public
     entry point.
  4. `MerchantPayableService.schedulePayoutRun()`'s own unverified path
     needs "the customer's own doc 07 'confirm receipt' action," which
     this codebase does not build as a distinct signal (checked
     directly). It uses the closest concrete proxy that exists,
     `Order.status === 'DELIVERED'`, named as a proxy in the method's own
     comment rather than silently assumed to be the same thing.
  5. `processPayoutRun()` settles every `SCHEDULED` `MerchantPayable` for
     one merchant in one call — this codebase's own AP settlement idiom
     (`recordSupplierBillPayment`'s one-bill-at-a-time shape) applied
     across a set, since no separate `PaymentRun` entity exists to reuse
     literally.
  6. Neither `WalletAccount`, `WalletEntry` nor `MerchantPayable` carries
     a numbered-document field (`number`) — the doc's own Prisma snippets
     never show one for any of the three, unlike `PurchaseOrder`/
     `SupplierBill`/`GoodsReceipt`. No `nextXNumber()`-style generator was
     built for this module; adding one would have been speculative.

### Status
**Accepted, pending legal review before enablement.** WO-155.0 is the one
open item: real counsel must confirm the closed-loop design and the
merchant-agreement characterisation before `wallet` is added to any
deployment's `MODULES` or `placeOrderWithWalletCredit()` is wired into
checkout. Record that confirmation as a new entry here (or an update to
this one) before either happens.
