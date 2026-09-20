# 22g generate findability at scale

Output of the `gen:22:findability-at-scale` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Findability at ten thousand rows and a hundred branches

## File

docs/erp-lenses/22-findability-at-scale.md

## Lenses

### The default is a scope, not a filter

**Question:** For an actor with an AdminScope grant narrower than ORG (a BRAND or BRANCH grant), name the field on the list request that is set to that grant's value before the page renders its first row, and name the file where that value is computed — not offered as an optional filter the operator must apply themselves.

**Grounding:** scopeFilterFor() at apps/api/src/core/auth/scope.guard.ts:124 (read in full) has exactly one production call site, OrganizationController.actorFor; InventoryService.list() at inventory.service.ts:90-117 (read in full) builds its where from stock/search/filter params only, never retailBrandId or branchNodeId.

### The view nobody can name back

**Question:** When an operator builds a five-clause filter they will use again tomorrow, name the table row that stores it, the field that scopes who else can see it, and the control that reopens it exactly as saved.

**Grounding:** No SavedView/FilterPreset/UserView model exists among the 115 models in apps/api/prisma/schema/*.prisma (ground survey); Setting (core.prisma:153) is key-only, global, no user/brand column, 30s process-local cache — cited from ground brief, consistent with SettingsService description.

### The selection that outlives the page

**Question:** When an operator ticks 'select all' against a filtered result of 8,400 rows fetched 50 at a time, name what is stored to represent that selection when the bulk action executes minutes later, and state whether a row entering or leaving the match set in that window is included.

**Grounding:** InventoryService.list() (inventory.service.ts:109-117, read directly) has no take/skip at all, so no page-spanning selection concept exists to check a bulk action against; transfers.service.ts's moveMany loop cited from ground brief as the nearest same-transaction batching pattern.

### The 21st row

**Question:** For every search that returns a capped list (pos-catalog.service.ts:56's take: 20), name what the operator sees when their term matches row 21, and contrast it with InventoryService.list(), which has no cap at all.

**Grounding:** pos-catalog.service.ts:31-58 read directly, confirms take: 20 with contains/insensitive OR and no total count; InventoryService.list() (inventory.service.ts:109-117) read directly, confirms no take/skip; catalog.service.ts:65-84 read directly, confirms the contrasting skip/take/count-in-one-transaction pattern already used elsewhere in the repo.

## Absences

- No SavedView, FilterPreset or UserView model, and no per-user or per-brand storage for one — Setting is the only nearby primitive and is global, unowned, and cached per-process.
- No selection-set concept that survives past one page load — bulk actions have only a browser-held id list, because the list endpoints they'd select from return everything in one unbounded call.
- No total-match-count contract on either findability-critical search path examined (pos-catalog.service.ts's searchVariants caps silently at 20; InventoryService.list() never caps at all) — neither tells the operator how many rows really matched.

