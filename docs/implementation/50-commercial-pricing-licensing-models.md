# 50 — Commercial pricing and licensing models

`PlatformPlan` (doc 39) already exists as the control plane's pricing
primitive, but its one field — `monthlyPriceMinor: Int` — can express
exactly one commercial model: a flat monthly fee. The promotional list
names three real, different ones (per-seat subscription, flat-fee POS, and
a one-time capital-purchase licence), and Newax's own billing is doc 39's
own business, not the retail tenant's — this document extends `PlatformPlan`
to actually price what the business sells, the same way doc 40 promoted
payroll's own placeholder once a real requirement existed.

## 1. A pricing model is a shape, not a bigger integer

```prisma
// platform.prisma — additive

enum PricingModel { PER_SEAT FLAT_MONTHLY ONE_TIME_LICENSE }

model PlatformPlan {
  // existing fields unchanged
  pricingModel      PricingModel @default(FLAT_MONTHLY)
  /// Used only when pricingModel = PER_SEAT — the per-user monthly rate.
  perSeatPriceMinor Int?
  /// Used only when pricingModel = ONE_TIME_LICENSE — the capital price;
  /// a tenant on this model has no recurring PlatformSubscription charge
  /// at all, only this one-time figure and whatever support-renewal term
  /// the licence names (below).
  oneTimeLicenseMinor Int?
  /// ONE_TIME_LICENSE only: OFFLINE (no hosting, doc 48's desktop node,
  /// sold once) or ONLINE (hosted, doc 39's platform tier, sold once but
  /// still provisioned through it) — named because "one-time" does not by
  /// itself say whether this plan even uses the hosting control plane.
  licenseDeploymentMode String?
}
```

Three real commercial shapes, three sets of fields each meaningful only
for its own model — the same "rows over rate cards" discipline `LeaveType`/
`Rank` already establish, applied to pricing instead of HR policy. A
`PER_SEAT` plan's actual monthly charge is computed at invoicing time from
`perSeatPriceMinor × active seat count` (below); a `FLAT_MONTHLY` plan's
charge is exactly `monthlyPriceMinor`, unchanged from doc 39; a
`ONE_TIME_LICENSE` plan produces one invoice, ever, at provisioning.

## 2. A seat is counted, not assumed

```ts
/** PER_SEAT billing needs a real, defensible seat count — not "however
 *  many rows exist in the User table," which counts a disabled account
 *  and a customer-facing service account identically to a working staff
 *  member. */
async countBillableSeats(tenantId: string): Promise<number> {
  // Reads the tenant's OWN database (through doc 39's existing
  // deployment-credential resolution), counting active staff Users —
  // never customers, never service/API accounts.
}
```

This is the one place doc 39's own shared-infrastructure/isolated-data
boundary is deliberately, narrowly crossed: the control plane's billing
job needs a number *from* the tenant's isolated database, read-only,
computed and discarded — never a write, never a cached copy of the
tenant's own user table sitting in the control plane's database, which
would be exactly the isolation leak `DECISIONS.md`'s own entry on doc 39
was written to prevent. The count crosses the boundary; the tenant's own
data never does.

## 3. `ONE_TIME_LICENSE` still goes through provisioning — a capital sale is not a different product

A perpetual-licence customer is not exempt from doc 39's own
`ProvisioningService` — an `OFFLINE` licence provisions doc 48's desktop
node once and never bills again; an `ONLINE` one still provisions a
hosted, isolated tenant, charged once instead of monthly. **The
architecture doc 39 already built does not change** — this document only
adds a plan shape whose recurring `PlatformSubscription` is, by design,
zero after the first invoice.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: no new actor beyond doc 39's own
`PlatformTenant`.
**Whose rows, and which columns** — pricing fields are visible to
`platform.billing.manage`, unchanged from doc 39's own scoping; a
tenant's own seat count is visible to that tenant's billing contact and to
`platform.billing.manage`, never to another tenant.
**The threshold nobody approves alone** — a custom quote (the
promotional list's own "custom quotes" for the top licence tier) above a
configured discount-from-list-price threshold needs a second approver —
the same shape every other value-based threshold in this document set
already uses, applied to a sales discount instead of a payroll or asset
figure.
**The toxic pair** — the sales role issuing a custom quote and approving
their own discount is refused together.
**Authority and blast radius** — who may create a `PlatformPlan` or edit
its price (finance/commercial admin, platform-wide); the worst value is a
live plan's price edited retroactively — prevented by §'s own version
stamp (below): a subscription snapshots the plan's price at the billing
period it applied to, so an edit only ever affects future periods.
**Audience is a capability, not an address** — a `PER_SEAT` tenant
crossing a seat-count threshold that changes its effective tier (if any)
notifies its own billing contact, resolved from `PlatformTenant`, never a
hardcoded address.
**Request or record** — issuing an invoice from a computed seat count or
a flat fee is a REQUEST (refused: no active plan, seat count computation
failed); once issued, the invoice amount is a RECORD — a later seat-count
change never rewrites an already-issued invoice, only the next one.
**The movement with no address** — n/a: this is Newax's own hosting
revenue, not a stock or branch-scoped movement.
**Four hours down** — a seat-count read that cannot reach a tenant's
database (that tenant briefly unreachable) defers that one tenant's
invoice generation to the next billing run, never blocks every other
tenant's billing — the same per-tenant isolation doc 39's own control
plane already guarantees, applied to a billing job instead of routing.
**Click the number** — an invoice's `PER_SEAT` line links to the exact
seat count and the date it was computed; a custom-quote discount links to
its own approval record.
**The unwritten posting rule** — Newax's own hosting revenue posts
through its own internal `accounting`/`finance` instance exactly as doc
39 already states — a `PER_SEAT` or `ONE_TIME_LICENSE` charge is a
`Sale`/`Invoice` line there, unchanged by this document's addition of two
new pricing shapes.
**Every column or none / The period that already moved** — unchanged
from Newax's own ordinary revenue-recognition rules; a one-time licence's
revenue-recognition treatment (recognised immediately vs. amortised over
a support term) is a real accounting policy decision named here as
existing, not decided by this document.
**The second legal entity** — `PlatformPlan` pricing is already scoped
per Newax's own legal entity exactly as doc 39 states; nothing here
widens that.
**Dry run before live** — a "what would this tenant's next invoice be"
preview computes the seat count and applies the plan's own pricing shape
with no write — one function, a preview caller and the real billing job's
own caller.
**Three silhouettes** — n/a in the usual Solo/Chain/Organization sense —
this document's own "silhouette" is the three pricing models themselves,
each a real, complete commercial offering on its own, none assumed to be
"the small version" of another.
**The absent collaborator** — a tenant on `ONE_TIME_LICENSE`/`OFFLINE`
never touches doc 39's control plane again after provisioning; billing
code for it is simply never invoked, not a special-cased skip.
**The second copy of the write** — a billing run retried for the same
period must not issue a second invoice for the same tenant/period —
enforced by the same `@@unique`-per-period discipline every other
recurring-charge model in this repository already uses (`Expense`'s own
recurring-instance uniqueness is the precedent).
**The hundred-thousandth row** — invoice volume tracks tenant count ×
billing periods, small relative to any tenant's own business data; no
new concern beyond what doc 39's own `PlatformUsageRecord` already
handles at that scale.
**The reversal document** — a wrongly-computed seat-count invoice is
corrected by a credit note against that specific invoice, never an edited
invoice line, identical to doc 39's own billing-dispute handling.
**The undo fan-out** — n/a beyond doc 39's own stated commitments.
**The version stamp** — restated as this document's own answer: a
`PlatformSubscription`'s pricing is snapshotted at the period it billed,
so a later plan-price edit never retroactively reprices a past invoice —
this is doc 39's own existing rule, unchanged, now covering three pricing
shapes instead of one.
**The erasure the ledger cannot obey** — n/a beyond doc 39's own existing
billing-record retention.
**The failure path** — a seat-count computation that fails (tenant
database briefly unreachable) defers that tenant's invoice to the next
run with a logged reason, never silently bills a stale or zero count.

## Work orders

**WO-50.1 — schema**: `PricingModel`, `perSeatPriceMinor`,
`oneTimeLicenseMinor`, `licenseDeploymentMode` on `PlatformPlan`.
**WO-50.2 — `countBillableSeats()`**: read-only, cross-boundary (§2),
never persisted in the control plane.
**WO-50.3 — billing job**: computes and issues the correct charge per
plan's `pricingModel`, idempotent per tenant/period.
**WO-50.4 — custom-quote flow**: the discount threshold and its second
approval.
**WO-50.5 — UI**: plan catalogue admin (the three models, each with its
own fields shown/hidden per model), tenant invoice history showing the
seat count or flat/one-time basis behind each charge.

## Acceptance

- A `PER_SEAT` tenant's invoice equals `perSeatPriceMinor × countBillableSeats()`
  at issue time, provably traceable per invoice.
- A `ONE_TIME_LICENSE` tenant is billed exactly once, ever, and the
  billing job never attempts a second charge for it.
- Retrying a billing run for an already-billed period issues no second
  invoice for any tenant.
- A custom-quote discount above the threshold cannot be approved by the
  person who issued it.
- Editing a live plan's price never changes an already-issued invoice's
  amount.

## Out of scope

Usage-based/metered pricing beyond doc 39's own `PlatformUsageRecord`
(pay-per-transaction, pay-per-order) — a real, different pricing shape
this document does not add, named as a future model if a real commercial
need for it arises. Currency/region-specific pricing — `monthlyPriceMinor`/
`perSeatPriceMinor`/`oneTimeLicenseMinor` are single-currency figures,
inheriting the same open FX gap doc 25 already names rather than
re-litigating it here.
