# 58 — The live operational feed: a read-model over rows that already exist

> **Status: shipped (2026-09-26), WO-58.1/58.2/58.3.**
> `GET /admin/feed` (`core/feed/`) merges `OrderFeedSource`,
> `PurchaseOrderFeedSource` and `PaymentFeedSource` — the identical
> `ActionHubSource`-shaped registration pattern doc 44 established, so a
> fourth source is additive, never a rewrite. `PurchaseOrderFeedSource`
> gates on `purchasing.manage` (the same permission `purchasingSpend()`
> already requires for these figures) and returns nothing for a
> location-scoped call, since `PurchaseOrder` itself carries no
> `locationId` column — only `GoodsReceipt` does, once goods land
> somewhere; `null` is honest here, never a guessed default.
> `PaymentFeedSource` resolves `locationId` from its own order. The client
> widget (`live-feed-widget.tsx`) polls every 8s with a `sinceId` cursor
> and shows a visible retry state on a failed poll — it ships on the admin
> dashboard home. It does **not** ship on doc 52's own "staff self-service
> mobile app shell" — verified doc 52 carries no `Status:` note and no
> corresponding code exists anywhere in this repository, so there is no
> such shell to add a widget to. Building doc 52 itself is a separate,
> much larger feature and is explicitly out of scope for this work order;
> the honest gap is named here rather than silently skipped.

"Embedded home-screen transaction logs displaying recent sales, purchases,
and order statuses in real time without opening separate ledgers" is,
underneath the phrase "in real time," a request for **one unified,
human-readable read** over three tables (`Order`, `PurchaseOrder`,
`Payment`) that already record every fact this feed would show. This
document is that read-model projection, plus an honest statement of what
"real time" actually means here — this repository has no WebSocket or
server-sent-event infrastructure today, and adding one is a real
architectural decision (a new always-on connection model, a new failure
mode, a `DECISIONS.md` entry of its own) this document does not make
casually just to answer a dashboard-widget request.

## 1. "Near-real-time," stated honestly, is short-interval polling

The feed refreshes on a short client-side poll interval (a few seconds),
reading only rows newer than the last-seen cursor — not a push channel.
This is the same trade-off `09-ai-layer.md`'s own latency rule already
makes explicit elsewhere in this repository: correctness and simplicity
over an infrastructure commitment the actual requirement (a manager
glancing at recent activity, not a trading floor ticker) does not need.
**If sub-second push delivery is ever a real, measured requirement**, that
is a `DECISIONS.md` entry adopting WebSockets/SSE platform-wide, not a
one-widget special case — named here so the honest limitation is visible,
not hidden behind the word "live."

## 2. A feed entry is a normalized shape over three different sources

```ts
interface FeedEntry {
  id: string;          // "order:ord_123", "po:po_456", "payment:pay_789"
  kind: 'ORDER' | 'PURCHASE_ORDER' | 'PAYMENT';
  summary: string;     // "Order #YSN-2026-0412 placed, Rs 4,500"
  occurredAt: Date;
  href: string;         // deep link to the real record — this feed never edits anything
  locationId: string | null;
}

async recentActivity(sinceId: string | null, locationId?: string): Promise<FeedEntry[]> {
  // Three bounded, indexed queries (Order.placedAt, PurchaseOrder.createdAt,
  // Payment.createdAt), each already indexed for their own existing
  // screens, merged and sorted by occurredAt — never a new table, never a
  // union view materialised ahead of time.
}
```

This is doc 44's own "registered source, shared shape" pattern, applied to
a feed instead of an approval queue — `ORDER`/`PURCHASE_ORDER`/`PAYMENT`
each contribute through the identical interface shape, so a fourth source
(a stock transfer, a returned item) is a new implementation, never a
rewrite of the feed itself.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a read over existing, already-scoped
actors.
**Whose rows, and which columns** — the feed is scoped to the caller's
subtree by `locationId` exactly as every other branch-scoped read in this
repository already is — restated because a "recent activity" feed with no
location filter is exactly the kind of "implicit all-branches read"
`CLAUDE.md`'s own three-axes table explicitly forbids.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a read with no write, no authority to bound.
**Audience is a capability, not an address** — n/a: a pull screen, not a
notification.
**Request or record** — n/a: a pure read over already-recorded facts;
this document performs no write of its own.
**The movement with no address** — restated as this document's own
central scoping rule: every entry names the `locationId` it belongs to,
resolved from its own source record, never defaulted.
**Four hours down** — the feed simply stops updating while offline (a
poll that fails silently retries on the next interval) and catches up
once connectivity returns — no queued writes to reconcile, since this
document performs none.
**Click the number** — restated as this feed's entire design: every
entry's `href` opens the real record it summarizes, never a dead-end
summary line.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: no money fact of its
own; each source's own posting rule, unchanged.
**Dry run before live** — n/a: `recentActivity()` is already a pure read
with no computed rule to preview.
**Three silhouettes** — Solo: low volume, the feed rarely has more than a
handful of entries per poll. Chain: a real per-branch operational
glance. Organization: cross-brand volume — bounded per poll (next lens)
so the feed never becomes an unbounded firehose at scale.
**The absent collaborator** — a source module being off (e.g.,
`purchasing` disabled) means that `FeedEntry.kind` simply never appears —
the feed renders the sources that exist, exactly doc 44's own registered-
source discipline.
**The second copy of the write** — n/a: no write; the feed's own
`sinceId` cursor prevents re-showing an already-seen entry on the next
poll, never a duplicate render.
**The hundred-thousandth row** — each poll returns a small, capped page
(e.g., the most recent 20 entries since the cursor, never an unbounded
"everything since last time" if the client was closed for a day) — the
same bounded-pagination discipline this repository's own performance
table already requires of every list endpoint.
**The reversal document / The undo fan-out / The version stamp** — n/a:
nothing here is written or reversed.
**The erasure the ledger cannot obey** — n/a beyond what `Order`/
`PurchaseOrder`/`Payment` already state for their own customer/supplier
data; the feed's `summary` text avoids surfacing anything those records
do not already show on their own existing screens.
**The failure path** — a poll that fails (network blip, brief server
issue) shows the feed's own "unable to refresh, retrying" state, never a
silent freeze that looks like genuinely quiet operations.

## Work orders

**WO-58.1 — `recentActivity(sinceId, locationId)`** read, merging three
bounded, indexed source queries.
**WO-58.2 — registered-source pattern**: the identical `ActionHubSource`-
shaped registry doc 44 already establishes, so a fourth source (transfers,
returns) is additive.
**WO-58.3 — UI**: the feed widget on the admin dashboard home and on
doc 52's staff self-service mobile app shell, short-interval client poll,
capped page size, "retrying" state on poll failure.

## Acceptance

- The feed never shows an entry outside the caller's own location scope.
- A capped poll page never exceeds its stated size, even during a burst
  of real activity.
- Every entry's link opens the exact real record it summarizes.
- With `purchasing` off, no `PURCHASE_ORDER` entries ever appear, and the
  feed still renders `ORDER`/`PAYMENT` entries normally.
- A failed poll shows a visible retry state, never a silent, misleadingly
  quiet feed.

## Out of scope

True push-based real-time delivery (WebSockets/SSE) — named in §1 as a
platform-wide decision this document does not make on a single widget's
behalf. Filtering/searching the feed's own history beyond "recent" — this
is a glance widget, not a general activity-log search screen; a full
audit-trail search already exists via `AuditService` and is not
duplicated here.
