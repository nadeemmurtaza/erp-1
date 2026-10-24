# 81 — Flat-rate, no hidden fees: already one of doc 50's three shapes

> **Status: confirmed (2026-09-25). No work order.** Re-verified against the
> running code, not re-derived from doc 50's own text: `PlatformPlan`
> (`apps/platform/prisma/schema/platform.prisma`) has `pricingModel`
> defaulting to `FLAT_MONTHLY`, and no setup-charge field exists on
> `PlatformPlan`, `PlatformSubscription` or `PlatformInvoice`.
> `billing.service.ts`'s `computeCharge()` switches on exactly
> `PER_SEAT`/`FLAT_MONTHLY`/`ONE_TIME_LICENSE` and never reads
> `PlatformUsageRecord`; that model exists in the schema but its only
> consumer today is `ResourceQuotasService` (alerting against a tier quota),
> not billing — so "no per-invoice/usage metering feeds a tenant's bill" is
> true of the code as it stands, not only of doc 50's stated design.

"Transparent flat-rate monthly subscriptions (Rs./month) that explicitly
remove hidden 'per-invoice' fees, setup charges, or overage limits" is
doc 50's own `PricingModel.FLAT_MONTHLY` — `PlatformPlan.monthlyPriceMinor`
already is exactly this shape, and doc 50's own text is explicit that "a
`FLAT_MONTHLY` plan's charge is exactly `monthlyPriceMinor`, unchanged
from doc 39" — one number, no metering. The commercial *claim*
("transparent, no hidden fees") is a positioning statement about a
pricing shape this repository already implements correctly; the only
engineering content in the bullet is confirming that nothing in this
codebase's billing path introduces a per-invoice or overage charge that
would make the claim false.

## What already exists, and what was checked to confirm the claim is true

- **`PlatformPlan.pricingModel = FLAT_MONTHLY`** — one fixed monthly
  figure, doc 50's own default.
- **No per-invoice metering exists anywhere in `apps/platform` billing** —
  confirmed by doc 50's own schema: `PlatformSubscription`'s charge is
  computed from the plan's own fixed fields (`monthlyPriceMinor` for
  `FLAT_MONTHLY`, `perSeatPriceMinor × countBillableSeats()` for
  `PER_SEAT`), never a count of invoices, orders, or API calls generated
  inside a tenant's own database — the control plane never reads a
  tenant's transaction volume to compute Newax's own bill, per doc 39's
  own shared-infrastructure/isolated-data boundary.
- **No setup-charge field exists on `PlatformPlan` or
  `PlatformSubscription`** — a one-time setup fee, if a client's contract
  ever needs one, would be a distinct, separately-scoped
  `PlatformOnboardingFee` concept, never bundled invisibly into the
  monthly figure.

## Scope lenses

Not repeated — no schema, write path, or permission change; doc 50's own
scope lenses already answer every lens for `PlatformPlan`'s commercial
shapes.

## Work orders

None. If a future audit finds a metered or setup-fee charge anywhere in
the billing path, that is a defect against doc 50's own stated design,
fixed there — not a new mechanism this document would introduce.

## Acceptance

- `PlatformSubscription`'s computed charge for a `FLAT_MONTHLY` plan
  never varies month to month for an unchanged plan, proven by doc 50's
  own existing (or newly added, if missing) spec.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
the promotional list's own bullet has a corresponding, citable document.
