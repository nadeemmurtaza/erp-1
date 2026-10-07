# ADR-067 — Docs 31/66/67/76 (`pos-hardware/` category): the till hardware layer as extension points, ad-hoc modifiers over a hardcoded list, and a corrected permission claim

[← Decision log](../DECISIONS.md)


### Context

The `docs/implementation/pos-hardware/` category holds four documents built
as one unit of work, following on from doc 144: doc 31 (sector POS profiles
and hardware integration — the substantial build), doc 66 (multi-form-factor
POS, a design-law coverage note), doc 67 (secure cash-drawer triggering, a
coverage note dependent on doc 31), and doc 76 (a POS-side dashboard screen).
Doc 31's own text left several points genuinely ambiguous or, in one place,
plainly wrong, and doc 66/67 could not be honestly confirmed until doc 31
actually existed to confirm against.

### Options Considered

1. **Build a concrete WebUSB/serial receipt-printer and cash-drawer driver
   alongside the extension points.** Rejected — doc 31's own WO-31.1 asks
   only for the interfaces ("extension points", not concrete drivers), this
   sandbox environment has no physical hardware to honestly test a real
   driver against, and a fake/mock WebUSB implementation would be
   speculative functionality with no way to verify it — the same
   `AiProvider`-style "absent collaborator" pattern this repository already
   uses for every other optional integration.
2. **Invent a `ProductModifierOption` catalogue table so a modifier could be
   picked from a list instead of typed ad hoc.** Rejected — doc 31 names
   `PosLineModifier` as a per-sale record explicitly, never a catalogue, and
   a catalogue is a materially larger, separately-scoped capability (product
   setup screens, a new permission, seed data) that the document never asks
   for. A hardcoded, in-code list of modifier options would also violate
   Law 1 directly. Ad-hoc entry (label + price delta, typed by the cashier)
   is the only non-speculative, non-hardcoded choice available today.
3. **Take WO-31.6's claim that `pos.terminal.configure` "already extends the
   existing `pos.*` family, no new top-level key needed" at face value and
   add no permission catalogue entry.** Rejected — grepping
   `packages/shared/src/permissions.ts` confirmed the specific key never
   existed; only the `pos.*` *namespace* did. Silently treating the doc's
   claim as already-satisfied would have shipped WO-31.6 as scaffolding with
   no real catalogue entry, exactly the `seedPermissions()`-vs-`seedRoles()`
   trap CLAUDE.md itself names as already tracked and not to be repeated.
4. **Build a separate terminal-level admin screen gating order-type/driver
   configuration behind `pos.terminal.configure`.** Rejected for now,
   after re-reading doc 31's own "Authority and blast radius" lens a second
   time as its own text instructs: "the worst value is a terminal left in
   `TABLE` mode at a counter-only branch, which only changes which button
   the cashier sees, not what the sale posts" describes a per-sale UI
   choice, not a fixed device setting a manager configures once. Building a
   dedicated config screen the document's own WO-31.4/31.5/31.6 never ask
   for would be scope creep beyond what "ships whole" requires; the
   permission is seeded through for when that screen is actually scoped.
5. **Build the whole capability as scoped above: extension points only for
   hardware, park/retrieve, ad-hoc modifiers, a real permission correction,
   a per-sale order-type toggle, and confirm docs 66/67/76 against the real
   result.** Chosen.

### Decision

**Doc 31.** `packages/pos-core/src/hardware.ts` adds `BarcodeScanner`/
`ReceiptPrinter`/`CashDrawer` as interfaces only; `apps/pos/src/lib/
hardware.ts` is the browser-side registry, every function a safe no-op with
nothing registered. `pos.prisma` gains `PosLineModifier`,
`QuantitySource`/`PosLineQuantitySource`, `PosOrderType`/`PosParkedSale`
(migration `20260927080000_wo31_pos_hardware_park_retrieve`), additive only.
`PosParkedSalesService` parks (refusing `COUNTER`) and retrieves
idempotently via a conditional `updateMany` (House Rule 10's own
predicate-on-write pattern), gated by the existing `pos.operate` — parking
a sale changes no authority boundary, so it needs no new permission.
`PosCatalogService.listSellableRecipes()` reads `bom.prisma`'s `BomRecipe`
directly, matching this module's own existing "direct read, no
cross-module import" precedent — no `BomModule` export, no new
`KNOWN_MODULE_COUPLINGS` entry. `basket.ts`'s `addLine`/`setQuantity`/
`removeLine` gain a trailing optional `lineRef` parameter — omitted, every
existing call site behaves exactly as before (proven by the pre-existing
spec cases passing unchanged); supplied, it scopes the operation to one
specific line so a modifier or scale/recipe line never silently merges with
another. A modifier's `priceDeltaMinor` folds into `OrderItem.unitPrice` in
`OrdersService.placeFromPos()` — zero schema change to `orders`.
`pos.terminal.configure` is added for real to `PERMISSION_CATALOG` (Sales,
medium), the `sales` `PERMISSION_GROUPS` entry, and `ROLE_PERMISSION_SEED
.ADMIN` only (matching `pos.manage`'s own placement) — WO-31.6's own text
is corrected in doc 31's status blockquote rather than left standing.
Order type ships as a per-sale toggle on the till screen, not a
`pos.terminal.configure`-gated config screen. Modifiers are entered ad hoc
at the till (label + price delta); no `ProductModifierOption` catalogue is
built.

**Doc 66.** `check-overflow.mjs`'s `routeInventory()` walks `apps/pos/src/
app` on the filesystem directly (`scripts/check-links.mjs`), so every
`apps/pos` route is already swept, and `WIDTHS` already carries Law 4's
seven — confirmed by reading the checker's own source, then proven by
running it for real (api+web+pos booted against a live Postgres, 141
routes × 7 widths). That run found one genuine `apps/pos` violation — the
new till order-type/recipe row overflowing 13px at `xs` (280px) — fixed
with `flex-wrap`; a second run confirmed zero `apps/pos` violations remain.
The same run surfaced 22 pre-existing `apps/web` admin-route violations,
named in doc 66's own status blockquote and left untouched — out of this
category's own scope.

**Doc 67.** Re-verified against the actual doc-31 build rather than taken
on faith: `kickCashDrawer()` is called from exactly one place
(`till/page.tsx`'s `completeSale()`), only when `cashWasTendered` is true,
never for a queued offline sale. This till has no card/wallet tender path
at all (`pos-core/src/tender.ts`'s own header), so "never on a card
tender" holds structurally rather than by a conditional that could be
flipped.

**Doc 76.** `PosDashboardService.summary(locationId)` delegates to the
same facts `AnalyticsService.summary()` already computes (`Order`,
`Contact`, `VariantLocationStock`/`ProductVariant`), scoped to one
terminal's own `locationId` for sales and low stock. `totalCustomers` is a
plain, unscoped `Contact.count()` — `Contact` carries no `locationId`
anywhere in this schema, and at chain scale a branch's own node/database
(RETAIL-ERP.md R7) already makes that count branch-scoped by construction.
A new `pos.dashboard.view` permission (Sales, low, seeded to `STAFF` and
`ADMIN`) gates a sixth `apps/pos` route, `/dashboard`, reachable from the
till's own header.

### Reasoning

The four documents in this category share one theme: each names a gap
against this repository's own existing code, and each gap has an honest,
non-speculative answer only once the surrounding code is actually read —
`pos.terminal.configure`'s absence, the "no card tender exists" fact that
makes doc 67's claim trivially true rather than merely asserted, and
`check-overflow.mjs`'s filesystem-walked route discovery all had to be
verified, not assumed, before any of the four documents could honestly
claim "built" or "confirmed". Building concrete hardware drivers or a
modifier catalogue neither doc 31 nor any other document in this
repository asks for would have been exactly the "speculative functionality"
CLAUDE.md's own engineering protocol forbids — the extension-point
interfaces are what makes a later, real driver a new file, not a rewrite,
which is the same "flexibility first" reasoning the module-pack system
itself already applies.

### Consequences

- A deployment can plug in a real WebUSB/serial `ReceiptPrinter`/
  `CashDrawer`/`BarcodeScanner` later by registering one against
  `apps/pos/src/lib/hardware.ts`'s existing functions — no call site
  changes, since every one already checks for absence.
- `pos.terminal.configure` exists in the catalogue and is seeded to ADMIN,
  but gates no route yet — a future terminal-configuration screen is real,
  scoped, separate work, not fabricated here to make the permission "used".
- A second node/branch's `Contact` table naturally scopes doc 76's
  `totalCustomers` tile without any code change, by the node-per-branch
  model RETAIL-ERP.md already establishes — but a Solo-to-Chain
  transition should re-examine this the day `Contact` itself gains a
  `locationId` or cross-branch sharing, since the current correctness
  depends on the node boundary, not an explicit filter.
- The 22 pre-existing `apps/web` overflow findings this session's own
  `check:overflow` run surfaced remain open — named in doc 66's status
  blockquote so they are not lost, not silently fixed as scope creep under
  a pos-hardware document.
- All four documents' own status blockquotes and `docs/implementation/
  README.md`'s four rows state exactly what shipped, per this session's
  own standing documentation discipline.

### Status
**Accepted.**
