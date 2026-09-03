# 15 — Tax (Blocker B4)

**Read `00-HOUSE-RULES.md` and `MULTI-SECTOR.md` first.**

> **Status: built (2026-09-03), WO-15.1–15.4.** `tax.enabled=false` is the
> live default — verified end to end (a real checkout with tax on charges
> exactly the expected amount; with tax off, `grandTotal` is byte-identical
> to before this module existed). WO-15.5 (FBR-specific invoice fields)
> remains unbuilt, blocked on real compliance requirements as described
> below. Admin UI lives at `/admin/tax` rather than folded into
> `/admin/settings` — there was no generic Setting-editing endpoint to fold
> it into (settings-admin only covers permissions/roles/audit-log), so a
> small tax-scoped settings endpoint was added instead of building that
> generic mechanism as a side effect.

## The design decision this doc locks in

Asked whether prices today are informally GST-inclusive or whether tax is
simply absent, the answer from the owner was: **build both — inclusive and
exclusive both need to exist as a selectable mode, not a hardcoded
assumption.** That one decision shapes the whole schema below: pricing mode
is a `Setting`, not a code branch, consistent with House Rule 4.

## Schema — new module `tax`

```prisma
model TaxClass {
  id        String  @id @default(cuid())
  key       String  @unique   // "standard", "zero_rated", "exempt"
  name      String
  isDefault Boolean @default(false)

  rates TaxRate[]
}

/// One row per rate that has ever applied to a class. Effective-dated so a
/// GST rate change doesn't rewrite history — an order snapshots the rate it
/// was charged (House Rule 7), never looks this table up again after
/// placement.
model TaxRate {
  id          String    @id @default(cuid())
  taxClassId  String
  /// Basis points, not a float — 1700 = 17%. Never a percentage as a Float.
  rateBps     Int
  effectiveAt DateTime  @default(now())
  endedAt     DateTime?

  taxClass TaxClass @relation(fields: [taxClassId], references: [id], onDelete: Cascade)

  @@index([taxClassId, effectiveAt])
}
```

On `ProductVariant` (`catalog.prisma`):

```prisma
  /// Null = the store's default class. Most products never set this.
  taxClassId String?
```

On `OrderItem` (`orders.prisma`) — the snapshot, exactly like `unitCost`:

```prisma
  /// Tax charged on this line, in paisa, AT THE MOMENT OF PURCHASE — a
  /// snapshot like unitCost and unitPrice. Zero for historical orders placed
  /// before this module existed; never backfilled (see migration note).
  taxAmount Int @default(0)
  /// The rate actually applied, basis points, for the invoice and for
  /// FBR-style reporting. Snapshotted for the same reason as taxAmount.
  taxRateBps Int @default(0)
```

### Settings

```ts
TaxEnabled:      'tax.enabled',        // false — off until an owner turns it on
TaxPricingMode:  'tax.pricing_mode',   // 'INCLUSIVE' | 'EXCLUSIVE'
TaxDefaultClass: 'tax.default_class',  // TaxClass.key, e.g. "standard"
```

`tax.enabled = false` is the ship-safe default: every function below is a
no-op (`taxAmount: 0`) until an owner deliberately turns it on for their
shop, exactly like `PAYMENT_PROVIDERS` gates a payment method existing at
all.

## The pricing math — and where the rounding trap is

Both modes compute from the same inputs — `unitPrice` (paisa) and `rateBps`
— so this belongs as pure functions in `packages/shared/src/pricing.ts`,
next to `weightedAverageCost()` and `allocateLandedCost()` (House Rule 11):

```ts
/** EXCLUSIVE: tax is added on top. unitPrice is the pre-tax price. */
function taxExclusive(unitPrice: number, rateBps: number): { taxAmount: number; total: number } {
  const taxAmount = Math.round((unitPrice * rateBps) / 10_000);
  return { taxAmount, total: unitPrice + taxAmount };
}

/** INCLUSIVE: unitPrice already contains the tax. Extract it for the
 *  invoice/report — the customer-facing price never changes. */
function taxInclusive(unitPrice: number, rateBps: number): { taxAmount: number; total: number } {
  const taxAmount = unitPrice - Math.round((unitPrice * 10_000) / (10_000 + rateBps));
  return { taxAmount, total: unitPrice };
}
```

**The rounding trap, same shape as WO-1.5's landed-cost one:** summing
`taxAmount` line-by-line and summing the order's tax as
`grandTotal - grandTotal / (1 + rate)` computed once will disagree by a few
paisa on some carts, because integer rounding doesn't distribute. Pick one
source of truth — line-level, summed up — and unit-test it with values that
don't divide evenly (e.g. three lines of Rs 1,299.99-shaped prices at 17%),
asserting the sum of line `taxAmount`s is what appears on the invoice total,
never a separately-rounded order-level figure.

**Inclusive mode changes nothing the customer pays.** That's the point of
the mode — it's a reporting/invoice concern, not a pricing one. Exclusive
mode changes `grandTotal`: `computeOrderTotals()` in
`packages/shared/src/pricing.ts` needs a new line item, gated entirely on
`tax.enabled`.

## Checkout integration

In `orders.service.ts`'s `place()`, alongside the existing cost-snapshot
step (WO-1.3's pattern): for each line, resolve the variant's `taxClassId`
(falling back to `tax.default_class`), look up the active `TaxRate` for that
class as of now, compute `taxAmount`/apply per `tax.pricing_mode`, and write
both onto `OrderItem` in the same transaction that decrements stock. If
`tax.enabled` is false, write zeros and skip the lookups entirely — no
behavior change for a shop that hasn't turned this on.

## What this doc deliberately does not specify

**FBR-specific invoice fields** (NTN format, sales-tax invoice numbering,
any Pakistan-specific compliance requirement beyond "a rate and a class
exist and are shown on the invoice") are named as a need in
`MULTI-SECTOR.md`'s capability list but are a legal/compliance question, not
an engineering one — get the actual FBR invoicing requirements from an
accountant or the FBR's own documentation before building WO-15.5 below.
Building compliance fields from a guess would be worse than not building
them.

## Work orders

| WO | Title | Depends on |
|---|---|---|
| 15.1 | `tax` module: `TaxClass`/`TaxRate` schema, `taxClassId` on `ProductVariant`, `taxAmount`/`taxRateBps` snapshot on `OrderItem` | — |
| 15.2 | Shared pricing functions (`taxExclusive`/`taxInclusive`) in `packages/shared/src/pricing.ts`, unit-tested against the rounding trap | 15.1 |
| 15.3 | Checkout integration: `orders.service.ts` snapshots tax per line, `computeOrderTotals()` adds the exclusive-mode line item | 15.1, 15.2 |
| 15.4 | Admin: tax classes/rates CRUD, the `tax.pricing_mode` toggle in `/admin/settings` | 15.1 |
| 15.5 | Invoice/report tax breakdown — **blocked on real compliance requirements**, see above | 15.3 |

### Acceptance

- [ ] `tax.enabled = false` (the default): every order's `taxAmount` is zero
      and `grandTotal` is byte-identical to today's calculation. Existing
      behavior is provably unchanged until an owner opts in.
- [ ] Exclusive mode: a Rs 1,000 item at 17% charges Rs 1,170; `taxAmount`
      on the line is Rs 170.
- [ ] Inclusive mode: a Rs 1,170 item at 17% still charges Rs 1,170; the
      extracted `taxAmount` is Rs 170, shown on the invoice, changing
      nothing the customer pays.
- [ ] Three lines whose per-line tax doesn't divide evenly still sum to a
      total that matches the invoice exactly, to the paisa — unit test with
      values chosen not to divide evenly, same discipline as WO-1.5.
- [ ] Changing a `TaxRate`'s `rateBps` today does not change the `taxAmount`
      already snapshotted on a placed order.
- [ ] A STAFF user without whatever permission gates tax-class management
      cannot edit rates; `ADMIN` can.

## When to actually build this

Sooner than the other three scoped-but-unbuilt blockers (B5, B6) — this one
is independently overdue for the current single-sector shop, not just a
second-sector prerequisite. `tax.enabled = false` by default means shipping
WO-15.1–15.4 carries no risk to the live store; WO-15.5 waits on getting the
actual compliance requirements right rather than guessed.
