# ADR-023 — WO-23.3c/e: Node.retailBrandId, a separate PolicyQuarantine table, and apply() drawing exactly one distinction per entity

[← Decision log](../DECISIONS.md)


### Context
WO-23.3c/e registers `GoodsReceipt`, `BomProductionRun` and `Expense` with
`ReplicationRegistry` as FACT/UP (ADR-021's own decision) and builds R9's
"quarantined for review" mechanism ADR-021/ADR-022 both named as still
missing. Doing so surfaced three questions neither prior ADR settled:

1. **Nothing in the schema names "which brand does this branch belong
   to."** `Node` (organization.prisma) carries `role: BRANCH|BRAND` but no
   `retailBrandId` — confirmed in ADR-021's own research. `PurchaseOrder`/
   `GoodsReceipt`/`BomProductionRun`/`Expense` carry `scopeLevel` but,
   per ADR-021, deliberately no `retailBrandId` either. ADR-022's own
   `allowsBranchLocalPurchasing(userId)` sidesteps this by resolving the
   brand from the ACTING USER's own `AdminScope` grant — but a fact
   arriving over replication has no acting user, only the authenticated
   child node that pushed it (`ReplicationController.push()`'s own
   convention: origin is always the credential, never the payload).
2. **`ReplicationQuarantine` cannot hold a policy-violation record
   honestly.** Its schema requires `sequence` (a replication-log position)
   and always pairs with an apply() throw, routed there by
   `ReplicationApplyService`'s own catch block. A policy violation is not
   a failure to apply — R5/R2 forbid treating it as one — so writing it
   into the same table under the same status enum would make "OPEN" mean
   two unrelated things: "we could not process this" and "we processed
   this and it needs a human decision."
3. **Chain-wide consolidation for these three entities is not built**,
   the same gap `OrderReplicationListener`'s own doc comment already
   names for `Order` (WO-20.6): resolving `GoodsReceipt.purchaseOrderId`,
   `BomProductionRun.recipeId`, or `Expense.categoryId` against a parent
   database that was never sent the referenced row (`PurchaseOrder`,
   `BomRecipe`'s owning module state, `ExpenseCategory`) has no answer
   yet. `apply()` must be honest about this without pretending the
   feature is further along than it is.

### Options Considered
**On resolving "which brand governs this node":**
1. Add `retailBrandId` to each of the four scope-carrying models
   (reopening ADR-021). Rejected: ADR-021 already decided against this,
   for a value that is a property of the NODE that raised the fact, not
   of the fact itself — every fact from the same branch would carry an
   identical, redundant copy of the same value.
2. **Add `Node.retailBrandId` (nullable, no backfill).** Chosen: this is
   where the codebase already tracks a child's identity (`nodeId`,
   `role`, `label`, `url`, its credential) — brand membership belongs
   beside those, once, not duplicated onto every fact that node raises.
   Nullable because no existing `Node` row can honestly claim a brand it
   was never asked about; the receiving-tier check (below) treats a null
   the same way ADR-021 already treats a missing `BrandPolicy` row —
   "cannot verify" reads as "not allowed," never as "nothing to check."

**On where the policy-violation record lives:**
1. Add nullable `policyKey`/`retailBrandId` columns to the existing
   `ReplicationQuarantine` and let both cases share one table. Rejected:
   makes every row's meaning conditional on which columns happen to be
   set, and forces every future query ("show me apply failures" vs. "show
   me policy exceptions") to filter on that condition rather than the
   table itself.
2. **A new `PolicyQuarantine` table** (replication.prisma), structurally
   parallel to `ReplicationQuarantine` — same `OPEN`/`RESOLVED` lifecycle,
   reusing `ReplicationQuarantineStatus` since the two states mean the
   same thing in both places — but with its own columns (`policyKey`,
   `retailBrandId`, `resolvedById`, `resolvedNote`) and no `sequence`,
   since this row describes the fact's CONTENT, not its transport
   position. Chosen: two tables, two honest meanings, one shared status
   vocabulary.

**On `apply()`'s own shape for a BRANCH-scope fact:**
1. Always quarantine into `PolicyQuarantine` for a BRANCH-scope fact,
   whether or not the brand actually disallows it, since consolidation
   isn't built anyway. Rejected: this would misfile a compliant fact
   (a brand that DOES allow local purchasing) as a governance exception,
   the exact "silently honoured when it shouldn't be flagged, or flagged
   when it shouldn't be" confusion R9's "never silently" language is
   trying to prevent from the other direction.
2. **`apply()` checks the BrandPolicy switch ONLY for `GoodsReceipt`**
   (the one entity R9 names a real switch for —
   `allowBranchLocalPurchasing`); on violation it performs the quarantine
   write and returns normally (no throw); on a compliant or non-BRANCH
   fact it throws the same "not built yet" error `Order.apply()` already
   throws, routing it into the EXISTING apply-failure quarantine.
   `BomProductionRun`/`Expense` draw no policy distinction at all and
   always throw — R9 names four switches total
   (`allow_branch_product_creation`, `allow_branch_local_purchasing`,
   `allow_inter_branch_transfers`, `org.allow_inter_brand_transfers`); none
   governs branch-local manufacturing or branch-local expenses, so
   inventing one for either would be exactly the kind of speculative
   policy semantics this codebase's own "no speculative functionality"
   rule forbids. Chosen.

### Reasoning
Each option above keeps the SAME two mechanisms ADR-022 already
distinguished (a same-node synchronous refusal vs. a receiving-tier
quarantine) internally honest about what each row means: a `Node` row
either does or does not know its own brand; a `ReplicationQuarantine` row
is always a technical apply-failure; a `PolicyQuarantine` row is always a
governance exception on a fact that DID apply, in the sense that R5/R2
require — accepted, never rejected. Registering `BomProductionRun`/
`Expense` without inventing a policy check for them follows directly from
"scoped, not tier-specific" (R13's own phrase): being tier-aware (carrying
`scopeLevel`) does not obligate every entity to also be policy-gated —
only the ones R9 actually names a switch for.

### Consequences
- `Node.retailBrandId` is unset (null) for every `Node` row that exists
  today — a chain deployment gains no automatic policy enforcement from
  this migration alone; an operator must explicitly badge each branch
  with its brand (new `PATCH /organization/nodes/:nodeId/brand`, WO-23.3c/e's
  own admin surface) before `GoodsReceipt.apply()`'s policy check can ever
  return `true` for it. Silence here reads as "not yet configured," which
  fails closed correctly but is not the same as "configured to disallow."
- `GoodsReceiptReplicationListener.apply()` is the first `apply()`
  implementation in this codebase that can both succeed (quarantine into
  `PolicyQuarantine`, no throw) and fail (throw, quarantine into
  `ReplicationQuarantine`) depending on its input — every other
  registrant (`Order`, `Product`, now `BomProductionRun`/`Expense`) is
  unconditionally one or the other. A future reader diffing entities by
  "does its apply() ever succeed" needs to know this is the one exception
  and why.
- `PolicyQuarantine` rows are scope-filtered the same way `scopeFilterFor`
  already narrows other list reads (`OrganizationService
  .listPolicyQuarantine()`): an ORG-wide viewer sees every open entry, a
  BRAND/BRANCH-scope viewer only entries whose `retailBrandId` their scope
  reaches, and an entry with no resolvable `retailBrandId` at all — the
  node that raised it was never badged — is ORG-only, since a
  brand-scoped viewer has no attributable claim on it.
- WO-23.3d (org-central purchasing, StockTransfer's own landed-cost
  receive-side fix) and full chain-wide consolidation for these three
  entities (the `Order`-shaped "not built yet" throw this ADR keeps) both
  remain explicitly out of scope here, tracked separately, not silently
  assumed solved by this migration.

### Status
**Accepted.**
