# 33. The operator hands: scanner, till, phone, bad network

The corporate-scale ground truth lists 100+ locations and 10,000+ products,
but every one of those numbers is served by a person holding a device: a
cashier with a queue behind them, a picker with a scanner and gloves, a
till with no signal. `apps/pos` already proves this repo takes the physical
layer seriously — a real outbox, a real service worker — but it proves that
by building it in exactly one place and stopping. That stopping point is
where a narrow build hides.

## Lens: The barcode that already decided

**Question:** For every screen where the input can be a barcode-scanner
burst (an exact string followed by Enter, arriving well inside any client
debounce), name what happens on an exact match versus a fuzzy one, and how
many taps separate a successful scan from the item landing in the basket.

**Why:** `PosCatalogService.searchVariants()` (`apps/api/src/modules/pos/pos-catalog.service.ts:37-44`)
already distinguishes an exact `barcode: { equals: trimmed }` from a fuzzy
`sku`/name `contains`. But `TillPage` (`apps/pos/src/app/till/page.tsx:63-74`)
debounces every keystroke 250ms regardless, then always renders a tappable
`<ul>` (L191-199) the operator reads and clicks via `addToBasket()` (L80-84)
— there is no `onKeyDown`/Enter handler anywhere in the file and no
auto-add on a unique exact-barcode hit. A scan and a half-typed guess cost
the same two steps today.

**Worked example:** Narrow slice: ship barcode search as "type into the same
box as SKU/name search," verified with one item and no queue behind the
till. Complete capability: an exact `barcode: { equals }` hit with exactly
one result adds to the basket immediately (zero extra taps), while a fuzzy
SKU/name match still shows the list — the design doc states the tap count
for each case, not just that "search works."

**Done test:** The PR names the line in `till/page.tsx` that branches on
"result count === 1 AND matched via barcode equality" and adds to the
basket without a click; absent that branch, `results.length > 0` (L191)
always renders the same list for a scan as for a typed guess.

**Breaks without:** At a branch with a real queue, every scanned item costs
an extra look-and-tap the design never accounted for; multiplied across
100+ tills and thousands of daily line items, the "fast lane" the scanner
was bought for is the same speed as typing.

## Lens: Which writes get the queue

**Question:** For every write a till operator can trigger (sale, return,
refund, cash movement, shift open/close), state whether it is wrapped in
the offline outbox today and, if not, what the operator sees on a dropped
connection mid-action.

**Why:** `@newax/pos-core`'s `outbox.ts` (`packages/pos-core/src/outbox.ts:1-15`)
is a genuine, reusable PENDING→SYNCING→SYNCED/FAILED state machine, and
`TillPage.completeSale()` (`apps/pos/src/app/till/page.tsx:98-112`) is the
*only* call site that uses it — a non-`ApiError` failure there queues via
`createOutboxEntry`/`putOutboxEntry`. `ReturnsPage.confirmReturn()`
(`apps/pos/src/app/returns/page.tsx:61-79`) runs `returnOrder()` then
`refundPayment()` as two sequential network calls with the identical
failure shape, but on a dropped connection it only sets
`'Could not process the return'` (L75) — nothing queues, and if
`returnOrder()` already committed before the drop, the operator has no way
to know the return itself succeeded. `PosShiftsService` (`pos-shifts.service.ts`)
has no client-side queue for shift open/close or cash movements either.
This is distinct from resilience lens 23 ("request or record — classify
every write"), which is about the server's unconditional-posting model; this
asks which client actions the *device* itself protects against its own
disconnection.

**Worked example:** Narrow slice: build in-store returns and verify them on
a wired connection where the network never drops. Complete capability: the
return and refund reuse the same `OutboxEntry` machinery as the sale, the
design doc names which of sale/return/refund/cash-movement/shift-toggle
gets client-side queuing and which are declared safe to fail loud, and the
partial-completion case (return committed, refund not) surfaces as its own
state rather than one generic error string.

**Done test:** `grep -rn "createOutboxEntry\|putOutboxEntry" apps/pos/src`
shows every write the design doc lists as "queued," not just `till/page.tsx`;
any write the doc calls "protected" that is absent from that grep is a
failed lens on its own PR.

**Breaks without:** A cashier on a flaky branch connection completes a sale
that survives (queued, synced later) but loses a return or a refund that
silently didn't — the drawer and the ledger disagree, and nothing on
screen told the operator which outcome happened.

## Lens: The tap that might have already landed

**Question:** When the outbox retries a queued write whose earlier attempt
timed out client-side without a definite success or failure response, name
what stops the server from creating a second order for it — the exact
field, and where it is checked.

**Why:** `sell()` (`apps/pos/src/lib/pos-client.ts:160-161`) posts
`PosSaleRequest` with no client-generated id in its body, and
`OrdersService.placeFromPos()` (`apps/api/src/modules/orders/orders.service.ts:394`)
has no idempotency check anywhere in the file (`grep -n idempot
apps/api/src/modules/orders/orders.service.ts` returns nothing). The
outbox's own transitions (`outbox.ts:52-71`) assume a clean success or fail
response; a timeout on a slow or dropping connection leaves the entry
`SYNCING` with the true server outcome unknown, and the next retry replays
the same payload with nothing to deduplicate it. This differs from lens 28
("the second copy of the write"), which is about two concurrent editors
racing on one row; this is one operator's own device replaying its own
unconfirmed write, through a mechanism (the outbox) that carries no
request-level key today.

**Worked example:** Narrow slice: build offline queuing and test it by
killing the network before the request leaves the device, where retry is
always safe because nothing was ever sent. Complete capability: every
`OutboxEntry` carries a client-generated id, `placeFromPos()` accepts it and
checks a unique constraint (or an existing-order lookup) before creating a
new `Order`, and the design doc states what the till shows if the retry
finds its own earlier sale already posted.

**Done test:** The PR shows a request body or DTO field carrying a
client-generated id reaching `placeFromPos()`, and a query or constraint in
`orders.service.ts`/`orders.prisma` that rejects or short-circuits a repeat
of it; absent both, the PR states in writing why a timeout-then-retry on a
real sale cannot double-post.

**Breaks without:** On a branch with genuinely bad signal — the exact
condition this lens's domain exists for — a cashier's retried sale silently
books twice: stock decrements twice, revenue posts twice, and nothing in
this codebase's outbox, orders, or accounting layer would catch it before a
reconciliation days later.

## Not modelled yet

- No exact-match fast path in POS product search — `searchVariants()`
  distinguishes barcode equality from fuzzy text server-side, but the till
  UI treats every result set the same way.
- No offline queue outside `till/page.tsx`'s sale flow — returns, refunds,
  cash movements and shift open/close have no `OutboxEntry` path and no
  partial-failure state.
- No client-generated idempotency key anywhere in the POS write path —
  `PosSaleRequest`, the outbox entry shape, and `placeFromPos()` all lack a
  field a retried, previously-ambiguous write could be deduplicated on.

## Hardening record

**Kept (3 of 3):**

- **The barcode that already decided** — verified `PosCatalogService.searchVariants()`
  (`apps/api/src/modules/pos/pos-catalog.service.ts:31-49`, exact/fuzzy branches
  at lines 39-40) against `TillPage` (`apps/pos/src/app/till/page.tsx`: 250ms
  debounce at line 72, `addToBasket()` at line 80, unconditional `<ul>` render
  at `results.length > 0` line 191). Citations accurate; kept as written.
- **Which writes get the queue** — verified `outbox.ts`'s PENDING/SYNCING/
  SYNCED/FAILED machine (`packages/pos-core/src/outbox.ts:16-82`),
  `TillPage.completeSale()` as the sole `createOutboxEntry`/`putOutboxEntry`
  call site (`apps/pos/src/app/till/page.tsx:86-107`; confirmed by
  `grep -rln "createOutboxEntry|putOutboxEntry" apps/pos/src` returning only
  `till/page.tsx`, `outbox-db.ts`, `outbox-sync.ts`), and `ReturnsPage.confirmReturn()`
  (`apps/pos/src/app/returns/page.tsx:61-75`) queuing nothing on failure.
  Its differentiation from the existing resilience lens "Request or record —
  classify every write" (confirmed present, `docs/erp-lenses/26-day-two-operations.md`)
  is stated and correct: that lens is server posting semantics, this one is
  client-device disconnection handling. Citations accurate; kept as written.
- **The tap that might have already landed** — verified `sell()`
  (`apps/pos/src/lib/pos-client.ts:160`) posts `PosSaleRequest`
  (`lines`, `customerName`, `customerPhone`, `customerEmail` only — no id
  field, lines 77-82) and `placeFromPos()`
  (`apps/api/src/modules/orders/orders.service.ts:394`) with zero idempotency
  handling (`grep -n idempot apps/api/src/modules/orders/orders.service.ts`
  returns nothing). Its differentiation from the existing concurrency lens
  "The second copy of the write" (confirmed present,
  `docs/erp-lenses/18-master-data-taxonomy.md`) is stated and correct: that
  lens is two concurrent editors racing on one row, this is one device
  replaying its own unconfirmed write. Citations accurate; kept as written.

**Killed:** none. All three lenses cite real, current code; none restates an
existing lens without a stated difference; none is generic advice, a coding
standard, or unfalsifiable; each demands a specific artifact (a line/branch,
a grep result, a DTO field) rather than a yes/no.

**Corrections:** none. Every path, method, and line range cited in the file
was opened and matches what is claimed:
`apps/api/src/modules/pos/pos-catalog.service.ts` (searchVariants, exact vs.
fuzzy match), `apps/pos/src/app/till/page.tsx` (debounce, addToBasket, result
list, completeSale/outbox calls), `packages/pos-core/src/outbox.ts` (status
machine), `apps/pos/src/app/returns/page.tsx` (confirmReturn's two sequential
calls and single error string), `apps/pos/src/lib/pos-client.ts` (`sell()`,
`PosSaleRequest` shape), `apps/api/src/modules/orders/orders.service.ts`
(`placeFromPos()`, absence of any idempotency check), and
`apps/api/src/modules/pos/pos-shifts.service.ts` (exists; no outbox usage,
confirmed by the same repo-wide grep above).
