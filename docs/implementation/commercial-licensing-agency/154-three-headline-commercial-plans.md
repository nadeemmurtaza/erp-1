# 154 — Three headline plans: packaging doc 50/153's own existing shapes, never a new pricing mechanism

> **Status: shipped (2026-09-26), WO-154.1–154.4.** `PlatformPlan.isHeadline`/
> `.headlineOrder` plus public-copy columns, `PlansService.getPlanComparison()`,
> the public `/pricing` page, and the "talk to us" path for `PER_SEAT` are all
> built in `apps/platform`. See `docs/implementation/DECISIONS.md`'s ADR-042
> for where the public-copy fields live and why.

The owner wants exactly three plans on the pricing page — **Lifetime
License**, **Per Month**, and **Pay As You Grow** — with `PER_SEAT` kept
available as a fourth option for a client whose own need specifically
matches it (doc 84's HR-only micro-SaaS case), but never displayed as one
of the three headline choices. Every technical shape this needs already
exists: doc 50's `ONE_TIME_LICENSE`/`FLAT_MONTHLY`/`PER_SEAT` and doc
153's `USAGE_BASED`. This document is pure packaging — which
`PlatformPlan` row a customer-facing screen shows, in what order, with
what comparison — never a new `PricingModel` value or a new billing
mechanism.

## 1. The three headline plans, each an existing `PricingModel` under a customer-facing name

| Headline name | `PricingModel` | Hosting mode | Who it's for |
|---|---|---|---|
| **Lifetime License** | `ONE_TIME_LICENSE` (doc 50) | `licenseDeploymentMode: OFFLINE` (doc 48's desktop node) by default, `ONLINE` (doc 39) available as a named variant | A business that wants to own the software outright, pay once, and run with no recurring cost — doc 48's own "no continuous connectivity at all" case is this plan's natural home |
| **Per Month** | `FLAT_MONTHLY` (doc 50) | `ONLINE` (doc 39's hosted control plane) | A business that wants predictable, doc 81's own "transparent, no hidden fees" recurring cost |
| **Pay As You Grow** | `USAGE_BASED` (doc 153) | `ONLINE` | A business that wants zero/low upfront cost and is comfortable with a variable bill tied to actual usage and sales volume |

`PER_SEAT` remains a real, selectable `PricingModel` — reachable through
a "need per-user pricing instead? talk to us" path on the pricing screen,
never removed from `PlatformPlan`'s own enum, never presented as a fourth
tile alongside the three headline plans. This is the literal difference
between "at least three" and "exactly three": the technical menu keeps
four; the customer-facing menu shows three, plus one door to the fourth.

## 2. Why these three specific shapes cover the real span of a merchant's own risk appetite

Stated once, since a pricing page should explain *why* three options
exist, not just list them: **Lifetime License** trades a larger upfront
cost for zero ongoing dependency on Newax at all — the correct choice for
a merchant who wants to own their infrastructure outright. **Per Month**
trades predictability for a recurring cost — the correct choice for a
merchant who wants to budget a fixed line item. **Pay As You Grow** trades
predictability the other direction — near-zero cost when idle, cost that
scales only with real usage and real sales — the correct choice for a
merchant unwilling to commit to either a large upfront cost or a fixed
monthly one before they know if the software earns its keep. Three real,
different trade-offs, not three cosmetic variations of one.

## 3. The pricing screen itself — a customer-facing surface that doesn't exist yet

No document in this set has actually specified the storefront-facing
pricing/plan-comparison page a prospective client sees before signing up
— doc 50/153 specify the billing *mechanism*, doc 51 specifies trial
*provisioning*, but nothing specifies the comparison page itself. This is
the one genuinely new, small piece of work this document adds:

```ts
interface PlanComparisonRow {
  planKey: 'LIFETIME_LICENSE' | 'PER_MONTH' | 'PAY_AS_YOU_GROW';
  displayName: string;
  priceDescription: string;   // "One-time, from Rs X" / "From Rs Y/month" / "1% of sales + usage"
  hostingMode: 'OFFLINE' | 'ONLINE' | 'EITHER';
  bestFor: string;
  ctaLabel: string;           // "Buy once" / "Start subscription" / "Start free"
}

async getPlanComparison(): Promise<PlanComparisonRow[]> {
  // Reads the three headline PlatformPlan rows an organization admin has
  // marked isHeadline: true (a new boolean on PlatformPlan, additive) —
  // never hardcoded copy in a frontend component, since the actual price
  // figures live in PlatformPlan's own existing fields (doc 50/153) and
  // must never drift from what billing actually charges.
}
```

```prisma
// platform.prisma — additive to doc 50's own PlatformPlan
model PlatformPlan {
  // existing fields (doc 50, doc 153) unchanged
  isHeadline    Boolean @default(false)  // shown on the pricing comparison page
  headlineOrder Int?                     // display order among headline plans, null otherwise
}
```

`isHeadline`/`headlineOrder` are the entire new surface: an admin flips
exactly three `PlatformPlan` rows to `isHeadline: true` (one
`ONE_TIME_LICENSE`, one `FLAT_MONTHLY`, one `USAGE_BASED`), and the
pricing page renders exactly those three, in the stated order —
`PER_SEAT` stays `isHeadline: false`, reachable only through its own
"talk to us" path, never through the comparison grid.

## 4. Selecting a plan routes to the identical provisioning path every plan already uses

Choosing "Per Month" or "Pay As You Grow" on the pricing page hands off
to doc 51's own existing `ProvisioningService.provisionTenant()` (doc
39), unchanged — a `FLAT_MONTHLY` or `USAGE_BASED` tenant provisions
exactly like any other. Choosing "Lifetime License" hands off to doc
48's own desktop-node install path when `hostingMode: OFFLINE`, or the
identical online provisioning path when a client picks the online
variant of a lifetime license — no new provisioning mechanism, only a
new entry point into the two that already exist.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a prospective customer browsing a
pricing page is unauthenticated; no actor exists until they actually
sign up, at which point doc 51/39's own existing actor model applies
unchanged.
**Whose rows, and which columns** — `isHeadline`/`headlineOrder` are
gated by `platform.billing.manage` (doc 153's own existing permission),
distinct from the pricing page's own public read, which shows only
`displayName`/`priceDescription`/`bestFor` — never a `PlatformPlan`'s own
internal fields (`transactionFeeBps`'s exact value, `usageRateCardMinor`)
beyond what the plan's own public copy states.
**The threshold nobody approves alone** — flipping a plan's own
`isHeadline` flag is a real commercial decision (what the world sees
first); gated the same as any other `PlatformPlan` field change doc 153
already requires.
**The toxic pair / Authority and blast radius** — n/a beyond doc 153's
own existing answer for changing a `PlatformPlan`'s fields.
**Audience is a capability, not an address** — n/a: a public page, not a
notification.
**Request or record** — viewing the comparison page is a pure read;
selecting a plan and provisioning is a REQUEST exactly as doc 51's own
existing sign-up flow already classifies it.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity / Dry run before live** — n/a: no money or stock fact of its own;
this document only decides which existing plans are shown and in what
order.
**Three silhouettes** — n/a in the usual sense (this concerns Newax's own
commercial packaging, not a tenant's own deployment scale); the same
three headline plans apply regardless of which silhouette a prospective
client will eventually run at.
**The absent collaborator** — with no `PlatformPlan` row marked
`isHeadline: true`, the comparison page renders an empty state, never a
broken layout — the design system's own "every state shipped" rule
applied to a marketing page instead of an admin screen.
**The second copy of the write** — n/a: no write beyond an admin toggling
a boolean flag, no physical event to deduplicate.
**The hundred-thousandth row** — n/a: `PlatformPlan` is a small,
admin-authored table, unaffected in volume by this document.
**The reversal document / The undo fan-out / The version stamp** — n/a:
un-marking a plan `isHeadline` simply removes it from the comparison
page; nothing about an already-provisioned tenant's own billing changes
retroactively.
**The erasure the ledger cannot obey** — n/a: a public pricing page
carries no personal data.
**The failure path** — fewer than three `PlatformPlan` rows marked
`isHeadline` renders however many exist, never a broken three-column
layout assuming a row that isn't there.

## Work orders

**WO-154.1 — schema**: `PlatformPlan.isHeadline`/`.headlineOrder`,
forward-only migration (additive, both default to
`false`/`null`).
**WO-154.2 — mark exactly three existing/new `PlatformPlan` rows**
(`ONE_TIME_LICENSE`, `FLAT_MONTHLY`, `USAGE_BASED`) `isHeadline: true`,
in the order Lifetime License → Per Month → Pay As You Grow.
**WO-154.3 — `getPlanComparison()`** read, plus the public pricing-
comparison page on the marketing/storefront surface, each plan's own CTA
routing into doc 51/39's existing provisioning flow (or doc 48's offline-
install path for an offline lifetime license).
**WO-154.4 — a "need something else" link** on the comparison page
routing to a contact/sales path for `PER_SEAT` or any other
non-headline plan.

## Acceptance

- The pricing page shows exactly the `PlatformPlan` rows marked
  `isHeadline: true`, in `headlineOrder`, never more, never fewer than
  what's actually flagged.
- Selecting any of the three headline plans provisions a tenant through
  the identical existing path (doc 39/48/51) its own `PricingModel`
  already uses — no new provisioning code.
- `PER_SEAT` remains fully functional as a `PlatformPlan` row (doc 84's
  own HR-only use case unaffected) while never appearing in the headline
  comparison grid.

## Out of scope

Per-region or per-currency variant pricing pages — a real, separate
localization concern if Newax ever sells outside its current market; this
document specifies one comparison page for one market, matching every
other document in this set's own "no speculative functionality" rule.
