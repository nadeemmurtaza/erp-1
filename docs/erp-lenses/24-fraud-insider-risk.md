# 24. Fraud and the malicious insider

Fraud here is not a stranger breaking in — it is the same permission key used
honestly on Monday and dishonestly on Friday, or a stock movement with no
address. Lens 03 already owns toxic permission pairs and grant-versus-act
detection; this domain is the gap between an action and the evidence that
would let a later reviewer tell the honest version of that action from the
dishonest one — the field, location, or price nobody captured because
nobody asked for it at build time.

## Lens: The void that outruns the refund

**Question:** Name the check `OrdersService.changeStatus()` runs against
`Payment.status` before it allows `CANCELLED`, and the mechanism that
reverses the posted journal entry when that check is skipped.

**Why:** `ALLOWED_TRANSITIONS` (orders.service.ts:58-67) permits `CONFIRMED`,
`PROCESSING` and `READY_TO_SHIP` to reach `CANCELLED` — every one of those
statuses is reachable after `payment.succeeded` has already posted Dr 1000
Cash & Bank · Cr 1100 AR. `changeStatus()` (orders.service.ts:657-707) never
reads `Payment.status`, never calls `AccountingService.reverseEntry()`, and
publishes only `OrderCancelled` — the only path that reverses a posted entry
is the separate `payment.refunded` handler, which nothing in `changeStatus()`
triggers. `reverseEntry(entryId, memo?)` (accounting.service.ts:102) is also
full-reversal-only, with no line-selection or partial-amount parameter.

**Worked example:** Narrow slice: ship the `CANCELLED` transition because it
correctly restocks the shelf (`moveMany` with reason `CANCELLATION` at
`order.locationId`). Complete capability: an order paid at the till — cash
physically in the drawer, `payment.succeeded` already posted — gets cancelled
by the same or a different staff member with a free-text `cancelReason`, and
stock quietly returns to the shelf. Nothing forces a refund, a payment void,
or even a flag that this cancellation happened against a paid order, so the
cash the till user collected is never reconciled against the books.

**Done test:** `grep -n "Payment.status\|paymentStatus\|reverseEntry" apps/api/src/modules/orders/orders.service.ts` inside `changeStatus()` returns nothing today. The PR either refuses `CANCELLED` on a paid order without an explicit reversal step, or its description names the existing screen that surfaces "cancelled and already paid" as a distinct, reviewable state.

**Breaks without:** At 100+ till locations a paid sale can be voided after
the fact with the cash never returned to drawer or customer; `AuditLog`
records "status changed to CANCELLED" and "payment succeeded" as two
ordinary, unlinked rows. The same silence hides the honest employee's
legitimate pre-ship cancellation inside the identical, undifferentiated
bucket — nothing distinguishes the two until someone manually cross-checks
receipts.

## Lens: The write-off with no address

**Question:** Name the field that records which of the 100+ locations a
manual stock write-off actually happened at, and say what `adjust()` uses
today when that field is absent.

**Why:** `AdjustStockDto` (inventory.dto.ts:15-30) carries `delta`, `reason`
and `note` — no `locationId`. `InventoryAdminController.adjust()`
(inventory.controller.ts:39-61) always resolves
`this.inventory.defaultLocationId()` (:51), gated by one key,
`inventory.manage`, no matter which branch the caller is standing in.
`StockMovementReason.WRITE_OFF`'s own schema comment reads "lost, stolen,
expired" (inventory.prisma:13) — the reason built for exactly this kind of
loss is unreachable through this endpoint at all: `reasonMap`
(inventory.controller.ts:46-49) maps only `'damaged'`, so every other typed
reason silently becomes `ADJUSTMENT`.

**Worked example:** Narrow slice: ship `/adjust` because the delta math and
the `audit.record()` call (inventory.service.ts:409-415) are both correct.
Complete capability: a floor manager at Branch 47 keys in a write-off for
merchandise that walked out the back door. The movement posts against the
default/MAIN location's `VariantLocationStock`, not Branch 47's — Branch
47's shelf count stays wrong with a gap that never closes, while a location
that lost nothing silently loses stock on the ledger instead.

**Done test:** `grep -n "locationId" apps/api/src/modules/inventory/dto/inventory.dto.ts` returns no match today. The PR either adds a required `locationId` to `AdjustStockDto` and threads it through to `move()`, or its description states why every corporate write-off may legitimately post to one shared default location.

**Breaks without:** With 100+ locations, every manual write-off through the
admin screen lands on the same single location regardless of which branch
clicked it. A branch running an insider theft scheme accumulates a physical
shortage the ledger never records there, the default location's book stock
erodes for reasons unrelated to its own floor, and a count at either site
cannot explain its own variance.

## Lens: The price nobody can point to

**Question:** Name the permission key, distinct from `pos.operate`, that
would gate a till price override, and the column that would preserve the
catalog price it replaced.

**Why:** `pos.module.ts:29` states plainly that "a till-side price override
remain[s] unbuilt." `placeFromPos()` (orders.service.ts:420) derives
`unitPrice` itself, from `variant.priceOverride ?? variant.product.basePrice`
— never from caller input — so no till user can change a price today.
`OrderItem` (orders.prisma:124-129) has `unitPrice` and `discountUnit` but no
`listPrice` column to diff against, and the only amount-adjacent permission
key in the catalog, `payments.approve` (permissions.ts:83), is a boolean
with no ceiling — the ground brief confirms no rank or approval-limit model
exists anywhere to attach one to.

**Worked example:** Narrow slice: add a till "custom price" input because a
manager asked for it and it is a two-line change to `placeFromPos()`'s price
resolution. Complete capability: the override ships with its own permission
key separate from `pos.operate`/`pos.manage`, a stored pre-override price on
the line so a report can compute the gap per till user, and a stated
ceiling — per-line, per-shift, or explicitly none — because `payments.approve`
already shows this repo's default failure mode: a flat key with no amount
band and no record of what the number would otherwise have been.

**Done test:** The PR adds a permission key distinct from `pos.operate` and `pos.manage`, a schema field that preserves the pre-override price on the order line, and states the ceiling in its description. `grep -n "priceOverride\|listPrice" apps/api/prisma/schema/orders.prisma` finds no such column on `OrderItem` today.

**Breaks without:** Without a preserved original price, a till user who
discounts a friend's purchase to near-zero produces a `StockMovement`/
`Payment` pair indistinguishable from an ordinary discounted sale. Nothing
in the schema lets a loss-prevention report rank overrides by size or
frequency per till user across 100+ locations — the abuse is invisible
until someone manually compares receipts to the price list.

## Not modelled yet

- No check comparing `Payment.status` to an order's cancellation —
  `OrdersService.changeStatus()` never reads it, so voiding a paid order and
  refunding it are two disconnected actions with no field linking them.
- No `locationId` on `AdjustStockDto` or anywhere in the manual write-off
  path — every corporate write-off through the admin UI posts to one shared
  default location regardless of which of the 100+ branches performed it.
- No till-side price override at all (`pos.module.ts:29` says so directly)
  — no permission key for it, no column preserving the price it would
  replace, no per-transaction or per-shift ceiling.
- No amount-banded or rank-based approval anywhere in the codebase —
  `payments.approve` is boolean, and the ground brief confirms no
  rank/grade/approval-limit model exists to attach one to.

## Hardening record

**Kept (3):**

- *The void that outruns the refund* — distinct from the existing
  "reversal document, not the reversal flag" lens: that lens asks whether a
  reversal, once triggered, is a real linked document; this one is upstream
  of that — it asks why `OrdersService.changeStatus()` lets `CANCELLED` fire
  at all on an order whose payment already posted, with no reversal
  triggered in either direction. Verified: `ALLOWED_TRANSITIONS`
  (orders.service.ts:58, enforced at :672) permits `CONFIRMED` /
  `PROCESSING` / `READY_TO_SHIP` → `CANCELLED`; `changeStatus()`
  (orders.service.ts:658-710) never reads `Payment.status` and never calls
  `reverseEntry`; the only path that calls `AccountingService.reverseEntry()`
  (accounting.service.ts:102) is the separate `payment.refunded` handler in
  `PostingRulesSubscriber` (posting-rules.subscriber.ts) — confirmed by grep,
  nothing in `changeStatus()` triggers it.
- *The write-off with no address* — distinct from "Row 4312 authority" (bulk
  operations): that lens is about who may act on someone else's already-listed
  row; this is about a single-row write that silently discards which of the
  100+ locations it happened at. Verified: `AdjustStockDto`
  (inventory.dto.ts:15-30) has `delta`, `reason`, `note` — no `locationId`;
  `InventoryAdminController.adjust()` (inventory.controller.ts:41-61) always
  resolves `this.inventory.defaultLocationId()` (:51); `reasonMap`
  (inventory.controller.ts:46-48) maps only `'damaged'` to `DAMAGE`, and
  `STOCK_ADJUSTMENT_REASONS` (inventory.dto.ts:5-11) does not even include a
  write-off-shaped reason as a caller-selectable value — `WRITE_OFF`
  (inventory.prisma:13, comment "lost, stolen, expired") exists in the Prisma
  enum but is unreachable from this endpoint.
- *The price nobody can point to* — distinct from `04-approval-delegation`'s
  use of the same `payments.approve` fact: that domain asks about delegating
  an existing approval; this one is about a feature that does not exist yet
  (till price override) and what evidence it must ship with on day one, not
  after. Verified: `pos.module.ts:29` states the override "remain[s]
  unbuilt"; `placeFromPos()` (orders.service.ts:420, also :846) derives
  `unitPrice` only from `variant.priceOverride ?? variant.product.basePrice`;
  `OrderItem` (orders.prisma:124-129) has `unitPrice`/`discountUnit`, no
  `listPrice`; `payments.approve` (permissions.ts:83) is a flat boolean with
  no ceiling; `pos.operate` (permissions.ts:77) and `pos.manage` (:71) both
  confirmed to exist as separate, real keys.

**Killed:** none. All three lenses cite verifiable, currently-true facts, ask
for a specific artifact (a field, a permission key, a check), fail a
concrete PR without one, and are not restatements of the five original
lenses or the thirty prior-workflow lenses — each states its distinction
above.

**Corrections:** none. Every cited path, method, field, enum value and
permission key was opened and confirmed to exist with the stated behavior:
`ALLOWED_TRANSITIONS` / `changeStatus()` (orders.service.ts), `reverseEntry()`
(accounting.service.ts:102), `payment.refunded` → `PostingRulesSubscriber`
(posting-rules.subscriber.ts), `AdjustStockDto` / `STOCK_ADJUSTMENT_REASONS`
(inventory.dto.ts), `InventoryAdminController.adjust()` /  `reasonMap`
(inventory.controller.ts), `StockMovementReason.WRITE_OFF`
(inventory.prisma:13), `pos.module.ts:29`, `placeFromPos()` (orders.service.ts:420,846),
`OrderItem` (orders.prisma:124-129), and `payments.approve` / `pos.operate` /
`pos.manage` (permissions.ts:83,77,71 — file is `packages/shared/src/permissions.ts`,
abbreviated to match this doc set's existing citation convention).
