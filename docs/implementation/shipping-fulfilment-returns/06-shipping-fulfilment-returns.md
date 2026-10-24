# Phase 6 — Shipping, fulfilment, tracking and returns

**Read `00-HOUSE-RULES.md` first.** Depends on Phase 1.

> **Status (2026-09-24): built.** New core module `fulfilment`
> (`apps/api/src/modules/sales/fulfilment/`) — shipping zones/rates/methods/classes
> as real tables (WO-6.1), the `CourierProvider` interface with only
> `manual` implemented (WO-6.2 — WO-6.3's own text says build the one the
> shop uses and no more; there is no real courier account here to integrate
> against), the shipment lifecycle with manifests and `ShipmentEvent`
> (WO-6.4), a 30-minute `FulfilmentCron` poll that skips `manual` shipments
> entirely since `ManualCourierProvider.track()` has nothing to ask —
> staff record a manual shipment's status by hand from `/admin/fulfilment/
> shipments` instead (WO-6.5), returns/RMA with seeded reason codes and an
> inspection step that restocks a saleable item or writes off a damaged one
> (WO-6.6), RTO detection and its own dashboard by city/product/order value
> (WO-6.7), and the admin + storefront screens WO-6.8 names.
>
> **A real, deliberate limit on WO-6.6's REFUND path, not a bug:**
> `ReturnsService.resolve()` only permits `resolution: 'REFUND'` when the
> return covers the order's entire returnable quantity. Why: `accounting`'s
> `posting-rules.subscriber.ts#onPaymentRefunded()` has no partial-refund
> support today — its own comment says a full reversal of the sale "is the
> correct read of today's domain model, not an approximation of one that
> isn't built." Wiring a partial return into that path would silently
> reverse a whole order's revenue and COGS for one returned item among
> several. A partial return resolves as EXCHANGE, STORE_CREDIT or REPAIR
> instead (STORE_CREDIT is recorded as a resolution only — real issuance and
> redemption depend on Phase 5, `05-promotions-giftcards.md`, unbuilt).
> Building a correct proportional GL reversal is real, separable work,
> named here rather than attempted as a drive-by fix inside this pass.
>
> **Order.status and ReturnRequest.status are deliberately independent.**
> A return does not move the order out of `DELIVERED` — `Order.status` has
> no partial-return state, and a return can cover one item out of several.
> The one exception: a full-order return resolved `REFUND` publishes
> `DomainEvent.ReturnRequestFullyRefunded`, which `orders/shipment-status.
> listener.ts` (living in `orders`, not `fulfilment` — INDEPENDENCE,
> MULTI-SECTOR.md) turns into `changeStatus(..., 'RETURNED', {
> skipStockRelease: true })`, reusing the existing restock/notification/
> OrderEconomics-reversal machinery without double-restocking what
> `inspect()` already moved.
>
> **Named gaps:** no pagination yet on the shipments/manifests/returns list
> endpoints (WO-6.8's own screens render fine at today's scale; the
> performance rule's own pagination requirement is not yet met at volume).
> No admin-initiated return (only the customer's own `POST /returns`) — a
> phone-in return needs a staff-facing "create on behalf of" endpoint, not
> built. No label upload wiring (`CourierProvider.label()` exists on the
> interface; no enabled provider returns one to upload).

## Why

Three gaps, all of which cost real money in Pakistan:

1. **Shipping is a JSON blob.** `shipping.zones` in `Setting`
   (`settings.defaults.ts`) holds city lists, a flat fee, a free-above threshold
   and an ETA. That is a fine starting point and a bad permanent home — it cannot
   be queried, reported on, versioned or extended to weight-based rates.
2. **Fulfilment is manual.** The `Shipment` model exists (`orders.prisma`) with a
   `courier` string and a tracking number typed by hand. No courier integration,
   no label, no manifest, no status polling.
3. **There is no returns model at all.** `OrderStatus.RETURNED` exists and
   nothing else. No reason codes, no inspection, no restocking decision, no
   refund path. In a COD market with high RTO, this is the largest unmeasured
   cost in the business.

**Note:** the existing `tracking` module is **visitor analytics**, not shipment
tracking. Do not add courier code to it. Shipment tracking goes in the new
`fulfilment` module.

## Work orders

| WO | Title |
|---|---|
| 6.1 | Shipping module: zones, rates, methods |
| 6.2 | `CourierProvider` interface + manual driver |
| 6.3 | Real courier drivers |
| 6.4 | Shipment lifecycle, labels, manifests |
| 6.5 | Tracking automation and customer notifications |
| 6.6 | Returns and RMA |
| 6.7 | RTO handling |
| 6.8 | Screens |

---

## WO-6.1 — Shipping as a module

```prisma
model ShippingZone {
  id        String  @id @default(cuid())
  key       String  @unique
  order     Int     @default(0)
  /// Cities matched case-insensitively. An empty list = the catch-all zone.
  cities    String[] @default([])
  isActive  Boolean @default(true)
  /// Exactly one zone must be the fallback.
  isCatchAll Boolean @default(false)

  translations ShippingZoneTranslation[]   // labelEn / labelUr, House Rule 6
  rates        ShippingRate[]
}

enum ShippingRateType { FLAT  BY_WEIGHT  BY_PRICE  BY_ITEM }

model ShippingRate {
  id       String           @id @default(cuid())
  zoneId   String
  methodId String
  type     ShippingRateType @default(FLAT)
  /// Paisa. For BY_WEIGHT/BY_ITEM this is per unit above `includedUnits`.
  fee      Int
  baseFee  Int  @default(0)
  includedUnits Int @default(0)
  /// Order subtotal above which this rate is free. Null = never free.
  freeAbove Int?
  /// Band bounds, for tiered rates. Null = unbounded.
  minValue Int?
  maxValue Int?
  isActive Boolean @default(true)

  zone   ShippingZone   @relation(fields: [zoneId], references: [id], onDelete: Cascade)
  method ShippingMethod @relation(fields: [methodId], references: [id], onDelete: Cascade)
}

model ShippingMethod {
  id          String  @id @default(cuid())
  key         String  @unique   // "standard" | "express" | "same_day"
  courierKey  String?           // preferred CourierProvider for this method
  etaMinDays  Int     @default(2)
  etaMaxDays  Int     @default(5)
  isActive    Boolean @default(true)
  order       Int     @default(0)

  translations ShippingMethodTranslation[]
  rates        ShippingRate[]
}
```

**Migrate the existing setting into rows** in the same migration. Read
`SettingsService.getShippingZones()` and `resolveShippingZone()` — the new module
must produce byte-identical fees for the existing zones on day one, and there
should be a test asserting exactly that against the seeded data. Checkout must
not change behaviour when this ships.

Keep the COD fee as a rate, not a constant. Add per-product shipping classes
(`Product.shippingClassId`) and a handling fee.

---

## WO-6.2 — The `CourierProvider` interface

Follow `apps/api/src/core/storage/storage.driver.ts` exactly — small interface,
one file per implementation, selected by an env allowlist (House Rule 8).

```ts
export interface CourierProvider {
  readonly key: string;
  /** Book a consignment. Returns the tracking number and any label payload. */
  createShipment(input: CreateShipmentInput): Promise<CourierShipment>;
  /** Current status. Called by the polling job. */
  track(trackingNumber: string): Promise<CourierTrackingResult>;
  cancel(trackingNumber: string): Promise<void>;
  /** PDF or ZPL. Null when the courier has no label API. */
  label?(trackingNumber: string): Promise<Buffer | null>;
  /** Optional webhook verification, for couriers that push. */
  verifyWebhook?(headers: Record<string, string>, body: unknown): boolean;
}
```

Env allowlist `COURIER_PROVIDERS="manual"` initially. Ship the `manual` driver
first — it is what the shop uses today (type a tracking number) and it keeps the
whole phase useful before any integration exists.

**Normalise statuses.** Every courier has its own vocabulary. Map all of them
onto the existing `ShipmentStatus` enum (`PENDING | DISPATCHED | IN_TRANSIT |
DELIVERED | RETURNED | LOST`) in the driver. Never let a courier's raw string
reach the domain — store it in `meta` for support, map it for logic.

---

## WO-6.3 — Real couriers

Pakistan-relevant, in rough order of usefulness: **PostEx**, **Leopards**,
**TCS**, **M&P**, **Trax**, **BlueEx**, **CallCourier**.

One driver per file, one at a time, each behind its allowlist key. Each needs:
credentials in env (never in code), a sandbox test, retry with backoff on 5xx,
and a timeout — a courier API hanging must not hang checkout. **Booking a
shipment happens after the order is placed, never inside the checkout
transaction.**

Do not build all seven. Build the one the shop actually uses, prove the
interface, and let the rest follow demand.

---

## WO-6.4 — Shipment lifecycle

Extend `Shipment` (`orders.prisma`): `methodId`, `weightGrams`, `packageCount`,
`labelUrl`, `manifestId`, `meta Json?`, `rtoAt`, `failedAttempts`.

New models: `Manifest` (a day's pickup, grouped by courier, with a printable
sheet) and `ShipmentEvent` (the tracking timeline — one row per status change,
with the courier's raw status in `meta`).

Flow: order `READY_TO_SHIP` → pick/pack → book with the courier → label →
manifest → dispatch. Partial shipments: an order may ship in two parcels, so a
shipment holds `ShipmentItem` rows rather than implicitly covering the whole
order.

---

## WO-6.5 — Tracking automation

A `@Cron` every 30 minutes polls `track()` for every shipment not in a terminal
state, and:
- writes a `ShipmentEvent` when the status changes (idempotent — do not write a
  row when nothing moved);
- advances the order status (`SHIPPED`, `DELIVERED`);
- publishes `DomainEvent.ShipmentStatusChanged`;
- a notification subscriber tells the customer through the existing
  `NotificationChannel` core service.

Back off on shipments that have not moved in days — do not poll a stale
consignment every 30 minutes for a month. Where a courier supports webhooks,
prefer them and keep polling as the fallback.

---

## WO-6.6 — Returns and RMA

```prisma
enum ReturnStatus {
  REQUESTED
  APPROVED
  REJECTED
  IN_TRANSIT
  RECEIVED
  INSPECTED
  REFUNDED
  CLOSED
}

enum ReturnResolution { REFUND  EXCHANGE  STORE_CREDIT  REPAIR  REJECTED }

model ReturnRequest {
  id        String       @id @default(cuid())
  number    String       @unique   // "RMA-2026-0001"
  orderId   String
  userId    String?
  status    ReturnStatus @default(REQUESTED)
  resolution ReturnResolution?
  customerNote String?
  staffNote    String?
  /// Customer-uploaded photos, via StorageDriver.
  photoUrls String[] @default([])

  requestedAt DateTime @default(now())
  approvedAt  DateTime?
  receivedAt  DateTime?
  refundedAt  DateTime?
  refundAmount Int?

  order Order              @relation(fields: [orderId], references: [id])
  items ReturnRequestItem[]

  @@index([status, requestedAt])
  @@index([orderId])
}

model ReturnRequestItem {
  id        String @id @default(cuid())
  returnId  String
  orderItemId String
  quantity  Int
  reasonKey String   // "too_small" | "damaged" | "not_as_described" | …
  /// Set at inspection: is it saleable?
  restockable Boolean?
  restocked   Boolean  @default(false)

  returnRequest ReturnRequest @relation(fields: [returnId], references: [id], onDelete: Cascade)
}
```

Reason codes are a **seeded, editable list**, not free text — they are the input
to the fit-feedback loop in Phase 9. "Too small" and "too big" on a garment are
signal, not noise.

Restocking goes through `InventoryService.move({ reason: 'RETURN' })` and only
when inspection marks the item restockable. A damaged return is a `WRITE_OFF`
movement and a direct cost in the P&L, not silent shrinkage.

Refunds go to the original payment method where the gateway supports it,
otherwise to store credit (Phase 5). Recompute `OrderEconomics` (Phase 4) on
refund — reversing revenue **and** COGS together.

---

## WO-6.7 — RTO

Return-to-origin on a COD order is the defining cost of this market and today it
is completely invisible.

- A shipment reaching `RETURNED` without a customer request is an RTO.
- Record the RTO cost (both legs of courier charge) as a direct cost.
- Restock automatically — the goods never reached anyone.
- Increment an RTO counter on the customer's `Contact` record.
- Surface an **RTO rate** on the dashboard: by city, by product, by order value.
  This is what tells the shop which cities to require advance payment from, and
  it is the input to Phase 9's COD risk score.

---

## WO-6.8 — Screens

Fulfilment group: `/admin/fulfilment/shipments`, `/manifests`, `/tracking`,
`/rto`. Sales group: `/admin/sales/returns` + `/[id]` (the inspection sheet).
Settings: `/admin/settings/shipping` (zones, rates, methods),
`/admin/settings/couriers`.

The packing and inspection screens get used on a phone in a stockroom. Design for
375px first.

## Phase 6 exit criteria

1. Migrated shipping rates produce identical fees to the old setting — asserted
   by a test against the seeded zones.
2. A shipment books, labels, manifests, dispatches and auto-tracks to delivered
   with no manual status entry.
3. A customer-initiated return flows request → approve → receive → inspect →
   restock-or-write-off → refund, and inventory and P&L both agree afterwards.
4. RTO rate is visible by city and by product.
5. A courier API timing out does not affect checkout.
