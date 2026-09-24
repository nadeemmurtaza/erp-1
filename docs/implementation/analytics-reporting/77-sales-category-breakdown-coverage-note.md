# 77 — Apparel / Beverages / Medicine: already just data in an existing query

"Sales category breakdowns visually segregating revenue into distinct
retail niches such as Apparel, Beverages, and Medicine" names three
example categories, not three example *mechanisms*. `AnalyticsService.
productsCategories(days)` (this session's own doc 57 already cites its
exact behavior) already computes a top-10-category revenue breakdown for
any set of `Category` rows a client has configured, and doc 47's own
`CategoryPreset` already ships starter category trees per sector — a
pharmacy's preset naturally includes "Medicine," a grocery's includes
"Beverages," an apparel retailer's includes exactly what its name says.
Nothing about "Apparel vs. Beverages vs. Medicine" requires new code: it
requires a client whose `Category` rows happen to be those three names,
which is precisely what doc 47's presets exist to seed. This is a coverage
note, not a new document.

## What already exists

- **`Category`** (`catalog.prisma`) — an ordinary, client-configured
  taxonomy; "Apparel"/"Beverages"/"Medicine" are three rows a client
  creates or accepts from a doc 47 preset, never enum values in code.
- **`AnalyticsService.productsCategories(days)`** — the top-10-category
  revenue snapshot, already segmenting revenue by whatever categories
  exist.
- **`categoryVelocity(days)`** (doc 57) — the per-category *daily* series,
  for a trend view across the same categories.
- **`CategoryPreset`** (doc 47) — starter category trees per vertical,
  seeded once, editable afterward like any other `Category` row.

## Scope lenses

Not repeated — no new schema, write path, or permission; doc 47 and doc
57 (and the `productsCategories()` method they both build on) already
answer every lens for this exact mechanism.

## Work orders

None. If a specific client's preset is missing "Medicine" or "Beverages"
as a starter category, that is a `CategoryPreset` **data** addition (a
new seed row, per doc 47's own "data, not a module" ruling), never a code
change to `AnalyticsService`.

## Acceptance

- No schema, service, or permission change — verified by citation to doc
  47 and doc 57's own existing mechanisms.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
the promotional list's own bullet has a corresponding, citable document.
