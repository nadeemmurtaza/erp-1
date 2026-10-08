# ADR-086 — Launchpad apps: a static, presentation-only first-party manifest with tier/sector/audience tags; Mail as a control plane over a mail engine; Auction bids as predicate-on-write records

[← Decision log](../DECISIONS.md)


### Context

The owner is building an Odoo-style launchpad that groups modules into mini
apps (core and industry-specific, tagged B2B/B2C/C2C) and approved three new
apps: Mail, Auction, and a Vault & Work Credit app (docs 232–235). Docs
184–195 already define a different thing — third-party directory apps that are
always remote services (ADR-073). `MULTI-SECTOR.md` already rules that business
models cut across sectors.

### Options Considered

1. **App = module with declared dependencies (Odoo-style).** Rejected: turns app
   dependencies into code dependencies and breaks module independence.
2. **App = presentation manifest over independent modules (chosen).**
3. **Audience (B2B/B2C/C2C) as a folder/category.** Rejected: one app belongs to
   several; the repository already treats business models as cutting across
   sectors. Chosen: three tags — tier, sector, audience.
4. **Build a mail server.** Rejected: deliverability, spam, storage and abuse
   are an operations burden. Chosen: control plane over a mail engine (doc 13's
   Stalwart) behind an interface, gated on proof-of-concept spikes.
5. **Ship C2C auctions in the first release.** Rejected: needs escrow,
   reputation and dispute handling the platform lacks. `C2C` is a reserved tag.

### Decision

Options 2, 3, 4, and a B2C/B2B-first auction. The launchpad resolves tiles
server-side from permissions, `MODULES` and a per-tenant `AppEnablement`
setting. Directory (third-party) apps appear as tiles but their trust model
(doc 184 §2) is unchanged.

### Parameters

See doc 233 §6 (quotas, send limits, retries), doc 234 §12 (increment 5%,
anti-snipe 2 min / 30 min cap, 10 bids/min, 72 h payment window, 3 strikes,
2-of-3 sealed opening, hot-lot 50 bids/s). All are proposals in `Setting`,
versioned and audited.

### Reasoning

Keeps module independence and the third-party boundary intact, uses tags where
the domain is genuinely multi-valued, avoids owning mail infrastructure, and
puts the one hot concurrency invariant (current bid) behind one writer.

### Consequences

A new `check-launchpad` lint. Mail depends on spikes S1–S3 passing. Auction
deposits depend on a `payments` hold capability not yet verified, so v1 may run
without deposits. Auction legality needs per-market review. C2C stays unbuilt.

### Status

Proposed. Nothing built.

### ADR-086 addendum (2026-10-02) — vault protection mode: both ship, chosen per vault, no default

Owner decision, "keep both for now": sealed vaults support `CLIENT_SIDE` and
`SERVER_HELD` protection modes, selected by a vault's owners at creation, with
no global default (`vault.defaultMode` unset until the owner sets one).
Reasoning: neither mode dominates (confidentiality from the operator vs.
recovery and search), and the owner chose not to decide for every client in
advance. Cost accepted: two key providers behind one `VaultKeyProvider`
interface, and two sets of key-handling tests. Downgrade to `SERVER_HELD`
needs every owner; upgrade destroys the server-held key. Revisit with usage
evidence after the first client vaults. Doc 231 §3.3 holds the detail.

### ADR-086 addendum (2026-10-02) — WO-234.1 foundation: what was fixed, and the Int32 price ceiling

Built: `Auction` and `AuctionLot` (additive migration `20261002180000`), the
admin API and screens, three permissions, and the `auction` module, off by
default. The parameters below are exact, per the "exact parameters" rule.

| Parameter | Exact value | Applies to | Why this number | Enforced | Fails how |
|---|---|---|---|---|---|
| Price ceiling | 2,147,483,647 minor units | `startPriceMinor`, `reservePriceMinor` | Money is `Int` minor units repo-wide; Postgres `INTEGER` is 32-bit. Widening only the auction columns would make them the one `BIGINT` money column | `@Max(MAX_MINOR)` in `auction.dto.ts`; `INTEGER` is the backstop | 400 with the limit named. **Open:** widen to `BIGINT` before WO-234.2 adds `Bid.amountMinor`, and before any real-estate or vehicle lot is listed |
| Number allocation | advisory lock namespace `8_241_170`, key = year; MAX scan of `AUC-<year>-%` | `Auction.number` | Same pattern as every other document number; the next free namespace in this repository | `nextAuctionNumber()` in a transaction | Concurrent creates queue on the lock; the `number` unique index is the backstop |
| Per-auction serialisation | `SELECT … FOR UPDATE` on the `Auction` row, first statement of every mutation | schedule, unschedule, cancel, lot add/edit/withdraw | "Schedule" and "withdraw the last lot" must not both win, and `lotNo` must stay gapless under concurrent adds | `lockAuction()` | A losing request waits, then re-reads and is refused or no-ops; repeated transitions write no second audit row |
| Text limits | title 160, terms 5,000, cancel reason 300 characters; quantity 1 to 1,000,000 | DTOs | Long enough for a real lot description and legal terms, short enough to keep a list page cheap | class-validator | 400 |
| Role grants | `auction.view`, `auction.manage`, `auction.publish` to the Admin role only; sensitivities low, medium, high | permission catalogue and migration `20261002180100` | The three keys are not toxic with one another today. `auction.publish` is high because it makes an auction visible to bidders | `ROLE_PERMISSION_SEED` for new deployments; the migration for existing ones, because `seedRoles()` runs once | An unreachable permission is a defect, so the migration is idempotent (`ON CONFLICT DO NOTHING`) and grants only to a permission with no grant yet |

Pillars touched: architecture (the module imports no other module; the launchpad
manifest entry is carried by WO-232.2), secure by design (every route states a
permission; the reserve price is stripped from any read by a caller without
`auction.manage`), stable and reliable (row lock, idempotent transitions,
forward-only hand-written migrations tested on a scratch database from an empty
state and from a simulated existing deployment). Observability is audit rows on
every state change and Nest `Logger`; no metrics backend exists to wire in.

Known gaps, stated rather than hidden: auction start and end are entered in the
browser's time zone and stored as UTC, so the admin screen shows what was
typed only on the same zone; there is no BigInt price path yet (above); the
`OPEN` status badge keeps its neutral tone from the shared task state until
WO-234.3 opens lots for real.

### ADR-086 addendum (2026-10-02) — WO-234.2 bidding: the BIGINT decision made, and the exact parameters

The open decision in the WO-234.1 addendum is closed: `AuctionLot.startPriceMinor`
and `reservePriceMinor` are `BIGINT` (migration `20261002190000`, which widens in
place and keeps every value), and `Bid.amountMinor` is `BIGINT` from its first
day. Money elsewhere in the repository stays `Int`; the auction is the one
exception, contained at the service boundary (every lot and bid leaves
`AuctionService` as a plain number, so JSON never meets a `bigint`). The ceiling
is 10^15 minor units; the reasoning is in doc 234 §12.

Built: `placeBid()` (one writer of a lot's price), `Bidder` and `Bid`,
`verifyBids()`, the bidder route and the admin ledger. Two supporting changes
outside the auction module, both additive: `core/common/hash-chain.ts`, the
tamper-evident chain doc 231 §2.3 also names, as pure functions with no
dependency, so doc 231's `WorkContribution` calls the same code; and
`AllExceptionsFilter` now passes a vetted `code` (SCREAMING_SNAKE_CASE) and flat
`details` (at most ten primitive values) from an exception to the response, so a
client can tell "BID_TOO_LOW" from "AUCTION_ENDED", both a 409. Before this the
filter replaced every exception's `error` with the HTTP status name, which made
the `error: 'INVALID_MEASUREMENTS'` the measurements module sets unreachable by
clients; that module is untouched and can adopt `code` when it needs to.

| Parameter | Exact value | Applies to | Why this number | Enforced | Fails how |
|---|---|---|---|---|---|
| Price ceiling | 10^15 minor units | every `*Minor` on a lot or bid | Largest round number whose 5% step and the sum with it stay below 2^53 − 1 (9.007 × 10^15); `computeIncrement` multiplies in `BigInt` regardless | `@Max(MAX_MINOR)`; `BIGINT` is the backstop | 400 naming the limit |
| Minimum raise | max(ceil(current × 500 / 10 000), `toMinor(1)`) | `minimumNextBid()` | 5% takes about 15 raises to double a price; one whole currency unit is the smallest step a person calls a raise | `placeBid()`; copied onto the auction at `schedule()` from Settings `auction.bid_increment_bps`, `auction.bid_min_step_minor` | A missing or malformed field falls back to its default, field by field |
| Lot lock | `pg_advisory_xact_lock(8_241_171, hashtext(lotId))`; bidder provisioning `8_241_172` keyed by auction id | `placeBid()` | Serialises writers of one lot so the loser re-checks against the new price; the second lock keeps "Bidder N" gapless. Lock order is always lot, then bidders | the transaction | A waiter queues up to `maxWait`, then a 503 |
| Bid transaction | `maxWait` 10 000 ms, `timeout` 10 000 ms | `BID_TRANSACTION` | Prisma's 2 000 and 5 000 refuse a healthy hot lot in a final-minute rush; 10 s drains the 50 bids/s target through a pool of ten and still fails visibly | Prisma | 503, "your bid was not placed", nothing written |
| Attempts | 3 whole attempts | `MAX_BID_ATTEMPTS` | A bound on a bug, not a tuned number: the lock makes a lost predicate rare | `placeBid()` | 409 `LOT_CHANGED` |
| Per bidder per lot | 10 accepted bids per rolling 60 000 ms | `assertWithinBidRate()` | Unreachable by hand, reachable by a script; doc 234 §12 | counted from the ledger via the `(bidderId, acceptedAt)` index, so every node agrees without a shared counter | 429 `BID_RATE_LIMITED`, `Retry-After` set |
| Per client address | 60 requests per 60 000 ms | `POST /auctions/lots/:lotId/bids` | One a second sustained; ten bidders behind one office address still get six a minute each | `@Throttle`, Redis-backed `SharedThrottlerStorage` | 429; a Redis outage follows the throttler's existing per-route policy |
| Chain verification page | 1 000 bids per read | `verifyBids()` | A lot with 100 000 bids is never in memory at once; keyset on `seq` | the loop | none; read-only |

Pillars touched: architecture (the module still imports no other module; the
hash chain is core and pure), secure by design (the bid route is
`@AuthenticatedOnly` on purpose, closed to API keys by having no `CustomerScope`;
staff who run an auction are barred from bidding on it by data; no response
carries a user id, the reserve or the idempotency key; the admin ledger shows
aliases), stable and reliable (one transaction per bid, a retry of an accepted
key answered from the record even after close, the unique indexes behind the
lock, a refused first bid burning no alias), observable (`Logger` at `debug` for
an accepted bid, `warn` for a lost predicate or a timeout; no `AuditLog` row per
bid, because the hash-chained `Bid` ledger is the record and a row per bid
would double the write volume of the hottest path).

Known gaps, stated rather than hidden: nothing opens an auction until WO-234.3,
so bids exist only in tests; the bidder-facing bid box is WO-234.4; the §6 load
test needs the realtime path; staff identity-barring by `Party` link is WO-234.5;
`Bid` is not partitioned by month yet (doc 234 §4).


### ADR-086 addendum (2026-10-02) — WO-234.3 proxy bidding, anti-snipe and the close job: exact parameters

Built: `ProxyBid` and `AuctionResult`, per-lot `endsAt` and `extendedMs`
(migration `20261002200000`, additive), `setProxyBid()`, `placeBid()` rebuilt as
a commit pipeline, `AuctionLifecycleService` and `AuctionLifecycleCron`. The
module still imports no other module; the only core additions are three Settings
keys and the reuse of `encryptSecret()`.

Decisions, each with the alternative it displaced:

- **One commit writes a manual bid and at most one system answer, as consecutive
  links of the same chain, with one guarded `UPDATE`.** The alternative, a second
  transaction for the answer, would let a reader see a lot led by the manual
  bidder for a moment and would let a crash between the two lose the answer.
  Both bids carry the one `acceptedAt` the database clock gave under the lot's
  lock; their `seq` orders them.
- **One answer, never a ladder.** `resolveProxy()` jumps straight to the price
  the leader would have reached, so a 10 000-to-1 gap between two maxima costs
  one ledger row. The ladder (an auto-bid per increment) would have made the
  hottest path write amplification proportional to the gap.
- **A maximum is encrypted, raise-only and owner-readable.** AES-256-GCM with the
  existing `APP_ENCRYPTION_KEY`; lowering is refused because a maximum that could
  be pulled lets a bidder frighten others off with a number never meant; a raise
  counts as a new offer placed now and loses its place in a tie. Rotating the
  key means re-encrypting `ProxyBid` rows; there is no automatic migration of
  ciphertexts, which is an open item for key-rotation work, not for this one.
- **The lot closes `OPEN → CLOSED` directly.** No status between the end and the
  result needs protecting, and the auction's row is locked before the count of
  what is left, so two lots of one auction closing together cannot each see the
  other open and leave the auction open for ever (tested).
- **An outage extends, it never closes.** A lot found more than 60 s past its end
  is given 120 s from now once, audited, and outside the anti-snipe cap.
- **No domain event yet.** Nothing consumes one; WO-234.6's `AuctionOrderSink`
  will, and will define `auction.lot_closed` from the `AuctionResult` row then.

| Parameter | Exact value | Applies to | Why this number | Enforced | Fails how |
|---|---|---|---|---|---|
| Anti-snipe window | 120 000 ms (Settings `auction.anti_snipe_window_seconds` 120), a bid exactly at the edge is inside | a bid's effect on a lot's end | Long enough to read "you were outbid" and answer | `antiSnipeExtensionMs()` in `commitBids()`, snapshot on the auction at `schedule()` | missing or malformed → default, field by field |
| Anti-snipe extension | 120 000 ms (`auction.anti_snipe_extend_seconds` 120; 0 switches it off) | one commit | As long as the window, so a lone late bid always leaves one full window | same | same |
| Anti-snipe cap | 1 800 000 ms per lot (`auction.max_extension_seconds` 1 800) | a lot's total extension | A war ends within half an hour; staff and sellers can plan | same; the last extension is cut to what is left | no further extension |
| Standing maximum | ≤ 10^15, ≥ the next bid (a leader's: ≥ their bid), never lowered | `setProxyBid()` | A maximum below the next bid could never be used | the service | 409 `PROXY_TOO_LOW`, `PROXY_CANNOT_LOWER` |
| Proxy route | 30 requests per 60 000 ms per client address | `PUT /auctions/lots/:lotId/proxy` | Half of a bid's allowance: a decision, not a race; slows a probe for another bidder's maximum to one per two seconds on top of the lot lock | `@Throttle`, Redis-backed | 429, nothing changed |
| Bid rate count | manual bids only | `assertWithinBidRate()` | The system's answers are not the bidder's doing; counting them would let a bidding war lock a proxy holder out | the query's `kind: 'MANUAL'` | — |
| Job cadence | every 15 000 ms, 100 auctions and 100 lots a run, a run skipped while the last still goes | `AuctionLifecycleCron` | 15 s is how soon a result appears; 100 a run is 400 a minute against a handful of auctions; a backlog drains over runs | the cron, idempotent by predicate | a failing lot is logged and left for the next run |
| Outage grace and extension | found > 60 000 ms late → extend to 120 000 ms from now, once | `closeLot()` | 60 s is four missed runs; two minutes is the same window as anti-snipe | `OUTAGE_GRACE_MS`, `OUTAGE_EXTENSION_MS` | a longer outage extends again on the next recovery |

Pillars touched: architecture (no new import between modules; the proxy maths is
pure and the pipeline shares one `commitBids()` for a bid and a maximum), secure
by design (a maximum is encrypted at rest and readable by its owner alone, not
by staff and not in the ledger; the proxy route is `@AuthenticatedOnly` with no
`CustomerScope`; staff who run the auction cannot set one), stable and reliable
(close and open are idempotent by predicate and under locks, safe on every node
at once with no leader; a failing lot never blocks the batch), observable (`Logger`
at `log` for each open and close, `warn` for an outage extension, `error` for a
failure; `AuditLog` rows for `auction.opened`, `auction.lot_closed`,
`auction.closed` and `auction.lot_extended_after_outage`, none per bid).

Known costs and gaps, stated rather than hidden: every bid decrypts every
standing maximum on its lot, a few microseconds each and bounded by the bidders
who hold one, so it is cheap for the 50 bids a second target and would want a
per-lot cache under the lot lock only if one lot ever carries thousands of
maxima; a bidder still has no screen to bid from, and learns they were outbid by
a maximum only from the response to their own request or the next read of the
lot, until WO-234.4's realtime path; the §6 load test is WO-234.4's;
reserve-not-met leaves staff to make an offer by hand until WO-234.6 gives them
somewhere to do it.

### ADR-086 addendum (2026-10-03) — WO-234.4 realtime fan-out and the public lot page: exact parameters

Built: the `realtime` Redis keyspace with `RedisService.subscriber()`,
`AuctionRealtimeService`, `AuctionPublicService` and `AuctionPublicController`,
the bidder's own `GET /auctions/lots/:lotId/me`, the storefront list and lot
pages, and `scripts/load-auction.mjs`. No schema change, no migration, no new
dependency, no import between modules: the `auction` module still imports
nothing, and the nav entry reads the enabled-modules list the storefront already
had.

Decisions, each with the alternative it displaced:

- **An event is a snapshot, not a delta.** The price, `bidSeq`, minimum next
  bid, end, state and the newest ≤ 20 bids. That makes merging two events a
  rule (the later, by `bidSeq` then by state rank) instead of a protocol, makes a
  lost event free, and lets a late joiner be sent the same thing as everyone
  else. A delta stream would need ordering, gap detection and replay on every
  node, and one dropped message would corrupt a page until it reloaded.
- **Publish after the commit, never inside it, never awaited.** Redis being
  slow or down must not fail or delay a bid (R5's spirit: a fact that happened
  is not undone by a dependency). The failure mode is a watcher that learns of
  the bid up to 5 s late by polling; the recovery path is the poll and the
  reconnect snapshot. The alternative, writing the event to the transactional
  outbox, was rejected for this path: the outbox is for facts a consumer must
  not miss, and a snapshot that is superseded in 250 ms is not one.
- **Merge per lot per node (250 ms), not one write per bid.** The cost of a hot
  lot to each watcher is bounded at four writes a second whatever the bid rate;
  the cost to the writer is nothing, because it never waits on a watcher.
- **Server-sent events with a polling fallback, not WebSockets.** The traffic is
  one-way; SSE reconnects by itself, sends the current snapshot on every
  reconnect, and passes through ordinary proxies. A client that cannot hold a
  stream polls the same read the page already uses, so there is no second
  protocol to keep correct.
- **The public lot read is cached for 1 s per node.** Owner: `AuctionPublicService`.
  Key: lot id. Expiry: 1 000 ms. Invalidation: a realtime event for the lot, on
  this node, drops the entry. Freshness: a person bidding reads a price at most a
  second old and the server still decides every bid. Auth isolation: the cached
  value is the public view only, which carries no viewer data, so one entry
  serves everyone; the viewer's own standing is a separate read (`/me`).
- **A public view never reveals more than a person at the auction would know.**
  No reserve (only SOLD, or NOT_SOLD with `RESERVE_NOT_MET` or `NO_BIDS`), no
  names or accounts (only the per-auction alias), and a lot that is withdrawn, or
  in a draft or cancelled auction, is a 404 indistinguishable from an unknown id.
- **The viewer's standing needs `participating`, not just the alias.** An alias
  belongs to the auction, not to a lot, so a bidder with an alias from another
  lot of the same auction would otherwise be told "you have been outbid" on a lot
  they never bid on. `ViewerLotState.participating` is true only when the bidder
  has a bid or a standing maximum on this lot.
- **No offline queue.** A bid sent from a page that was offline would be placed
  at a price and a time the bidder did not see; the page says so and sends
  nothing. A retry of the same amount reuses its idempotency key, so a bid whose
  answer was lost is safe to repeat.

| Parameter | Exact value | Applies to | Why this number (not smaller or larger) | Enforced | Fails how |
|---|---|---|---|---|---|
| Merge window | 250 ms per lot per node, first event immediate | writes to a lot's watchers | Four a second is as fast as a screen is read; smaller makes the 50 a second target a flood, larger makes the page feel late | `FLUSH_INTERVAL_MS` | no events; the page polls |
| Open streams per node | 5 000 | `GET …/stream` | Inside a default descriptor limit and memory; a node protects the watchers it has | `MAX_STREAMS_PER_NODE` | 503, `Retry-After: 5`; the page polls |
| Slow-consumer drop | 65 536 bytes unsent | one watcher | About thirty full events; past it the link is stalled and Node would hold every write in memory | `MAX_BUFFERED_BYTES` | its updates are dropped; the page re-reads on a `bidSeq` gap |
| Heartbeat | 15 000 ms | an idle stream | A quarter of a typical 60 s proxy idle timeout | `HEARTBEAT_MS` | a proxy closes the stream; the browser reconnects |
| Stream age | 600 000 ms | one stream | Bounds a half-dead connection and a node being replaced; not churn | `MAX_STREAM_AGE_MS` | a reconnect costs one snapshot |
| Client reconnect | 5 000 ms (SSE `retry`), 5 000 ms ±20 % after a refusal | the browser | A crowd that lost a stream together must not return together | `CLIENT_RETRY_MS`, `useLotLive` | polling meanwhile |
| Polling fallback | 5 000 ms ±20 %; ≥ 1 000 ms between event-triggered reads | the page with no stream | A bid is seen within five seconds; the spread de-synchronises a crowd | `POLL_FALLBACK_MS`, `REFRESH_MIN_GAP_MS` | the page keeps what it shows |
| Lot page cache | 1 000 ms, 2 000 lots, single-flight | `GET …/lots/:lotId` | One database read a second per node however many pages poll; a second is the freshness a polling page already accepts | `LOT_PAGE_CACHE_MS`, `MAX_CACHED_LOTS` | a miss is a database read |
| Public lot page throttle | 120 per 60 000 ms per client address | `GET …/lots/:lotId` | A page polling every 5 s makes 12 a minute, so ten pages can share an address | `@Throttle`, Redis-backed, off under `NODE_ENV=test` | 429 |
| Stream throttle | 60 per 60 000 ms per client address | `GET …/lots/:lotId/stream` | One open per page; several reconnects a minute still fit | same | 429 |
| Bids in an event | 20 | one event, one page | A page lists twenty; a longer history is a read | `MAX_EVENT_BIDS` | a watcher behind by more reads the lot |
| Closing soon | 300 000 ms | display only | Long enough to decide, short enough to remain a signal | `CLOSING_SOON_MS` | none |
| List page | 12 lots | the storefront list | Fills a row at every width | `PAGE_SIZE` | none |

Measured (§16.11 of doc 234, one development machine, one node): at 50 bids a
second every bid was accepted, bid p95 18 ms, a watcher told within 247 ms at
p95, chain valid; at 100 a second with 1 000 watchers all were correct but bid
p95 was 479 ms, over the 300 ms target. The target is met; the headroom beyond
it is thin and unmeasured on production hardware.

Pillars touched: architecture (no new coupling; the realtime path is a core
Redis keyspace and the module's own services), scalable (per-node fan-out, a
per-lot cache and merge so cost grows with lots, not bids), secure by design
(the public routes are `@Public` and read-only; the viewer's own state is
`@AuthenticatedOnly` with no `CustomerScope`, like the bid routes, and reads only
the caller's own rows; nothing a bidder could use against another leaves the
server),
stable and reliable (a failed publish, a down Redis and a stalled watcher each
degrade to polling and none touches a bid), observable (`Logger` warnings, at most one a minute for a failed publish, and
on a failed subscription or a failing listener; a write to a dead socket at
`debug`; no per-event log).

Known costs and gaps, stated rather than hidden:

- **Behind a reverse proxy the stream must not be buffered.** The response sets
  `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`; the
  deployment's proxy (Caddy, nginx) must flush as it receives and must not apply
  a response timeout shorter than the 15 s heartbeat. Not verified here: there is
  no proxy in this environment.
- **No "open" event.** Nothing is published when an auction opens, so an
  upcoming lot is polled, and a lot is streamed only while open.
- **Fan-out is per node.** 5 000 streams is a node's limit, and a very large
  audience for one lot needs more nodes, each subscribing to Redis once.
- **The list page does not refresh itself,** and the lot pages carry no
  server-rendered metadata, so a shared link has no preview.
- **My bids and Watchlist are not built;** neither is lot media.
- **Redis pub/sub is at-most-once.** A message sent while a node is
  disconnected is lost; the reconnect snapshot and the poll are what close the
  gap, which is why no delta is ever relied on.

### ADR-086 addendum (2026-10-07) — WO-234.5 bidder registration, approval and strikes: exact parameters

Built: `Auction.registration`, `BidderStatus.DECLINED`, the decision and appeal
columns on `Bidder`, `BidderStrike`, the pure rules in `bidder-trust.ts`,
`AuctionBidderService`, the customer routes `POST /auctions/:auctionId/registration`
and `…/appeal`, the staff routes under `admin/auctions/:id/bidders`, the
permission `auction.bidders.manage` (catalogue, the "Sales & payments" bundle and
a migration that grants it to the live Admin role), the viewer's registration
state, the lot page's register-to-bid states, and the Bidders panel and sheet on
the admin auction page. One additive migration; no new dependency; the `auction`
module still imports no other module (identity is read through the core
`IdentityVerificationStatusRegistry`).

Decisions, each with the alternative it displaced:

- **How an auction vets its bidders is a column on the auction, not one
  deployment switch.** A shop runs a free-for-all clearance and an invitation-only
  sale in the same month. The value is chosen while the auction is a draft and
  frozen from `schedule()` like every other rule bidders can see. The displaced
  option, one Setting for the whole deployment, would have made the stricter sale
  loosen or the looser one tighten whenever someone changed it.
- **A single pure function decides eligibility.** `eligibility()` is called by
  `placeBid()`, `setProxyBid()`, the viewer's own state and registration, so the
  page's "you can bid" and the API's "you may not" cannot drift. The previous
  shape had the same two checks written twice, in the service and in the public
  read, with the same text copied into both.
- **A strike belongs to a person and is computed, not stored.** The threshold is
  "three in twelve months", a fact about someone across auctions; a counter on the
  per-auction `Bidder` would be wrong the day they bid in a second auction, and a
  counter of any kind goes stale when a strike is voided.
- **Reaching the threshold flags and never suspends.** §8 says suspension is a
  staff decision with a reason, and an automatic ban on a count is the silent ban
  §8 rules out for fraud signals. The system's part is to stop *approving*
  without a human: the registration lands `PENDING`, and an open-auction first bid
  is refused until the person registers.
- **A refused registration is `DECLINED`, not `SUSPENDED`.** The person reads
  "your registration was not approved" and staff read a different history. The
  cost is one enum value, added in a migration that does not use it.
- **The reason is written for the bidder.** A refusal states its remedy
  (design law `FLO-7`); the form says the bidder will read it, so staff do not put
  an internal note there. The audit row carries the same text.
- **Decisions, strikes, voids, registrations and appeals use `recordEvidence()`
  in the same transaction.** They change what someone may do. A failed audit write
  fails the act, where the module's other transitions use the log-and-continue
  `record()`.
- **Predicate-on-write on the status.** A decision is an `UPDATE … WHERE id = ?
  AND status = <the status the staff member saw>`. Two staff acting on one
  registration cannot both succeed: the second gets 409 `BIDDER_CHANGED` and the
  fresh row, never a silent overwrite.
- **Nobody decides on themselves.** Compared on `userId` at the act
  (`CANNOT_DECIDE_OWN`), because the same person can hold `auction.bidders.manage`
  and a customer account.
- **The strike policy is read before a bid's transaction opens, never inside
  it.** The policy is two Settings, and a Setting that is not cached is read on a
  second pool connection. A first-time bidder under `OPEN` needs it to learn
  whether they are at the threshold, so the first version read it inside the bid
  transaction: each bid held one of the pool's ten connections while asking for
  another. With the cache cold (a restart, or the 30 seconds an L1 entry lives)
  and more first-time bidders than connections, every connection was held by a
  bid waiting for one, and every bid timed out as a 503. It showed first as three
  concurrency tests failing in the combined e2e run and passing alone. The policy
  is now read by `placeBid()` and `setProxyBid()` before `inBidTransaction()` and
  handed in; `strikeState()` takes it as a required argument, so a caller cannot
  forget. Pinned two ways: unit tests assert the order (policy, then
  transaction), and `test/auction-bidders.e2e-spec.ts` runs 40 first-time bidders
  at once after `settings.invalidate()` against a pool of ten, which returns 503
  to all 40 with the read inside the transaction and to none with it before.
  The displaced option, a longer pool timeout, hides the starvation until the
  crowd is a little bigger. The rule generalises: nothing inside an interactive
  transaction may wait on a second connection.
- **Suspension does not rewrite the ledger.** An accepted bid is a record
  (§5.2). The suspended bidder's maximum stops answering (the proxy read already
  requires `APPROVED`) and no new bid is accepted; a standing bid is removed only
  by a void under `auction.adjust` (WO-234.9), and the screen says so when staff
  suspend.

| Parameter | Exact value | Applies to | Why this number (not smaller or larger) | Enforced | Fails how |
|---|---|---|---|---|---|
| Strikes to review | 3 not voided within 365 days, per person; Settings `auction.strikes_to_review` 1 to 20 and `auction.strike_window_days` 1 to 3 650 | the flag and the `PENDING` landing | One slip is human, three is a pattern; a year shows a pattern without one bad week following someone for ever | `strikeState()` in `bidder-trust.ts`, `AuctionBidderService` | flags only; a missing or malformed value → 3 and 365 |
| Default registration | `APPROVAL`; Setting `auction.registration_default` | `AuctionService.create()` when the request names none | The cost of one click on an open sale is far below the cost of an unvetted winner who does not pay | `create()` | malformed → `APPROVAL`; the column itself defaults to `OPEN` for auctions that already ran |
| Registration throttle | 10 per 60 000 ms per client address | `POST /auctions/:auctionId/registration` | Once per auction per person: ten lets an office register several people, a script is held to one every six seconds | `@Throttle`, Redis-backed, off under `NODE_ENV=test` | 429, nothing changed |
| Appeal throttle | 5 per 60 000 ms per client address | `POST /auctions/:auctionId/appeal` | An appeal is written once | same | 429 |
| Reason length | 1 to 500 characters | decline, suspend, keep, strike, void | A paragraph a person reads and an audit row stores | DTO `@MaxLength` | 400 naming the limit |
| Appeal length | 1 to 1 000 characters | an appeal | Room to explain without becoming a letter | DTO `@MaxLength` | 400 |
| Open appeals | 1 per bidder | the bidder row | One question at a time; the audit trail holds history | `appeal()` | 409 `APPEAL_ALREADY_OPEN` |
| Waiting-page refresh | 20 000 ms ±20 % while `PENDING` or an appeal is open, and on tab focus | the lot page's own state read | An approval is seen within half a minute; three reads a minute per waiting page is cheap, and the spread keeps a crowd from lining up | `useLotViewer` | the page keeps showing "waiting" |
| Bidders list | 20 a page, 100 at most | the staff queue | The shared pagination limits | `PaginationQueryDto` | none |

Pillars touched: architecture (one pure rule shared by four callers; no new
coupling, identity through an existing extension point), scalable (the queue is
indexed `(auctionId, status, createdAt)` and paged; the strike window reads only
rows inside it through `(userId, recordedAt)`; the bid hot path adds no query for
a bidder that already exists), secure by design (`auction.bidders.manage` on
every staff route, checked server-side; the customer routes find the caller's own
row by `(auctionId, userId)` and never take a bidder id; identity columns leave
the server only on the staff routes; a person cannot decide on themselves),
stable and reliable (predicate-on-write decisions, the audit row in the same
transaction, an identity lookup that fails is "not verified"), observable (`Logger`
lines for each decision with the actor and the auction, no reason text or contact
details in the log; the audit rows are the trail).

Known costs and gaps, stated rather than hidden:

- **No message reaches a bidder or an approver.** There is no `notify` wiring in
  this work order, so the person sees the state on the lot page (refreshed every
  20 s while waiting) and staff see a count on the auction page. The first
  consumer of a `bidder decided` event would be `notify`; none is published until
  then. (`auction.lot_closed` is published from WO-234.6.)
- **A suspended leader still leads.** Their bids stand until WO-234.9 can void
  them, which matters on a lot that closes before then.
- **B2B accounts, `Party` conflict barring, `expiresAt`, deposits and lot-value
  caps are not built;** each is named in §8 of doc 234 with the work order that
  owns it.
- **Strikes are entered by staff.** Nothing records "did not pay" until
  settlement exists. (WO-234.6 records it itself, with `recordUnpaidWinStrike`: a
  sibling method on the same service and the same table, with no author, because
  the person the strike is about is never the person who recorded it.)


### ADR-086 addendum (2026-10-07) — WO-234.6 settlement: what a winner owes, and exact parameters

Built: `AuctionSettlement` and `AuctionSettlementPayment`; `Order.sourceType` and
`sourceRef` (unique together); the `AuctionOrderSink` extension point in
`core/extension-points/`, implemented by `AuctionOrderSinkService` in `orders`;
the `auction.lot_closed` domain event; `AuctionSettlementService` with its
subscriber, its 60-second sweep and its staff routes under
`admin/auctions/:id/settlements`; the permission `auction.settle` (catalogue, the
"Sales & payments" bundle, and a migration granting it to the live Admin role);
three Settings; the winner's card and the one-line cost on the storefront lot page;
the admin "Winners" figure, list and dialogs. Three additive migrations, none of
which rewrites a row; no new dependency. The `auction` module imports no other
module: orders are reached through the extension point, payments and cancellations
through the domain events `payment.succeeded` and `order.cancelled`.

Decisions, each with the alternative it displaced:

- **The auction does not make orders; it asks the one thing that does.** The
  alternative, `auction` importing `OrdersService`, would make orders a hard
  dependency of an optional module and add a `KNOWN_MODULE_COUPLINGS` entry for a
  write that has no need to share a transaction. A retry after a crash is safe
  without one: the order is keyed on `(sourceType, sourceRef)`, so asking twice
  returns the first.
- **A debt is a row per attempt, not a flag on the result.** `(lotId, attempt)` is
  unique: attempt 1 is the winner, attempt 2 the next bidder staff offered it to.
  The displaced shape, one settlement per lot that is edited when the lot moves to
  someone else, would lose the first buyer's lapse and strike the moment it is
  re-offered.
- **A payment is counted by its own id.** `AuctionSettlementPayment` has the
  payment's id as its primary key, so a second delivery of `payment.succeeded` is a
  unique-key conflict inside the transaction and counts nothing. The displaced
  option, summing the order's payments on each event, is correct only while no
  payment is ever edited.
- **One lock per settlement serialises a payment against a lapse.** A payment
  racing the sweep is the only way to strike someone who paid. Both take
  `pg_advisory_xact_lock` in namespace 8 241 173 on the settlement's id and both
  re-read the status under it. The namespace is separate from the lot (8 241 171) so
  a flood of bids does not queue behind a payment.
- **The sweep waits ten minutes past the stated deadline before it lapses a win.**
  The buyer is shown the deadline. A payment staff approved a moment earlier takes
  one trip through the outbox to arrive, and the outbox retries a failing delivery
  for about four minutes; striking someone for a delay between two systems is the
  worse error, and it costs a person nothing to be told a little late.
- **A lapse strikes once, with no author, and cancels the order.** It is a fact the
  system found, not an act a person did, so `BidderStrike.recordedById` is nullable
  and `settlementId` is unique: the second sweep that reaches the same win cannot
  record a second strike. The order and its payment are cancelled best-effort; if
  the order cannot be cancelled the lapse stands and the reason is written on the
  row for staff, because a debt that cannot be released must not keep the lot
  hostage.
- **Cancelling a win is not a strike.** Staff cancel a win when the fault is the
  shop's or the buyer's circumstance. It requires a reason, nobody may cancel their
  own, and a paid win cannot be cancelled here (it is refunded from the order).
- **Offering to the next bidder is staff's act, at the bidder's own bid.** The
  displaced option, automatic cascading, sells a lot to someone who has not
  noticed it is theirs, and at a price they may have forgotten. The offer is
  one-time per bidder, never while the first win is owed, and shows who and at what
  before anything is written.
- **The premium and the payment window are frozen onto the auction at
  `schedule()`.** What a bidder was told when they decided to bid is what they pay.
  The displaced option, reading the Setting at close, makes an edit made during the
  sale change the price of lots already bid on. The lot page states both before
  anyone bids.
- **The premium is part of the order's total, apart in the lines.** Premium income
  is therefore not separated from sales in the books. That is a named gap, owned by
  WO-234.11, not a decision.
- **A failed invoice waits; it never blocks a close.** `INVOICE_FAILED` carries the
  reason, creates nothing and replays when the cause is fixed. The close itself has
  already committed and published; nothing downstream can roll a sale back.

| Parameter | Exact value | Applies to | Why this number (not smaller or larger) | Enforced | Fails how |
|---|---|---|---|---|---|
| Payment window | 72 hours from the invoice; Setting `auction.payment_window_hours`, whole number 1 to 720, copied onto the auction at `schedule()` | the win's deadline | Covers a weekend bank transfer; shorter penalises honest buyers, longer ties up the lot; 720 hours (30 days) is the ceiling because beyond it a lot is relisted, not waited on | `paymentDueAt()` in `settlement.ts`, `parseBidRules()` | malformed → 72 |
| Buyer's premium | 0 basis points by default, 0 to 5 000; Setting `auction.buyer_premium_bps`, copied onto the auction at `schedule()`; rounded half up to a whole minor unit | the invoice total | An auction that was shown without a premium must stay that way; above half the price is a typo | `settlementAmounts()` (BigInt) | malformed → 0 |
| Expiry grace | 600 000 ms (10 minutes) past the deadline | the sweep | The outbox retries a failing delivery for about four minutes; ten lets the slowest honest payment land first | `EXPIRY_GRACE_MS` | a payment after the lapse is counted, audited `auction.payment_after_end`, flagged for staff |
| Sweep | every 60 000 ms, at most 50 lapses and 50 stalled invoices per run; a run is skipped while the last still goes | the lapse job | A minute is far finer than an hours-long window and coarser than the 15 s lot job; 50 a run is 3 000 an hour | `AuctionSettlementCron` | a failing win is logged and left for the next run; two nodes cost a wasted query, never a double strike |
| Stalled invoice retry | 120 000 ms in `INVOICING` | the same sweep | Far longer than an invoice takes, far shorter than the window | `STALLED_INVOICING_MS` | shows as "to fix"; staff can replay |
| Invoice delivery retry | the outbox's own: 8 attempts, backoff, batch 25 every 2 000 ms | `auction.lot_closed` | The existing dispatcher's parameters, unchanged | `OutboxDispatcher` | after the last attempt the event is dead-lettered and the stalled retry still repairs the win |
| Largest invoice | 2 147 483 647 minor units | the order | The order's money columns are `Int`; the auction's are `BIGINT` | `MAX_ORDER_MINOR` | `INVOICE_FAILED` stating the limit |
| Settlement lock | one `pg_advisory_xact_lock` per settlement, namespace 8 241 173 | payment, lapse, cancel, offer | Serialises the only races that can strike a buyer who paid | `lock()` | waits, then re-reads; a stale screen gets 409 `SETTLEMENT_CHANGED` |
| Cancellation reason | 1 to 500 characters | cancel | A sentence a person reads; the audit row stores it | DTO `@MaxLength` | 400 naming the limit |
| Invoice-wait refresh | 5 000 ms for the first 12 reads (60 s), then 20 000 ms, only while the buyer's invoice is missing or being made | the lot page's own state read | The invoice normally exists within seconds; after a minute something is wrong and a slower poll is enough | `settlementPollMs()` | the page keeps showing "preparing" |
| Settlements list | 20 a page, 100 at most | the staff list | The shared pagination limits | `PaginationQueryDto` | none |

Pillars touched: architecture (one extension point, three events, no new
coupling; the pure rules in `settlement.ts` and the page's helpers are testable
without a render or a database), scalable (indexes `(lotId, attempt)` unique,
`(auctionId, status, createdAt)`, `(status, dueAt)`, `(orderId)`, each named for
the query it serves; the sweep is batched; "who would be offered" for a page of
rows is two grouped queries, not one per row), secure by design (`auction.settle`
on every staff route, checked server-side; the winner's route finds their debt by
`(lotId, userId)` from the token and takes no id from the request; the list carries
aliases, never a name, email or phone; nobody acts on their own win), stable and
reliable (the order keyed on `(sourceType, sourceRef)`, the payment keyed on its
id, a lock per settlement, predicate-on-write on every state change, the
transactional outbox for delivery, a sweep that repairs a crash between claiming
and ordering), observable (`Logger` lines for each invoice, lapse, cancel and offer
with the settlement id and no personal data; `recordEvidence()` inside the
transaction for paid, lapsed, cancelled and offered, `record()` for the retryable
states invoiced and invoice failed).

Known costs and gaps, stated rather than hidden:

- **Staff are not told when an invoice fails.** The "to fix" figure and the list
  show it; nothing messages anyone. A message to the holders of `auction.settle`
  would be the first consumer of a staff-facing notification and is not built here.
- **No tax on an auction invoice, and no separate premium income.** The premium is
  inside the order's total; both belong to the ledger work in WO-234.11.
- **A consignor's payable, stock release and relisting are not built** (WO-234.11).
  A lot with no stock source moves no stock.
- **Orders cap at 2 147 483 647 minor units.** A larger win is `INVOICE_FAILED`
  with the limit stated.
- **A payment in the instant before the order's id is written down is not
  counted.** The 120 s stalled retry repairs the invoice, not that one payment;
  staff see the order paid and the win unpaid and replay it. The window is a few
  milliseconds wide.
- **Cancelling the order at a lapse is best-effort.** If it fails the lapse stands
  and the reason is on the row.
- **`expireDue()` lapses every overdue win in the database.** The end-to-end test
  therefore runs only against a development or CI database, never one holding real
  sales.
