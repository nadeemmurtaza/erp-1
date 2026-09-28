# 211 — Cloud (subscription) and offline (license) as strictly separate commercial products, never mixed

> **Status: proposed, not yet built.** Corrects doc 154 §1's "Lifetime
> License... `ONLINE` (doc 39) available as a named variant" row — that
> variant is retracted by this decision. No code in
> `apps/platform/src/modules/billing/` has changed yet; §7 below is the
> enforcement work this decision requires before doc 154's own shipped
> comparison page can be trusted to reflect it. ADR-080.

## 1. The instruction

Direct from the owner: **do not mix cloud and offline at all.** Cloud is
sold on a monthly or yearly subscription. Offline is sold on a license,
never a subscription. This document records that as a binding decision,
not a preference, and states exactly what it changes in the commercial
model docs 39/48/50/153/154 already specified or shipped.

## 2. What's shipped today, and where it violates the instruction

Doc 50 (`PricingModel` enum, shipped 2026-09-25) already separates pricing
*shape* from hosting *mode* — `licenseDeploymentMode: OFFLINE | ONLINE` on
`PlatformPlan`, used only when `pricingModel = ONE_TIME_LICENSE`. Doc 154
(shipped 2026-09-26) packages this into three headline plans:

| Headline name | `PricingModel` | Hosting mode |
|---|---|---|
| Lifetime License | `ONE_TIME_LICENSE` | `OFFLINE` by default, **`ONLINE` available as a named variant** |
| Per Month | `FLAT_MONTHLY` | `ONLINE` |
| Pay As You Grow | `USAGE_BASED` | `ONLINE` |

The bolded cell is the exact mixing the owner just ruled out: a customer
paying once for a license, hosted by NEWAX on recurring infrastructure
NEWAX keeps paying for indefinitely, with no recurring charge to offset
it. That combination is retracted, in full, by this decision.

## 3. Decision

**`licenseDeploymentMode` and `pricingModel` are no longer independent —
they are locked together, in both directions:**

- `pricingModel ∈ { FLAT_MONTHLY, PER_SEAT, USAGE_BASED }` (every
  recurring shape) → `licenseDeploymentMode` must resolve to `ONLINE`,
  always. Cloud is subscription, full stop; there is no offline
  subscription product.
- `pricingModel = ONE_TIME_LICENSE` → `licenseDeploymentMode` must
  resolve to `OFFLINE`, always. The `ONLINE` variant doc 154 named is
  removed. A one-time payment never buys ongoing NEWAX-hosted
  infrastructure.

Doc 154's plan-comparison table is corrected: **Lifetime License is
`OFFLINE` only**, with no "named variant." The `hostingMode: 'EITHER'`
value doc 154 §3's `PlanComparisonRow` type reserves is dropped — no plan
may ever declare it under this decision.

## 4. The real blocker this exposes: doc 48 doesn't exist yet

`OFFLINE` isn't just "not hosted" — under doc 154's own definition it's
doc 48's native desktop deployment: an embedded-Postgres, zero-cloud-
dependency standalone build. Doc 48 carries no "Built" status anywhere in
its own file. **This decision means the Lifetime License plan cannot be
honestly sold until doc 48 ships.** Before this correction, a Lifetime
License customer could technically be routed to the `ONLINE` variant and
receive something real (a hosted instance) even though the standalone
offline build didn't exist. After this correction that fallback is gone
on purpose — selling "Lifetime License" now means selling doc 48, not a
disguised hosted instance. Doc 48 moves from "a proposed future
deployment mode" to **a precondition for a plan already on the public
pricing page** (doc 154 §3, `/pricing`).

## 5. License shape for the offline product

Doc 48/50 named `licenseDeploymentMode: OFFLINE` but never specified
renewal terms. Recorded here per `CLAUDE.md`'s own rule against vague
commercial/security parameters:

| Parameter | Exact value | Applies to | Why this number (not smaller or larger) | Where enforced | How it degrades |
|---|---|---|---|---|---|
| License term | 12 months, renewable | Every `ONE_TIME_LICENSE` / `OFFLINE` sale | A perpetual license with no renewal gives NEWAX no leverage to fund ongoing support or force security updates on an install NEWAX cannot see; an annual term keeps the "pay once, own it" pitch (one term's payment, not a monthly bill) while giving a real renewal point | doc 48's standalone build, license-key validation on local startup | Falls to the grace period below — never a hard kill |
| Renewal grace period | 30 days past expiry | Same | An offline install has no reliable connectivity to phone home on the exact expiry date; a hard cutoff on a missed renewal (clock skew, an owner traveling, a lapsed card) turns a licensing question into a business-down outage — disproportionate to a payment delay | Local license check in doc 48's build | After 30 days: read-only mode. Existing data stays visible, new writes blocked, until renewed — never data loss or deletion |
| License scope | Node-locked (one install/device fingerprint), not per-seat | Same | Offline has no reliable way to meter concurrent seats — no central session store to count against; node-locking is the only enforcement an install with no phone-home connectivity can honestly perform | Local license check, same as above | A fingerprint mismatch (hardware change) requires a manual re-issue through NEWAX support, never an automatic block |

These are recommendations for doc 48's own eventual work order to carry
forward, not yet built — no code changes in this pass.

## 6. What doesn't change

- Doc 39's shared cross-tenant hosting tier (`STANDARD`/`PLUS`/`DEDICATED`
  `ResourceTier`) — unaffected; it's how `ONLINE` plans are hosted, and it
  already never shares a database across tenants.
- Doc 50/153's pricing mechanism itself (`PlatformPlan`, the
  `PricingModel` enum, the billing cron) — unaffected; this decision
  removes one allowed *combination*, not the mechanism.
- `PER_SEAT` stays real and `ONLINE`-only, reachable through doc 154's
  "talk to us" path — untouched by this decision.

## 7. Out of scope (this pass)

Not built in this pass, named so a future session doesn't have to
re-derive it:

- The schema/DTO change enforcing the pairing (`licenseDeploymentMode` is
  currently validated only against `OFFLINE`/`ONLINE`, doc 50 WO-50.1 —
  needs a cross-field check rejecting `ONE_TIME_LICENSE` + `ONLINE` and
  every recurring model + `OFFLINE`).
- Doc 154's `PlanComparisonRow`/`getPlanComparison()` code update dropping
  the `EITHER` hosting mode and the "named variant" copy.
- Doc 48 itself — still fully unbuilt; this decision only raises its
  priority by naming it a precondition of a plan already on the public
  pricing page.
- The license-key issuance/validation mechanism in §5 — specified here,
  not implemented.

## Acceptance criteria (for the work order that eventually builds this)

1. `PlatformPlan` cannot be saved (API or seed) with `pricingModel` in
   `{FLAT_MONTHLY, PER_SEAT, USAGE_BASED}` and `licenseDeploymentMode !=
   ONLINE`.
2. `PlatformPlan` cannot be saved with `pricingModel = ONE_TIME_LICENSE`
   and `licenseDeploymentMode != OFFLINE`.
3. `/pricing` (doc 154) never renders a hosting-mode choice for Lifetime
   License.
4. Doc 48 has a real "Built" status before Lifetime License is sold to a
   paying customer.
