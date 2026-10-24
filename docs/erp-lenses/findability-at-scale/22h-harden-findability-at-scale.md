# 22h. Hardening record: Findability at ten thousand rows and a hundred branches (docs/erp-lenses/findability-at-scale/22-findability-at-scale.md)

Adversarial review of [22-findability-at-scale.md](./22-findability-at-scale.md) by the `harden:22:findability-at-scale` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (4)

### The default is a scope, not a filter  — solid

**Question:** For an actor with a narrower-than-ORG AdminScope grant, name the field on the list request set to that grant's value before first render, and the file computing it.

**Verified against:** scope.guard.ts:124 scopeFilterFor confirmed (returns only retailBrandId, never branchNodeId); citation of call site corrected from organization.controller.ts:33 to organization.service.ts:74-76 (OrganizationService.listBrands); InventoryService.list() range corrected from 90-117 to 84-117 - confirmed it never touches retailBrandId/branchNodeId

### The view nobody can name back  — solid

**Question:** Name the table row, owner-scoping field, and reopening control for a saved multi-clause filter.

**Verified against:** confirmed zero SavedView/FilterPreset/UserView models across 115 models in apps/api/prisma/schema; Setting model at core.prisma:153 confirmed keyed, ownerless, uncacheable per-user

### The selection that outlives the page  — strong

**Question:** For a 'select all' over a filtered result larger than one page, name what is persisted to represent the selection at execution time and whether drift is handled.

**Verified against:** InventoryService.list() confirmed to have no take/skip (unbounded); transfers.service.ts:138 moveMany call confirmed as the co-committing pattern referenced

### The 21st row  — strong

**Question:** For a capped search, name what the operator sees at the cap boundary and contrast with an uncapped equivalent in the same repo.

**Verified against:** pos-catalog.service.ts:56 take:20 in searchVariants confirmed; catalog.service.ts:65-84 listProducts skip/take/count-in-transaction confirmed as the paginated contract referenced

## Killed (0)

_Nothing was killed._


## Citations corrected (2)

- Lens 1 cited scopeFilterFor()'s sole production call site as OrganizationController.actorFor (organization.controller.ts:33); actorFor only assembles the ScopedActor object and never calls scopeFilterFor. The real (and only) call site is OrganizationService.listBrands() at organization.service.ts:74-76. Fixed in file.
- Lens 1 cited InventoryService.list() as inventory.service.ts:90-117; the method actually begins at line 84. Corrected to 84-117. Claim substance unaffected.
