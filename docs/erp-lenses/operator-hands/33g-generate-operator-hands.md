# 33g generate operator hands

Output of the `gen:33:operator-hands` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

The operator hands: scanner, till, phone, bad network

## File

docs/erp-lenses/operator-hands/33-operator-hands.md

## Lenses

### The barcode that already decided

**Question:** For every screen where the input can be a barcode-scanner burst (an exact string followed by Enter, arriving well inside any client debounce), name what happens on an exact match versus a fuzzy one, and how many taps separate a successful scan from the item landing in the basket.

**Grounding:** apps/api/src/modules/sales/pos/pos-catalog.service.ts:37-44 (exact barcode.equals vs fuzzy sku/name contains); apps/pos/src/app/till/page.tsx:63-74 (250ms debounce, no onKeyDown/Enter handler), L80-84 addToBasket(), L191-199 result list always rendered

### Which writes get the queue

**Question:** For every write a till operator can trigger (sale, return, refund, cash movement, shift open/close), state whether it is wrapped in the offline outbox today and, if not, what the operator sees on a dropped connection mid-action.

**Grounding:** packages/pos-core/src/outbox.ts:1-15 (pure PENDING/SYNCING/SYNCED/FAILED state machine); apps/pos/src/app/till/page.tsx:98-112 completeSale() is the only call site using createOutboxEntry/putOutboxEntry; apps/pos/src/app/returns/page.tsx:61-79 confirmReturn() has the same failure shape but no queue, just a generic error string; apps/api/src/modules/sales/pos/pos-shifts.service.ts has no client-side queue equivalent for shift open/close or cash movements

### The tap that might have already landed

**Question:** When the outbox retries a queued write whose earlier attempt timed out client-side without a definite success or failure response, name what stops the server from creating a second order for it — the exact field, and where it is checked.

**Grounding:** apps/pos/src/lib/pos-client.ts:160-161 sell() posts PosSaleRequest with no client-generated id; apps/api/src/modules/sales/orders/orders.service.ts:394 placeFromPos() has no idempotency check (grep for 'idempot' in the file returns nothing); packages/pos-core/src/outbox.ts:52-71 transitions assume a clean success/fail response, not an ambiguous timeout

## Absences

- No exact-match fast path in the POS till UI: searchVariants() distinguishes barcode equality from fuzzy text server-side, but till/page.tsx treats every result set identically, costing a confirm tap on a scan.
- No offline queue outside till/page.tsx's sale flow: returns, refunds, cash movements and shift open/close have no OutboxEntry path in apps/pos and no partial-failure state when a multi-step action (return then refund) is interrupted mid-way.
- No client-generated idempotency key anywhere in the POS write path: PosSaleRequest, the OutboxEntry payload shape, and OrdersService.placeFromPos() all lack a field a retried, previously-ambiguous write could be deduplicated on.

