# 33h. Hardening record: The operator hands: scanner, till, phone, bad network

Adversarial review of [33-operator-hands.md](33-operator-hands.md) by the `harden:33:operator-hands` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The barcode that already decided  — strong

**Question:** For every screen where the input can be a barcode-scanner burst, name what happens on an exact match versus a fuzzy one, and how many taps separate a successful scan from the item landing in the basket.

**Verified against:** PosCatalogService.searchVariants() (apps/api/src/modules/pos/pos-catalog.service.ts:31-49, exact match at line 40, fuzzy at 39/44) vs TillPage (apps/pos/src/app/till/page.tsx: 250ms debounce line 72, addToBasket line 80, unconditional <ul> render on results.length>0 at line 191) - all verified.

### Which writes get the queue  — strong

**Question:** For every write a till operator can trigger (sale, return, refund, cash movement, shift open/close), state whether it is wrapped in the offline outbox today and what the operator sees on a dropped connection mid-action.

**Verified against:** outbox.ts state machine (packages/pos-core/src/outbox.ts:16-82); TillPage.completeSale() as sole createOutboxEntry/putOutboxEntry call site (verified via repo-wide grep, only 3 files hit and none is returns/shifts); ReturnsPage.confirmReturn() (apps/pos/src/app/returns/page.tsx:61-75) queues nothing on failure. Differentiation from existing lens 'Request or record - classify every write' (confirmed real, in docs/erp-lenses/26-day-two-operations.md) is stated and correct.

### The tap that might have already landed  — strong

**Question:** When the outbox retries a queued write whose earlier attempt timed out without a definite success or failure, name what stops the server from creating a second order for it - the exact field and where it is checked.

**Verified against:** sell() (apps/pos/src/lib/pos-client.ts:160) posts PosSaleRequest with no id field (verified fields: lines, customerName, customerPhone, customerEmail); placeFromPos() (apps/api/src/modules/orders/orders.service.ts:394) has zero idempotency handling (grep for 'idempot' returns nothing). Differentiation from existing lens 'The second copy of the write' (confirmed real, in docs/erp-lenses/18-master-data-taxonomy.md) is stated and correct.

## Killed (0)

_Nothing was killed._


## Citations corrected (0)

_Every citation checked out as written._

