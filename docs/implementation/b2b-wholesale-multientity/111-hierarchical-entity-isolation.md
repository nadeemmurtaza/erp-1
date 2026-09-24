# 111 — Holding Company → Subsidiary → Franchise: already `RETAIL-ERP.md`'s own three axes, with cascade-and-override already built once

"Design the data architecture with strict `tenant_id` and
`organization_node` lineage. This supports deep corporate nesting (Holding
Company → Regional Subsidiary → Local Franchise), allowing global
policies to cascade downward while giving local branches the autonomy to
override specific operational parameters" is, structurally, doc 73's own
already-cited three-axes model (`Organization` → `RetailBrand` → `Location`/
`Node`) — restated here with a fourth citation, plus the one concrete
cascade-with-override mechanism this repository already ships: `BrandPolicy`
(WO-23.3b).

## What already exists, mapped onto the bullet's own three-tier example

| Bullet's tier | This repository's model |
|---|---|
| Holding Company | `Organization` — the tenant boundary |
| Regional Subsidiary | `RetailBrand` — its own legal identity, tax label, currency (doc 73's own citation) |
| Local Franchise | `Location`/`Node` — a branch, or at chain scale a node with its own database, per `RETAIL-ERP.md`'s own model |

"`tenant_id` and `organization_node` lineage" is exactly `organizationId`/
`retailBrandId`/`locationId`(`nodeId`) — the three columns doc 73, and
every money-touching document this session has written, already states
as the standing scoping discipline ("Every column or none" lens, answered
identically across a dozen documents).

## The cascade-with-override mechanism, already built, not hypothetical

`BrandPolicy` (WO-23.3b, cited in this session's own earlier work) is the
concrete instance of "global policies cascade downward while local
branches override specific parameters": a brand-level policy (e.g.,
whether local purchasing is allowed) sets the default for every branch
underneath it, and a specific branch can override that one parameter
without forking the whole policy object — the same pattern
`ApprovalChain`'s own tier-count-per-subject-type (doc 63) and
`CategoryPreset`'s own seed-then-edit model (doc 47) already establish:
**a default that cascades, a row that can locally override it, never a
copy-and-diverge fork of the whole configuration.**

## Scope lenses

Not repeated — doc 73's own scope lenses already answer every lens for
the `Organization`/`RetailBrand`/`Location` axes; `BrandPolicy`'s own
originating work order (WO-23.3b) already carries its own scope-lens
treatment for the cascade-and-override mechanism.

## Work orders

None new. If a genuinely deeper nesting than the existing three tiers is
ever required (e.g., a regional grouping *between* `RetailBrand` and
`Location` — "Regional Subsidiary" read as its own tier distinct from a
brand), that is a real, separately-scoped schema addition (a `Region`
model sitting between `RetailBrand` and `Location`) — not assumed to
already exist, and not built speculatively here without a concrete client
naming the need for a fourth tier.

## Acceptance

- No schema or code change — verified by citation to doc 73's existing
  `Organization`/`RetailBrand`/`Location` model and `BrandPolicy`'s
  existing cascade mechanism.

## Out of scope

A fourth organizational tier between `RetailBrand` and `Location` — named
above as real, plausible future work if a concrete client structure
requires it, not built speculatively on this promotional bullet's behalf.
