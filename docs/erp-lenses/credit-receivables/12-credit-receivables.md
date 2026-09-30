# 12. Credit, receivables and the customer who owes

B2B changes the shape of a sale from "paid or not" to "owed, by whom, since
when, and whether they still get supplied." This codebase already posts a
receivable and ages it, but the receipt never reliably clears what it
settles, no code path checks a customer's standing before taking their next
order, and a connected trade buyer can owe money in two ledgers that never
meet. None of this shows up until the group has customers worth chasing.

## Lens: The receipt that doesn't find its bill

**Question:** Name the field that ties a specific payment to the specific
receivable it settles, and show the query that reports it as settled. If no
such field exists, state what a payment against one of several open orders
for the same customer resolves to today.
**Why:** `onPaymentSucceeded` posts Dr Cash & Bank / Cr Accounts Receivable
but never sets `contactId` on the credit line
(`posting-rules.subscriber.ts:133-136`), while `agedReceivables()` only reads
`JournalLine` rows where `contactId` is not null
(`gl-reports.service.ts:233`). Every settlement is invisible to aging; a
customer who has fully paid still ages as if nothing was received.
`aging.ts`'s own header admits there is "no per-payment-to-invoice matching
yet," but FIFO still needs the settlement to reach the pool, and here it
never does. `Payment.orderId` (`payments.prisma:19`) is also a required bare
scalar — one payment clears exactly one order.
**Worked example:** Narrow slice: a "record payment" screen that posts
`payment.succeeded` and shows a green "paid" badge on the order. Complete
capability: the payment posts against a named receivable, the AR credit line
carries the same counterparty key the debit line does, a partial payment
leaves the remainder open and dated from the original sale, and
`agedReceivables()` reflects it same-day.
**Done test:** `grep -n "creditMinor: payload.amount" apps/api/src/modules/money/accounting/posting-rules.subscriber.ts`
shows a line object with no `contactId` today; the PR adds one plus a test
that posts a real payment through `onPaymentSucceeded` — not a hand-built
`aging.ts` fixture — then calls `agedReceivables()` and asserts the balance
drops.
**Breaks without:** At 100+ B2B accounts, every invoice ever raised ages into
the 91+ bucket forever regardless of payment, so a dunning or stop-supply
decision built on this report flags paid-up customers as delinquent and
cannot rank real risk.

## Lens: The status nobody checks

**Question:** Name the code path that reads a customer's credit-hold state
before an order is placed, and which value blocks the sale. If none exists,
state the permission key and scope a "stop supplying this customer" action
would require, and who is allowed to reverse it.
**Why:** `ContactStatus` already has a `BLOCKED` value (`crm.prisma:8-14`),
settable through the CRM admin DTO (`crm.dto.ts:16`), but grepping
`apps/api/src` for `BLOCKED` finds only that DTO constant — `orders.service.ts`'s
`place()` and `placeFromPos()` never read `Contact.status`, so marking a
contact `BLOCKED` changes a label, not behaviour. There is no `creditLimit`
or credit-hold field anywhere in the schema (confirmed absent). `payments.approve`
exists as a boolean capability; no comparable stop-supply capability exists
in `PERMISSION_CATALOG`.
**Worked example:** Narrow slice: a "Blocked" badge on the customer list so
staff can see the flag. Complete capability: `place()` checks the contact's
standing before creating the order, refuses or holds it with a named reason,
requires a distinct permission to lift the hold, and audits who did it.
**Done test:** `grep -rn "ContactStatus.BLOCKED" apps/api/src/modules/sales/orders`
— the PR must show a real read, not just the enum, and must state the
permission key gating a lift, checkable against `PERMISSION_CATALOG`.
**Breaks without:** A delinquent B2B account keeps ordering on credit
indefinitely because nothing in checkout can see the fact finance already
flagged — finance's decision and the sales path disagree, and the group
keeps extending credit it already chose to stop.

## Lens: One customer, two ledgers

**Question:** For a business buyer who both places storefront/POS orders and
receives trading-partner invoices, name the single field or query that
returns everything they owe across both. State whether `Contact` and
`TradingPartner` ever resolve to the same row.
**Why:** `Contact` (`crm.prisma`) backs `Order.contactId` and the AR aging's
counterparty key; a connected B2B buyer is instead a `TradingPartner`
(`trading-partners.prisma`), and `Invoice`/`Quote` carry only
`tradingPartnerId` (`invoicing.prisma:25,58`) — grepping
`trading-partners.prisma` for `contactId` returns nothing. `invoicing.prisma`'s
own header says this MVP "posts nothing to the ledger" and that "AR aging
across every customer" needs the larger accounting tranche it explicitly
defers. A single corporate buyer can accumulate exposure in two systems that
share no key, one of which never reaches accounting.
**Worked example:** Narrow slice: give trading partners an "invoices" tab
showing their own `Invoice` rows. Complete capability: an explicit link
between a `TradingPartner` and its `Contact` where one exists, a query that
sums one counterparty's exposure across both, and an unpaid `Invoice`
posting to the same AR account Contact-keyed sales use.
**Done test:** PR names the join between `TradingPartner` and `Contact` (or
states none exists and why that is acceptable this release), and shows one
real customer's exposure summed from both `Order`-driven AR and open
`Invoice.totalMinor`.
**Breaks without:** A franchise or wholesale buyer placing both web orders
and invoiced trade purchases shows two partial, disagreeing balances to two
teams, and neither a credit-limit check nor a dunning run can see the whole
exposure — the group under- or over-extends credit without knowing it.

## Not modelled yet

- No `creditLimit`, credit-hold or held-order-at-limit concept anywhere in
  `apps/api/prisma/schema/*.prisma`.
- No payment-terms field on a customer or `Invoice`; `paymentTerms` exists
  only on the supplier side (`purchasing.prisma:29`).
- No CreditNote or DebitNote model — `invoicing.prisma`'s own header names
  `CreditNote` as future R18 scope, not built.
- No customer statement and no dunning schedule/sequence of any kind.
- No per-payment-to-invoice allocation — `aging.ts` is explicit that it
  approximates with FIFO because that matching does not exist.
- No enforcement of `ContactStatus.BLOCKED` at order placement, and no
  distinct "stop supplying" permission in `PERMISSION_CATALOG`.
- No shared key between `Contact` (storefront/POS identity) and
  `TradingPartner` (B2B invoicing identity).

## Hardening record

**Kept (3):**

- **The receipt that doesn't find its bill** — verified: `onPaymentSucceeded`
  in `posting-rules.subscriber.ts` (lines 133-136, not 134-137 as first
  drafted) posts the AR credit line with no `contactId`, and
  `agedReceivables()` (`gl-reports.service.ts:233`) filters on
  `contactId: { not: null }` — so a real, checked settlement is invisible to
  aging today. Distinct from the WO-22 "A fact that already happened is never
  rejected" lens: that one is about integration events being accepted, this
  one is about a posted, accepted GL entry that is structurally unreadable by
  its own aging report.
- **The status nobody checks** — verified: `ContactStatus.BLOCKED` exists
  (`crm.prisma:8-14`) and is settable via `ContactQueryDto`
  (`crm.dto.ts:16`), but `orders.service.ts`'s `place()` (line 133) and
  `placeFromPos()` (line 394) contain no read of `contact.status` anywhere in
  the file — confirmed by grep, only `order.status` appears. `creditLimit`
  confirmed absent from every `.prisma` file. `PERMISSION_CATALOG`
  (`packages/shared/src/permissions.ts:45`) confirmed to contain
  `payments.approve` but no stop-supply/credit-hold key. Distinct from the
  WO-22 "Authority and blast radius" lens: that one is about who a rule
  change reaches, this one is about a specific existing flag that checkout
  never reads at all.
- **One customer, two ledgers** — verified: `Contact` backs
  `Order.contactId` and the AR aging counterparty key;
  `trading-partners.prisma` has no `contactId` field (confirmed by grep);
  `Invoice`/`Quote` carry only `tradingPartnerId`
  (`invoicing.prisma:25,58`); the file's own header (lines 2-5) states AR
  aging across every customer needs a larger accounting tranche it defers.
  Distinct from the WO-22 "The other end and what nets it out" lens: that one
  is about a single transaction's counter-entry, this one is about the same
  legal customer existing as two unlinked identity rows with no combined
  exposure query.

**Killed:** none — all three claimed lenses survived verification with one
citation correction (below). No replacement lens was needed.

**Corrections:**

- Claimed `posting-rules.subscriber.ts:134-137` for the AR credit line with
  no `contactId`; actual location is lines 133-136 (the `lines: [...]` array
  inside the `postEntry` call starts at 133, and the cited `creditMinor` line
  is 136, not 137).
