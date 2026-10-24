# Judge owner

Output of the `judge:owner` agent (Judge phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Winner

_draft-terse.md

## Must Fix

- Dead links: docs/erp-lenses/_meta/_index.md and _canonical-decisions.md are cited at lines 13-15 and 182 and neither exists anywhere under docs/ (124 files in docs/erp-lenses, neither among them). Write both in the same change or the section ships pointing at nothing.
- "corporate edition" is not this repo's name. Lines 47, 118 and 132 say corporate; the three editions are Solo / Chain / Organization (docs/implementation/RETAIL-ERP.md:352; apps/api/prisma/schema/organization.prisma:12). Take teacher's "reaches at Org".
- Restore the second half of the current opening: "Building 'a cart' is not done at add/remove line items" and "This section is the method for finding the rest of it, every time, before calling anything done." The cart by name is the line people remember.
- The bridge paragraph (lines 44-47) carries locations, actors, roles and departments but no catalogue volume and no ranks. Add 10k+ products and 100+ ranks explicitly - ranks are not roles, and approval-threshold lenses depend on the difference.
- The toxic-pair lens names RolesService.create/.update for grant time (correct: apps/api/src/core/auth/roles.service.ts:60, :91) but its act-time half is "a throw at act time comparing the actor to a stored id", which names no symbol. It is the one lens in the draft a reviewer cannot grep for.
- "(29 lines, in order)" is right today (5 + 24) and rots the day a lens is added. Say "one line per lens, in catalogue order", or make the catalogue the count's source.
- While the file is open, fix CLAUDE.md:114: it says PermissionGuard, which has zero occurrences in apps or packages. The symbol is PermissionsGuard (apps/api/src/core/auth/guards.ts). All three drafts spell it correctly; the existing file does not.

## Scores

### _draft-terse.md

**Fidelity:** 8

**Voice:** 7

**Actionability:** 9

**Coverage:** 9

**Restraint:** 9

**Total:** 42

**Best Parts:** Bridge paragraph is the only one that states the whole scale in a breath: "one Organization, several brands, 100+ locations across timezones, 100+ kinds of actor, 100+ roles ... One codebase, three editions - a lens that makes sense for only one edition is not a lens." The `## Scope map` block with a line count is the most mechanical fail instrument of the three: a reviewer counts. Headings like "The actor - everything after this is a property of somebody" match the file's register exactly. Most precise symbols in the set: InventoryService.defaultLocationId() with its owning class (verified inventory.service.ts:166), all five JournalLine dimension columns named rather than counted (accounting.prisma:185-197), InboundEmail.bodyText in the erasure lens (crm.prisma:142,151), findPostedEntry(source, sourceRef). Restraint is flawless - no line is removable, and the catalogue pointer is two sentences at the top rather than a closing paragraph.

**Worst Parts:** "corporate edition" three times (47, 118, 132) when the repo's third edition is Organization (RETAIL-ERP.md:352). Both catalogue links dead. Cuts the existing opening in half, losing the cart-by-name example and "the method for finding the rest of it, every time". The ```markdown fence at 163 is a register CLAUDE.md never uses. The toxic-pair lens's act-time half names no symbol. "(29 lines, in order)" is a number that rots.

### _draft-teacher.md

**Fidelity:** 9

**Voice:** 9

**Actionability:** 9

**Coverage:** 8

**Restraint:** 6

**Total:** 41

**Best Parts:** Highest density of checkable claims, four of them complete worked cases where every clause held up under inspection: OrdersAdminController's single class-level @RequirePermission('orders.manage') over a status write (orders.controller.ts:87-88, :112; DELIVERED and RETURNED both in OrderStatus, orders.prisma:7-16); User having a Contact relation but no link to Party (core.prisma:48) while TradingPartner authenticates by inboundApiKeyHash (trading-partners.prisma:43-47); adjust() taking its locationId from defaultLocationId() (inventory.controller.ts:41-51, resolving MAIN per inventory.service.ts:160-169); and the best paragraph in the set - "reverseEntry() dates the reversal `now` and resolves the period from it, so the credit lands in March; FiscalPeriod has no brand column to close one brand at a time" (accounting.service.ts:112-121; accounting.prisma:91-108). Voice is indistinguishable from the existing section - keeps the opening nearly verbatim and grows out of it. Three fail conditions nobody else has, the best being "a permission key named in the plan that reaches no ROLE_PERMISSION_SEED grant, only a Permission row", which closes a loop CLAUDE.md:210-212 already opened. Also the only draft that names the edition correctly ("at Org").

**Worst Parts:** The six inline worked cases are ~12 lines restating what the catalogue holds, at the top of CLAUDE.md - overview first, detail on click, failed by the owner's own rule. Longest of the three. "the seventy narrower ones behind them" (line 187) is false and checkable: _cluster-analysis.md:1 says 146 lenses became 24, so 122 are behind. Scale statement is thin - a hundred actors and a hundred locations, no ranks, no departments, no products. Dead catalogue links.

### _draft-auditor.md

**Fidelity:** 6

**Voice:** 7

**Actionability:** 8

**Coverage:** 7

**Restraint:** 7

**Total:** 35

**Best Parts:** "An otherwise correct diff still fails on them." is the single sentence that turns a fail list into a gate, and terse's list has no equivalent. "a rule that cannot fail a review is decor." "A one-line fix runs no lenses; a named feature or capability runs all of them. Nothing sits in between" is sharper than terse's none/all phrasing. "a scope column left out because this client has one brand is not a simpler schema, only a migration run later under deadline" says something neither other draft says. "not a second product and not an edition, but what the same feature must carry for all three to work" is a genuinely useful distinction. Its group-2 and group-6 subtitles beat terse's.

**Worst Parts:** Systematically hedges the specifics out, which is the one thing a pass/fail instrument cannot afford: "which of the five dimension columns" never names them; "and the idempotency key" where the others name findPostedEntry(source, sourceRef); "a refusal in RolesService at role-save time" names no method though .create and .update exist at roles.service.ts:60 and :91; "a second brand in a second country" avoids RetailBrand. Nothing false, but nothing greppable either. "corporate group" / "corporate edition" wrong per RETAIL-ERP.md:352. "The group-scale twenty-four" puts a rotting count in a heading. Scope-map part 1 duplicates the five lenses printed forty lines above. "including the surface-specific ones held back above" (192) refers to something not above. Dead links.

