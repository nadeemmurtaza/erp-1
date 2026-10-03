# 234 — Auction app

> **Status: Planned.** Launchpad app (doc 232): tier **CORE**, cross-sector
> (not an industry pack). Audiences: **B2B**, **B2C**; **C2C is reserved** until
> the prerequisites in §2 exist. Industry packs may *feed* it through an
> extension point (§10) without it knowing about them.

## 1. Objective

Let a business sell (or buy) by competitive bidding with **a result everyone
can trust**: the price is fair, the winner is the right one, the audit trail
proves it, and the winning bid turns into a normal order that the rest of the
ERP already knows how to invoice, collect and fulfil.

## 2. Audiences and what each really needs

| Audience | Example | What it needs beyond the basics | Phase |
|---|---|---|---|
| **B2C** | clearance lots, unsold stock, vehicles, charity items, a developer's remaining plots (via `AuctionLotSource`) | bidder verification, deposits, clear payment window, buyer protection | **1** |
| **B2B — sell side** | liquidation/surplus to trade buyers | registered trade bidders, lot-level terms, bulk lots | **1** |
| **B2B — buy side (reverse)** | a procurement team posts a requirement, suppliers bid *down* | sealed bids, fairness, supplier pre-qualification, evaluation beyond price | **1–2** |
| **C2C** | individuals listing to each other | **escrow** (payment held until delivery), **reputation**, **dispute resolution**, seller identity, listing moderation | **3 — reserved** |

**Why C2C waits:** with a business as seller, *we* are the counterparty to
trust; with peers, the platform must hold the money and decide disputes.
`payments` has no hold/escrow primitive today (to be verified, §6 and open
question 3), there is no reputation model, and `support` is built for
business-to-customer tickets. Shipping C2C early would be shipping fraud
exposure. The `C2C` tag stays `RESERVED` (doc 232 §4).

## 3. Auction types

| Type | How it works | Phase |
|---|---|---|
| **English (timed)** | open ascending bids until a closing time; highest wins | 1 |
| **Sealed-bid** | each bidder submits one hidden bid; bids opened together at a set time; highest (sell) or lowest (reverse) wins | 1 |
| **Reverse (procurement)** | buyer posts a spec; suppliers bid the price **down**; award is by price *or* scored criteria | 1 (price only) → 2 (scored) |
| **Dutch (descending)** | price falls on a schedule; first to accept wins | 3 |
| **Live-floor (auctioneer)** | real-time with an auctioneer | not planned |

## 4. Data model (additive, forward-only)

| Table | Key columns |
|---|---|
| `Auction` | `id`, `organizationId`, `outletLocationId?`, `type`, `title`, `status` (`DRAFT` `SCHEDULED` `OPEN` `CLOSING` `CLOSED` `SETTLED` `CANCELLED`), `startsAt`, `endsAt`, `currency`, `terms`, `rulesVersionId` |
| `AuctionLot` | `auctionId`, `lotNo`, `sourceType`/`sourceId` (catalogue item, stock lot, plot…), `quantity`, `startPriceMinor`, `reservePriceMinor?` (hidden), `buyNowMinor?`, `incrementRule`, `currentBidMinor`, `leaderBidderId?`, `bidSeq`, `status`, `endsAt` (extendable) |
| `Bidder` | `id`, `partyId`, `auctionId?` (or org-wide), `alias` (e.g. "Bidder 7", shown publicly), `status` (`PENDING` `APPROVED` `SUSPENDED`), `verifiedAt?`, `strikes` |
| `Bid` | `id`, `lotId`, `bidderId`, `amountMinor`, `kind` (`MANUAL` `PROXY_AUTO` `SEALED`), `seq` (DB-assigned, monotonic per lot), `acceptedAt` (server time), `idempotencyKey`, `prevHash`, `hash` |
| `ProxyBid` | `lotId`, `bidderId`, `maxMinor`, unique `(lotId, bidderId)` — stored **encrypted at rest**, never revealed |
| `DepositHold` | `bidderId`, `auctionId`, `amountMinor`, `paymentRef`, `status` |
| `AuctionResult` | `lotId`, `winnerBidderId?`, `finalMinor`, `reserveMet`, `closedAt`, `orderId?` |
| `AuctionAdjustment` | the reversal/credit document (§9) |

`organizationId`, `outletLocationId` exist from migration one (three
silhouettes); money names its location.

## 5. Bidding rules

1. **Server time is the only time.** The client countdown is a display aid,
   resynchronised from the server on every response; the bid's `acceptedAt` is
   the server's.
2. **A bid is a request until accepted; once accepted it is a record.** It may
   be refused (below the minimum, lot closed, bidder not eligible, own item).
   An accepted bid is never edited or deleted; a mistaken bid is handled by an
   `AuctionAdjustment` with a named authority (§9), not a silent delete.
3. **Minimum next bid** = current bid + increment (§12). Proxy bidding: a
   bidder sets a maximum; the system bids the minimum needed to stay ahead, up
   to that maximum. Equal maxima → the **earlier** `seq` wins.
4. **Anti-sniping.** A valid bid within the closing window extends the lot's
   end (§12). All bidders see the new end time.
5. **Reserve.** If the reserve is not met at close, the lot is `CLOSED` with no
   winner (`reserveMet = false`) and an offer to the highest bidder is staff's
   decision, never automatic.
6. **No retraction.** A bidder cannot withdraw an accepted bid; staff may
   void one for a stated reason (§9).
7. **Own-item and conflict barring.** The seller, anyone who can edit the
   auction, and anyone sharing a `Party` link with them cannot bid (checked by
   data, not by role name).

## 6. Concurrency, idempotency, scale

* **One writer per invariant.** The lot's leader and current bid change only in
  `AuctionService.placeBid()`, via a **predicate-on-write**:
  `UPDATE lot SET currentBid=:new, leader=:b, bidSeq=bidSeq+1 WHERE id=:id
  AND status='OPEN' AND currentBid=:expected AND now()<endsAt`. Zero rows
  updated → re-read and re-evaluate (House Rule 10). A per-lot serialisation
  (advisory lock) keeps hot lots correct.
* **Idempotency key** on every bid: a double-tap or retried request is a no-op
  (unique `(lotId, bidderId, idempotencyKey)`).
* **Fan-out.** Accepted bids publish to a Redis channel; clients receive them
  over SSE with polling fallback every 5 s. A slow consumer never slows the
  writer.
* **Close** is a single job per lot with a predicate (`status` from `OPEN` to
  `CLOSING`), idempotent; a missed run closes on the next tick.
* **Hot-lot budget (stated target):** 50 accepted bids/second on one lot with
  p95 < 300 ms; load-tested before WO-234.4 is called done.
* **Tamper-evident bids.** `Bid.hash = SHA-256(prevHash ‖ canonical(row))` per
  lot, reusing the hash-chain primitive of doc 231. Anyone auditing a result
  can verify nothing was inserted or altered.

## 7. Sealed bids and confidentiality

Sealed bids are encrypted when submitted and **cannot be read by anyone —
including the auction owner and admins — until the opening time.** Mechanism:
the same envelope/key-wrap primitive as doc 231 §3.3, with the opening key
**split among officers (default 2-of-3)** so no single person can peek early.
Opening is an auditable event; bids are then decrypted together and ranked.
This is the doc-231 confidentiality principle applied to procurement fairness:
the boss cannot see supplier prices before the deadline either.

## 8. Bidder trust and money

* **Registration & eligibility.** A bidder is a `Party`; optional identity
  verification (existing `identity-verification`, off by default) and per-auction
  approval. B2B bidders must belong to an approved `account`.
* **Deposit hold.** To bid on lots above a threshold, a deposit is **held**
  against the bidder's payment method and released/applied afterwards. **This
  requires a hold/authorisation capability in `payments` that has not been
  verified to exist.** If absent, v1 runs **without deposits**, using account
  standing (verification + strikes + lot-value caps for new bidders) instead,
  and says so on the registration screen.
* **Strikes.** Non-payment after winning is a strike; the thresholds are in §12.
  Suspension needs a staff decision with a recorded reason and is appealable.
* **Fraud signals (flag, never auto-ban silently).** Seller-related or
  same-device/IP bidders, repeated bid-then-retract-by-staff patterns, bids that
  always push the price to just below a related account's proxy max. Flags go
  to a review queue (`auction.integrity.review`); the output is a ranked list
  with evidence, not a verdict.

## 9. After the bidding

* **Settlement.** The winning bid becomes a core `Order` through
  `AuctionOrderSink` (an extension point; `core/extension-points/` pattern), so
  tax, payment, ledger and fulfilment already work. The deposit (if any) is
  applied to the invoice.
* **Buyer's premium / seller fees** are versioned charge rules
  (`AuctionFeeRule`), shown to bidders **before** they bid.
* **Payment window:** §12. Non-payment → strike + **second-chance offer** to
  the next highest bidder **at their own bid**, or relist.
* **Seller proceeds.** For a consignment sale (a third party's goods), proceeds
  are owed to the consignor through the existing `wallet` merchant-payable path
  (to be verified for fit), not recorded as company revenue.
* **Posting rule (written out).** Deposit received: Dr Cash/Bank, Cr Bidder
  Deposits (liability). Winning invoice: Dr Receivable, Cr Auction Sales and
  Cr Buyer's-Premium Income (and Cr Consignor Payable if consigned); deposit
  applied: Dr Bidder Deposits, Cr Receivable. Keyed
  `findPostedEntry('auction.settlement', lotId)`; accounts the 13-account chart
  lacks are named and seeded by the work order.
* **Reversal document.** Voiding a winning result, partially refunding, or
  voiding one mistaken bid is an `AuctionAdjustment` pointing at the specific
  `Bid`/`AuctionResult` line, partial and repeatable until exhausted, needing
  `auction.adjust` (different authority from the person who ran the auction).
* **Undo fan-out.** Order cancellation, stock/lot release and ledger reversal
  are automatic; refund of money paid needs a human (`payments` screen);
  goods already collected are deliberately irreversible here.

## 10. Extension points (so industries can sell by auction without editing it)

* `AuctionLotSource` — an industry/pack module offers lots (a hospitality
  property's surplus, a housing society's unsold plots, apparel clearance). The
  Auction app never imports a pack; packs register a source.
* `AuctionOrderSink` — settlement into a core order (above).
* `AuctionBidderGate` — optional eligibility rules (e.g. "members in good
  standing only" for a society's plot auction).

## 11. Screens (one main job per page)

* **Public lot page** (the money page): lot media, current price, **time left**
  (server-synced), next minimum bid, one bid box, bid history with masked
  aliases ("Bidder 7"), watch/notify. States: scheduled (countdown to start),
  open, closing soon, closed, reserve not met, you are winning / outbid, ended,
  not eligible (with the reason and what to do), offline (bid is *not* queued
  silently; the bidder confirms on reconnect), rate-limited.
* **Auction list** (browse and filter), **My bids**, **Watchlist**.
* **Admin:** create auction → add lots (bulk import from Excel, reusing the
  import pattern of doc 229) → schedule → **live monitor** → results →
  settlements → disputes → integrity queue.
* Seven widths 280→1536, targets ≥ 44 px, logical properties for RTL, no dead
  space; a countdown never relies on colour alone.

## 12. Parameters (proposals to confirm)

| Parameter | Exact value | Why this number | Enforced | Degrades |
|---|---|---|---|---|
| Minimum increment | greater of 5% of current bid and the smallest sensible currency step (`Setting`) | ~14 bids to double a price keeps contests moving without penny-bids | `placeBid()` | Rule missing → 5% |
| Anti-snipe window / extension | bid in last 2 minutes extends end by 2 minutes | Long enough for a human to respond, short enough that a lot does not run forever | `placeBid()` | Cap hit → no further extension |
| Max total extension | 30 minutes | Bounds a bidding war so staff and sellers can plan | same | Lot closes at the cap |
| Bids per bidder | 10 per minute per lot | A person cannot exceed this; scripts can | rate limiter | 429, bid not placed |
| Payment window after win | 72 hours | Covers a weekend bank transfer; shorter penalises honest buyers, longer ties up the lot | settlement job | Expiry → strike + second-chance/relist |
| Strikes to suspend | 3 in rolling 12 months | One slip is human, three is pattern | bidder service | Suspension needs staff reason |
| Deposit (when available) | 10% of reserve (or start price if no reserve), capped by a `Setting` ceiling | Large enough to deter non-payment, small enough not to price out bidders | `payments` hold | No hold support → no-deposit mode (§8) |
| Sealed-bid opening quorum | 2 of 3 officers | No single person can open early; one absence does not block | key-split opening | <2 available → opening waits, deadline unaffected |
| Bid retention | 7 years | Disputes and audits outlive the auction | retention job | Pseudonymise bidder after retention |
| Hot-lot target | 50 bids/s/lot, p95 < 300 ms | Realistic peak for a popular timed lot | load test | Backpressure on fan-out, not on writes |

All live in `Setting` (versioned, second-signature, old/new audited) under
`auction.settings.manage`.

## 13. Permissions

| Key | Grants |
|---|---|
| `auction.view` | browse (public pages need none) |
| `auction.manage` | create/edit auctions and lots |
| `auction.publish` | open/schedule (separate from edit) |
| `auction.bidders.manage` | approve/suspend bidders |
| `auction.adjust` | void a bid / adjust a result — **never** held with `auction.manage` by the same person on one auction |
| `auction.integrity.review` | the fraud-signal queue |
| `auction.seal.open` | take part in a sealed-bid opening (officer) |
| `auction.settings.manage` | parameters, fee rules |

Public bidders authenticate as a **portal user**, scoped to their own bids; they
hold no staff permission. Toxic pairs refused in `RolesService`:
`auction.manage`+`auction.adjust`, `auction.manage`+`auction.seal.open`.

## 14. Legal and regulatory caution (not decided here)

Auction rules differ by country and by item type: licensing for auctioneers,
consumer-protection and distance-selling rules, tax treatment of buyer's
premium, real-estate and vehicle transfer formalities, and the line between an
auction and a lottery for some formats. **This document makes no legal claim.**
A legal review per target market is a gate before any B2C launch, and the
property/vehicle formats need their own review before use.

## 15. Scope lenses

**Actor with three tables** — bidder → `Party` (+`Bidder`); staff → `User`+`Employee`; seller/consignor → `Party`; supplier in a reverse auction → `Party`/`TradingPartner`.
**Principal with no permission key** — portal bidder: scoped to own bids and registered auctions; `AuctionBidderGate` evaluated server-side.
**Grant that ends itself** — bidder approval can carry `expiresAt`; staff roles end with deactivation, and pending adjustments return to the role queue; officer key-shares for sealed opening are re-split when an officer leaves.
**Whose rows/columns** — bidders see aliases, never identities; reserve and proxy maxima are never returned; staff see identities only with `auction.bidders.manage`; cross-organization auctions never mix.
**Threshold nobody approves alone** — adjusting a result or voiding a bid above a `Setting` value needs a second holder of `auction.adjust`; sealed opening needs 2 of 3; the undo is a different authority.
**Toxic pair / blast radius** — §13; changing increments or anti-snipe on a live auction is refused (rules are versioned per auction, `rulesVersionId`).
**Audience is a capability** — outbid/won/ending alerts go to the bidder via `notify`; integrity flags to `auction.integrity.review` holders; zero → escalate to admin; a lot with 200 watchers gets one digest per window, not 200 pings.
**Request or record** — a bid is a request until accepted, then a record; a close is a record; settlement is a request (payment may fail → strike path).
**Movement with no address** — a lot sourced from stock names the stock `locationId` and reserves it (not decrements) until settlement, then moves via `InventoryService.move()`; `defaultLocationId()` unused.
**Four hours down** — bidding pauses and **lots do not close while the API is down** (extension on recovery, announced); no bid is accepted offline; clients show the state honestly.
**Posting rule / columns / period / legal entity** — §9; `branchNodeId` = selling location, `costCentreId` = auction; a late settlement in a closed period posts to the next open one with a variance; a second brand/country gets its own currency, fee rule and number series.
**Dry run** — `computeIncrement`, `route/eligibility` and `rankSealedBids(bids, rule)` are pure functions; a *simulate this auction on past bids* preview writes nothing.
**Click the number** — result totals drill to lots, bids and the order.
**Three silhouettes** — one shop clearing stock monthly; a trade house running weekly B2B lots; a group with auctions per brand — `organizationId` and fee rules scope each.
**Absent collaborator** — no `payments` hold → no-deposit mode; no `identity-verification` → manual approval; no `wallet` → consignment disabled; no `notify` → in-page alerts; no Redis → polling only.
**Second copy of the write** — §6 idempotency key; settlement unique on `lotId`.
**Hundred-thousandth row** — `Bid` reaches hundreds of millions at group scale: partition by month, index `(lotId, seq)` and `(bidderId, acceptedAt)`, chains verified per lot.
**Adoption test** — `lotNo` unique per auction, auction numbers `PREFIX-YEAR-SEQ` with `nodeId` folded in; bid ids random 128-bit.
**Reversal / version / erasure** — §9 adjustment; `rulesVersionId` and fee-rule version stored on each result; bidder PII pseudonymised after retention, bids and totals kept.
**Failure path** — failed notifications, failed order-sink and failed payment-hold calls land in *Auction problems* (permission `auction.settings.manage`) with payload and a safe **Replay**.

## 16. Acceptance criteria

1. 1,000 concurrent bids on one lot yield a strictly increasing `seq` with no lost update and a valid hash chain (test).
2. Retrying a bid with the same idempotency key creates exactly one bid.
3. A bid in the last 2 minutes extends the end by 2 minutes, never beyond the 30-minute cap (test at the boundary).
4. Proxy bidding: with maxima 100 and 80, the leader is the 100-bidder at the minimum increment above 80; equal maxima go to the earlier bid.
5. A sealed bid is unreadable by any user, including admin, before opening; opening with 1 of 3 officers fails, with 2 succeeds, and is audited.
6. The seller and related parties cannot bid (test through `Party` links).
7. Reserve not met → `CLOSED` with no winner and no automatic offer.
8. A paid winning lot creates exactly one core `Order`; running settlement twice creates one.
9. Voiding a bid creates an adjustment, never a delete; the chain still verifies.
10. API outage: lots do not close during it and are extended on recovery, shown to bidders.
11. Hot-lot target met in a load test before release.

## 17. Work orders

234.1 schema + `Auction`/`Lot` admin + launchpad manifest, permissions seeded to real roles, nav entry · 234.2 `placeBid()` with predicate-on-write, idempotency, hash chain · 234.3 proxy bidding + anti-snipe + close job · 234.4 realtime fan-out + public lot page + load test · 234.5 bidder registration, eligibility, strikes · 234.6 settlement through `AuctionOrderSink`, fee rules, posting · 234.7 sealed-bid + officer key-split opening · 234.8 reverse (price-only) auctions · 234.9 integrity queue + adjustments · 234.10 deposit hold (after `payments` verified) · 234.11 `AuctionLotSource` and first industry feed · later: scored reverse auctions, Dutch, C2C (after escrow, reputation, disputes exist).
