# Phase 1 — Inventory, Purchasing and Cost

**Read `00-HOUSE-RULES.md` first.** Everything there applies.

## Why this phase is first

Because **cost price is the keystone.** Without a cost per unit there is no
margin, no profit-and-loss, no stock valuation, and no way to tell whether a
discount is profitable. Phase 4 (Finance) is impossible until this lands, and
Phase 5 (Promotions) is dangerous without it — you would be discounting blind.

There is also a hole to close. Today `apps/api/src/modules/orders/orders.service.ts`
changes `ProductVariant.stock` directly at lines 139-142 (sale) and 366-370
(cancel/return restock) and **writes no `StockAdjustment` row at all**. The only
writer of `StockAdjustment` is `inventory.service.ts:92`. So the inventory
history screen shows manual corrections but not the actual selling — the thing
stock mostly does. Any stock report built on today's data is wrong.

## What Phase 1 delivers

- One stock ledger that records **every** movement, including sales.
- Cost price per variant, maintained as a weighted average.
- Cost snapshotted onto order lines so historical margin never moves.
- Suppliers, purchase orders, goods receipts, supplier bills.
- Landed cost (freight/duty) spread correctly across received lines.
- Reorder points, low-stock and slow-mover detection, stock counts.
- The admin screens for all of it, and a stock valuation report.

## Work orders

| WO | Title | Depends on |
|---|---|---|
| 1.1 | Nav foundation: declared group order + Inventory & Supply group | — |
| 1.2 | The unified stock ledger (`StockMovement`) | — |
| 1.3 | Cost price on variants + COGS snapshot on order lines | 1.2 |
| 1.4 | Suppliers | — |
| 1.5 | Purchase orders, goods receipts, weighted-average and landed cost | 1.2, 1.3, 1.4 |
| 1.6 | Reorder points, low stock, slow movers | 1.2, 1.5 |
| 1.7 | Stock counts | 1.2 |
| 1.8 | Admin screens | 1.1, 1.5, 1.6, 1.7 |
| 1.9 | Reports: valuation, purchases, ledger export | 1.5 |

1.1 and 1.4 are independent of everything and can be done in parallel with 1.2.

---

## WO-1.1 — Nav foundation

**Problem.** `apps/web/src/components/admin/admin-shell.tsx:61` computes the
sidebar's group order like this:

```ts
const groups = [...new Set(items.map((i) => i.group))];
```

That is **first-appearance order in the filtered `ADMIN_NAV` array**, not the
order declared in `NAV_GROUP_LABELS`. So moving one nav item silently reorders
whole groups. This must be fixed before we add ~9 more sections, or the sidebar
will scramble itself every time someone touches the registry.

**Files**
- `apps/web/src/components/admin/nav-registry.ts`
- `apps/web/src/components/admin/admin-shell.tsx`

**Do this**

1. Replace `NAV_GROUP_LABELS` with an ordered array — order becomes explicit
   data, not an emergent property:

   ```ts
   export interface AdminNavGroup {
     key: AdminNavItem['group'];
     label: string;
     /** lucide-react icon name. */
     icon: string;
   }

   /** Sidebar order is THIS ARRAY's order. Nothing else decides it. */
   export const NAV_GROUPS: readonly AdminNavGroup[] = [
     { key: 'home',       label: 'Home',               icon: 'LayoutDashboard' },
     { key: 'sales',      label: 'Sales',              icon: 'ShoppingCart' },
     { key: 'fulfilment', label: 'Fulfilment',         icon: 'Truck' },
     { key: 'catalogue',  label: 'Catalogue',          icon: 'Package' },
     { key: 'inventory',  label: 'Inventory & Supply', icon: 'Boxes' },
     { key: 'workshop',   label: 'Workshop',           icon: 'Scissors' },
     { key: 'customers',  label: 'Customers',          icon: 'Users' },
     { key: 'marketing',  label: 'Marketing',          icon: 'Megaphone' },
     { key: 'finance',    label: 'Finance',            icon: 'Wallet' },
     { key: 'insights',   label: 'Insights',           icon: 'BarChart3' },
     { key: 'settings',   label: 'Settings',           icon: 'Settings' },
   ] as const;
   ```

2. Widen `AdminNavItem['group']` to those eleven keys. Re-file every existing
   entry: `overview`→`home`, `people`→`customers`, `production`→`workshop`,
   `sales` stays, `catalogue` stays, `settings` stays. Move **Inventory** out of
   `catalogue` into `inventory`, and **Reports** out of `sales` into `insights`.

3. Add to `AdminNavItem`:
   ```ts
   /** lucide-react icon name. */
   icon?: string;
   /** One level of nesting. Do not nest deeper. */
   children?: readonly AdminNavItem[];
   /** API module that owns this. Hidden when the module is off in MODULES. */
   module?: string;
   ```

4. In `admin-shell.tsx`, render by iterating `NAV_GROUPS` and selecting the
   items for each group. Skip a group with no visible items. **Delete the
   `[...new Set(...)]` line.**

5. Fix the active-state bug at `admin-shell.tsx:196-197`. Today every non-dashboard
   item uses `pathname.startsWith(item.href)`, so `/admin/stitching` stays
   highlighted while you are on `/admin/stitching/bookings` and both light up.
   Use exact match, or `startsWith` only when no longer sibling href also matches.

6. Add the empty **Inventory & Supply** group with its future children commented
   out, so WO-1.8 only has to uncomment.

7. `pnpm add lucide-react --filter @yaseen/web`. Render icons from the string
   name via a small lookup map — do **not** import all of lucide.

**Acceptance**
- [ ] Reordering an entry inside `ADMIN_NAV` does not change group order.
- [ ] A TAILOR (only `stitching.jobs.view_queue`) sees exactly one group.
- [ ] On `/admin/stitching/bookings` only "Stitching bookings" is highlighted.
- [ ] `pnpm build` passes — a bad group key is a type error.

---

## WO-1.2 — The unified stock ledger

**The rule from here on: nothing writes `ProductVariant.stock` except
`InventoryService.move()`.** Not orders, not the seed, not a script. One door.

### Schema — new file `apps/api/prisma/schema/inventory.prisma`

```prisma
// Inventory: the stock ledger. Every change to ProductVariant.stock has
// exactly one StockMovement row, written in the same transaction, so the
// ledger replays to the live number and "why is stock 4" always has an answer.

enum StockMovementReason {
  PURCHASE_RECEIPT   // goods received against a purchase order
  SALE               // order placed
  CANCELLATION       // order cancelled, stock returned to the shelf
  RETURN             // customer returned goods
  ADJUSTMENT         // manual correction by staff
  DAMAGE             // written off as damaged
  COUNT              // variance posted by a stock count
  WRITE_OFF          // lost, stolen, expired
}

model StockMovement {
  id        String              @id @default(cuid())
  variantId String
  /// Positive = stock in, negative = stock out. NEVER zero.
  delta     Int
  /// Stock level AFTER this movement, so history reads without replaying deltas.
  resultingStock Int
  reason    StockMovementReason

  /// What caused it: "Order" | "GoodsReceipt" | "StockCount" | null for manual.
  refType   String?
  refId     String?

  /// Unit cost in paisa at the moment of the movement. Set on PURCHASE_RECEIPT
  /// (what we paid) and on SALE (what it cost us — the COGS figure). Null for a
  /// movement where cost is not meaningful.
  unitCost  Int?

  note      String?
  actorId   String?
  createdAt DateTime @default(now())

  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  actor   User?          @relation("StockMovementActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([variantId, createdAt])
  @@index([reason, createdAt])
  @@index([refType, refId])
}
```

Add the back-relations to `ProductVariant` and `User` in `catalog.prisma` /
`core.prisma`. **Leave `StockAdjustment` exactly where it is for now** — Rule:
expand/contract.

### The service

Rewrite `apps/api/src/modules/inventory/inventory.service.ts`:

```ts
export interface StockMoveInput {
  variantId: string;
  /** Positive in, negative out. Zero is rejected. */
  delta: number;
  reason: StockMovementReason;
  refType?: string;
  refId?: string;
  unitCost?: number;
  note?: string;
  actorId?: string | null;
}

/**
 * The ONLY way stock changes. Callers inside a transaction pass their tx
 * client so the movement row and the stock change commit together.
 */
async move(input: StockMoveInput, tx: PrismaLike = this.prisma): Promise<StockMovement>
```

Implementation notes, in order of how easy they are to get wrong:

1. **Reject `delta === 0`** with a `BadRequestException`. A zero movement is
   always a bug upstream.

2. **Use the conditional-update idiom** (House Rule 10). For a negative delta
   the predicate is `stock: { gte: -delta }`:

   ```ts
   const updated = await tx.productVariant.updateMany({
     where: delta < 0 ? { id: input.variantId, stock: { gte: -delta } }
                      : { id: input.variantId },
     data: { stock: { increment: delta } },
   });
   if (updated.count === 0) { /* distinguish not-found from would-go-negative */ }
   ```

   The existing code at `inventory.service.ts:75-88` does exactly this and its
   error message is good — keep both.

3. **Read `resultingStock` after the update, inside the same transaction.** The
   row is locked by the update, so this is safe.

4. **Emit `DomainEvent.ProductLowStock`** when the movement takes stock to or
   below `lowStockThreshold` **and it was above before**. The event already
   exists in `domain-events.ts:29` — check whether anything subscribes; if
   nothing does, that is Phase 1's job to add in WO-1.6. Pass `tx` to `publish`.

5. Keep the best-effort `AuditService.record()` call **outside** the transaction,
   as the current code does — `AuditService` never throws by design.

6. Add `moveMany(inputs, tx)` for the multi-line case (an order, a receipt).
   Process sequentially inside one transaction; **sort inputs by `variantId`**
   before processing. Two concurrent multi-line operations touching the same two
   variants in opposite order will deadlock in Postgres; consistent ordering
   removes that entirely. This is not theoretical — a two-line order and a
   two-line receipt on the same variants is enough.

### Wire orders through it

`apps/api/src/modules/orders/orders.service.ts`:

- Replace the direct `updateMany` at 139-142 with
  `this.inventory.move({ …, delta: -qty, reason: 'SALE', refType: 'Order', refId: order.id }, tx)`.
  **The sold-out error message must not change** — it is customer-facing.
- Replace the restock loop at 366-370 with `move(..., reason: 'CANCELLATION' | 'RETURN')`.
- `OrdersModule` imports `InventoryModule`; `InventoryModule` must `exports:
  [InventoryService]`. This is a legal cross-module import (top-level
  `.service`, House Rule 2). **A NestJS module import, not a registry change** —
  so it works even if `inventory` is not in the `MODULES` allowlist.

### Backfill migration

One migration, `add_stock_movement_ledger`, containing:

```sql
INSERT INTO "StockMovement"
  (id, "variantId", delta, "resultingStock", reason, note, "actorId", "createdAt")
SELECT id, "variantId", delta, "resultingStock", 'ADJUSTMENT', note, "actorId", "createdAt"
FROM "StockAdjustment";
```

`StockAdjustment.reason` is a free-text string (`"restock" | "correction" |
"damaged" | "sold_offline" | "other"`). Map it: `damaged` → `DAMAGE`, everything
else → `ADJUSTMENT`, and carry the original string into `note` prefixed
`legacy reason: ` so nothing is lost.

`StockAdjustment` is **not dropped in this work order.** It is dropped in a
follow-up migration after Phase 1 ships and the ledger has been verified in
production. Note that in the PR.

### Acceptance
- [ ] `grep -rn "productVariant.update" apps/api/src --include=*.ts | grep -v inventory.service`
      returns nothing. One door.
- [ ] Place an order, cancel it, adjust by hand, and all three appear in the
      ledger for that variant with the right `reason` and `refType`/`refId`.
- [ ] Replaying `delta` from the first movement equals the live `stock`, and
      every row's `resultingStock` matches the running total.
- [ ] Concurrency test: two simultaneous checkouts for the last unit — one
      succeeds, one gets the sold-out error, **exactly one** `SALE` row exists.
- [ ] Deadlock test: a two-line order and a two-line receipt on the same two
      variants, run concurrently, both complete.
- [ ] `move({ delta: 0 })` throws.
- [ ] Existing `StockAdjustment` rows all appear as `StockMovement` rows.

---

## WO-1.3 — Cost price and COGS

### Schema

`catalog.prisma`, on `ProductVariant`:

```prisma
  /// Weighted-average unit cost in paisa. Recomputed on every goods receipt.
  /// Zero means "never received against a purchase order" — treat as unknown,
  /// not as free.
  costPrice        Int      @default(0)
  /// Below this, the reorder job suggests a purchase order. Null = no reorder.
  reorderPoint     Int?
  /// How many to suggest ordering. Falls back to reorderPoint when null.
  reorderQuantity  Int?
  preferredSupplierId String?
  lastReceivedAt   DateTime?
  barcode          String?  @unique
```

`orders.prisma`, on `OrderItem`:

```prisma
  /// Unit cost in paisa AT THE MOMENT OF PURCHASE. A snapshot, exactly like
  /// unitPrice — margin on a past order must never move when a supplier's
  /// price changes. Zero means cost was unknown at the time.
  unitCost Int @default(0)
```

### Behaviour

- `orders.service.ts`, when snapshotting each line, reads the variant's
  `costPrice` and writes it to `OrderItem.unitCost` **inside the same
  transaction** that decrements stock.
- The same value goes onto the `SALE` `StockMovement.unitCost`.
- Gross margin on a line is `lineTotal - (unitCost × quantity)`. Put that in
  **one function in `packages/shared/src/pricing.ts`** — `lineMargin()` — so the
  admin, the reports and the future P&L all compute it identically (House Rule 11).

### Permission

Add to `packages/shared/src/permissions.ts`:

```ts
{ key: 'inventory.view_cost', label: 'See cost prices and margins', category: 'Catalogue' },
```

Grant it to `ADMIN` only in `ROLE_PERMISSION_SEED`. Cost and margin are not
something every staff account should see.

**Enforce it in the API, not the UI.** The variant/product/order serialisers
must omit `costPrice`, `unitCost` and any margin field when the caller lacks
`inventory.view_cost`. Hiding a column in React while the API still returns the
number is not access control.

### Acceptance
- [ ] Place an order, then change the variant's `costPrice`. The order's margin
      does not move.
- [ ] A STAFF user without `inventory.view_cost` gets a response body with no
      cost fields at all — check the raw JSON, not the screen.
- [ ] `lineMargin()` is unit-tested including the zero-cost case.

---

## WO-1.4 — Suppliers

New module `purchasing` (House Rule 1: folder + schema file + registry line +
`MODULES` entry in all four env files).

### Schema — `apps/api/prisma/schema/purchasing.prisma`

```prisma
model Supplier {
  id           String  @id @default(cuid())
  name         String
  contactName  String?
  phone        String?
  email        String?
  address      String?
  city         String?
  /// Free text: "30 days net", "advance", "on delivery".
  paymentTerms String?
  /// Typical days from order to delivery. Feeds reorder suggestions.
  leadTimeDays Int     @default(7)
  notes        String?
  isActive     Boolean @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  products       SupplierProduct[]
  purchaseOrders PurchaseOrder[]
  bills          SupplierBill[]

  @@index([isActive, name])
}

/// What a given supplier charges for a given variant, and under what terms.
model SupplierProduct {
  id           String @id @default(cuid())
  supplierId   String
  variantId    String
  /// The supplier's own code for it, for the PO they will read.
  supplierSku  String?
  /// Last agreed unit cost in paisa. Pre-fills a new PO line.
  lastCost     Int    @default(0)
  /// Minimum order quantity this supplier accepts.
  moq          Int    @default(1)
  leadTimeDays Int?
  isPreferred  Boolean @default(false)

  supplier Supplier       @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  variant  ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([supplierId, variantId])
  @@index([variantId, isPreferred])
}
```

Supplier names are staff-facing, so plain columns — **not** translations
(House Rule 6).

### Permission

```ts
{ key: 'suppliers.manage', label: 'Manage suppliers', category: 'Purchasing' },
```

`ADMIN` and `STAFF`.

### API
`GET/POST/PATCH /admin/suppliers`, `GET /admin/suppliers/:id`, soft-delete via
`isActive` (never hard-delete a supplier with purchase history), plus
`GET/POST/DELETE /admin/suppliers/:id/products`.

### Acceptance
- [ ] `pnpm lint` passes — proves `purchasing` does not reach into `catalog`
      internals. It may import `CatalogService`, nothing deeper.
- [ ] Deactivating a supplier with open POs is allowed but warns; deleting is
      refused.

---

## WO-1.5 — Purchase orders, goods receipts, and cost

This is the largest work order in the phase and the one with the most ways to be
subtly wrong. Read all of it before starting.

### Schema — append to `purchasing.prisma`

```prisma
enum PurchaseOrderStatus {
  DRAFT       // being built, editable
  SENT        // sent to the supplier, locked
  PARTIAL     // some lines received
  RECEIVED    // fully received
  CANCELLED
}

model PurchaseOrder {
  id         String              @id @default(cuid())
  number     String              @unique   // "PO-2026-0001"
  supplierId String
  status     PurchaseOrderStatus @default(DRAFT)
  currency   String              @default("PKR")

  /// All paisa. subtotal = sum of line totals. total = subtotal + the three costs.
  subtotal   Int @default(0)
  freightCost Int @default(0)
  dutyCost    Int @default(0)
  otherCost   Int @default(0)
  total       Int @default(0)

  expectedAt  DateTime?
  sentAt      DateTime?
  receivedAt  DateTime?
  cancelledAt DateTime?
  notes       String?
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  supplier  Supplier            @relation(fields: [supplierId], references: [id])
  createdBy User?               @relation("PurchaseOrderCreator", fields: [createdById], references: [id], onDelete: SetNull)
  items     PurchaseOrderItem[]
  receipts  GoodsReceipt[]
  bills     SupplierBill[]

  @@index([status, createdAt])
  @@index([supplierId])
}

model PurchaseOrderItem {
  id        String @id @default(cuid())
  purchaseOrderId String
  variantId String
  quantityOrdered  Int
  quantityReceived Int @default(0)
  /// Agreed unit cost in paisa, before freight/duty.
  unitCost  Int
  /// quantityOrdered * unitCost
  lineTotal Int
  note      String?

  purchaseOrder PurchaseOrder  @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  variant       ProductVariant @relation(fields: [variantId], references: [id])
  receiptItems  GoodsReceiptItem[]

  @@index([purchaseOrderId])
  @@index([variantId])
}

model GoodsReceipt {
  id        String   @id @default(cuid())
  number    String   @unique   // "GRN-2026-0001"
  purchaseOrderId String
  receivedAt DateTime @default(now())
  receivedById String?
  notes     String?
  /// Freight/duty attributed to THIS receipt, spread across its lines.
  freightCost Int @default(0)
  dutyCost    Int @default(0)
  otherCost   Int @default(0)
  createdAt DateTime @default(now())

  purchaseOrder PurchaseOrder      @relation(fields: [purchaseOrderId], references: [id])
  receivedBy    User?              @relation("GoodsReceiptReceiver", fields: [receivedById], references: [id], onDelete: SetNull)
  items         GoodsReceiptItem[]

  @@index([purchaseOrderId])
}

model GoodsReceiptItem {
  id        String @id @default(cuid())
  goodsReceiptId String
  purchaseOrderItemId String
  variantId String
  quantity  Int
  /// Agreed unit cost, copied from the PO line at receipt time (a snapshot).
  unitCost  Int
  /// unitCost plus this line's share of freight/duty/other. THIS is the number
  /// that updates the variant's weighted-average cost.
  landedUnitCost Int

  goodsReceipt      GoodsReceipt      @relation(fields: [goodsReceiptId], references: [id], onDelete: Cascade)
  purchaseOrderItem PurchaseOrderItem @relation(fields: [purchaseOrderItemId], references: [id])
  variant           ProductVariant    @relation(fields: [variantId], references: [id])

  @@index([goodsReceiptId])
  @@index([variantId])
}

enum SupplierBillStatus {
  UNPAID
  PARTIAL
  PAID
}

model SupplierBill {
  id         String             @id @default(cuid())
  supplierId String
  purchaseOrderId String?
  /// The supplier's own invoice number.
  reference  String?
  amount     Int
  amountPaid Int                @default(0)
  status     SupplierBillStatus @default(UNPAID)
  issuedAt   DateTime           @default(now())
  dueAt      DateTime?
  paidAt     DateTime?
  notes      String?
  createdAt  DateTime           @default(now())
  updatedAt  DateTime           @updatedAt

  supplier      Supplier       @relation(fields: [supplierId], references: [id])
  purchaseOrder PurchaseOrder? @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)

  @@index([supplierId, status])
  @@index([status, dueAt])
}
```

### Numbering

`PO-2026-0001` / `GRN-2026-0001`. There is already a `nextOrderNumber(tx)`
helper in `orders.service.ts` — **read it and follow the same approach** rather
than inventing a second scheme. Generate inside the transaction.

### The two calculations you must get exactly right

#### (a) Landed cost allocation

Freight, duty and other costs on a receipt are spread across its lines **by
extended value** (`quantity × unitCost`), not evenly and not by quantity — a
receipt of 100 buttons and 2 bolts of silk must not put the same freight on each.

```
extra          = freightCost + dutyCost + otherCost
lineValue[i]   = quantity[i] * unitCost[i]
totalValue     = Σ lineValue
share[i]       = round(extra * lineValue[i] / totalValue)
landedUnit[i]  = unitCost[i] + floor(share[i] / quantity[i])
```

**The rounding trap.** `Σ share[i]` will usually not equal `extra` because of
rounding — you will be a few paisa out, and that error compounds into the stock
valuation report. Fix it deterministically: compute all but the last share by
rounding, then set the **last** share (order lines by descending `lineValue` and
use the largest) to `extra - Σ(other shares)`. Assert `Σ share == extra` before
writing. Add a unit test with values that do not divide evenly — e.g. extra =
1000 paisa across three lines of value 333, 333, 334.

If `totalValue == 0` (a free sample receipt), put the whole `extra` on the line
with the largest quantity. Never divide by zero.

#### (b) Weighted-average cost

```
oldValue = max(stockBefore, 0) * currentCostPrice
newValue = receivedQty * landedUnitCost
newCost  = round((oldValue + newValue) / (max(stockBefore, 0) + receivedQty))
```

Traps, all of which will happen in production:

- **`stockBefore` can be zero** (first ever receipt) → `newCost = landedUnitCost`.
- **`stockBefore` can be negative** if a correction went wrong → clamp to zero
  before weighting, otherwise the average goes negative or explodes.
- **`currentCostPrice` can be zero** for stock that predates this phase. Zero is
  "unknown", not "free". When `currentCostPrice == 0 && stockBefore > 0`, set
  `newCost = landedUnitCost` rather than averaging a real cost against a fake
  zero — averaging would understate cost and overstate profit forever.
- Do it **inside the receipt transaction**, and read `stockBefore` from the
  `StockMovement.resultingStock` you just wrote, not from a separate query.

Put both calculations in `packages/shared/src/pricing.ts` as
`allocateLandedCost()` and `weightedAverageCost()`, pure functions, fully unit
tested. They are exactly the kind of rule House Rule 11 exists for.

### Posting a receipt — the transaction

All of this in **one** `prisma.$transaction`:

1. Validate: PO is `SENT` or `PARTIAL`; every line belongs to this PO; quantity
   > 0; `quantityReceived + quantity <= quantityOrdered × (1 + tolerance)` where
   tolerance is the setting `purchasing.over_receipt_tolerance` (default `0`).
2. Create `GoodsReceipt` + its items with computed `landedUnitCost`.
3. For each line: `inventory.move({ delta: +quantity, reason: 'PURCHASE_RECEIPT',
   refType: 'GoodsReceipt', refId, unitCost: landedUnitCost }, tx)` — sorted by
   `variantId` (WO-1.2 rule).
4. Recompute and write each variant's `costPrice` and `lastReceivedAt`.
5. Increment `PurchaseOrderItem.quantityReceived`.
6. Recompute PO status: all lines full → `RECEIVED`, some → `PARTIAL`.
7. Publish a new domain event `DomainEvent.GoodsReceived` (add it to
   `domain-events.ts` with its payload), passing `tx`.

Steps 2-6 must be atomic. A half-posted receipt — stock in but cost not updated —
is the worst possible state because nothing will ever tell you.

### Settings to add

`settings.defaults.ts`:

```ts
PurchasingOverReceiptTolerance: 'purchasing.over_receipt_tolerance',  // 0
PurchasingAutoDraftReorder:     'purchasing.auto_draft_reorder',      // true
```

### Permission

```ts
{ key: 'purchasing.manage', label: 'Create and receive purchase orders', category: 'Purchasing' },
```

`ADMIN` and `STAFF`.

### Acceptance
- [ ] Receive 10 @ Rs 500, then 10 @ Rs 700 → `costPrice` reads exactly Rs 600.
- [ ] Receive 10 @ Rs 500 with Rs 1,000 freight → `landedUnitCost` = Rs 600,
      `costPrice` = Rs 600.
- [ ] Freight allocation across lines of value 333/333/334 sums to the freight
      exactly, to the paisa. Unit test.
- [ ] First-ever receipt on a variant with `costPrice = 0` and `stock = 5` sets
      cost to the landed cost, not to an average with zero.
- [ ] Partial receipt moves the PO to `PARTIAL`; the remainder moves it to
      `RECEIVED`.
- [ ] Over-receipt beyond tolerance is refused with a clear message.
- [ ] A receipt that throws at step 5 leaves **no** stock movement — verify by
      forcing a failure in a test.
- [ ] A `DRAFT` PO cannot be received.

---

## WO-1.6 — Reorder, low stock and slow movers

### Schema — append to `inventory.prisma`

```prisma
/// Nightly-computed sales velocity per variant. A cache, not a source of
/// truth — safe to delete and recompute.
model VariantSalesStat {
  variantId       String   @id
  /// Units sold in the trailing 30 / 90 days.
  units30         Int      @default(0)
  units90         Int      @default(0)
  lastSoldAt      DateTime?
  /// stock / (units30 / 30). Null when nothing sold — that IS the dead-stock signal.
  daysOfCover     Float?
  /// Days since the last PURCHASE_RECEIPT movement.
  ageDays         Int?
  computedAt      DateTime @default(now())

  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@index([daysOfCover])
  @@index([lastSoldAt])
}
```

### The nightly job

A `@Cron` in the `inventory` module (`@nestjs/schedule` — check whether it is
already a dependency; add it if not). Runs at 02:00 local.

1. Recompute `VariantSalesStat` for every active variant from `StockMovement`
   rows with `reason = SALE` (this is why WO-1.2 had to come first — before it,
   sales were not in the ledger at all and this job would have been impossible).
2. Flag low stock: `stock <= lowStockThreshold`.
3. Flag slow movers: no `SALE` in `inventory.slow_mover_days` (setting, default
   60) **and** `stock > 0`.
4. Reorder suggestions: `reorderPoint != null && stock <= reorderPoint`.
   Suggested quantity = `reorderQuantity ?? reorderPoint`, raised to the
   preferred supplier's `moq`.
5. If `purchasing.auto_draft_reorder` is on, group suggestions by preferred
   supplier and create **one DRAFT purchase order per supplier**. Never create a
   `SENT` PO automatically — a person sends it.

**Idempotency matters here.** The job may run twice (retry, restart, manual
trigger). Do not create a second draft PO for a supplier that already has an
open draft from today — find and update it instead. This is the same at-least-once
discipline as House Rule 3.

### Low-stock notification

Subscribe to `DomainEvent.ProductLowStock` (which WO-1.2 makes fire). Nothing
subscribes to it today — it is published nowhere and handled nowhere. Add a
handler in the `inventory` module that sends a notification through the existing
`NotificationChannel` core service and shows on the dashboard.

Debounce it: one alert per variant per day, or every sale of a low-stock item
alerts again and staff learn to ignore them.

### Settings

```ts
InventorySlowMoverDays: 'inventory.slow_mover_days',   // 60
InventoryDeadStockDays: 'inventory.dead_stock_days',   // 180
```

### Acceptance
- [ ] Seed sales history, run the job, confirm `units30` matches a hand count.
- [ ] A variant with stock and no sale in 60 days appears as a slow mover.
- [ ] A variant with stock 0 does **not** appear as a slow mover (it is not
      slow, it is absent).
- [ ] Running the job twice produces one draft PO, not two.
- [ ] Low-stock alert fires once, not on every subsequent sale that day.

---

## WO-1.7 — Stock counts

### Schema — append to `inventory.prisma`

```prisma
enum StockCountStatus {
  DRAFT       // lines being added
  COUNTING    // in progress on the shop floor
  COMPLETED   // variance posted to the ledger
  CANCELLED
}

model StockCount {
  id        String           @id @default(cuid())
  number    String           @unique   // "SC-2026-0001"
  status    StockCountStatus @default(DRAFT)
  /// Optional scope: only variants in this category were counted.
  categoryId String?
  notes     String?
  startedAt DateTime?
  completedAt DateTime?
  countedById String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  countedBy User?            @relation("StockCountCounter", fields: [countedById], references: [id], onDelete: SetNull)
  lines     StockCountLine[]

  @@index([status, createdAt])
}

model StockCountLine {
  id        String @id @default(cuid())
  stockCountId String
  variantId String
  /// System stock at the moment the count was STARTED — frozen, so goods
  /// arriving mid-count do not silently change the expected figure.
  expected  Int
  /// What the person actually counted. Null until entered.
  counted   Int?
  /// counted - expected, written when the count completes.
  variance  Int?
  note      String?

  stockCount StockCount     @relation(fields: [stockCountId], references: [id], onDelete: Cascade)
  variant    ProductVariant @relation(fields: [variantId], references: [id])

  @@unique([stockCountId, variantId])
}
```

**Why `expected` is frozen at start:** if you compute expected-vs-counted at
completion time, a sale during the count looks like a shrinkage. Freezing it at
start and posting the variance against the *current* stock is the correct
behaviour — the variance is real, and any sale during the count is separately in
the ledger.

Posting a completed count: for each line with `counted != null` and a non-zero
variance, `inventory.move({ delta: counted - currentStock, reason: 'COUNT',
refType: 'StockCount', refId })`. Note this is against **current** stock, not
against `expected`.

Barcode entry: the count screen accepts a scanned `ProductVariant.barcode`
(added in WO-1.3) and increments that line. Plain input field, `autofocus`, submit
on Enter — a USB barcode scanner is just a keyboard.

### Permission

```ts
{ key: 'inventory.count', label: 'Run stock counts', category: 'Catalogue' },
```

### Acceptance
- [ ] Sell an item mid-count; the variance reflects the physical difference, not
      the sale.
- [ ] Completing a count with zero variances writes zero movements.
- [ ] A completed count cannot be edited or re-posted.

---

## WO-1.8 — Admin screens

Uncomment the Inventory & Supply children from WO-1.1.

| Route | Contents |
|---|---|
| `/admin/inventory` | Rebuilt. Columns: product, SKU, barcode, stock, threshold, cost*, stock value*, days of cover, last sold. Filters: all / low / out / slow. Row expands to the movement ledger. |
| `/admin/inventory/counts` + `/[id]` | List and the count sheet with barcode entry |
| `/admin/inventory/reorder` | Suggestions, multi-select, "create draft POs" |
| `/admin/inventory/slow-movers` | Ageing buckets, days of cover, stock value at risk |
| `/admin/suppliers` + `/[id]` | Supplier list and record with PO history |
| `/admin/purchase-orders` | List, status filter |
| `/admin/purchase-orders/new` | Supplier → add lines → costs → save draft / send |
| `/admin/purchase-orders/[id]` | The PO, its receipts, its bills |
| `/admin/purchase-orders/[id]/receive` | Receiving sheet: quantity per line, freight/duty, post |

`*` cost and value columns render only with `inventory.view_cost` — and remember
the API already omits them (WO-1.3), so the UI is just not rendering an absent
field, which is the correct order of operations.

**Follow the existing page conventions**, since the shared primitives do not
exist until Phase 2: the `.card` / `.btn-primary` / `.field-input` classes from
`apps/web/src/app/globals.css`, the header block used by every page, and
`use-toast.ts` for feedback. Do **not** invent a component library here —
Phase 2 replaces all of it and duplicated effort will be thrown away.

Money renders through `formatMoney()` from `@yaseen/shared`. Never divide by 100
in a component.

### Acceptance
- [ ] Every screen is usable at 375px wide. The receiving sheet especially — it
      gets used on a phone in a stockroom.
- [ ] A STAFF user without `inventory.view_cost` sees no cost column and no
      layout gap where it was.
- [ ] Posting a receipt from the UI produces exactly the same result as the API
      test in WO-1.5.

---

## WO-1.9 — Reports

Add to the existing `reports` module (`apps/api/src/modules/reports/`), following
`csv.util.ts` and the three existing exports:

- **Stock valuation** — variant, stock, cost, `stock × cost`, with a grand total.
  Gate on `inventory.view_cost`.
- **Purchases by supplier** — period, supplier, PO count, value received.
- **Stock movement ledger** — full export with reason, ref and cost.
- **Slow movers** — as the screen, exportable.

### Acceptance
- [ ] The valuation total equals the sum of the ledger's cost-weighted movements.
      If it does not, the weighted-average implementation is wrong — do not ship.

---

## Phase 1 exit criteria

Verify all of these locally first. Live verification happens **after the
owner has merged and deployed** — you do not deploy, and you do not merge to get
a deploy. Do not start Phase 2 until all of these hold:

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green.
2. Nothing writes `ProductVariant.stock` except `InventoryService.move()`.
3. A full loop works end to end: create supplier → draft PO → send → receive
   partially → stock and cost update → sell → margin is right → reorder
   suggestion appears → stock count reconciles.
4. Stock valuation reconciles against the ledger to the paisa.
5. The migration has been run against a **copy of the production database** and
   every existing `StockAdjustment` row is present as a `StockMovement`.
6. `StockAdjustment` is still in the schema, unused, awaiting its drop migration.
