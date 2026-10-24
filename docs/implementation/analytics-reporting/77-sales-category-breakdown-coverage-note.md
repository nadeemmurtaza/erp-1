# 77 — Apparel / Beverages / Medicine: already just data in an existing query

> **Status: corrected (2026-09-26).** This document's original text claimed
> "doc 47's own `CategoryPreset` already ships starter category trees per
> sector" — verified false: `CategoryPreset` does not exist anywhere in
> `apps/api/src` or `apps/api/prisma`, only in doc 47's own proposal text,
> and doc 47 itself carries no `Status:` note — it is unbuilt. Building
> doc 47 is a separate, larger work order and is explicitly out of scope
> here; this note corrects the false citation without building it. The
> rest of this document's own claim stands unchanged and verified:
> `productsCategories()`/`categoryVelocity()` are real, already
> category-agnostic, and segment revenue by whatever `Category` rows a
> client has today — "Apparel"/"Beverages"/"Medicine" require only that a
> client's own `Category` rows carry those names, created by hand today
> via the Category admin screen, not seeded via a preset that does not
> exist yet.

"Sales category breakdowns visually segregating revenue into distinct
retail niches such as Apparel, Beverages, and Medicine" names three
example categories, not three example *mechanisms*. `AnalyticsService.
productsCategories(days)` (this session's own doc 57 already cites its
exact behavior) already computes a top-10-category revenue breakdown for
any set of `Category` rows a client has configured. Nothing about "Apparel
vs. Beverages vs. Medicine" requires new code: it requires a client whose
`Category` rows happen to be those three names, created directly today,
not via a preset — doc 47's own `CategoryPreset` proposal, which would
seed such rows automatically per sector, does not exist in code. This is a
coverage note, not a new document.

## What already exists

- **`Category`** (`catalog.prisma`) — an ordinary, client-configured
  taxonomy; "Apparel"/"Beverages"/"Medicine" are three rows a client
  creates directly via the Category admin screen, never enum values in
  code.
- **`AnalyticsService.productsCategories(days)`** — the top-10-category
  revenue snapshot, already segmenting revenue by whatever categories
  exist.
- **`categoryVelocity(days)`** (doc 57) — the per-category *daily* series,
  for a trend view across the same categories.
- **`CategoryPreset`** (doc 47) — a **proposal only**: starter category
  trees per vertical, seeded once. Not built — no `Status:` note on doc
  47, and no such model or seed exists anywhere in this repository today.

## Scope lenses

Not repeated — no new schema, write path, or permission; doc 57 (and the
`productsCategories()` method it builds on) already answers every lens for
this exact mechanism. Doc 47's own scope lenses remain doc 47's to answer
if and when it is built — not assumed satisfied here.

## Work orders

None for this document. Creating "Apparel"/"Beverages"/"Medicine" as
`Category` rows today is an ordinary admin action, not a code change to
`AnalyticsService`. Building `CategoryPreset` itself, if a client actually
needs starter categories seeded automatically per sector, is doc 47's own
work order — separate, larger, and not undertaken here.

## Acceptance

- No schema, service, or permission change to `AnalyticsService` — verified
  by citation to doc 57's existing mechanism and by this note's own
  correction of the false `CategoryPreset` claim.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
the promotional list's own bullet has a corresponding, citable document.
