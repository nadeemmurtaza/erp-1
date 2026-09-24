# 82 — Basic (offline) vs. Standard (cloud): already `licenseDeploymentMode`

"Tiered capital expenditure models clearly defining feature boundaries:
Basic licenses offer offline 'Basic Accounts' and 'Basic Reports,' while
Standard licenses unlock cloud databases and advanced analytics" maps
directly onto fields doc 50 and doc 48 already built, not a new tier
concept:

- **`PlatformPlan.pricingModel = ONE_TIME_LICENSE`** (doc 50) is the
  capital-purchase shape the bullet calls "capital expenditure" — one
  invoice, ever, no recurring subscription.
- **`PlatformPlan.licenseDeploymentMode`** (doc 50, added specifically for
  this distinction) is already `"OFFLINE"` (doc 48's own desktop node — a
  real, working single-node deployment with an embedded Postgres, "for
  businesses with no continuous connectivity at all") or `"ONLINE"`
  (doc 39's hosted control plane, provisioned onto shared cloud
  infrastructure with an isolated database per tenant).
- **"Advanced analytics"** is `AnalyticsService`'s own existing breadth
  (`productsCategories`, `categoryVelocity`, `comparison`, the whole
  `WO-D.1`–`WO-D.6` analytics surface already built across this
  repository) — real, shipped capability, not a marketing phrase with
  nothing behind it.

## The one genuinely open question: is a Basic-tier deployment actually smaller?

`MULTI-SECTOR.md`'s own `MODULES` allowlist is what makes a deployment
"Basic" or "Standard" in practice — a Basic/offline (doc 48) deployment's
`MODULES` allowlist is set at provisioning time to whatever subset a
client's licence actually paid for (e.g., `catalog`, `orders`, `pos`,
basic `finance` reports, no `bom`/`payroll`/advanced-analytics-heavy
modules), while a Standard/online (doc 39) deployment's allowlist can
include the full module set. **This allowlist-per-deployment mechanism
already exists and already varies per deployment** (`CLAUDE.md`'s own
standing rule: "a configuration is never encoded in time... every module
is independent... the `MODULES` allowlist [is] actually safe to vary per
deployment"). What this document adds, narrowly, is naming the mapping
from a `PlatformPlan`'s tier to a *recommended* `MODULES` allowlist — a
configuration convention, never a new enforcement mechanism:

```ts
// A recommended (not enforced in code — MODULES stays a deployment-time
// env-level allowlist per its own existing design) mapping, documented
// once so "what does Basic actually include" has one answer:
const BASIC_LICENSE_MODULES = ['catalog', 'orders', 'pos', 'finance'];
const STANDARD_LICENSE_MODULES = [...BASIC_LICENSE_MODULES, 'inventory-advanced', 'analytics-advanced', 'bom', 'payroll', /* ... */];
```

This mapping is **documentation, not code** — `MODULES` remains, correctly,
a deployment-time env-level decision an operator makes at provisioning
(per `ENTERPRISE-SCALE.md`'s own honest admission that pack-absence boot
is not yet machine-enforced beyond the allowlist itself), never a runtime
plan-based feature gate layered on top of it. Building a runtime
entitlement check that disables a module based on `PlatformPlan.tier`
would duplicate `MODULES`' own existing job with a second, competing
mechanism — exactly the kind of "two ways this repository knows the same
fact" `CLAUDE.md`'s own "click the number" lens warns against.

## Scope lenses

Not repeated — no new schema, write path, or permission; doc 48/39/50's
own scope lenses already answer every lens for offline vs. online
deployment and pricing-model shape.

## Work orders

**WO-82.1 (documentation only)** — record the `BASIC_LICENSE_MODULES`/
`STANDARD_LICENSE_MODULES` convention above in the operator-facing
provisioning runbook (wherever `MODULES` allowlist decisions are
currently documented for a new deployment), so "what does Basic include"
has one answer instead of being reconstructed per sale.

## Acceptance

- No schema or code change — verified by citation to doc 48/39/50's
  existing fields.
- The Basic/Standard module mapping is documented in one place, not
  re-derived per client contract.

## Out of scope

A runtime, plan-tier-based feature-flag system disabling modules
dynamically post-deployment — `MODULES`' own existing deployment-time
allowlist already is this repository's one mechanism for varying feature
scope per deployment; a second, runtime-toggleable version is named here
as explicitly not built, to avoid the two-mechanisms trap.
