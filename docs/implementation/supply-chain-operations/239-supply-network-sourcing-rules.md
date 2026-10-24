# 239 — Supply network and sourcing rules: regions, lanes, make / transfer / buy / subcontract / fulfil-from

> **Status: Planned (2026-10-04). Nothing built.** Architecture:
> [doc 236](./236-supply-chain-operations-architecture.md). Decision record:
> ADR-088. Read by [doc 238](./238-order-routing-omnichannel-fulfilment.md)
> (customer-order routing) and [doc 242](./242-multi-plant-manufacturing.md)
> (MRP).

## Objective

One place answers "how is SKU X supplied at destination Y", as versioned
policy:

- which DC or store fulfils a customer in region R;
- which DC replenishes store S;
- which plant makes sub-assembly A for plant B;
- which supplier is bought from, or which contract manufacturer makes it
  for us;
- the lanes between them, with transit days and cost.

Routing and MRP both read it, so a customer order and a production plan
never disagree about the network.

## Existing state (verified, 2026-10-04)

None of this exists:

- `Supplier.leadTimeDays` and `ProductVariant.preferredSupplierId` are the
  only sourcing facts.
- `planning`'s dependency graph derives Location → Location edges from
  **historic** `StockTransfer` rows only (ADR-066: "never a blanket 'any two
  locations may transfer' assumption").
- `RETAIL-ERP.md` Part 5's `SourcingAlternative` was never built.
- No geography model exists beyond free-text addresses.

## 1. Design

- **Regions.** A `SupplyRegion` matches an address by country code, postal
  prefix or city. `regionFor(address, regions)` is a pure function in
  `packages/shared`, first match by `priority`.
- **Lanes.** A `SupplyLane` is a source `Location` to a destination region or
  location, with `transitDays`, optional `costMinor` and a currency. Lanes
  are policy, not history: a lane may exist before any goods have moved on
  it.
- **Sourcing rules.** A rule has:
  - a **purpose** (`CUSTOMER_FULFILMENT`, `REPLENISHMENT`, `PRODUCTION`);
  - a **product scope** (a variant, a category, or all);
  - a **destination scope** (a location, a region, or all);
  - a **priority**;
  - a **source**: `FULFIL_FROM` location, `TRANSFER_FROM` location,
    `MAKE_AT` location, `BUY_FROM` supplier, or `SUBCONTRACT_TO` party.

  An optional `sharePct` expresses quota splits (60% plant A / 40% plant
  B), and an optional lead-time override.

- **Resolution.** `resolveSourcing(request, ruleSet, lanes)` is a pure
  function in `packages/shared`. It returns ordered candidates with the rule
  that produced each. `orderrouting` and `planning` call it with rows each
  reads read-only, so neither imports this module (the `pickTranslation()`
  precedent in `MULTI-SECTOR.md`).
- **Versioning.** A `SourcingRuleSet` is DRAFT → ACTIVE → RETIRED, with
  exactly one ACTIVE set per purpose. It is proposed and activated by two
  different users, and activation publishes `SourcingRulesActivated`.
- **Replication.** Regions, lanes and rule sets are **POLICY, DOWN** (R2),
  registered with `ReplicationRegistry` from this module's `onModuleInit()`
  (canonical Ruling 8 names the call site). They are authored at the
  brand or org tier and cached read-only below.

## 2. Schema — `apps/api/prisma/schema/supply-network.prisma` (new)

```prisma
enum SourcingPurpose { CUSTOMER_FULFILMENT REPLENISHMENT PRODUCTION }
enum SourceType      { FULFIL_FROM TRANSFER_FROM MAKE_AT BUY_FROM SUBCONTRACT_TO }
enum RuleSetStatus   { DRAFT ACTIVE RETIRED }

model SupplyRegion { id String @id @default(cuid()); code String @unique; name String; priority Int @default(100); matcher Json }
model SupplyLane {
  id String @id @default(cuid())
  sourceLocationId String
  destinationRegionId String?            // exactly one of these two — CHECK constraint in the migration
  destinationLocationId String?
  transitDays Int; costMinor Int?; currency String?
  isActive Boolean @default(true)
  @@index([sourceLocationId])
  @@index([destinationRegionId])
  @@index([destinationLocationId])
}
model SourcingRuleSet {
  id String @id @default(cuid())
  purpose SourcingPurpose; version Int; status RuleSetStatus @default(DRAFT)
  effectiveFrom DateTime?; proposedByUserId String; activatedByUserId String?
  @@unique([purpose, version])
  rules SourcingRule[]
}
model SourcingRule {
  id String @id @default(cuid())
  ruleSetId String
  variantId String?; categoryId String?          // both null = every product
  destinationLocationId String?; destinationRegionId String?   // both null = every destination
  priority Int
  sourceType SourceType
  sourceLocationId String?; supplierId String?; partyId String?  // exactly one, by sourceType — CHECK constraint
  sharePct Int?                                   // 1–100; quota split among equal-priority rules
  leadTimeDaysOverride Int?
  ruleSet SourcingRuleSet @relation(fields: [ruleSetId], references: [id], onDelete: Cascade)
  @@index([ruleSetId, variantId])
  @@index([ruleSetId, categoryId])
}
```

## 3. Parameters (exact)

| Parameter             | Value                                                                                                                               | Why                                                                                                                                                                                        | Enforced in                | On failure                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | --------------------------------- |
| Active rule-set cache | in-process L1 (`core/cache`, ADR-077), key `supplynetwork:active:<purpose>`, **TTL 300 s**, invalidated on `SourcingRulesActivated` | Routing reads rules on every order, and activation is rare. The TTL bounds staleness on a second replica if ADR-018's replicas ever exist, since no cross-process invalidation is assumed. | `SupplyNetworkReadService` | A cache miss reads the database   |
| Rules per rule set    | **20,000**                                                                                                                          | Category-scoped rules keep real sets in the hundreds. 20,000 caps the in-memory resolver at a few MB and keeps activation validation under a second on the bench fixture.                  | activation validator       | Activation refused with the count |

## 4. Work orders

- **WO-239.1 — Regions and lanes.** Schema, `/admin/supply-network/regions`
  and `/lanes`, `regionFor()` in `packages/shared`, POLICY-down replication
  registration. Permissions `supplynetwork.view`, `supplynetwork.manage`.
- **WO-239.2 — Sourcing rules.** Rule sets with the draft → active flow (two
  users), rule editor, `resolveSourcing()` in `packages/shared` with a
  table-driven spec, `SourcingRulesActivated`, and the "where does X come
  from for Y" explain screen (the pure function's second caller).
- **WO-239.3 — The graph uses policy too.** `planning`'s dependency graph
  gains lane and `MAKE_AT`/`SUBCONTRACT_TO` edges, kept visibly separate from
  historic-transfer edges so R20's "derived, never authored" stays true for
  the derived part.

## 5. Acceptance criteria

1. With the module off, `orderrouting` and `planning` behave as their
   briefs' fallbacks state, and nothing fails to boot.
2. `resolveSourcing()` is deterministic and returns, for each candidate, the
   rule id that produced it.
3. A rule set activated by its proposer is refused.
4. A brand-authored rule set replicates DOWN, and a branch node cannot edit
   it (POLICY, read-only cache).
5. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migration
   applies forward on a copy of production data.

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: author a draft → explain screen previews
  outcomes → second user activates → routing and MRP use it.
- The other side: the explain screen, "why did this order ship from DC2",
  read from the same pure function.
- What happens after "done": a set is retired, never deleted, so a request's
  `policyVersionId` / a planned order's rule id still resolves.
- The integrations: none external. Regions use stored address fields; there
  is no geocoder dependency.
- The policy layer: this module **is** policy. Activation needs two users.

**1. The actor**

- The actor with three tables: network planners are `User` with
  `supplynetwork.manage`. Suppliers and subcontractors are referenced by
  `supplierId` / `partyId` (existing tables), never duplicated.
- The principal with no permission key: none. Every route is
  `PermissionsGuard`-checked.
- The grant that ends itself: none per user. A proposer leaving leaves a
  DRAFT that any other holder may activate or discard.

**2. The authority**

- Whose rows, and which columns: rules are brand- or org-tier policy.
  Branch-tier users see the read-only cache, and lane `costMinor` is hidden
  from users without `supplynetwork.manage`.
- The threshold nobody approves alone: every activation, by a second user.
  The undo (re-activate the previous version) is also a second-user act.
- The toxic pair: proposing and activating the same set.
  `activate()` throws when the actor equals `proposedByUserId`.
- Authority and blast radius: the worst value, a rule sending every region
  to one DC, is visible on the explain screen's "share of demand by source"
  preview before activation. Activation is evidence-class audited, keeping
  the previous and new set ids.
- Audience is a capability: activation notifies `orderrouting.manage` and
  `planning` view holders, one message per activation.

**3. The act in the world**

- Request or record: an activation is a REQUEST (it can be refused by
  validation). This module writes no RECORD.
- The movement with no address: n/a, because it moves nothing. Every lane
  names its source `Location`.
- Four hours down: consumers keep the last cached active set, and routing
  still routes. Authoring waits.

**4. The money**

- The unwritten posting rule: none. Policy rows write no money fact.
- Every column or none: n/a, because no `JournalLine` is written.
- The period that already moved: n/a, for the same reason.
- The second legal entity: lane `currency` is per lane. A `BUY_FROM` rule
  points at a `Supplier` whose own `currency` already exists (R16).
- Dry run before live: `resolveSourcing()` is pure. Its second caller is the
  explain screen, which can replay last month's orders against a draft set.
- Click the number: every routed request and planned order stores the rule
  id. The explain screen links back to it.

**5. The scale**

- Three silhouettes: Solo, off. Chain, at brand tier. Group, at org tier
  for org-owned plants and DCs (R27), and at brand tier for the rest.
- The absent collaborator: the consumers degrade as their briefs state. This
  module depends on nothing but `PrismaService`.
- The second copy of the write: activation is predicate-written on
  `status = 'DRAFT'`, and replication applies by cuid.
- The hundred-thousandth row: rule sets stay in the hundreds to thousands
  (cap 20,000), and lanes in the thousands. Reads are cached.
- The adoption test: region `code` is human-chosen and global per
  brand-tier authorship. Branch nodes never create regions (POLICY), so no
  offline collision is possible.

**6. The afterlife**

- The reversal document: re-activating a prior version; versions are never
  edited after activation.
- The undo fan-out: routing and MRP pick up the reverted set on the next
  decision. Already-routed requests keep their stamped version, a
  deliberately irreversible decision record.
- The version stamp: `SourcingRuleSet.version`, stamped by consumers.
- The erasure the ledger cannot obey: no personal data, only user ids on
  propose/activate, pseudonymised by the existing path.
- The failure path: a set failing validation stays DRAFT, with the errors
  listed on the editor under `supplynetwork.manage`.
