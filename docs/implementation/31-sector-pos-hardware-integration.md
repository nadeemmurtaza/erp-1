# 31 — Sector POS profiles and hardware integration

`pos.prisma`'s own header already names two of this document's three gaps as
unbuilt: "park/retrieve and a till-side price override remain unbuilt." The
third is hardware I/O — a barcode scanner, a receipt printer, a cash drawer —
none of which the till app talks to directly today. This document is not a
POS rebuild: `PosTerminal`, `PosShift`, `CashMovement`, `PosReceipt` and the
`pos -> orders` coupling (R11) already carry the sale, the shift, the cash
count and the receipt. What's missing is the **till hardware layer** and the
**order-shape differences** a bakery counter, a wholesale counter and a
restaurant floor each need on top of the same sale.

## What each requested sector actually needs, checked against what exists

| Sector ask | Already served by | Genuinely new here |
|---|---|---|
| Retail, wholesale — fast billing | `pos`, `orders`, `PosSalesService` | Wholesale's quantity-break pricing needs the `pricing` core module `MULTI-SECTOR.md` already names as **not built** ("today price is `variant.priceOverride ?? product.basePrice`, resolved inline") — named here as a hard dependency, not re-specified; this document adds nothing to price resolution. |
| Grocery — fast billing, weight/scale items | `pos`, and doc 32's `lots` for anything perishable | A scale-input line type (below) |
| Paint shops — tinting/mixing at sale | `bom` (already built: raw materials, recipes, production runs) | Exposing an existing `bom` recipe as a sellable, till-scaled formula — a UI/read path onto `bom`, not a new domain model |
| Bakery/cafe — quick items, modifiers | `pos` | Item modifiers and a kitchen ticket (below) — genuinely new |
| Restaurant — tabs, table service | `pos` | Order-type + park/retrieve (below) — genuinely new, and already flagged unbuilt in `pos.prisma` |
| Barcode scanner, receipt printer, cash drawer | *(nothing — a real gap)* | The hardware driver layer (below) |

## 1. Hardware is an extension point, not a browser API call sprinkled through the till UI

`apps/pos` is a PWA; every driver below runs behind a `PosHardwareDriver`
interface so a deployment with no scanner, no ESC/POS printer, or no
drawer boots and sells normally — the same absent-collaborator discipline
every module in this repository already follows.

```ts
// packages/pos-core/src/hardware.ts
export interface BarcodeScanner {
  /** Most scanners are keyboard-wedge (HID) — no driver needed, this exists
   *  for camera-based scanning (mobile/tablet POS with no dedicated scanner). */
  onScan(handler: (code: string) => void): () => void;
}

export interface ReceiptPrinter {
  print(receipt: PosReceiptPayload): Promise<{ printed: boolean }>;
}

export interface CashDrawer {
  kick(): Promise<void>;
}
```

Keyboard-wedge scanners (the overwhelming majority of barcode hardware) need
**no driver at all** — they type digits and a newline into whatever input has
focus, which `apps/pos`'s basket-entry field already accepts as free text.
The genuine gap is a camera-based `BarcodeScanner` implementation for
tablet/mobile POS with no dedicated hardware, and the two drivers below that
have no browser-native equivalent.

**`ReceiptPrinter`** — one implementation talks WebUSB/serial to an ESC/POS
thermal printer directly from the PWA (works offline, matches till's own
offline-first design); a second, for print servers already on the network,
posts to a local print-spooler endpoint. `PosReceiptPayload` reuses
`packages/pos-core/src/receipt.ts`'s existing receipt maths — this module
adds where it prints, never re-derives what it prints.

**`CashDrawer`** — kicked either through the printer's own drawer-kick pulse
(the common case — most drawers wire through the receipt printer) or a
direct WebUSB/serial connection for a standalone drawer. `kick()` is called
from `PosSalesService`'s existing tender-completion path, once, per
completed cash tender — never on a card tender, never twice for one sale.

## 2. A line can carry a modifier set and a quantity source other than "typed"

```prisma
// pos.prisma — additive, no existing model changed
model PosLineModifier {
  id            String @id @default(cuid())
  /// The PosReceipt line or the pre-sale basket line this modifier applies
  /// to — a bare scalar per this file's existing decoupling convention
  /// (no @relation across the pos/catalog boundary).
  lineRef       String
  key           String  /// "no-onions", "extra-shot", "large"
  label         String
  priceDeltaMinor Int   @default(0)

  @@index([lineRef])
}

enum QuantitySource { TYPED SCALE_WEIGHT BOM_RECIPE_SCALE }

/// Extends the existing basket line concept with where the quantity came
/// from — a scale reading or a scaled BOM recipe, not just a typed integer.
/// This is metadata on the line, not a new sale model.
model PosLineQuantitySource {
  lineRef  String @id
  source   QuantitySource
  /// Set only when source = BOM_RECIPE_SCALE — which bom.prisma recipe this
  /// line's formula came from. Read-only pointer; pos never writes to bom.
  recipeId String?
}
```

`priceDeltaMinor` on a modifier is why this is not just a text note: "extra
shot" changes the till total and must appear as its own line on the printed
receipt and in `orders`' line items once `PosSalesService` hands off to
`OrdersService.placeFromPos()` — the coupling documented in `pos.prisma`
already carries whatever line shape `pos` hands it forward, so this needs no
new coupling, only a richer line.

## 3. Order type decides whether a sale can be parked, not whether it exists

```prisma
enum PosOrderType { COUNTER TAB TABLE }

/// A sale that has started but not tendered — this is exactly the
/// "park/retrieve" pos.prisma already names as unbuilt. Extends PosShift's
/// existing scope; a parked sale belongs to a shift, never floats free of
/// one.
model PosParkedSale {
  id         String   @id @default(cuid())
  shiftId    String
  orderType  PosOrderType @default(COUNTER)
  /// "Table 4", "Tab — Ahmed" — free text; this repository does not model a
  /// restaurant floor plan, only a label a server recognizes.
  label      String
  /// The full basket snapshot (pos-core's own basket shape), park/retrieve
  /// with the underlying maths, never a second sale model.
  basketSnapshot Json
  parkedAt   DateTime @default(now())
  retrievedAt DateTime?

  shift PosShift @relation(fields: [shiftId], references: [id])

  @@index([shiftId, retrievedAt])
}
```

A `COUNTER` sale never parks — retail and bakery counters tender
immediately, the same flow as today. `TAB`/`TABLE` sales may park repeatedly
(a table orders a second round) before final tender, which is what makes
this a distinct, named order type rather than a boolean "can this be parked."

## Scope lenses

**The actor with three tables** — n/a: no new counterparty; a hardware
driver is a browser-side integration, not a principal that authenticates to
the API.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a.
**Whose rows, and which columns** — `PosParkedSale` is visible only to the
shift's own terminal/cashier and to a manager with `pos.shift.view` for that
location, never across branches.
**The threshold nobody approves alone** — n/a: no money commits until
tender, which already goes through `PosSalesService`'s existing path unchanged.
**The toxic pair** — n/a: no new permission pair introduced.
**Authority and blast radius** — who may enable `TAB`/`TABLE` order types for
a terminal (a branch-level POS configuration, per-terminal) — the worst
value is a terminal left in `TABLE` mode at a counter-only branch, which
only changes which button the cashier sees, not what the sale posts.
**Audience is a capability, not an address** — n/a.
**Request or record** — parking a sale is a REQUEST (nothing commits);
tendering it is the existing RECORD path `PosSalesService`/`OrdersService`
already own, unchanged by this document.
**The movement with no address** — n/a beyond the existing sale's own
location, already carried by `PosTerminal.locationId`.
**Four hours down, the counter stays open** — `PosParkedSale` is written
locally to the till's existing offline outbox exactly like a normal sale in
progress; a printer or drawer that's offline degrades to "print/kick
failed, retry" on the till screen, never blocks completing the sale — the
cashier can hand a receipt from a backup printer or write one by hand, and
the sale itself is unaffected, since hardware I/O is deliberately
decoupled from the sale's own completion.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: this document adds no money fact; the sale it
eventually produces posts exactly as `orders`/`payments` already do.
**The second legal entity** — n/a beyond `pos`'s existing per-terminal/
per-location scoping.
**Dry run before live** — n/a: no computed rule to preview: park/retrieve
and printing are direct actions, not policy.
**Three silhouettes** — Solo: one terminal, `COUNTER` only, no hardware
drivers configured — behaves exactly as `pos` does today. Chain: per-branch
terminal configuration (order type, which drivers are wired). Organization:
brand-wide hardware/driver defaults with per-branch override.
**The absent collaborator** — with no `ReceiptPrinter`/`CashDrawer`
implementation registered, `pos` runs exactly as it does today (no print, no
kick, both silently no-op) — proven the same way every other extension
point in this repository is.
**The second copy of the write** — retrieving an already-retrieved
`PosParkedSale` is refused (idempotent retrieve, checked against
`retrievedAt`), not a second basket materializing from the same park.
**The hundred-thousandth row** — parked sales are bounded by open shifts;
`retrievedAt IS NOT NULL` rows are pruned after the shift closes and its Z
report is generated, since a retrieved-and-tendered park has no further use
beyond the sale it became.
**The reversal document** — n/a: nothing here posts a reversible fact; a
parked-then-abandoned sale (till closes with it still parked) is surfaced
on the shift's own close screen as "N sales left parked" so a manager sees
it, never silently discarded.
**The undo fan-out** — n/a.
**The version stamp** — n/a: modifiers and quantity sources are captured on
the line at sale time, unaffected by a later menu/recipe change.
**The erasure the ledger cannot obey** — n/a: no personal data introduced
beyond what `orders`/`pos` already carry.
**The failure path** — a print failure is surfaced on the till screen with a
retry action, logged, and never silently swallowed; a drawer-kick failure
is the same — both are hardware faults, not sale faults, and the sale's own
completion does not wait on either succeeding.

## Work orders

**WO-31.1 — `PosHardwareDriver` extension points** in `pos-core`:
`BarcodeScanner` (camera-based), `ReceiptPrinter` (WebUSB/serial ESC/POS +
network print-spooler), `CashDrawer` (via printer pulse or direct).
**WO-31.2 — schema**: `PosLineModifier`, `PosLineQuantitySource`,
`PosOrderType`, `PosParkedSale`.
**WO-31.3 — park/retrieve flow** in `PosSalesService`, reusing the basket
maths in `pos-core` unchanged.
**WO-31.4 — modifier UI**: a quick-modifier grid on the till line editor,
scale-weight entry for a `SCALE_WEIGHT` line, a read-only "use this bom
recipe" picker for `BOM_RECIPE_SCALE` lines (paint tinting, bakery formulas).
**WO-31.5 — kitchen ticket**: a `TABLE`/`TAB` sale with modifiers prints a
second, kitchen-facing ticket (no prices) alongside the customer receipt,
via the same `ReceiptPrinter` driver.
**WO-31.6 — permissions**: `pos.terminal.configure` (order type, driver
wiring) already extends the existing `pos.*` permission family, no new
top-level key needed.

## Acceptance

- With no hardware driver registered, `pos` behaves identically to today —
  proven by running the existing `pos-shifts.service.spec.ts`/
  `pos-receipts.service.spec.ts`/`pos-catalog.service.spec.ts` suite
  unchanged.
- Retrieving an already-retrieved parked sale is refused.
- A `TAB` sale can be parked and retrieved twice before tender, and the
  final tender total matches the sum of all rounds ordered.
- A print or drawer-kick failure never blocks or reverses a completed sale.
- Wholesale quantity-break pricing is explicitly named as depending on the
  not-yet-built `pricing` module — no work order here attempts it.

## Out of scope

The `pricing` core module itself (quantity breaks, price lists —
`MULTI-SECTOR.md`'s own named gap, a separate work order when it is
scoped), a restaurant floor-plan/table-map UI (this document gives a table a
free-text label, not a visual layout), kitchen display systems beyond a
printed ticket (a KDS screen is a real, larger, separately-scoped surface).
