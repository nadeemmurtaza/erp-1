# ADR-042 — Doc 154 (three headline commercial plans): public pricing-page copy lives as four columns on `PlatformPlan` itself, not a JSON blob or a second table; the read endpoint joins the existing `billing` module rather than a new one

[← Decision log](../DECISIONS.md)


### Context — what problem required a decision?

`commercial-licensing-agency/154-three-headline-commercial-plans.md` is
explicit that it is "pure packaging" — no new `PricingModel` value, no new
billing mechanism, only which existing `PlatformPlan` rows a public
pricing-comparison page shows, in what order. Its own literal schema
sketch (§3) adds exactly two columns, `isHeadline`/`headlineOrder`, and
says "these are the entire new surface." But its own `PlanComparisonRow`
TypeScript sketch, three lines later in the same section, reads
`displayName`/`priceDescription`/`bestFor`/`ctaLabel` off a `PlatformPlan`
row — fields that do not exist anywhere in doc 50's or doc 153's own
schema. Building `getPlanComparison()` "exactly as the doc's own sketch
shows" is therefore impossible without first deciding where that public
copy actually lives, which the doc itself never states. A second question
followed once the DTO/controller layer was being written: whether this
belongs inside the existing `billing` module (`PlansController`/
`PlansService`, doc 50/153's own home for every `PlatformPlan` mutation)
or a new module, the way doc 14 stood up its own `agency` module for a
genuinely new domain (API keys, Stripe linkage, usage snapshots).

### Options Considered

1. **Where the copy lives.** (a) Four new nullable `String` columns on
   `PlatformPlan` (`displayName`/`priceDescription`/`bestFor`/`ctaLabel`),
   mirroring how every other pricing-model-specific fact on this table is
   already a discrete, typed column (`oneTimeLicenseMinor`,
   `licenseDeploymentMode`, …); (b) one JSON blob column, matching the
   pattern `usageRateCardMinor`/`includedAllowances` already use for a
   genuinely open-ended, per-dimension rate card; (c) a separate
   `PlatformPlanCopy` table keyed to `planId`.
2. **Where the read/write code lives.** (a) Extend the existing `billing`
   module — `PlansController`/`PlansService` gain an `update()` method and
   a sibling, unauthenticated `PricingController`; (b) a new `pricing`
   module, mirroring doc 14's own `agency` module precedent.
3. **How the CTA reaches the identical existing provisioning path.**
   `PlanComparisonRow`'s own literal shape (doc 154 §3) carries no field a
   signup form could submit as `RequestSignupDto.planKey` — only the
   semantic `planKey: 'LIFETIME_LICENSE' | 'PER_MONTH' | 'PAY_AS_YOU_GROW'`
   union doc 154 §1's table defines. (a) Add the real `PlatformPlan.key`
   as a field on the returned row anyway, despite the doc's sketch not
   listing it; (b) resolve it through a second, new public endpoint
   (`GET /pricing/:planKey`) that maps the semantic name back to a real
   key server-side.

### Decision

**1(a), 2(a), 3(a).** `PlatformPlan` gained four nullable `String`
columns — `displayName`, `priceDescription`, `bestFor`, `ctaLabel` —
alongside doc 154's own `isHeadline`/`headlineOrder`, all in the same
migration (`20260925094500_wo154_headline_plans`). `PlansController` gained
one `PATCH :id` route (`UpdatePlanDto`, gated by the same
`platform.billing.manage` scope `create()` already requires — doc 154's
own "gated the same as any other PlatformPlan field change doc 153 already
requires" scope lens, not a new permission), and a new, sibling
`PricingController` (`GET /pricing`, unauthenticated) was added to the
SAME `billing` module rather than a new one. `PlanComparisonRow` carries
an additional `key: string` field beyond the doc's literal sketch — the
actual `PlatformPlan.key` — documented in its own doc comment as exactly
what a CTA needs to hand to doc 51's unmodified `RequestSignupDto.planKey`.

### Reasoning

- **A JSON blob would have been the wrong shape for a fixed, small set of
  known fields.** `usageRateCardMinor`/`includedAllowances` are JSON
  because their keys are genuinely open-ended (a new metered dimension is
  a rate-card key, not a migration — doc 153 §1). Pricing-page copy has
  exactly four fixed fields, known today, the same shape every other
  pricing-model-specific fact on this table already takes as a discrete
  column. A JSON blob here would have been schema-avoidance, not
  flexibility — CLAUDE.md's own "never hardcode an assumption" cuts the
  other way when the fields are already fully enumerated by the doc that
  specifies them.
- **A separate `PlatformPlanCopy` table would have split one row's public
  identity across two tables for four nullable strings**, the same
  "two-competing-truths" shape ADR-039 already refused for doc 14's
  `AgencyClient` — a plan's own public copy is a property of the plan,
  not a separate entity with its own lifecycle, cardinality, or query
  path.
- **The `billing` module, not a new one.** Doc 154 adds no new actor, no
  new external integration, no new domain event — it is a new read
  (`getPlanComparison()`) and one new write path (`update()`) over a table
  `PlansService` already owns end to end. Doc 14's own `agency` module
  earned its separateness from real new surface (API-key issuance, Stripe
  webhooks, a nightly usage cron) doc 154 has none of; forcing a second
  module here would have been the pattern applied where its own
  justification does not hold, not consistency.
- **`PlanComparisonRow.key` is necessary, not scope creep.** Doc 154 §4 is
  explicit that a headline plan's CTA "routes into the identical existing
  provisioning entry point its own `pricingModel` already uses" — doc 51's
  existing, unmodified signup form takes a real `planKey` string, and
  nothing else in doc 154's own document names a mechanism for a browser
  to learn it. Building a second public endpoint that maps the semantic
  name back to a real key (option 3b) would itself have been the "new,
  parallel mechanism" doc 154 explicitly forbids introducing. The one
  exclusion doc 154 §"whose rows, and which columns" actually states —
  never `transactionFeeBps`'s exact value or `usageRateCardMinor` — is
  honored exactly: `key` is never a billing figure, and
  `getPlanComparison()`'s own tests assert the internal fields are absent
  from every returned row.

### Consequences

- `getPlanComparison()` degrades honestly when copy was never set:
  `displayName` falls back to the plan's own `key`, `ctaLabel` to "Get
  started" — doc 154's own "the absent collaborator"/failure-path lenses,
  applied to a single row missing its copy rather than only to zero rows.
- `PlansService.update()` is a predicate-on-write guard, not admin
  discipline alone: a `PER_SEAT` plan can never be marked `isHeadline`
  (doc 154 §1's "never a fourth tile," enforced at the one write boundary,
  not left to be caught only by a reviewer reading the admin console), and
  `getPlanComparison()` itself drops any headline row whose
  `pricingModel` has no doc 154 §1 headline name as a second, defensive
  layer.
- No new permission key exists — `platform.billing.manage` alone gates
  every `PlatformPlan` mutation this doc adds, matching doc 153's own
  precedent exactly, so there is no `seedPermissions()`-vs-`seedRoles()`
  gap of the kind this repository already tracks elsewhere: this app's
  `PlatformOpsClient.scopes` model has no seed step to miss in the first
  place (ops keys are issued out of band, per `OpsAuthGuard`'s own doc
  comment) — the same true of every other `platform.*` scope in this app,
  not a gap doc 154 introduces.
- `apps/platform`'s own `pnpm test` step is not wired to a Postgres
  service in `.github/workflows/ci.yml` today (the same pre-existing
  characteristic ADR-039 already named for doc 14) — this migration was
  verified by hand against a real, disposable Postgres database
  (`prisma migrate deploy` + `prisma migrate diff --exit-code`), not by
  CI, exactly as every prior `apps/platform` work order in this set has
  been.

### Status
**Accepted.**
