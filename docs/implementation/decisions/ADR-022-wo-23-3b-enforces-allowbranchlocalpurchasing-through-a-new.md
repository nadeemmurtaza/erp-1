# ADR-022 — WO-23.3b enforces `allowBranchLocalPurchasing` through a new BranchPolicyRegistry extension point, keyed off the caller's own AdminScope grant

[← Decision log](../DECISIONS.md)


### Context
ADR-021 named the `BrandPolicy` admin surface as "a hard prerequisite, not
a nice-to-have" for `allowBranchLocalPurchasing` to ever be exercised, and
sequenced it as part of this same work order (WO-23.3b). Building it
surfaced two questions ADR-021 did not settle:

1. **`purchasing` is always-on; `organization` is off by default**
   (`modules.registry.ts`: `{ name: 'organization', offByDefault: true }`).
   `PurchasingService.createPurchaseOrder()` cannot import
   `OrganizationService` directly to check the switch — that would make an
   always-on core module schema/type-depend on an off-by-default one,
   exactly what `KNOWN_MODULE_COUPLINGS` exists to keep rare and explicit,
   and this coupling has no same-transaction justification the way an
   approved entry does.
2. **`PurchaseOrder` carries `scopeLevel` but no `retailBrandId`**
   (ADR-021's own decision) — so at the point `createPurchaseOrder()` runs,
   there is no column on the row itself naming *which* brand's
   `BrandPolicy` should govern a `BRANCH`-scope request. The only thing
   that names a brand at all is the calling actor's own `AdminScope` grant
   — and a `BRANCH`-level grant already carries both `branchNodeId` *and*
   `retailBrandId` (`AdminScope.retailBrandId` is set for `BRANCH`, not
   only `BRAND` — confirmed in `assertScopeShape()`), so no new column is
   needed to resolve it.

### Options Considered
**On the coupling:**
1. Import `OrganizationService` directly from `purchasing`, guarded by
   `AppConfigService.isModuleEnabled('organization')`. Rejected: still a
   compile-time dependency of an always-on module on an off-by-default
   module's exports, the same shape `accounting`'s own module-independence
   note (finance.prisma's header) already rejects for the same reason.
2. **A new core-internal extension point, `BranchPolicyRegistry`**,
   mirroring `StockIntakeRegistry` exactly: `organization` registers a
   handler from its own `onModuleInit()`; `purchasing` injects the
   registry (global, via `ExtensionPointsModule`) and calls it without
   knowing whether anything is registered. Chosen: this is the named
   precedent for "two core modules, one always-on and one not, need to
   talk" — `StockIntakeRegistry`'s own doc comment says so explicitly.

**On resolving "which brand governs this request":**
1. Add `retailBrandId` to `PurchaseOrder`. Rejected: reopens ADR-021's
   already-accepted column set for a value derivable from data that
   already exists (the actor's own grant), and every deployment that
   never enables `organization` would carry a column that is always null.
2. **Resolve the brand from the calling actor's own `AdminScope` grants**,
   inside the `organization`-owned handler. Chosen: no schema change, and
   it is the actor who is claiming a branch identity by asking for
   `scopeLevel: 'BRANCH'` at all — checking their own grant is the
   correct authority to consult, not the row being created.

**On the handler's own decision logic** (who may create a `BRANCH`-scope PO):
1. Gate every `BRANCH`-scope PO on `BrandPolicy`, regardless of the
   actor's own scope width. Rejected: an ORG-wide or BRAND-level admin
   already holds the authority to flip the switch itself — refusing their
   own `BRANCH`-scope request would not protect anything R9 is meant to
   protect, only add friction for the person who owns the policy.
2. **An ORG-wide or BRAND-level (or wider) grant always passes; a
   BRANCH-only grant is checked against its own brand's `BrandPolicy`,
   fail-closed on a missing row or `false` (ADR-021); an actor with no
   `AdminScope` grant at all (or `organization` not enabled at all —
   `BranchPolicyRegistry` has no handler registered) passes.** Chosen:
   this is the same "absent module changes nothing for a deployment that
   never opted in" default `StockIntakeRegistry` already documents — a
   Solo/STANDALONE deployment never sees "branch" as a concept, so nothing
   about its purchasing flow should start refusing requests once this
   registry exists.

### Reasoning
`BranchPolicyRegistry` is mechanically identical to `StockIntakeRegistry` —
same file, same problem shape ("two core modules, one always-on and one
switchable") — so reusing the pattern rather than inventing a second one
keeps the "extension points, not conditionals" rule legible: a reader who
already understands `StockIntakeRegistry` understands this without new
vocabulary. Resolving the brand from the actor's grant rather than a new
column keeps ADR-021's decision intact and avoids a column that would be
null on every Solo/STANDALONE deployment forever. The fail-closed default
inside the handler is R9's own text ("never silently honoured"); the
pass-through default for a wider grant or an absent module is this
codebase's own "invisible in Solo" rule (R14) — the two do not conflict,
because R9's switch is about a *branch* overreaching, never about refusing
an actor who already holds the authority to set the switch, or a
deployment that never had the concept at all.

### Consequences
- `core/extension-points/branch-policy.registry.ts` is a new, narrow
  extension point — one method, one handler shape — following
  `StockIntakeRegistry`'s own precedent to the letter, including its
  "absent handler → safe default" idiom.
- `PurchasingService` gains one new constructor dependency
  (`BranchPolicyRegistry`, injected globally via `ExtensionPointsModule`,
  no new module import needed) and one new check at the top of
  `createPurchaseOrder()`, before the transaction opens — a `BRANCH`-scope
  refusal is a 403 the caller sees immediately, not a rollback.
- `OrganizationService` gains its first real `BrandPolicy` write path
  (`setBrandPolicy`, upsert-based) and its first real consumer of
  `assertCanManageAtScope()` — built but uncalled anywhere before this ADR.
- A user holding *multiple* `BRANCH`-level grants across different brands
  is allowed the moment *any* one of those brands' policies says `true`
  (`.some()`, not `.every()`) — deliberately the more permissive reading,
  since each grant is independently legitimate authority over its own
  branch; a stricter "every brand must agree" reading was not asked for
  and would refuse a request the actor has clear standing to make on at
  least one of their own branches.
- `WO-23.3c` (the R9 quarantine table for a fact arriving in violation of
  a replicated policy) is unaffected by this ADR — that quarantine is for
  a FACT arriving over replication from another node, never for a
  same-node synchronous write like `createPurchaseOrder()`, which this ADR
  refuses outright (400/403) rather than accepting-then-quarantining. The
  two mechanisms cover different moments in R9's own text ("enforced at
  both ends") and are not redundant with each other.

### Status
**Accepted.**
