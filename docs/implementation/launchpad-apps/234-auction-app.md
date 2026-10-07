# 234 — Auction app

> **Status: In progress — WO-234.1 and WO-234.2 built (2026-10-02, §17);
> WO-234.3 onward planned.** Launchpad app (doc 232): tier **CORE**, cross-sector
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

**What WO-234.1 created (the rest arrives with the work order that first uses
it, each as its own additive migration).** `Auction`: `id`, `number` (unique,
`AUC-<year>-<seq>` through `documentNumber()`), `organizationId?`,
`outletLocationId?`, `type`, `title`, `status`, `startsAt`, `endsAt`,
`currency`, `terms?`, `createdById`. `AuctionLot`: `auctionId`, `lotNo`
(unique per auction), `title`, `description?`, `sourceType?`/`sourceId?`,
`quantity`, `startPriceMinor`, `reservePriceMinor?`, `status` (`PENDING`
`OPEN` `CLOSED` `WITHDRAWN`). Not yet present: `rulesVersionId`, `buyNowMinor`,
`incrementRule`, `currentBidMinor`, `leaderBidderId`, `bidSeq`, per-lot
`endsAt`, and every table below `AuctionLot`. `type` accepts `ENGLISH` only on
create; `SEALED_BID` and `REVERSE` exist in the enum so it never needs altering.

**What WO-234.2 added.** `Bidder`: `id`, `auctionId`, `userId` (the portal
account that acts as the bidder; a plain string, not a foreign key, like the
other cross-module ids), `alias` ("Bidder N", unique per auction), `status`.
`Bid`: `id` (random UUID), `lotId`, `bidderId`, `amountMinor` (BIGINT), `kind`,
`seq`, `acceptedAt`, `idempotencyKey`, `prevHash`, `hash`, unique on `(lotId,
seq)` and on `(lotId, bidderId, idempotencyKey)`. `AuctionLot` gained
`currentBidMinor`, `leaderBidderId` and `bidSeq`; `startPriceMinor` and
`reservePriceMinor` are now BIGINT. `Auction` gained `bidRules` (JSON), the
rules copied from Settings at `schedule()` and never read from Settings again,
which is how "rules are versioned per auction" (§15) is met until fee rules
need a real `rulesVersionId` in WO-234.6. Two deliberate differences from the
table above: a **bidder is a portal `User` per auction**, not a `Party`
(`Party` today holds suppliers and manufacturers only; the optional `partyId`
for a B2B account arrives with WO-234.5), and the **first bid provisions the
bidder** as `APPROVED` (`PENDING` and `SUSPENDED` exist so WO-234.5 adds a gate,
not a column). Still absent: `ProxyBid`, `DepositHold`, `AuctionResult`,
`AuctionAdjustment`, per-lot `endsAt`, `incrementRule`, `buyNowMinor`. `Bid`
partitioning by month (§15) is not done: Prisma does not model partitions, so it
is a hand-written migration for when a deployment's `Bid` table needs it, and
the `(lotId, seq)` and `(bidderId, acceptedAt)` indexes are in place for it.

**What WO-234.3 added.** `ProxyBid`: `id`, `lotId`, `bidderId`, `maxCipher` (the
maximum, AES-256-GCM through `encryptSecret()` with `APP_ENCRYPTION_KEY`, as
`iv:tag:ciphertext`; never a number in the database), `placedAfterSeq` (the
lot's `bidSeq` when the offer was made, which is what orders equal maxima),
unique `(lotId, bidderId)`. `AuctionResult`: `id`, `lotId` (unique),
`topBidderId?`, `topBidMinor?`, `reserveMet`, `bidCount`, `closedAt`. `AuctionLot`
gained `endsAt?` (null means "when the auction ends", so a lot nobody bid late on
has one end) and `extendedMs` (anti-snipe spent so far, counted apart from any
outage extension). The result differs from the table above on purpose: it holds
a **top bidder** and **top bid**, not a `winnerBidderId`/`finalMinor`, because a
lot whose reserve was not met has a highest bidder and no winner (§5.5) and
staff need to see both; `orderId?` arrives with WO-234.6, the first writer of it.
The lot `OPEN → CLOSED` directly, under the lot's lock; `CLOSING` (§6) is not
used, because no work sits between the end and the result that a second status
would protect.

**What WO-234.5 adds.** `Auction.registration` (`OPEN` `VERIFIED` `APPROVAL`;
the column defaults to `OPEN`, which is the rule every auction ran under until
now, while an auction created through the service takes the Setting default,
`APPROVAL`). `BidderStatus` gains `DECLINED`, so a refused registration and a
suspended bidder read differently to the person and to staff. `Bidder` gains
`decidedById`, `decidedAt`, `decisionReason` (written for the bidder to read),
`appealText` and `appealedAt` (one open appeal at a time; the history is the
audit rows). `BidderStrike`: `id`, `userId`, `bidderId` (which names the
auction), `lotId?`, `reason`, `recordedById`, `recordedAt`, `voidedAt?`, `voidedById?`,
`voidReason?`, indexed on `(userId, recordedAt)`; never deleted, a mistaken
strike is voided with a reason. Three deliberate differences from the table
above. A strike belongs to the **person** (`userId`), not to the per-auction
`Bidder`, because "three in twelve months" is about someone, not about one
auction. The count is **computed** from the strikes, never stored on `Bidder`,
so a voided strike cannot leave a stale number. `verifiedAt` is not stored: a
person's verification is read live through `IdentityVerificationStatusRegistry`
at the moment they register. Still absent, each for the reason in §8: `partyId`
and the B2B account link, `expiresAt`, deposits.

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
  `UPDATE lot SET currentBid=:new, leader=:b, bidSeq=:seq WHERE id=:id
  AND status='OPEN' AND bidSeq=:read AND <auction OPEN and endsAt > :acceptedAt>`.
  The version compared is `bidSeq`, not `currentBid`, because the first bid has
  no current bid to compare. Zero rows updated → roll back, re-read and
  re-evaluate (House Rule 10), at most three whole attempts. A per-lot
  serialisation (a transaction-scoped advisory lock keyed by lot id, namespace
  `8_241_171`) keeps hot lots correct and makes the retry rare. The time compared
  and stored is the database's `clock_timestamp()` read under that lock.
* **Idempotency key** on every bid: a double-tap or retried request is a no-op
  (unique `(lotId, bidderId, idempotencyKey)`).
* **Fan-out (built in WO-234.4).** After the bid's transaction commits, the
  service publishes one **snapshot** event (price, `bidSeq`, minimum next bid,
  `endsAt`, state, the newest bids) to the Redis channel `auction:lot:<lotId>`,
  keyspace `realtime`. Every node subscribes once and writes to its own
  watchers; a node with no watchers for a lot drops the message. Publishing
  never awaits and never fails a bid: Redis down means the event is lost, the
  bid stands, and watchers fall back to polling. Because an event is a
  snapshot, a dropped or merged one costs nothing: the next one carries the same
  facts. Per node, per lot, the first event after quiet goes out at once and
  events inside the next 250 ms are merged into one (`mergeLiveEvents`), so a
  hot lot costs each watcher at most four writes a second. A watcher whose
  socket holds more than 64 KiB unsent is skipped until it drains, so a slow
  consumer never slows the writer or grows the node's memory. Clients receive
  the stream over SSE and fall back to reading the lot every 5 s (±20 %) when
  there is no stream; both paths end in the same view, and a view never goes
  backwards (`newerView`).
* **The public lot page is cached per node.** One read per lot per second:
  in-process, single-flight, at most 2 000 lots, invalidated when a realtime
  event for the lot arrives, `serverTime` aged by the time the entry has sat. A
  thousand pages polling one lot cost one database read a second per node.
* **Close** is a single job per lot with a predicate (`status` from `OPEN` to
  `CLOSED`, built in WO-234.3 without a `CLOSING` step), idempotent; a missed
  run closes on the next tick. It runs under the same per-lot lock as a bid, so
  no bid is mid-flight when a lot closes and a late bid that moved the end
  after the job found the lot due is not closed over.
* **Hot-lot budget (stated target):** 50 accepted bids/second on one lot with
  p95 < 300 ms; load-tested before WO-234.4 is called done. **Measured in
  WO-234.4** (`scripts/load-auction.mjs`, see §16): met with room at 50 a second
  (every bid accepted, bid p95 18 ms, a watcher told within 247 ms at p95); past
  the target, at 100 a second, nothing is lost or wrong but a bid waits its turn
  at the lot's lock (p95 479 ms).
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

  **Built in WO-234.5.** An auction says who may bid (`Auction.registration`,
  chosen while it is a draft and frozen from `schedule()` like the other rules):
  `OPEN`, any signed-in customer who does not run the auction, registered by
  their first bid exactly as before; `VERIFIED`, a customer whose identity is
  verified is approved the moment they register and everyone else waits for
  staff; `APPROVAL`, every customer waits for a holder of
  `auction.bidders.manage`. Identity is read through
  `IdentityVerificationStatusRegistry` (core), never by importing
  `identity-verification`; with that module off the registry answers "no", so
  `VERIFIED` behaves as `APPROVAL`, which is the "no `identity-verification` →
  manual approval" row of §15. A customer registers from the lot page
  (`POST /auctions/:auctionId/registration`, idempotent). A `Bidder` is per
  auction, so an approval ends with the auction; taking it away earlier is a
  suspension, with a reason. The rules are one pure function,
  `eligibility()` in `bidder-trust.ts`, called by `placeBid()`, `setProxyBid()`,
  the viewer's own state and the registration itself, so the four cannot
  disagree. **Not built, and why.** *B2B account link:* `B2BAccount` keys on
  `Contact`, which reaches a `User` through `Contact.userId`; reading it from
  `auction` would couple two modules, and the right shape is an extension point
  that `accounts` registers into, as `identity-verification` does, wanted when
  the first B2B auction exists (WO-234.11). Until then the approver is the check.
  *`expiresAt` on an approval:* a `Bidder` is already per auction, so the grant
  ends itself with the auction; an earlier end is a suspension. *Conflict
  barring through `Party` links (§5.7):* no stored link joins a `User` to a
  `Party`, and the seller is the organisation itself until consignment (WO-234.11),
  who is already barred by data (the creator and every holder of `auction.manage`);
  the `Party` bar arrives with the consignor, where the seller first exists as a
  row. *Lot-value caps for new bidders:* a "new" bidder needs settlement history
  to be measured (WO-234.6). *Deposits:* WO-234.10, so v1 runs in no-deposit mode
  and the registration card says no deposit is needed.
* **Deposit hold.** To bid on lots above a threshold, a deposit is **held**
  against the bidder's payment method and released/applied afterwards. **This
  requires a hold/authorisation capability in `payments` that has not been
  verified to exist.** If absent, v1 runs **without deposits**, using account
  standing (verification + strikes + lot-value caps for new bidders) instead,
  and says so on the registration screen.
* **Strikes.** Non-payment after winning is a strike; the thresholds are in §12.
  Suspension needs a staff decision with a recorded reason and is appealable.

  **Built in WO-234.5.** A strike is a staff-recorded fact about a person
  (`reason` required, optional lot), counted over a rolling window; settlement
  (WO-234.6) will record "non-payment after winning" through the same
  `AuctionBidderService.recordStrike()`. A strike can be **voided** with a reason
  and is never deleted. Reaching the threshold **flags, and never suspends**: the
  Bidders list marks the person "Review due", a registration by them lands as
  `PENDING` whatever the auction's mode, and under `OPEN` their first bid is
  refused as "register first" so the registration can wait for staff. Suspension
  stays a staff decision with a recorded reason. The reason of a decline or a
  suspension is **shown to the bidder** (the form says so) and the bidder may
  appeal, one open appeal at a time, in up to 1 000 characters; staff reinstate,
  or keep the decision with a reason, and each step is an audit row. The appeal
  is two columns on `Bidder` (`appealText`, `appealedAt`) and one derived state:
  none, waiting (sent, unanswered) or kept (answered, the decision stands, no
  further appeal). A new decision clears both, so a reinstated bidder who is
  later suspended again starts with a fresh appeal; keeping a decision clears
  only the text, so "answered" survives. Every decision is a predicate on the
  status the screen was looking at (`expectedStatus`, answered `409
  BIDDER_CHANGED` with the status now), so two staff acting at once cannot
  overwrite each other. A staff member cannot decide on their own registration or strikes
  (`CANNOT_DECIDE_OWN`). **What suspension does not do:** bids already placed
  stand (an accepted bid is a record, §5.2), a suspended bidder's standing
  maximum stops answering (the proxy read already requires `APPROVED`), and
  removing a standing bid is a void under `auction.adjust`, which is WO-234.9;
  the screen says so at the moment of suspending.
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
* **Auction list** (browse and filter), **My bids**, **Watchlist**. The list is
  built in WO-234.4; My bids and Watchlist are not (no work order owns them yet;
  see §17).
* **Admin:** create auction → add lots (bulk import from Excel, reusing the
  import pattern of doc 229) → schedule → **live monitor** → results →
  settlements → disputes → integrity queue.
* Seven widths 280→1536, targets ≥ 44 px, logical properties for RTL, no dead
  space; a countdown never relies on colour alone.

### Storefront screen brief (WO-234.4: `/auctions` and `/auctions/lots/:lotId`)

* **One job.** The lot page: *let a person see where a lot stands and bid on
  it.* The list: *find a lot to look at.* Two pages, two jobs (Law 5). Both live
  at the storefront, public, and are reachable by clicking (a module-gated
  "Auctions" entry in the header from `xl`, in the mobile menu, and in the
  footer); the nav entry is absent, not disabled, when the `auction` module is
  not enabled (`MOD-1`).
* **Headline and three stops (lot page).** Headline: the lot's name. Stops: the
  current price with the time left beside it, the bid box (the one loud
  button), the bid history. Everything else (terms, proxy maximum) is one level
  down in a `Disclosure` (Law 2).
* **States, every one designed.** Loading (skeleton shaped like the page),
  upcoming (countdown to opening, no bid box), open, closing soon (the last five
  minutes, said in words as well as colour), end moved by a late bid (said once
  in words), closed with a winner / sold to an alias, closed reserve not met /
  no bids (the reason, never the reserve), signed out (sign-in with a way back
  to this lot), not eligible (what and why, with *Contact us*), leading,
  outbid (says what the next bid must be), outbid by an automatic bid, you won,
  offline (a bid is **not** queued; the page says so), rate-limited (names the
  wait), server busy, unknown or withdrawn lot (404 page with a way on), load
  error with *Try again*. The list has empty-for-each-filter, empty-for-search,
  error, and module-absent states, each with an action.
* **Success surface.** A bid is accepted in place: the price, the leader mark
  and the history change on the frame the answer arrives, and the button's
  label returns. No toast, no modal: the page itself is the receipt (`SUC-3`).
* **Seven widths.** One column from `xs` to `fold`, the bid box before the
  history; two columns from `lg` with the bid box sticky beside the price. The
  history rows are a grid whose amount column never collides with the alias at
  280. Targets ≥ 44 px below `fold`; logical properties throughout; amounts and
  dates only through `formatMoney` / `formatDateTime`.
* **Honest by construction.** Public views never carry the reserve (only SOLD or
  NOT_SOLD with a reason), never a name or an account, only the per-auction
  alias. A countdown is read against the server's clock (an offset taken from
  every message that carries `serverTime`), never the visitor's.
* **Copy.** Every string is in `messages/en.json` and `ur.json` under
  `auction.*` (parity checked), one word per concept: *bid*, *lot*, *maximum*.
* **Proof.** `lib/auction-live.spec.ts` (merge, standing, countdown, amount
  parsing); `test/auction-realtime.e2e-spec.ts` (public pages, `/me`, a real
  stream, cross-node delivery); a real-browser walk of bid, outbid, maximum,
  polling fallback, closed, upcoming, staff and error states at the seven
  widths; `scripts/load-auction.mjs` for §16.11.
* **Out of scope here.** Lot media (no media exists on a lot yet), search-engine
  metadata and server rendering of the lot page, My bids, Watchlist and "notify
  me", a list that refreshes by itself.

### Bidder screens brief (WO-234.5: the registration card and the bidders queue)

Two surfaces, two jobs (Law 5). **Storefront:** *let a signed-in customer get
permission to bid in one auction.* **Admin:** *let staff decide who may bid in one
auction.* The brief the `ux` agent wrote before the first line of JSX; what
differs from it in the build is named under "Departures".

* **Storefront: `LotRegistration`, in the bid box's place.** Registration is per
  auction, so it is one card, the same on every lot of it, for a person who is
  signed in and may not bid yet. A person who may bid sees no card at all. Each
  state is a title, one line and one button, in words (never colour alone), with
  the exit *See other lots* beside it: **join** (*Join this auction to bid*; the
  line depends on the auction's rule, and says plainly that joining is free and
  needs no deposit); **waiting** (*Waiting for the organiser*, since when, and that
  the page checks again by itself); **declined** and **suspended** (the
  organiser's own reason as written, `dir="auto"`, never cut, then the one
  appeal box with its character count); **appeal sent** (their text echoed, no
  second box); **kept** (the organiser kept the decision; *Contact us* is the
  human remedy, `FLO-7`); **runs this auction** (staff cannot bid on their own
  sale). Joining and being let in at once is a status line above the bid box, not
  a card. A failure is a sentence that says what happened and what to do
  (`describeRegistrationFailure`): network (press again, it is safe), rate
  limited (names the wait), ended (the card becomes that line and a way on),
  *changed under you* (the page reads again and shows what is true), signed out
  (a sign-in link back to this lot), anything else (nothing was changed). What the
  person typed is kept across a failure.
* **Storefront: joining before bidding opens.** An auction that approves its
  bidders is joinable as soon as it is scheduled, so the organiser can decide
  ahead of the start. An upcoming lot has no bid box, so `LotJoin` shows the same
  card there and nothing for a person who is already in.
* **Storefront: reading the answer.** `useLotViewer` reads the viewer once, and
  while the registration waits (or an appeal does) again every 20 000 ms ±20 %
  and once when the tab becomes visible, never in a hidden tab, never twice
  inside 1 000 ms; the last answer stays on screen if a read fails. Nothing is
  pushed to the bidder (notifications are not built), so this read is how they
  find out.
* **Storefront: focus.** When the card changes state (the person caused it, or
  the organiser decided), focus moves to the new title unless the person was doing
  something elsewhere on the page; a failure moves focus to its alert; a bidder
  who was let in lands on the status line above the bid box.
* **Admin: the "Bidders" figure** on the auction page's strip, only for a holder
  of `auction.bidders.manage` (for everyone else the strip is three figures and
  closes over the gap, `PRM-5`). Its value is what needs a person first (*3
  waiting*), then how many are in, then *None yet*; its panel is the queue.
  Counts come from one cheap read (`GET …/bidders/summary`); the rows are read
  only when the panel opens (Law 7).
* **Admin: the queue.** A filter (*Waiting*, *Approved*, *Suspended or declined*,
  *Appeals*, *All*, each with its count; it opens on *Waiting* when anyone waits),
  then a stacked table of 20 a page: bidder (alias, name, email or phone), status
  with *Appeal waiting* under it, strikes with *Review due* at the threshold,
  joined, and a *Review* button. Four empty states, never the same message: nobody
  has joined; nobody is waiting; nothing matches; and a failure with *Try again*.
* **Admin: the sheet.** A side sheet for one bidder: who they are, whether their
  identity is verified, the organiser's earlier decision and any appeal, then the
  acts their state allows (waiting: *Approve*, *Decline*; approved: *Suspend*,
  *Record a strike*; declined or suspended: *Approve*, and *Keep declined* or
  *Keep suspended* while an appeal waits, and *Record a strike* for a suspended
  one). *Approve* is one button; every other act is a short form that replaces the
  buttons, with a required reason of at most 500 characters and a line saying who
  reads it. The strikes are one level down in a closed *Strikes (n)* disclosure,
  each with a *Void strike*; a voided strike stays listed, struck through, with who
  voided it and why. A staff member looking at themselves sees the buttons
  disabled and the sentence why. Every act ends in a sentence saying what happened
  to which bidder, and, when someone else waits, the one loud way to the next.
* **Admin: who may bid.** *Who may bid* is a choice in Edit details (a draft, by
  someone who may edit auctions), in words rather than the rule's name (*Anyone
  signed in*, *Verified customers, others approved*, *Approved customers*), and a
  line under Details for everyone who can see the page.
* **Copy.** Customer strings are in `messages/en.json` and `ur.json` under
  `auction.registration.*`, checked for the same keys and the same placeholders
  in both languages by `lib/auction-messages.spec.ts`. Admin pages write literals
  (`ITG-9`). One word per concept: *join* (never *register*), *organiser*,
  *decline* (never *reject*), *suspend*, *strike*, *void*, *appeal*.
* **Proof.** `lib/auction-registration.spec.ts` (which card, when to keep asking,
  the failure sentences), `lib/auction-bidders.spec.ts` (the acts a state allows,
  the sentences), `lib/auction-messages.spec.ts`, the API's unit specs and
  `test/auction-bidders.e2e-spec.ts` against a real database, and a real-browser
  walk at the seven widths, in Urdu, of every state of the card and of the queue
  and the sheet.
* **Departures from the brief, and why.** The strikes disclosure stays closed even
  at the threshold (`Disclosure` is closed by default, always); the *Review due*
  badge and the standing line say it instead. The sheet says whether identity is
  verified but not since when (the API returns no date for it). The legacy
  *not eligible, Contact us* card is gone: a refusal now says why and what to do.
* **Out of scope here.** Notifications to the bidder, bulk approval, voiding a
  bid, deposits, linking a bidder to a B2B account, and the rules for who is
  barred by their relationship to the seller (all named in §8 as not built).

## 12. Parameters (proposals to confirm)

| Parameter | Exact value | Why this number | Enforced | Degrades |
|---|---|---|---|---|
| Minimum increment | greater of 500 basis points (5%) of the current bid, rounded up, and `toMinor(1)` (one whole currency unit; 100 in a two-decimal currency); Settings `auction.bid_increment_bps`, `auction.bid_min_step_minor`, **copied onto the auction at `schedule()`** | ~15 raises double a price, which keeps contests moving without penny-bids; one whole unit is the smallest step a person calls a raise | `placeBid()` via `minimumNextBid()` | Missing or malformed rule → the defaults, field by field |
| Anti-snipe window / extension | bid in last 120 000 ms extends the lot's end by 120 000 ms (a bid exactly 120 000 ms before the end is inside); Settings `auction.anti_snipe_window_seconds` 120, `auction.anti_snipe_extend_seconds` 120 (0 switches it off), **copied onto the auction at `schedule()`** with the increment | Long enough for a human to read "you were outbid" and answer, short enough that a lot does not run forever | `commitBids()` in `placeBid()`, in the same `UPDATE` as the price; one extension per commit, so a bid and its proxy answer cannot extend twice | Cap hit → no further extension; a missing field → its default |
| Max total extension | 1 800 000 ms (30 minutes) per lot, Settings `auction.max_extension_seconds` 1 800, copied at `schedule()`; the last extension is cut to what is left | Bounds a bidding war so staff and sellers can plan | same | Lot closes at the cap |
| Standing maximum (proxy) | one per bidder per lot, ≤ 10^15, never lowered; must reach the next bid the bidder could place by hand (a leader's need only reach their bid); a raise counts as a new offer placed now | A maximum that could be pulled would frighten others off with a number never meant; one below the next bid could never be used | `setProxyBid()` | 409 `PROXY_TOO_LOW` with `details.minimumMaxMinor`, 409 `PROXY_CANNOT_LOWER` |
| Proxy answer | at most **one** `PROXY_AUTO` bid per manual bid or per maximum set: the leader stands at the runner-up's ceiling plus one increment, capped at their own ceiling; equal ceilings go to the earlier offer | A 10 000-to-1 gap between two maxima costs one ledger row, not a ladder of them | `resolveProxy()` (pure), `proxyAnswer()` | none; pure |
| Proxy requests per client address | 30 per 60 000 ms on `PUT /auctions/lots/:lotId/proxy` | Setting a maximum is a decision, not a race: half a bid's allowance; a script probing for another bidder's maximum is slowed to one every two seconds on top of the lot lock | `@Throttle` on `AuctionBidController`, Redis-backed | 429, nothing changed |
| Bid rate counts | **manual bids only** | The system's answers on a bidder's behalf are not the bidder's doing; counting them would let a bidding war lock a proxy holder out | `assertWithinBidRate()` | — |
| Open and close job | every 15 000 ms (`*/15 * * * * *`), at most 100 auctions and 100 lots per run, a run skipped while the last still goes; no leader lock | 15 s is how soon a result appears; 100 a run is 400 a minute, far above any schedule, and a backlog drains over runs; idempotent by predicate, so two nodes cost a wasted query and never a double close | `AuctionLifecycleCron` | A failing lot is logged and left for the next run |
| Outage grace | a lot found more than 60 000 ms past its end is extended once to 120 000 ms from now, with an `auction.lot_extended_after_outage` audit row, and not closed; not counted against the anti-snipe cap | 60 s is four missed runs; under it a slow tick is not an outage and the lot closes. Two minutes is long enough to see the lot is open again and answer | `closeLot()` | An outage that lasts longer simply extends again on the next recovery |
| Bids per bidder | 10 accepted bids per rolling 60 s, per bidder per lot, counted from the ledger | A person cannot exceed this; scripts can | `assertWithinBidRate()` in `placeBid()` | 429 `BID_RATE_LIMITED` with `Retry-After`, bid not placed |
| Bid requests per client address | 60 per 60 s on `POST /auctions/lots/:lotId/bids` | One a second sustained; a final-minute war is a bid every few seconds, and ten bidders on one office address still get six each | `@Throttle` on `AuctionBidController`, Redis-backed | 429, bid not placed |
| Bid transaction wait and run | `maxWait` 10 000 ms, `timeout` 10 000 ms | Prisma's 2 000/5 000 refuse a healthy hot lot in a rush; 10 s drains the 50/s target through a pool of ten and still fails visibly | `BID_TRANSACTION` | 503 "bid was not placed"; nothing written |
| Whole attempts at one bid | 3 | A bound on a bug: the lot lock makes a lost predicate rare | `MAX_BID_ATTEMPTS` | 409 `LOT_CHANGED`, "check the price and bid again" |
| Payment window after win | 72 hours | Covers a weekend bank transfer; shorter penalises honest buyers, longer ties up the lot | settlement job | Expiry → strike + second-chance/relist |
| Strikes to review (**WO-234.5**) | 3 strikes not voided within the last 365 days, per person; Settings `auction.strikes_to_review` (whole number 1 to 20) and `auction.strike_window_days` (whole number 1 to 3 650), read live, not frozen on an auction | One slip is human, three is pattern; a year is long enough that a pattern shows and short enough that one bad week does not follow someone for ever. Read live because it is a policy on people, not a rule of one auction | `AuctionBidderService`, `strikeState()` in `bidder-trust.ts` | **Flags, never suspends**: "Review due" on the list, a registration lands `PENDING`, an `OPEN` first bid is refused as "register first". A missing or malformed value → 3 and 365 |
| Default way to register (**WO-234.5**) | `APPROVAL`; Setting `auction.registration_default` (`OPEN`, `VERIFIED` or `APPROVAL`) | A new auction vets its bidders unless staff choose otherwise: the cost of one click on an open sale is far lower than the cost of an unvetted bidder who wins and does not pay. The database column itself defaults to `OPEN`, the rule every earlier auction ran under | `AuctionService.create()` when the request names none | A malformed value → `APPROVAL` |
| Registration and appeal requests per client address (**WO-234.5**) | registration 10 per 60 000 ms on `POST /auctions/:auctionId/registration`; appeal 5 per 60 000 ms on `POST /auctions/:auctionId/appeal` | A person registers once per auction, so ten lets an office register several people from one address while a script is held to one every six seconds; an appeal is written once, so five | `@Throttle` on `AuctionBidController`, Redis-backed, off under `NODE_ENV=test` | 429, nothing changed |
| Reason and appeal length (**WO-234.5**) | a decision or strike reason 1 to 500 characters; an appeal 1 to 1 000 | A reason a bidder reads and an audit row stores fits in a paragraph; an appeal needs room to explain | DTO `@MaxLength` | 400 naming the limit |
| Registration refresh while waiting (**WO-234.5**) | the lot page re-reads the viewer's own state every 20 000 ms ±20 % while the registration is `PENDING` or an appeal is open, and when the tab becomes visible | A person waiting for an approval wants to see it within half a minute; three reads a minute per waiting page is cheap, and the spread keeps a crowd from lining up | `useLotViewer` | The page keeps showing "waiting" |
| Bidders list page (**WO-234.5**) | 20 a page, 100 at most | The shared `PaginationQueryDto`; a queue is worked from the top, never read whole | `PaginationQueryDto` | none |
| Deposit (when available) | 10% of reserve (or start price if no reserve), capped by a `Setting` ceiling | Large enough to deter non-payment, small enough not to price out bidders | `payments` hold | No hold support → no-deposit mode (§8) |
| Sealed-bid opening quorum | 2 of 3 officers | No single person can open early; one absence does not block | key-split opening | <2 available → opening waits, deadline unaffected |
| Bid retention | 7 years | Disputes and audits outlive the auction | retention job | Pseudonymise bidder after retention |
| Hot-lot target | 50 bids/s/lot, p95 < 300 ms | Realistic peak for a popular timed lot | `scripts/load-auction.mjs` (§16.11) | Backpressure on fan-out, not on writes: events are merged and a slow watcher skipped, a bid never waits on a watcher |
| Fan-out merge window | 250 ms per lot per node: the first event after quiet at once, the rest merged and sent when 250 ms have passed | A hot lot is at most four writes a second to each watcher instead of fifty; a quarter of the one second a screen takes to read; an event is a snapshot, so a merge loses nothing | `FLUSH_INTERVAL_MS` in `auction-realtime.service.ts` | Redis or the subscription down → no events; the page polls |
| Open streams per node | 5 000 | Each is a socket and a few hundred bytes of state, well inside a default Node descriptor limit; past it a node protects the watchers it has | `MAX_STREAMS_PER_NODE` | 503 with `Retry-After: 5`; the page polls every 5 s ±20 %. More watchers means more nodes: fan-out is per node by design |
| Slow-consumer drop | a watcher with more than 65 536 bytes (64 KiB) unsent is skipped until it drains | About thirty full events, far more than a healthy link ever queues; past it Node would hold every further write in the process's memory | `MAX_BUFFERED_BYTES` | Its updates are dropped; the page sees the gap in `bidSeq` and reads the lot |
| Stream heartbeat | a comment line every 15 000 ms | A quarter of a typical 60 s idle-connection timeout on a proxy | `HEARTBEAT_MS` | A proxy that ignores comment lines closes the stream; the browser reconnects after 5 000 ms |
| Stream age | closed by the server after 600 000 ms (10 min); the browser reconnects and is sent a fresh snapshot | Bounds a half-dead connection or one to a node being replaced; not so short that it is churn | `MAX_STREAM_AGE_MS` | A reconnect costs one snapshot |
| Client reconnect | SSE `retry: 5000` ms; after a refusal the page asks again after 5 000 ms ±20 % | A thousand pages that lost a stream together must not return in one second | `CLIENT_RETRY_MS`, `useLotLive` | Meanwhile the page polls |
| Polling fallback | every 5 000 ms ±20 %, and at least 1 000 ms between two reads that an event triggered | A bid is seen within five seconds without a stream; the spread keeps a crowd from lining up | `POLL_FALLBACK_MS`, `REFRESH_MIN_GAP_MS` | The page keeps showing what it has |
| Public lot page cache | per node, 1 000 ms, at most 2 000 lots, single-flight, dropped by a realtime event for the lot, `serverTime` aged by the entry's age | A thousand pages polling one lot cost one read a second per node; a second is the freshness a polling page already accepts | `LOT_PAGE_CACHE_MS`, `MAX_CACHED_LOTS` in `auction-public.service.ts` | Cache cold or evicted → a database read; an entry is never older than 1 000 ms |
| Events carry | at most 20 newest bids | A page lists twenty; a longer history is a read, not a push | `MAX_EVENT_BIDS` | A watcher behind by more than twenty bids reads the lot |
| Public read requests per client address | lot page 120 per 60 000 ms; stream 60 per 60 000 ms; the list keeps the global 300 per 60 000 ms | A page polling every 5 s makes 12 a minute, so 120 allows ten pages behind one address; a stream is one open per page, and 60 allows several reconnects a minute | `@Throttle` on `AuctionPublicController`, Redis-backed; off when `NODE_ENV=test` | 429 |
| "Closing soon" mark | the last 300 000 ms (5 min) of a lot | Long enough to decide to bid, short enough to stay a signal | `CLOSING_SOON_MS` (display only) | none; never decides anything |
| Public list page | 12 lots a page, "Show more" | Fills a row at every width and loads fast on a phone | `PAGE_SIZE` in the list page | none |
| Maximum price on one lot (**decided in WO-234.2**) | 10^15 minor units (ten trillion in a two-decimal currency), `MAX_PRICE_MINOR` in `bidding.ts`, for `startPriceMinor`, `reservePriceMinor` and every `*Minor` column on a lot or bid | The columns are `BIGINT` now. 10^15 is the biggest round number whose 5% step and the sum with it stay under `Number.MAX_SAFE_INTEGER` (9.007 × 10^15), so every comparison in the service is exact | DTO `@Max(MAX_MINOR)`; `computeIncrement()` does its multiplication in `BigInt`; the database `BIGINT` is the backstop | A larger amount is a 400 naming the limit. Money elsewhere in the repository is still `Int`; the auction is the one place a `BIGINT` money column exists, and the service returns it as a plain number |
| Lots per auction / auctions per list page | no cap on lots; list pages are 20 by default, 100 at most (`PaginationQueryDto`) | An auction's lots are read through the detail page, not the list | `PaginationQueryDto` | A very large auction needs lot pagination on its detail page — add when a real auction crosses ~200 lots |

All live in `Setting` (versioned, second-signature, old/new audited) under
`auction.settings.manage`.

## 13. Permissions

| Key | Grants |
|---|---|
| `auction.view` | browse (public pages need none) |
| `auction.manage` | create/edit auctions and lots |
| `auction.publish` | open/schedule (separate from edit) |
| `auction.bidders.manage` | approve, decline and suspend bidders, record and void strikes, answer appeals; the only key that shows a bidder's name, email and phone (**live since WO-234.5**: granted to the Admin role and in the "Sales & payments" bundle; it also opens the auction list and page read-only, with the reserve hidden, so a person who only approves bidders can reach them) |
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

### Scope lenses — WO-234.5 (bidder registration, approval, strikes)

The plan this work order was built from. Objective: a person can register to
bid, staff can decide on them and hold them to account, and every bid path
refuses whoever is not allowed, by one rule. Existing state: the first bid
provisions an `APPROVED` bidder; `assertMayBid` refuses staff, the creator and
any non-`APPROVED` row; nothing can make a row `PENDING` or `SUSPENDED`. Out of
scope: deposits, B2B account link, `Party` conflict bar, voiding bids, lot-value
caps, notifications (each named in §8 with its owner).

* **The actor with three tables** — a bidder is a portal `User` (per auction, `Bidder.userId`); the decider is a staff `User`; a strike is about the `User`, not the per-auction row. No `Party`, no `Contact` is read.
* **The principal with no permission key** — the customer is `@AuthenticatedOnly` and reads and writes only their own `Bidder` (found by `(auctionId, userId)`, never by an id from the request); staff routes are `auction.bidders.manage`.
* **The grant that ends itself** — a bidder's approval is per auction and ends with it; an earlier end is a suspension. A deactivated staff `User` leaves no pending decision behind, because a registration waits on a permission, not on a person.
* **Whose rows and columns** — a list never crosses auctions (the route names the auction and the query filters on it); identity columns (name, email, phone) leave the server only on the `auction.bidders.manage` routes; the public lot, the ledger and the history still show an alias only.
* **The threshold nobody approves alone** — no money moves in this work order, so no second signature. The one rule of this family is that nobody decides on themselves: `CANNOT_DECIDE_OWN`, compared on `userId` at the act. The undo of a strike (void) takes a reason and the same key; it is audited as a separate row with the voider.
* **The toxic pair, caught at the act** — `auction.bidders.manage` with a customer account that registers: caught by `CANNOT_DECIDE_OWN`. The `auction.manage` + bid pair is unchanged (`RUNS_AUCTION`).
* **Authority and blast radius** — the registration default and the strike threshold are Settings under the existing second-signature rules; the worst a mis-set threshold does is send every registration to staff (threshold 1) or stop flagging (20), and neither suspends anyone. Audit rows carry `from`/`to` status and the reason.
* **Audience is a capability** — the people who must act (registrations waiting, appeals) are the holders of `auction.bidders.manage`; with no `notify` wiring in this work order, the audience is reached by a count on the auction page, not by a message. Zero holders: the auction list still shows nothing waiting, which is the honest state, and the Admin role holds the key by default. A thousand registrations are a paged queue, never a thousand alerts.
* **Request or record** — registration, an appeal and a staff decision are requests (refused with a reason); a strike, once recorded, is a record (voided, never edited or deleted); a bid already accepted is a record a suspension does not touch.
* **The movement with no address** — no stock or cash moves.
* **Four hours down** — registration and decisions need the API; a person who cannot register simply cannot bid yet, and the page says the request did not go through. Nothing is queued silently.
* **The unwritten posting rule, every column, the period that already moved, the second legal entity** — no journal entry is written; strikes carry no money. The first settlement-linked strike (WO-234.6) will name its posting rule there.
* **Dry run before live** — `eligibility()`, `decideRegistration()`, `nextBidderStatus()` and `strikeState()` are pure (no `prisma.`, no `publish(`) and the viewer's own state calls the same `eligibility()` that `placeBid()` does, so a "can this person bid?" read writes nothing.
* **Click the number** — the "waiting" figure on the auction page opens the queue it counts, filtered to waiting; a strike count opens that person's strikes.
* **Three silhouettes** — a shop that approves ten people, a trade house that approves its buyers, a group with auctions per brand: the mode is per auction and `organizationId` is already on `Auction`, so each chooses its own; a Setting default is the only global.
* **The absent collaborator** — no `identity-verification` → `VERIFIED` is `APPROVAL`; no `notify` → the page shows the state; no Redis → the throttle is off and nothing else changes; module `auction` off → none of it exists.
* **Second copy of the write** — registering twice returns the existing state (unique `(auctionId, userId)`); two staff deciding at once: the second gets 409 `BIDDER_CHANGED` and the fresh state (predicate-on-write on the status read); a double-clicked strike is two strikes by design, so the form disables on submit and the void exists.
* **The hundred-thousandth row** — `Bidder` grows with bidders × auctions: indexed `(auctionId, status, createdAt)` for the queue; `BidderStrike` indexed `(userId, recordedAt)` for the window count, and only the rows inside the window are read.
* **Adoption test** — ids are `cuid()`; a `Bidder` alias stays "Bidder N" per auction under the existing advisory lock, shared by registration and the first bid.
* **Reversal, version, erasure** — a strike is voided, a decision is changed by a later decision (the audit trail keeps every step), personal data on a `Bidder` is the `userId` only (identity is read from `User` on request) so pseudonymising after retention changes one table.
* **Failure path** — the identity lookup failing at registration is treated as "not verified" (the person lands `PENDING`, never `APPROVED`), logged once. A decision, a strike, a void, a registration and an appeal each change what someone may do, so they are written with `AuditService.recordEvidence()` inside the same transaction: a failed audit write fails the act and nothing is half-recorded, the opposite of the log-and-continue `record()` used for the module's other transitions.

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
12. Nobody who is not approved can place a bid or a standing maximum: under `APPROVAL` not until a holder of `auction.bidders.manage` approves them, under `VERIFIED` not unless their identity is verified or staff approve them, under `OPEN` their first bid registers them; a suspended bidder's standing maximum stops answering (test).
13. Two staff deciding on one registration at once: exactly one decision is written, the other is answered `409 BIDDER_CHANGED` with the status it is now (test, ten at once).
14. A staff member cannot decide on, record a strike against, or void a strike for their own registration (`CANNOT_DECIDE_OWN`), and every staff route refuses someone without `auction.bidders.manage`.
15. A person at the strike threshold is never suspended by the system: their registration lands `PENDING`, and a voided strike stops counting without being deleted.
16. A crowd of first-time bidders with the Settings cache cold, on a pool of ten connections, loses no bid to a starved connection: nothing inside a bid transaction waits on a second connection (test, 40 at once; it fails with 40 of 40 `503` when the strike policy is read inside the transaction, as the first version did).

**Met so far (2026-10-02, WO-234.2):** 1 (`test/auction-bidding.e2e-spec.ts`:
1,000 concurrent bids, the accepted ones numbered 1 to n with strictly
increasing amounts, the lot's price and `bidSeq` agreeing with the last bid, the
chain verifying; 1,000 requests finished in about 3 s on a development machine
through a pool of ten, of which roughly 100 to 120 were accepted writes and the
rest cheap refusals, so it is a correctness test and not the §6 load test, which
needs the realtime path of WO-234.4); 2 (a retried key is one bid, ten at once
included); the chain half of 9 (tamper is detected and named; the void itself is
WO-234.9); the staff-and-author half of 6 (the `Party`-link half is WO-234.5).

**Met so far (2026-10-02, WO-234.3):** 3 (`test/auction-lifecycle.e2e-spec.ts`:
a bid before the window leaves the end alone; one inside it adds 120 000 ms in
the same `UPDATE` as the price; four bids in the window against a 300 000 ms cap
add 120 000, 120 000, 60 000 and 0; the boundary itself, a bid exactly 120 000 ms
before the end, is in `bidding.spec.ts`, where the clock is a parameter); 4 (maxima of
100 000 and 80 000 leave the 100 000 bidder at 84 000, 80 000 plus 5%; equal
maxima go to the earlier offer, who stands at that maximum); 7 (a lot whose
reserve is not met closes `CLOSED` with its highest bidder recorded and
`reserveMet = false`, and nothing in the audit trail or elsewhere offers it to
anyone); 10 (a lot found 10 minutes past its end is extended once and still
open, takes bids, and has no result; one 30 s late is closed). Also: ten close
runners at once close a lot once with one result row; two lots of one auction
ending together leave the auction `CLOSED`; the open job is idempotent. Not met
yet: 5, 6's `Party` half, 8, 9's void, 11.

**Met so far (2026-10-03, WO-234.4):** 11, measured with
`scripts/load-auction.mjs` (20 s, one lot, a 0.1 % bid rule, open-loop bids from
200 or 400 registered bidders, 200 or 1 000 anonymous watchers on the live
stream, API with `NODE_ENV=test` so the per-address throttle is off, Postgres,
Redis, the API and the generator on **one development machine, one node**, so
these are floors for a deployment with separate hosts, not a capacity claim):

| Offered | Accepted | Bid latency p50 / p95 / p99 / max | Fan-out delay p50 / p95 / p99 / max | Watchers that reached the last bid | Ledger |
|---|---|---|---|---|---|
| 50 a second, 200 watchers | 1 000 of 1 000 (50.0 a second) | 13 / 18 / 24 / 55 ms | 137 / 247 / 260 / 267 ms (200 000 samples) | 200 of 200 | `bidSeq` 1 000 = 1 000 rows, chain valid |
| 100 a second, 1 000 watchers | 1 939 of 2 000 (96.8 a second; 61 refused as `BID_TOO_LOW`: raced for the same price) | 308 / 479 / 564 / 584 ms | 144 / 256 / 283 / 306 ms (1 939 000 samples) | 1 000 of 1 000 | `bidSeq` 1 939 = 1 939 rows, chain valid |

Read plainly: the stated target (50 accepted a second on one lot, p95 under
300 ms) is met with room: every bid accepted, bid p95 18 ms. Twice the target
is still correct (no server error, no lost or doubled bid, a valid chain, every
watcher level) but a bid now waits its turn at the lot's lock, p95 479 ms, which
is **over** the 300 ms target; this sandbox does not say where between 50 and
100 the knee is, and a production host will differ. The fan-out delay barely
moves between the two runs because it is bounded by the 250 ms merge window by
design (a watcher is told within one window of the bid), not by the number of
watchers. Not measured: more than one node (the cross-node path is covered by
`test/auction-realtime.e2e-spec.ts`, not by load), a real network between
watcher and node, TLS, or a proxy in front. The first version of the generator
offered each bid from the last *answered* price, which capped acceptance at
about one bid per round trip and measured the generator; it now offers each bid
0.3 % above the highest price it has seen or offered.

**Met so far (2026-10-07, WO-234.5):** 12 (`test/auction-bidders.e2e-spec.ts`, against real Postgres: not registered, waiting, approved then bids, `OPEN` first bid, `VERIFIED` with a verified and an unverified person and with the identity module failing, a suspended bidder refused and their maximum silent); 13 (ten simultaneous approvals, one wins, nine see `BIDDER_CHANGED`; an approval racing a decline, never both; a stale screen refused); 14 (own registration, strike and void refused; every staff route guarded; every bidder route needs a sign-in); 15 (three strikes across two auctions flag and never suspend, a voided one stops counting, the row is kept); 16 (the crowd test above, which went from 40 of 40 refused to none). Also: twenty people joining at once get twenty different aliases and one person joining ten times at once is one row (the alias is allocated under the auction's lock); the queue pages twenty at a time, oldest first; malformed decisions, strikes, voids and appeals are a 400 that creates nothing. The whole API suite passes (312 suites, 3 490 tests). Browser (Playwright against the real stack): every card state at 280, 380, 640, 768, 1024, 1280 and 1536 and in Urdu has no overflow from its own content and no control under 44 px below 640; the queue with none, one and 23 bidders and the sheet at 280, 768 and 1280 behave; a dead connection and a `429` on an appeal are told in words and keep what the person typed. Not met, and why: 6's `Party` half (no stored link joins a `User` to a `Party`; it arrives with the consignor, WO-234.11), and the notification half of "told when decided" (nothing publishes a decision event until `notify` consumes one; the waiting page polls every 20 s, ±20 %). Not measured: the load test of WO-234.4 was not re-run after the registration check was added to the bid path; the new path adds no query for a bidder that already exists, and one `COUNT` on `(userId, recordedAt)` for a first-time bidder under `OPEN`.

## 17. Work orders

234.1 schema + `Auction`/`Lot` admin + launchpad manifest, permissions seeded to real roles, nav entry (**built 2026-10-02:** schema, admin API and screens, permissions, nav; the launchpad manifest entry is carried by WO-232.2, which owns `manifest.ts`) · 234.2 `placeBid()` with predicate-on-write, idempotency, hash chain (**built 2026-10-02:** BIGINT prices, `Bidder` and `Bid`, `placeBid()` behind `POST /auctions/lots/:lotId/bids`, the admin ledger and chain check at `GET /admin/auctions/:id/lots/:lotId/bids` and `…/verify`, a side sheet on the auction page, `core/common/hash-chain.ts` as the reusable primitive; **not yet reachable by a bidder or openable by the system:** nothing sets an auction `OPEN` until the open job of WO-234.3, and the bidder's bid box is WO-234.4's public lot page, so until then bids exist only in tests) · 234.3 proxy bidding + anti-snipe + close job (**built 2026-10-02:** `ProxyBid` and `AuctionResult`, per-lot `endsAt`, `setProxyBid()` behind `PUT /auctions/lots/:lotId/proxy` and the owner-only `GET`, `placeBid()` rebuilt as a commit pipeline that writes a manual bid and at most one proxy answer as consecutive links of one chain with one guarded `UPDATE`, anti-snipe inside it, `AuctionLifecycleService` and its 15-second cron (open, close, outage extension), results and lot ends on the admin auction page; **now reachable by the system:** a scheduled auction opens by itself, but a bidder still has no screen to bid from until WO-234.4; no domain event is published yet, because the first consumer is WO-234.6's `AuctionOrderSink`, which will define `auction.lot_closed` from the `AuctionResult` row) · 234.4 realtime fan-out + public lot page + load test (**built 2026-10-03:** the `realtime` Redis keyspace and `subscriber()`, `AuctionRealtimeService` (snapshot events, per-lot merge, slow-consumer drop, stream cap), `AuctionPublicService` and `AuctionPublicController` (`GET /auctions/public/lots`, `…/lots/:lotId`, `…/lots/:lotId/stream`), the bidder's own `GET /auctions/lots/:lotId/me`, the storefront list and lot pages with bid and maximum forms, a module-gated header, mobile-menu and footer entry, `scripts/load-auction.mjs`; **now reachable by a person:** a visitor can watch a lot and a signed-in customer can bid on it; **not built:** My bids, Watchlist, lot media, search-engine metadata, an "open" realtime event, so an upcoming lot is polled, and bidder eligibility, which is WO-234.5, so until then any signed-in customer who is not staff may bid) · 234.5 bidder registration, eligibility, strikes (**built 2026-10-07:** `Auction.registration` (`OPEN`, `VERIFIED`, `APPROVAL`), `Bidder` status and appeal columns, `BidderStrike`, `eligibility()` as the one rule `placeBid()`, `setProxyBid()`, the viewer's own state and joining all call, `AuctionBidderService` (join, appeal, decide, record and void a strike, the queue and its counts) behind `POST /auctions/:auctionId/registration`, `POST /auctions/:auctionId/appeal` and `/admin/auctions/:id/bidders…`, the strike policy as two Settings, the `auction.bidders.manage` permission, in the catalogue and granted to the live Admin role by migration, the storefront's one registration card and upcoming-lot join, the admin "Bidders" figure with its queue and sheet, and "Who may bid" in the auction's details; **now reachable by a person:** a customer joins from a lot page and is let in, made to wait, declined or suspended with a reason and one appeal, and staff decide from the auction page; **not built:** notifications (the waiting card polls every 20 s, ±20 %), the B2B account link, `Party`-link conflict barring (so acceptance criterion 6 is met for staff and the author only), `expiresAt`, deposits and lot-value caps, and removing a suspended bidder's standing bid, which is a void under WO-234.9) · 234.6 settlement through `AuctionOrderSink`, fee rules, posting · 234.7 sealed-bid + officer key-split opening · 234.8 reverse (price-only) auctions · 234.9 integrity queue + adjustments · 234.10 deposit hold (after `payments` verified) · 234.11 `AuctionLotSource` and first industry feed · later: scored reverse auctions, Dutch, C2C (after escrow, reputation, disputes exist).
