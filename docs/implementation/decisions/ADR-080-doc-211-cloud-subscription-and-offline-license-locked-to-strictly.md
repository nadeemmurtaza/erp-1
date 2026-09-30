# ADR-080 — Doc 211: cloud (subscription) and offline (license) locked to strictly separate `PricingModel`/`licenseDeploymentMode` pairings, retracting doc 154's "Lifetime License, ONLINE variant" row and naming doc 48 a precondition of a plan already on the public pricing page

[← Decision log](../DECISIONS.md)


### Context

The owner's direct instruction: do not mix cloud and offline at all —
cloud is sold on a monthly/yearly subscription, offline on a license,
never a subscription. Doc 50 (shipped) already models pricing shape
(`PricingModel`) and hosting mode (`licenseDeploymentMode: OFFLINE |
ONLINE`) as independent fields, and doc 154 (shipped, public `/pricing`
page) used that independence to offer an `ONLINE` variant of the
`ONE_TIME_LICENSE`-priced "Lifetime License" plan — a customer paying
once for infrastructure NEWAX keeps hosting indefinitely, with no
recurring charge to offset it.

### Options Considered

1. **Leave `licenseDeploymentMode` and `pricingModel` independent**, as
   shipped. Rejected — directly contradicts the owner's explicit
   instruction; also a real commercial liability (unbounded hosting cost
   with no recurring revenue to match).
2. **Remove `OFFLINE` entirely, sell only hosted plans.** Rejected — the
   owner separately confirmed a real, license-based offline product is
   wanted (this session's prior turn); doc 48 exists specifically to
   serve it.
3. **Lock the two fields together in both directions — recurring pricing
   models forced to `ONLINE`, `ONE_TIME_LICENSE` forced to `OFFLINE` —
   and retract doc 154's `ONLINE` variant of Lifetime License.** Chosen.

### Decision

Doc 211, as written. `pricingModel ∈ {FLAT_MONTHLY, PER_SEAT,
USAGE_BASED}` always implies `licenseDeploymentMode = ONLINE`;
`pricingModel = ONE_TIME_LICENSE` always implies `licenseDeploymentMode =
OFFLINE`. Doc 154's plan-comparison table's `ONLINE`-variant row for
Lifetime License, and the `hostingMode: 'EITHER'` value its
`PlanComparisonRow` type reserves, are both retracted. An annual license
term (12 months, 30-day grace period, node-locked) is recorded as the
recommended shape for the offline product, per `CLAUDE.md`'s own rule
against vague commercial parameters — not yet built.

### Reasoning

Doc 50's own field separation already gave this decision a home to land
in without a new mechanism — the fix is a constraint on an existing
model, not a new one. Locking the pairing in both directions (not just
removing the one violating cell) keeps the rule legible: there is no
configuration anywhere in `PlatformPlan` that mixes the two commercial
shapes, now or later. Naming doc 48 a precondition, rather than quietly
leaving the `ONLINE` fallback in place, is the honest reading of "do not
mix at all" — the fallback existed specifically because doc 48 doesn't.

### Consequences

Doc 154's shipped `/pricing` page and `PlanComparisonRow`/
`getPlanComparison()` no longer match this decision until the schema/DTO
cross-field check and the UI copy are updated (doc 211 §7, not built in
this pass). Doc 48 (native desktop deployment), previously a speculative
future mode, is now a named blocker on selling a plan already public.
No code changed in this pass — this ADR and doc 211 are the record; the
enforcement work is a future work order.

### Status
**Accepted.**
