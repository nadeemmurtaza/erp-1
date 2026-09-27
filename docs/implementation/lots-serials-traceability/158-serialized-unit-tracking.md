# 158 — Serial numbers: one row per physical unit, the same sub-ledger pattern doc 32 already proved for a batch

`MULTI-SECTOR.md` already names this exact gap and leaves it unbuilt:
"electronics adds `serials` and `warranty`" is listed among the future packs
a new sector would add. Confirmed by grep — no `SerializedUnit` model, no
`serialNumber` field, nothing warranty-related on a product anywhere in
`inventory.prisma` or the API. This document is the buildable brief behind
that one line, in the identical relationship doc 32 has to its own listing
("`lots` is core, not a pack") — except a serial number is the other end of
the same idea: **a lot groups many units under one batch identity; a serial
number gives exactly one unit its own identity.** Neither replaces the
other, and neither replaces `Location`/`VariantLocationStock`'s own job of
"how much of this variant is at this location."

> **Status (2026-09-27): built, WO-158.1–158.5, with named boundaries.**
> `SerializedUnit`/`SerializedUnitStatus` and `ProductVariant.tracksSerials`
> ship as sketched (WO-158.1). `SerializedUnitsService.receiveUnits()` is
> the only writer at receipt time, calling `InventoryService.move()`
> unchanged — N individual calls (delta 1 each), not one `moveMany()` for
> the whole line, proved cost-equivalent to a single batched receipt
> (DECISIONS.md ADR-069). `sellUnit()`/`returnUnit()`/`writeOff()` are
> manual staff actions, **deliberately NOT wired into the POS/online sale
> flow WO-158.4 also names** — automatically picking which physical unit a
> sale consumes is a real correctness risk this document's own §2 sketch
> does not resolve, so a staff member reconciles the sold serial against
> the order afterward instead (ADR-069's own reasoning). `getUnitHistory()`
> and the public `GET /public/serials/:serialNumber` warranty lookup are
> built (WO-158.3) and reachable from the storefront footer — **surfacing
> the lookup inside doc 64's help-desk ticket screen is not built**. The
> goods-receipt screen's serial-entry step is built (WO-158.4). Permissions
> are exactly as scoped (WO-158.5): `inventory.manage` for staff actions,
> `@Public()` for the narrow lookup.

## Why this is a real gap, not a smaller version of `lots`

A grocery recall asks "which customers may have bought from batch
L2024-118" — doc 32's own question, answered at the batch level because a
carton of milk has no serial number and a hundred-unit recall is the right
granularity. An electronics/appliance/high-value-goods recall, warranty
claim, or theft investigation asks a **stricter** question: "which specific
unit — this exact phone, this exact laptop, this exact IMEI — did we sell,
to whom, and when." Pakistan's own PTA DIRBS regime requires phone IMEIs
to be tracked at exactly this granularity for a retailer selling
handsets. A `Lot` with `quantity` still can't answer "was THIS unit ever
in our stock at all," which is the one question a counterfeit-goods dispute
or a warranty claim always starts with.

## 1. `SerializedUnit` — a sub-ledger under the existing stock row, never a second stock model

```prisma
// inventory.prisma — additive
enum SerializedUnitStatus {
  IN_STOCK
  SOLD
  RETURNED
  RMA_TO_SUPPLIER
  WRITTEN_OFF
}

model SerializedUnit {
  id             String   @id @default(cuid())
  organizationId String
  productVariantId String
  /// Manufacturer-assigned in the overwhelming majority of cases (IMEI, a
  /// printed serial) - this system records it, never generates it, unlike
  /// documentNumber()'s own sequence-generated codes elsewhere in this repo.
  serialNumber   String
  status         SerializedUnitStatus @default(IN_STOCK)
  /// The batch this unit shipped in, when the supplier also lot-codes -
  /// doc 32's Lot, unchanged. Null when the sector uses serials without lots.
  lotId          String?
  /// Current location, valid only while status = IN_STOCK. History of how it
  /// got there is StockMovement's own job (see WO-158.1) - never duplicated
  /// here as a second location ledger.
  locationId     String?
  /// Set once, on SOLD - which order carried this exact unit out the door.
  orderId        String?
  /// The StockMovement that produced the CURRENT status - unique per
  /// movement, the same discipline StockVariance.stockMovementId already
  /// uses, so one movement can never be double-attributed to two units.
  stockMovementId String? @unique
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, serialNumber])
  @@index([productVariantId, status])
  @@index([orderId])
}
```

`ProductVariant` gains one opt-in flag:

```prisma
model ProductVariant {
  // existing fields unchanged
  tracksSerials Boolean @default(false)
}
```

Off by default, and off means byte-identical to today's behavior — a t-shirt
or a bag of rice never asks for a serial number; only a variant a merchant
explicitly flags (phones, laptops, appliances, anything IMEI-regulated or
individually warrantied) gains the extra step. This is the same "absent
collaborator" discipline every optional overlay in this repository already
follows.

## 2. Capture points — three, and only three, moments a serial is ever written

```ts
async receiveSerializedUnits(
  goodsReceiptLineId: string,
  serials: string[],   // scanned or typed, one per physical unit received
): Promise<SerializedUnit[]> {
  const line = await this.goodsReceiptLine(goodsReceiptLineId);
  if (line.variant.tracksSerials && serials.length !== line.quantity) {
    throw new BadRequestException(
      `${line.quantity} units received but ${serials.length} serial numbers given - counts must match exactly.`,
    );
  }
  return this.prisma.$transaction(async (tx) => {
    const movement = await this.inventory.move(
      { variantId: line.variantId, delta: line.quantity, locationId: line.locationId, reason: 'PURCHASE_RECEIPT', refType: 'GoodsReceipt', refId: line.goodsReceiptId },
      tx,
    );
    // One SerializedUnit per serial, all pointing at the SAME movement's
    // resulting stock - InventoryService.move() itself never learns a
    // serial exists, unchanged per "one writer per invariant."
    return Promise.all(serials.map((serialNumber) =>
      tx.serializedUnit.create({ data: { organizationId: line.organizationId, productVariantId: line.variantId, serialNumber, locationId: line.locationId, stockMovementId: movement.id } }),
    ));
  });
}
```

```ts
async sellSerializedUnit(orderLineId: string, serialNumber: string): Promise<void> {
  const line = await this.orderLine(orderLineId);
  const unit = await this.prisma.serializedUnit.findUniqueOrThrow({
    where: { organizationId_serialNumber: { organizationId: line.organizationId, serialNumber } },
  });
  if (unit.status !== 'IN_STOCK' || unit.locationId !== line.fulfillingLocationId) {
    // Never a generic "not found" - the specific reason matters here: a
    // unit already sold elsewhere, or physically at the wrong branch, are
    // two different operator errors with two different fixes.
    throw new ConflictException(`Serial ${serialNumber} is not available at this location for sale.`);
  }
  await this.prisma.$transaction(async (tx) => {
    const movement = await this.inventory.move(
      { variantId: unit.productVariantId, delta: -1, locationId: unit.locationId!, reason: 'SALE', refType: 'Order', refId: line.orderId },
      tx,
    );
    await tx.serializedUnit.update({ where: { id: unit.id }, data: { status: 'SOLD', orderId: line.orderId, stockMovementId: movement.id, locationId: null } });
  });
}
```

Return processing scans the same serial and requires `status: SOLD` and
`orderId` matching the return's own order before accepting it — a direct,
concrete instance of doc 156's own fraud-prevention discipline: a "return"
naming a serial that was never sold to that order is refused outright, not
silently accepted on the strength of a typed number.

## 3. `getUnitHistory()` — the warranty and authenticity lookup this data makes possible

```ts
async getUnitHistory(serialNumber: string): Promise<{
  serialNumber: string;
  status: SerializedUnitStatus;
  soldOn: Date | null;
  orderNumber: string | null;
  warrantyEndsOn: Date | null;   // soldOn + ProductVariant.warrantyMonths, when set
} | null> {
  // A pure read over SerializedUnit + its linked Order/OrderLine and the
  // variant's own warrantyMonths (additive scalar, doc 158 only - a full
  // warranty-claims workflow, RMA approval chain, and repair tracking are
  // named explicitly as separably larger work in Out of Scope, not stubbed
  // here).
}
```

Reachable two ways: staff-side (doc 64's help-desk ticketing can look up a
customer's serial when they call in), and a narrow public "verify your
purchase" lookup a customer can run themselves — never exposing which
branch or which employee sold it, only status/date/warranty, the same
minimal-disclosure principle doc 46's own FBR QR-code lookup already uses.

## 4. Strengthens doc 156 for free — a variance can now name the exact unit, not just the SKU

```prisma
model StockVariance {
  // existing fields unchanged
  serializedUnitId String?  // set when the missing/oversold item is serial-tracked
}
```

Doc 156's own central finding was that a lone branch employee's shrinkage
is attributable only to "this branch, sometime" without a serial. With
serials on, an oversell or a count mismatch on a serial-tracked variant can
name the **exact missing unit** — closing the gap between "one phone short"
and "this specific IMEI, last scanned IN_STOCK during this employee's
shift, is now unaccounted for." Additive to doc 156's own design; nothing
in that document changes.

## Scope lenses

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: every write is by an existing `User`
(receiving/selling/returning staff); no new actor.
**Whose rows, and which columns** — `SerializedUnit` is `organizationId`-
scoped identically to every other table; the public warranty lookup (§3)
returns only status/date/warranty, never `locationId`, `orderId`'s own
customer detail, or which employee handled it.
**The threshold nobody approves alone** — n/a: receiving/selling a
serialized unit is an ordinary stock movement at whatever value threshold
doc 01's existing controls already gate; this document adds no new
money/stock threshold of its own.
**The toxic pair** — the return-acceptance check in §2 (`status: SOLD` +
matching `orderId`) IS this document's toxic-pair guard: a serial can never
be "returned" by anyone without it having been legitimately sold on that
exact order first - closing the identical class of self-dealing gap doc
156 named for `StockVariance.resolve()`.
**Authority and blast radius** — flipping a unit to `WRITTEN_OFF` (theft,
damage, lost) is gated by `inventory.manage`, same as any other stock
write; the audit trail is the `StockMovement` row it always produces.
**Audience is a capability, not an address** — n/a: no notification of its
own; a warranty lookup is a pull, never a push.
**Request or record** — `receiveSerializedUnits()`/`sellSerializedUnit()`
are REQUESTS (refusable — a count mismatch, an already-sold serial); once
the resulting `StockMovement` posts, the fact is a RECORD exactly as every
other movement already is.
**The movement with no address** — n/a beyond `InventoryService.move()`'s
own existing answer; this document never bypasses it or reaches
`defaultLocationId()`.
**Four hours down, the counter stays open** — an offline receiving/selling
flow queues scanned serials locally exactly as any other offline POS
action already does (doc 48); the uniqueness constraint on
`(organizationId, serialNumber)` is what makes a later sync's duplicate
attempt a conflict rather than a silent double-count.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: `SerializedUnit` posts no
GL entry of its own; the `StockMovement` it's attached to already carries
whatever posting rule that movement type already has (doc 01/04), unchanged.
**Dry run before live** — n/a: no policy calculation of its own to preview.
**Click the number** — a serial's own `getUnitHistory()` is itself the
drill-down target: any screen showing "this unit" links straight to it,
never a second, disagreeing summary of the same fact.
**Three silhouettes** — Solo: a small shop with a handful of serialized
phones, `tracksSerials` on two or three variants. Chain: serials scoped per
branch's own `Location`, no cross-branch duplicate risk because the
uniqueness constraint is organization-wide, not branch-local, so a unit
transferred between branches keeps one continuous identity. Organization:
the same table scales to tens of thousands of serials with the two indexes
already named.
**The absent collaborator** — a variant with `tracksSerials: false` (the
default) is entirely unaffected; the receiving/selling flow behaves exactly
as it does today, with no additional field, click, or check.
**The second copy of the write** — named explicitly in the code comments
above: `stockMovementId @unique` makes a redelivered/retried
receive-or-sell call a conflict, never a duplicate `SerializedUnit` row or
a double-counted stock movement.
**The hundred-thousandth row** — indexed on `(productVariantId, status)`
for "what's in stock, serialized" queries and `(orderId)` for "what did
this order contain" - both real, bounded query patterns, not speculative.
**The reversal document, not the reversal flag** — a return doesn't delete
or overwrite the SOLD row's own history; it's a new status transition
(`SOLD → RETURNED`) with its own `stockMovementId`, so a unit's full
lifecycle remains readable end to end, never collapsed to its latest state
alone. **The undo fan-out** — reversing a sale reverses exactly one thing
automatically (the stock movement, via the identical existing return path
doc 06 already specifies); nothing else fires from a serial-level return.
**The version stamp** — n/a: a unit's own serial number and lot are
immutable once received; only `status`/`locationId`/`orderId` ever change,
each captured as its own point-in-time movement.
**The erasure the ledger cannot obey** — `SerializedUnit.orderId` names an
order, not a person directly; a customer erasure request is handled at
`Order`/`Contact`'s own existing erasure path (doc 06/07), unchanged by
this table.
**The failure path** — a serial-count mismatch at receipt (§2) refuses the
whole receipt rather than partially creating units, so a receiving clerk
never ends up with some units tracked and others silently not.

## Work orders

**WO-158.1 — schema**: `SerializedUnit`, `SerializedUnitStatus`,
`ProductVariant.tracksSerials`, `StockVariance.serializedUnitId`,
forward-only migration.
**WO-158.2 — `receiveSerializedUnits()`/`sellSerializedUnit()`/return
handling**, each calling `InventoryService.move()` unchanged inside its own
transaction.
**WO-158.3 — `getUnitHistory()`** + the public warranty/authenticity lookup
route, and its surfacing inside doc 64's help-desk ticket screen.
**WO-158.4 — UI**: a serial-entry step on the goods-receipt screen (only
rendered when the line's variant has `tracksSerials: true`) and a
scan-or-pick step on the POS/online sale flow for the same variants.
**WO-158.5 — permissions**: reuses `inventory.manage` for
receive/sell/write-off; the public lookup route is `@Public()`, doc 46-
style, returning only the minimal fields named in §3.

## Acceptance

- Receiving 5 units of a `tracksSerials: true` variant with fewer than 5
  serial numbers is refused outright, proven by a spec.
- Selling a serial not currently `IN_STOCK` at the selling location is
  refused with the specific reason (already sold vs. wrong location),
  proven by a spec.
- A return naming a serial not sold on that exact order is refused, proven
  by a spec — the direct instance of doc 156's own toxic-pair discipline.
- `getUnitHistory()` on an unknown serial returns `null`, never a stack
  trace or a fabricated result.
- A `StockVariance` on a serial-tracked unit correctly carries
  `serializedUnitId`, provable by a spec extending doc 156's own tests.

## Out of scope

A full warranty-claims workflow (RMA approval, repair tracking, replacement
issuance) — `warrantyEndsOn` is surfaced as a read-only date this document
computes; building the claims process itself is real, separately-scoped
work for whenever a merchant actually needs it, not stubbed here. Serial-
number generation for a merchant's own house-branded goods with no
manufacturer serial — this document only records an already-assigned
number; a merchant needing to mint its own would reuse `documentNumber()`'s
existing node-safe sequence pattern, a one-line addition when a real
merchant asks for it, not built speculatively now.
