# 22. Findability at ten thousand rows and a hundred branches

At Solo scale a list is the whole inventory and the eye is the filter. At Org
scale — 10,000+ products, 100+ locations, 100+ roles all sharing one codebase
— the same screen must decide what an operator sees by default, what they can
save and reopen, what "select all" means when the rows outrun one page, and
what tells them a result was capped rather than complete. None of that is a
performance detail; each is a decision about what the feature contains.

## Lens: The default is a scope, not a filter

**Question:** For an actor with an `AdminScope` grant narrower than ORG (a
BRAND or BRANCH grant), name the field on the list request that is set to
that grant's value before the page renders its first row, and name the file
where that value is computed — not offered as an optional filter the operator
must apply themselves.

**Why:** `scopeFilterFor()` (`apps/api/src/core/auth/scope.guard.ts:124`)
already computes exactly this narrowing, but it has exactly one production
call site, `OrganizationController.actorFor` (`organization.controller.ts:33`).
`InventoryService.list()` (`inventory.service.ts:90-117`, confirmed by
reading it) builds its `where` from stock/search/filter query params alone —
no `retailBrandId`, no `branchNodeId`, ever. A branch floor manager and an
org-wide buyer see the identical unscoped list of every active variant across
every one of 100+ locations. This differs from lens 10 ("Name the owner, name
the reader it refuses"), which asks that a table *can* be filtered by owner;
this lens asks that a list *opens* already filtered to the viewer's own
scope, unasked.

**Worked example:** Narrow slice: build "products low on stock" with a
location dropdown the floor manager can pick from, defaulting to nothing.
Complete capability: the dropdown pre-selects the branch their BRANCH-level
`AdminScope` names, the query is narrowed server-side by that scope before
any filter the operator adds, and "all locations" is a second, explicit
click that only an actor whose scope permits it can make.

**Done test:** `grep -rn "scopeFilterFor\|assertCanManageAtScope" apps/api/src/modules --include=*.controller.ts`
names more than one controller, and the PR's diff shows a `retailBrandId` or
`branchNodeId` term entering the list's `where` from the actor, not from a
query-string filter.

**Breaks without:** A branch manager and an org auditor query-tune the
identical unscoped list by eye; at 100 locations and 10,000+ SKUs, "my
branch's problem" and "everyone's problem" are separated by a filter nobody
is told exists, so stockouts at the manager's own branch get lost in a list
sized for the ORG level.

## Lens: The view nobody can name back

**Question:** When an operator builds a five-clause filter (branch, category,
stock band, supplier, date range) they will use again tomorrow, name the
table row that stores it, the field that scopes who else can see it, and the
control that reopens it exactly as saved.

**Why:** There is no `SavedView`, `FilterPreset` or `UserView` model anywhere
among the 115 models under `apps/api/prisma/schema/*.prisma` (ground survey).
The closest existing primitive is `Setting` (`core.prisma:153`), which is
`key String @id` with no user, brand or branch column and a 30-second
process-local cache (`SettingsService`) — unusable for a personal, shareable
filter because it has no owner and no plural rows. At 100+ locations and
10,000+ SKUs a useful filter is not one query, it is a named, reusable one;
nothing in the schema can hold it today.

**Worked example:** Narrow slice: ship the five-clause filter as
query-string state that lives only for the session it was built in.
Complete capability: a `SavedView` row (`ownerId`, `scope`, `name`,
`filterJson`, `module`) a floor manager creates once — "My branch, size M,
under reorder point" — that reappears in a picker on next login and can
optionally be shared to their branch's role.

**Done test:** `grep -rn "model SavedView\|model FilterPreset" apps/api/prisma/schema`
returns a match, and the PR names which existing list screen(s) read from it.

**Breaks without:** Every operator rebuilds the same clauses by hand every
session; at 100+ branches the ones who don't bother just scroll the unscoped
list lens one describes, and the fix has nowhere to be kept, so it is lost
every login instead of solved once.

## Lens: The selection that outlives the page

**Question:** When an operator ticks "select all" against a filtered result
of 8,400 rows fetched 50 at a time, name what is stored to represent that
selection when the bulk action actually executes minutes later, and state
whether a row that enters or leaves the filter's match set in that window is
included.

**Why:** This is a different failure from lens 17's ("Row 4,312's authority")
per-row permission check and lens 16's ("weaker writer") write-path parity —
both assume a selection already exists as a concrete row-id list. At
corporate scale the selection cannot be one: `InventoryService.list()`
(`inventory.service.ts:109-117`, confirmed by reading it) has no `take`/
`skip` at all and returns every active variant in one response, so today
"select all" can only mean "everything this unbounded query already
loaded" — there is no keyset-scoped, re-evaluated-at-execution selection
concept anywhere in the codebase to check against.

**Worked example:** Narrow slice: a checkbox per row plus a client-side
"select all on this page" that bulk-updates the ids the browser currently
holds. Complete capability: "select all 8,400 matching" stores the filter,
not the ids; the bulk job re-runs that filter at execution time inside the
transaction (the way `transfers.service.ts`'s `moveMany` loop already
commits its lines together) and reports how many of the original 8,400 no
longer matched.

**Done test:** The PR states, and a reviewer can find in the bulk-action
service, whether the persisted selection is a row-id array or a
filter-plus-snapshot-count; a filter-plus-count with no re-evaluation code at
execution time is not a pass.

**Breaks without:** At 10,000+ products a "select all 8,400, then archive"
that silently degrades to "select the 50 the browser had open" either
archives the wrong 50 or tries to hold 8,400 ids in one payload — either way
the operator's stated intent and the executed action disagree, with nothing
recording which one happened.

## Lens: The 21st row

**Question:** For every search or lookup box that returns a capped list
(`pos-catalog.service.ts:56`'s `take: 20`), name what the operator sees when
their term matches row 21, and contrast it with what
`InventoryService.list()` (`inventory.service.ts:109-117`) does instead,
which has no cap at all.

**Why:** This repo already has both findability failures, live, in
different modules: `pos-catalog.service.ts` hard-caps at 20 with no total
count and no "more" affordance, so a till operator typing a common SKU
prefix can silently never reach their item; `InventoryService.list()` has no
`take`/`skip` whatsoever, so the equivalent admin search returns the entire
active catalogue — fine at 50 SKUs, a multi-thousand-row response at
10,000+. Neither surface tells the operator how many rows actually matched,
which is a different, and prior, question to how efficiently they are
fetched.

**Worked example:** Narrow slice: keep the `take: 20` on the till and leave
the admin list unbounded, because both "work" at today's SKU count.
Complete capability: both surfaces return a match count alongside the page,
the till lets a barcode-exact match bypass the cap entirely, and the admin
list gets the same paginated contract `catalog.service.ts`'s `listProducts`
already uses (`catalog.service.ts:65-84`: `skip`/`take`/`count` in one
transaction) instead of loading every row.

**Done test:** `grep -n "take: 20" apps/api/src/modules/pos/pos-catalog.service.ts`
and a read of `InventoryService.list()` around `inventory.service.ts:109` —
the PR must change at least one of these two to carry a total match count
back to the caller.

**Breaks without:** At 10,000+ variants a till operator's search is capped
with no signal that it was, so the item they need is invisibly missing; the
admin equivalent instead ships a multi-thousand-row payload on every
keystroke, and both look, to a reviewer skimming for "it returns results,"
like the same feature working correctly.

## Not modelled yet

- No `SavedView`, `FilterPreset` or `UserView` model, and no per-user or
  per-brand storage for one — `Setting` is the only persistence primitive
  near this shape and is global, unowned and cached per-process.
- No selection-set concept that survives past one page load — bulk actions
  today have only a browser-held id list to work from, because the list
  endpoints they'd select from (`InventoryService.list()`) return everything
  in one unbounded call rather than pages a selection could span.
- No total-match-count contract on the two findability-critical search
  paths this domain lives on (`pos-catalog.service.ts`'s `searchVariants`,
  `InventoryService.list()`) — one caps silently, the other never caps at
  all, and neither reports how many rows really matched.
