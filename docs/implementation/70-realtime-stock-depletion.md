# 70 — Real-time stock depletion: the "one writer per invariant" rule, already the mechanism

"Instantaneous inventory count deduction at the exact moment of sale via
barcode scanning, reflecting across both POS tills and back-office
stockrooms" describes, exactly, `CLAUDE.md`'s own standing rule: **"One
writer per invariant. Stock moves through `InventoryService.move()` and
nothing else."** Doc 68's own research (this same batch) already traced
the POS sale path directly: `OrdersService.createFromPos()`
(`apps/api/src/modules/orders/orders.service.ts`, lines 495-509) calls
`this.inventory.postUnconditional(...)` **inside the same transaction**
that creates the order, for every line item, the instant a till sale is
rung up — not a queued job, not an eventual-consistency batch, a
same-transaction write. There is no separate "back-office stockroom" copy
of stock to reconcile against: `ProductVariant.stock` (or its
location-scoped equivalent, `VariantLocationStock`) is the one row both
the POS till and the back-office screens read, because both read through
the identical `InventoryService`. This document is a coverage note, not a
new mechanism.

## 1. Why "reflecting across both POS tills and back-office" needs no extra work

A second read surface (a back-office stock report, a low-stock alert, a
storefront's "in stock" badge) does not get its own copy of the count —
it queries the same `VariantLocationStock`/`ProductVariant.stock` row
`InventoryService.postUnconditional()` just wrote, in the same database,
with no replication lag *within one node* (chain-scale, multi-node
replication of stock totals is `RETAIL-ERP.md`'s own separately-scoped
concern, and that document is explicit that stock is never replicated as
a bare total — only as movements, reconciled node-locally). "Real-time" is
not a feature to build here; it is a consequence of there being exactly
one writer and every reader querying that writer's own table directly.

## 2. Barcode scanning is a POS hardware input, not a stock-deduction mechanism of its own

Doc 31's own `BarcodeScanner` interface (`docs/implementation/31-...md`)
already covers "scan a barcode" as a till input event that resolves to a
`variantId` and adds a line item to the in-progress sale — the actual
stock deduction happens identically whether that line item arrived by
scan, by manual SKU entry, or by tapping a product tile. There is no
scan-specific deduction path to build; scanning is doc 31's own concern,
deduction is `InventoryService`'s, and the two are already correctly
separate.

## Scope lenses

Not repeated in full — this document introduces no schema, no write path,
and no permission change; `InventoryService.postUnconditional()`'s own
scope lenses (already covered wherever that mechanism was originally
specified) already answer every lens here. Worth restating once: **The
movement with no address** — every `postUnconditional()` call in the POS
path already names its `locationId` explicitly from `input.locationId`,
never a `defaultLocationId()` fallback — exactly the discipline this
lens exists to enforce, already satisfied by the code this document cites.

## Work orders

None. This document records that the requested capability is already
fully built, at the architectural level ("one writer, same-transaction
deduction") rather than merely coincidentally working for today's cited
example.

## Acceptance

- No schema, service, or permission change — verified by citation to
  `orders.service.ts` lines 495-509 and `CLAUDE.md`'s own standing
  "one writer per invariant" rule.
- Any future stock-related screen (a new report, a new badge) is required
  to read through `InventoryService`/the existing stock tables directly,
  never introduce its own cached or duplicated count — restated as a
  standing constraint for any *future* document, not a new rule invented
  here.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
the promotional list's own bullet has a corresponding, citable document.
