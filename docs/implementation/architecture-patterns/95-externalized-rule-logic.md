# 95 — "A central rules engine": already externalized, as rows, not as a generic engine

> **Status: corrected (2026-09-26).** This document's own table cited
> `DeductionType` (doc 40) and `CategoryPreset` (doc 47) as already-
> externalized policy rows — verified false: neither exists anywhere in
> `apps/api/src` or `apps/api/prisma`, and neither originating document
> carries a `Status:` note — both are unbuilt proposals. `LeaveType`,
> `Rank`, `BrandPolicy`, `TaxRate`, `PlatformPlan.pricingModel`, and
> `ApprovalChain`/`ApprovalStep` are all verified real. The correction is
> narrow — this document's own thesis (policy lives in rows, not a generic
> rules engine) stands, on the mechanisms that actually exist; building
> doc 40 or doc 47 is separate, larger work and is not undertaken here.

"Extract operational policies, tax compliance parameters, and pricing
tiers away from hardcoded application logic into a central, configurable
rules engine" describes an outcome (policy lives outside application code)
this repository already achieves everywhere it applies, through a
deliberately different mechanism: **data rows, not a generic rule-
evaluation engine.** Naming both, side by side, is this document's whole
job — the outcome is real and already shipped; the specific architecture
named ("a central rules engine") is not, and building one would be the
exact premature, speculative abstraction `CLAUDE.md`'s own "before
creating a new abstraction — what real boundary justifies its existence?"
test exists to catch.

## What is already externalized, named one by one, per the bullet's own three examples

| Bullet's example | Already externalized as |
|---|---|
| "Tax compliance parameters" | `TaxRate` (doc 15) — effective-dated rows, "so a GST rate change doesn't rewrite history," admin-editable at `/admin/tax` with no code deploy |
| "Pricing tiers" | `PlatformPlan.pricingModel`/`perSeatPriceMinor`/`monthlyPriceMinor` (doc 50) — three commercial shapes, each a data row, not a code branch |
| "Operational policies" | `LeaveType`, `BrandPolicy` (WO-23.3b), `Rank` (docs 19/20), `ApprovalChain`/`ApprovalStep`'s own tier-count-as-policy (doc 63) — every one of these is a client-editable row, never a hardcoded bracket or `if` statement |

`CLAUDE.md`'s own "rows over rate cards" discipline, restated by name
across at least four of this repository's own documents (`LeaveType`,
`Rank`, `BrandPolicy`, and now pricing itself in doc 50), already *is*
the architecture the bullet is asking for — it is simply not centralized
into one engine, because each policy type has its own real shape
(a tax rate is not the same kind of thing as an approval-chain tier
count), and forcing them into one generic "rule" abstraction would hide
that difference rather than express it.

## Why a single generic rules engine is the wrong abstraction here

A generic BRE (an arbitrary expression language, evaluated against a
context object, editable through one visual designer for every policy
type) trades a real cost for a benefit this repository does not need:
every one of the policy types above already has a *stable, small* shape
(a rate, a bracket, a tier count) that a domain-specific `DeductionType`
or `TaxRate` row expresses more safely than a generic rule string ever
could — a typo in a tax-rate percentage field is caught by a numeric
column constraint; a typo in an arbitrary rule expression is caught only
at evaluation time, in production, against a real transaction. `CLAUDE.md`'s
own words apply directly: **"Before creating a new abstraction — what real
boundary justifies its existence? No clear answer, don't create it."** No
policy type in this repository has outgrown its own dedicated data model
in a way only a generic engine could fix.

## Scope lenses

Not repeated — no new schema, write path, or permission; each cited
mechanism that actually exists (doc 15, doc 50, doc 63, WO-23.3b, docs
19/20) already carries its own complete scope-lens treatment.

## Work orders

None. If a genuinely new policy type is identified that does not fit any
existing rows-over-enums pattern, it is scoped as its own document
following the identical convention (a data-driven model, an admin screen,
an effective-dating or versioning discipline where the policy can change
over time) — never folded into a generic rules-engine abstraction built
ahead of a second real use case that would justify it.

## Acceptance

- No schema or code change — verified by citation to the existing
  mechanisms above.
- Any future policy externalization request is evaluated against "does
  this fit `LeaveType`/`TaxRate`/`BrandPolicy`'s own pattern" before a
  new abstraction is considered.

## Out of scope

A generic, visually-configurable rule-evaluation engine (an arbitrary
expression language editable through one UI for every policy type) —
explicitly not built, for the reasons stated above; this repository's own
per-policy data models already deliver the actual externalization this
bullet asks for, more safely.
