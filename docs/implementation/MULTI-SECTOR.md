# Running many sectors from one repository

**Read `00-HOUSE-RULES.md` first.** This file explains how one codebase serves
clothing, grocery, pharmacy, electronics and anything else, and what branches are
and are not for.

## The ruling, up front

**One `main`. One `production`. No per-sector master branches.**

A sector is not a branch. A sector is a **pack** — a set of feature modules —
plus the allowlist that decides which packs a given deployment boots with.

> **A branch is a point in time. A sector is a configuration.
> Do not encode a configuration in time.**

## Why not `master_clothing_boutique`, `master_grocery`, …

The proposal is reasonable on its face and it is how a lot of teams start. It
fails for four specific reasons, and all four get worse with time rather than
better.

**1. Every core fix has to be applied N times.** A bug in `orders` is a bug in
every sector. With one `main` you fix it once. With four sector masters you merge
or cherry-pick it four times, and the day someone forgets, that sector silently
keeps the bug. Nobody notices until a customer does.

**2. Divergence compounds.** Two branches that both accept commits drift apart at
a rate proportional to how long they have been apart. Merge conflicts in six
months are not four times harder than at six weeks — they are worse than that,
because the two sides have each refactored things the other has not seen.

**3. There stops being a single deployable artifact.** Today the model is clean:
`main` deploys `test.yaseen.pk`, `production` deploys `yaseen.pk`. With per-sector
masters you need a build and a deploy per master, and the question "is this fix
live everywhere?" no longer has an answer you can look up.

**4. The test matrix multiplies.** One `main` means one CI run proves every
sector. Four masters means four runs that can disagree with each other, and a
green tick on one tells you nothing about the others.

**And the deciding reason: this repository already solves the problem in code.**
`FEATURE_MODULES` in `apps/api/src/modules/modules.registry.ts` plus the `MODULES`
env allowlist means a deployment already chooses its own shape at boot. Adding
branches on top would encode the same decision a second time, in a worse place,
and the two would drift.

```
MODULES=catalog,cart,orders,inventory,purchasing,measurements,stitching   # a boutique
MODULES=catalog,cart,orders,inventory,purchasing,batches,perishables      # a grocery
```

Same commit. Same image. Different configuration.

## What a sector actually is

Two things, and nothing else:

1. **A pack** — a folder of feature modules under `apps/api/src/modules/` that
   only that sector needs, each with its own `prisma/schema/<name>.prisma` and
   its own line in the registry.
2. **An allowlist** — the `MODULES` value for that deployment.

Per-shop details that are *not* code — shop name, shipping zones, COD fee,
stitching lead time — live in the `Setting` table and are edited from
`/admin/settings` (House Rule 4). They never justify a branch either.

### The current packs

| Pack | Modules |
|---|---|
| `core` (universal) | `catalog` `cart` `orders` `payments` `inventory` `purchasing` `crm` `analytics` `reports` `tracking` `settings` `users` `addresses` — and, from Phase 10, `finance` and `bom` |
| `apparel` | `measurements` `stitching` — and, as they are built, `fabric` `fit` `styling` `alterations` |

Future packs, per the README's extensibility argument: grocery adds `batches` and
`perishables`; pharmacy adds `prescriptions`; electronics adds `serials` and
`warranty`; software adds `licences`.

**`bom` is classified `core`, not `apparel`.** The phase README listed it under
the apparel pack; that was wrong, and has been corrected. A bakery, a pharmacy
compounding lab and a furniture workshop all turn raw materials into finished
goods — raw-material → recipe → production run is universal manufacturing, and
Phase 10 builds it as a general module.

## The rule that makes this safe

**A `core` module may never import a pack module. A pack module may never import
another pack's module. Cross-pack communication is domain events only, in one
direction: packs subscribe to core, never the reverse.**

This is the whole architecture. If `inventory` (core) ever imports
`stitching.service` (apparel), then a grocery deployment that switches
`stitching` off has a broken `inventory`, and the pack model is finished.

### Enforced as of `f7c0ec1` — with one debt recorded

`apps/api/src/modules/module-packs.ts` declares each module's pack, and
`scripts/check-module-boundaries.mjs` fails `pnpm lint` on a core→pack import, a
pack→pack import, or a module missing from the map.

Turning it on originally surfaced one real violation:

> **`cart` → `measurements`.** `CartItem` carried `measurementProfileId` and
> `measurementValues`, and `cart.service.ts` called `MeasurementsService.validate()`
> when a line was added. Core cart knew what a garment is, so a grocery
> deployment with `measurements` switched off would not boot.

**Fixed.** `cart.service.ts` no longer imports `MeasurementsService` — it calls
`CartLineValidatorRegistry.validate('measurements', ...)` instead, a core
extension point (`apps/api/src/core/extension-points/`) that `measurements`
registers against from its own `onModuleInit()`. `KNOWN_VIOLATIONS` is empty;
an entry that stops firing is reported as stale and fails the build, so it was
removed rather than left to rot. The checker later grew a `.prisma`-schema
equivalent (`checkPrismaBoundaries()`, `KNOWN_SCHEMA_VIOLATIONS`) — see B7 in
the taxonomy section below for the one entry currently on that list
(`cart` → `stitching` via `CartItemStitchingOption`, the same underlying
"cart bakes in apparel concepts" problem, just for style options instead of
measurements, and still open).

The rest of this section records the reasoning, and the design the checker
implements.

### Why it needed enforcing

The checker originally enforced import **depth** only: a module may reach another
module's `<name>.module` or a top-level `<name>.service`, never a deep file. It
could not enforce **direction**, because it had no record of which modules were
core and which were apparel. So this passed lint:

```ts
// apps/api/src/modules/inventory/inventory.service.ts   (core)
import { StitchingService } from '../stitching/stitching.service';   // apparel — wrong, but green
```

Before enforcement existed, a violation could land unnoticed at any time — and
one had. This is the design the checker now implements.

**The manifest.** Modules declare a pack, next to the registry that already
declares everything else about them:

```ts
// apps/api/src/modules/module-packs.ts
export type PackName = 'core' | 'apparel' | 'grocery' | 'pharmacy' | 'electronics';

/**
 * Which pack owns each module. The boundary checker reads this to enforce that
 * core never depends on a pack, and packs never depend on each other.
 * A module missing from this map fails the check — classification is not optional.
 */
export const MODULE_PACKS: Record<string, PackName> = {
  addresses: 'core', analytics: 'core', cart: 'core',    catalog: 'core',
  crm: 'core',       inventory: 'core', orders: 'core',  payments: 'core',
  purchasing: 'core', reports: 'core',  settings: 'core', tracking: 'core',
  users: 'core',
  measurements: 'apparel', stitching: 'apparel',
};
```

Phase 10's `finance` and `bom` add their own `core` lines when those modules land
— the missing-from-map check forces it.

The checker's predicate:

- importer pack `core`, target pack not `core` → **violation** (core must not
  know a pack exists)
- importer pack A, target pack B, A ≠ B, neither `core` → **violation** (packs
  are siblings and must not couple)
- anything → `core` → allowed
- a module absent from `MODULE_PACKS` → **violation**, naming it, so a new module
  cannot skip classification

The error message should name the packs, not just the modules, and point at
domain events as the fix — the same shape the existing message uses.

### Independence — zero coupling between modules, not just across packs

DIRECTION, above, stops core from depending on a pack and stops packs from
depending on each other. It never restricted a module importing another
module of the *same* pack — nothing stopped one core module reaching into
another core module's `.service`, because both sides being `core` made
`directionViolation()` return null. That gap meant "independent module"
was only half enforced: a deployment could drop a pack, but it could not
drop, replace, or ship any single `core` module on its own, because the
other thirteen were free to import it directly.

**The rule now:** every module is independent of every other module, full
stop. A module may depend on `core` platform code
(`apps/api/src/core/`, which is not a module and sits outside this whole
check) and on its own files, and nothing else — cross-module communication
goes through a domain event or an extension point
(`apps/api/src/core/extension-points/`), the same seam DIRECTION already
established for crossing a pack boundary.

`scripts/check-module-boundaries.mjs` enforces it as a third check,
alongside DEPTH and DIRECTION: any public-surface import between two
different modules that DIRECTION already permits (same pack, or anything
importing `core` pack — the cases DIRECTION leaves open) is checked
against `KNOWN_MODULE_COUPLINGS`, a short, explicitly-NOT-a-burn-down
allowlist:

```
orders -> payments
orders -> inventory
orders -> tax
purchasing -> inventory
catalog -> inventory
```

Every entry is a write that must commit in the **same database
transaction** as the write that caused it — an order's payment record, an
order's stock deduction, an order's tax line, a purchase order's stock
receipt, and a product admin form's opening-stock write
(`product-admin.service.ts`'s `create()`/`syncVariants()`, both inside a
Prisma `$transaction`). Routing any of these through an event or a
registry would trade a correctness guarantee for architectural purity: an
eventually-consistent stock deduction can race a concurrent sale the exact
way B6 (`17-inventory-locations.md`) was built to prevent. Unlike
`KNOWN_VIOLATIONS` and `KNOWN_SCHEMA_VIOLATIONS`, this list is not meant
to shrink to zero — it is meant to stay exactly these five, permanently.
It still fails the build on a stale entry, so a removed import can't leave
a silent gap in what the checker actually enforces, and a sixth entry
needs the same same-transaction justification in the pull request that
added it.

**What actually moved, decoupling the safe edges:**

- `pickTranslation()` (was `catalog.service.ts`) and `stitchingFeeFor()`
  (was `cart.service.ts`) are pure functions with no DI/DB dependency —
  moved to `packages/shared` (`constants.ts`, `pricing.ts`), which fixed
  `cart -> catalog`, `orders -> cart` and `orders -> catalog` in one move:
  a pure-function import living in a feature module's file was never a
  real coupling, just a wrong home for the function.
- `purchasing.service.ts` injected `CatalogService` but never called it —
  dead code, deleted (`purchasing -> catalog`).
- `product-import.service.ts`'s CSV-driven stock write is NOT
  transactional (one row at a time, per-row `try/catch`, so a failure on
  row 40 must not roll back rows 1–39) — the textbook case for an
  extension point rather than a direct import. `StockIntakeRegistry`
  (`apps/api/src/core/extension-points/stock-intake.registry.ts`) is the
  new seam: `inventory` registers a handler from its own
  `onModuleInit()`, and any module that only needs a best-effort stock
  write outside a money-critical transaction calls the registry instead
  of injecting `InventoryService`. `product-import.service.ts` is its
  first caller, alongside the existing `CartLineValidatorRegistry`,
  `EntityEnrichmentRegistry` and `CheckoutValidatorRegistry` — the same
  pattern, used for the first time to decouple two `core` modules from
  each other rather than core from a pack.

`catalog` still keeps a direct `InventoryService` import for the
transactional case (`product-admin.service.ts`), which is why
`catalog -> inventory` is in `KNOWN_MODULE_COUPLINGS` rather than fully
decoupled — one file in the module needs the correctness guarantee, the
other does not, and NestJS module wiring is per-module, not per-call-site.

## Branch naming

```
<pack>/<type>/<slug>
```

| Slot | Values |
|---|---|
| `pack` | `core` · `apparel` · `grocery` · … · plus `web`, `mobile`, `infra` for work that is not an API module |
| `type` | `feat` · `fix` · `refactor` · `perf` · `test` · `docs` · `chore` — the same vocabulary the commit log already uses |
| `slug` | kebab-case: the module or screen, then a short description. Carries the work-order id when the work comes from a brief. |

```
core/feat/wo-a1-admin-ui-primitives
core/feat/inventory-stock-ledger
core/fix/orders-cod-fee-rounding
core/docs/phase-10-brief
apparel/feat/measurements-size-chart
apparel/fix/stitching-stage-transition
grocery/feat/batches-expiry-tracking
web/feat/wo-a4-dashboard-card-grid
infra/chore/bump-prisma-8
```

**Pack first**, because that is what you want to group by: `git branch --list
'apparel/*'` is every apparel branch, and GitHub, tig and Fork all render
slash-delimited names as a collapsible tree. Underscores give you a flat list you
have to read character by character.

**Slashes, not underscores.** `clothing_boutique_measurement` is one token to
every tool you own. `apparel/feat/measurements-size-chart` is three, and every
one of them is greppable, globbable and rendered as hierarchy.

**No sector/sub-sector pair in the name.** "clothing" and "boutique" are the same
pack — the sub-sector distinction belongs in the `Setting` table and the product
catalogue, not in a branch name. If a sub-sector ever needs its own modules, it
has earned its own pack and gets one.

Rules that still hold from the house rules: branch from `main`; one work order per
branch; pushing to `main` is fine, but **never push to or merge into
`production`** — that stays the owner's call.

### Branches that ARE about time, and are fine

Release branches encode a point in time, which is exactly what a branch is for:

```
release/2026-09          cut from main, hotfixed, merged back
```

That is legitimate. `master_grocery` is not, because it encodes a shape.

## Deployment model

| Branch | Deploys to | `MODULES` |
|---|---|---|
| `production` | `yaseen.pk` | core + apparel |
| `production` | a future grocery shop | core + grocery |

Two shops, two deployments, two databases, two env files — **one commit**. When
you fix a rounding bug in `orders`, both shops get it on their next deploy, and
you did the work once.

## The database

**One database per shop. It contains the union of every pack's tables.**

### Why one database per shop, not one shared database

Two shops are two businesses. Their orders, customers and stock have nothing to
do with each other. A shared database with a `tenantId` column would mean every
query in the codebase needs a tenant filter, and the first one that forgets leaks
another business's data. Separate databases make that class of bug impossible
rather than merely unlikely.

Each deployment therefore gets its own `DATABASE_URL`, and
`prisma migrate deploy` runs on container start as it does today.

### Why the union of tables, and not a database per pack

**Because foreign keys cross pack boundaries and a foreign key cannot span
databases.** `BomComponent.rawMaterialId` → `RawMaterial.variantId` →
`ProductVariant`, which is core catalogue. Split those across databases and the
constraint cannot exist, so the integrity the schema currently guarantees becomes
application code that gets it wrong eventually.

So: one database, holding every table from every pack.

> **The schema is the union of all packs. The runtime is the subset you enable.**

The consequence, stated plainly because somebody will ask: **a grocery shop's
database will contain empty `GarmentType`, `MeasurementProfile` and
`StitchingJob` tables.** `prisma/schema/*.prisma` is read whole, and
`migrate deploy` applies every migration regardless of `MODULES`. An empty table
costs a row in the system catalogue and nothing else.

Two things follow that do matter:

- **Every pack's migrations run on every deployment.** An apparel migration that
  locks a table for a minute costs the grocery shop a minute of downtime too.
  This is another reason the expand/contract rule in `00-HOUSE-RULES.md` §4 is
  not negotiable.
- **If that ever becomes genuinely painful**, the escalation is Prisma's
  multi-schema support with a migration stream per pack. It is a large change.
  Do not reach for it before the pain is real.

### Seed data must become pack-aware — this is a real gap today

`apps/api/prisma/seed.ts` seeds garment types, stitching options, stitching
services, measurement profiles and a tailor queue **unconditionally**. Run it on a
grocery deployment and you get a workshop queue for a shop with no tailors.

The fix, when a second sector is on the horizon:

```ts
const packs = enabledPacks();   // derived from MODULES via MODULE_PACKS

await seedPermissions(packs);
const users = await seedUsers();
const categories = await seedCategories();

if (packs.has('apparel')) {
  const garments = await seedGarmentTypes();
  await seedGarmentCatalogExpansion(garments);
  await seedStitchingOptions(garments);
  await seedStitchingServices(categories, garments);
  await seedMeasurementProfiles(users.customer.id, garments);
  await seedWorkshopQueue(users.tailor.id, garments);
}
```

Every seeder stays idempotent (House Rule 3 discipline), so this changes which
seeders run, never how they behave.

**Permissions need the same treatment.** `PERMISSION_CATALOG` in
`packages/shared/src/permissions.ts` is a flat list, so a grocery shop's
`Permission` table gets `stitching.jobs.assign` and six of its friends. Give
`PermissionDefinition` an optional `pack` (defaulting to `core`) and have
`seedPermissions()` skip permissions whose pack is not enabled.

## The API

This half already works. `modules.registry.ts` composes only the modules named in
`MODULES`, so a disabled module's routes do not exist, its controllers are never
instantiated, and Swagger shows only what is enabled. The boot log already says
so:

```
[FeatureModules] Enabled modules: catalog, measurements, cart, stitching, …
[FeatureModules] Disabled by MODULES allowlist: purchasing
```

Cross-pack behaviour degrades correctly by design: core publishes a domain event,
and if the pack that would have subscribed is switched off, nothing listens and
nothing breaks. That is the whole point of Rule 3.

### The gap: the web app cannot see which modules are enabled

`AdminNavItem.module` exists in `nav-registry.ts` and is documented as *"Hidden
when the module is off in MODULES"* — but **nothing reads it**. `navFor()` filters
on permissions alone, and `AppConfigService.isModuleEnabled()` is server-side
only and exposed nowhere. So today the admin would render a Stitching nav item
pointing at routes that 404.

Add a bootstrap endpoint:

```
GET /meta      @Public (or authenticated — it leaks no data either way)
  200 -> { modules: string[], packs: string[] }
```

Then `navFor(permissions, modules)` filters on both, and the Phase 10 dashboard's
`cardsFor(permissions, enabledModules)` (decision D1) has a source for its second
argument. **Phase 10's WO-A.4 needs this**, so it should land in or before that
work order rather than waiting for WO-E.1.

### Per-shop configuration

Anything that varies between shops but is not code — shop name, shipping zones,
COD fee, stitching lead time, low-stock threshold — is a row in the `Setting`
table, edited from `/admin/settings` (House Rule 4). Env carries only what must
exist before the database does: `DATABASE_URL`, `MODULES`, secrets.

| Varies by | Lives in |
|---|---|
| Sector | `MODULES` (which packs boot) |
| Shop | `Setting` rows, plus that deployment's env |
| Nothing — it is a rule of the platform | Code |

## Adding a new sector

1. Decide what is genuinely sector-specific. Most of it is not — if the answer is
   "products, orders, stock and customers", you need **zero** new modules; you
   need a `MODULES` list and some settings.
2. For each thing that really is specific, add a module the normal way
   (House Rule 1): folder, `prisma/schema/<name>.prisma`, one registry line, one
   entry in the four `.env*.example` files.
3. Add each new module to `MODULE_PACKS` with the new pack name.
4. Add the pack name to `PackName`.
5. Wire the sector's modules to core through **domain events only**. If you find
   yourself wanting to import a core service and change it, that is the signal an
   extension point is missing — add the extension point to core, generically, so
   every pack benefits.
6. Deploy with the new `MODULES` value. Do not create a branch.

**The test that the seam held:** switch the new pack off in `MODULES`, boot the
API, and confirm the shop still works end to end. If it does not, something in
core learned about your sector, and that is the bug.

## When branches or repos WOULD be right

Be honest about the escape conditions, because they exist:

- **Separate teams on genuinely independent release cadences** who must not block
  each other. Then the answer is `packages/pack-<sector>` as versioned internal
  packages — still one repo, but with a real version boundary.
- **A customer pinning an old version for months** while others move on. That is a
  release branch, which is fine, and it is temporary by definition.
- **Code that cannot coexist in one build** — a different Node major, genuinely
  conflicting dependencies. Then it is a separate repository consuming the core as
  a published package.

None of these is true today: one team, one release cadence, one build. Adopt the
heavier structure when one of them becomes true, and not before — every one of
them costs more than it looks like it will.

## Summary

| Question | Answer |
|---|---|
| One repo for all sectors? | Yes. |
| Master branch per sector? | **No.** One `main`, one `production`. |
| How is a sector isolated? | A pack of modules, plus the `MODULES` allowlist. |
| How do sectors share code? | The `core` pack. Packs depend on core; core never depends on a pack. |
| How do packs talk to core? | Domain events, one direction. |
| Do modules within `core` (or within a pack) couple to each other? | **No** — every module is independent of every other, five same-transaction exceptions aside. See "Independence" above. |
| What decides what a shop runs? | `MODULES` env + the `Setting` table. |
| One database or many? | **One per shop**, holding every pack's tables. Cross-pack foreign keys rule out a database per pack. |
| Does a grocery shop get apparel tables? | Yes, empty. The schema is the union; the runtime is the subset. |
| How does the API drop a disabled module? | `modules.registry.ts` never composes it — its routes 404 and its controllers never instantiate. |
| What are branches for? | Work in progress, and releases. Time, not shape. |
| Branch name? | `<pack>/<type>/<slug>` |

---

# Sectors and business models — the full taxonomy

Designed by fanning out one agent per sector and per business model over the real
schema, then reconciling. The reconciliation changed the answer substantially, so
the reasoning is recorded, not just the conclusion.

## The two axes

A **sector** is a product vertical. It changes the *data shape* — what a product
IS. It is a **pack**.

A **business model** is a transaction framework. It changes *who trades with whom
on what terms*, and it cuts across every sector: one shop can be B2C and B2B at
once. Business models are **capability modules in `core`**, never packs.

If business models were packs, ten sectors times eight models is eighty packs,
and every core fix would land in all of them. As capabilities they compose:
`apparel + pricing + quotes` is a wholesale clothing operation; swap `apparel`
for `lots` and it is a food distributor. Same commit.

## The finding that reorganised everything

**Most of what looks sector-specific is a universal capability wearing a
sector's clothes.**

Three agents independently proposed the same sub-ledger under three names:
pharmacy's `batches`, grocery's `perishables`, electronics' `serials`. All three
partition stock by an identity finer than the variant. Two agents proposed
`subscriptions` with different pack assignments. Three proposed price lists under
two names.

Once those are pulled into `core` where they belong, the sector packs collapse to
a fraction of what was proposed — and two of the nine need **no pack at all**.

### Universal capabilities extracted from the sector proposals

| Capability | Pack | Wanted by | Why it is universal |
|---|---|---|---|
| `lots` | core | grocery, pharmacy, media | Lot code + expiry + FEFO allocation + recall lookup. A bakery, a chemist and a battery warehouse need the identical sub-ledger. |
| `serials` | core | electronics, automotive, home | One identity per unit rather than per batch. Appliances, bicycles and power tools need it as much as phones. |
| `warranty` | core | electronics, automotive, home | A post-sale obligation with a clock. Sofas and gearboxes have warranties. |
| `agegate` | core | grocery, media, home | Restricted-goods classes and basket verification. Alcohol, 18+ games, solvents, blades — same gate. |
| `subscriptions` | core | pets, digital, grocery | A saved basket, an interval, a nightly runner producing normal Orders. Coffee, cat food and SaaS seats are one mechanism. |
| `fitment` | core | automotive, electronics | "This part fits these N things." Vehicle compatibility and printer-cartridge compatibility are the same matrix. |
| `dimensions` | core | home, electronics, automotive | Weight and volumetric footprint, so shipping prices from size rather than order value. |
| `tax` | core | **every model, and every shop** | See below — it does not exist at all today. |

**Ruling on `serials` vs `lots`:** they stay **two** modules, not one. A lot is an
identity over N units allocated by policy (FEFO); a serial is an identity over
exactly one unit allocated by selection. The allocation semantics differ enough
that merging them produces a module with two disjoint halves. They share the
principle, not the code.

## Sector packs, after reconciliation

| Pack | Modules | What core genuinely cannot express | Status |
|---|---|---|---|
| `apparel` | `measurements`, `stitching` | Body measurements, garment blueprints, tailor workflow | **exists — needs nothing new** |
| `grocery` | *(none)* | — | **no pack needed.** Once `lots`, `agegate` and `subscriptions` are core, nothing sector-specific remains. |
| `electronics` | *(none)* | — | **no pack needed.** `serials`, `warranty`, `fitment`, `dimensions` are all core. Blocked on Phase 3 variant options, not on a pack. |
| `pharmacy` | `pharmacy` | Drug schedules (GSL/P/POM, controlled), prescription capture, pharmacist verification, the legally-mandated controlled-drugs register | specified |
| `automotive` | `vehicles` | The vehicle taxonomy tree and the shopper's garage — reference data `fitment` points at | specified |
| `media` | `media` | Bibliographic identity: series, contributors, editions, ISBN/EAN semantics, extent | specified |
| `pets` | `pets` | Pet profiles and weight-to-size / weight-to-duration charts | specified |
| `home` | `cutting` | Selling by continuous measure over an integer ledger, and accounting for the offcut | specified |
| `digital` | `digital` | Entitlements, licence-key and seat pools, finite digital supply | specified |

Nine sectors, **seven small packs and two that need nothing**. Every pack that
survived owns genuine domain data — a drug schedule, a vehicle tree, an ISBN — not
a commerce mechanism.

## Capability modules for business models

All pack `core`. Named for what they do, never for a model.

| Module | Enables | Purpose |
|---|---|---|
| `pricing` | B2B, B2G, B2B2C | Resolve "what does THIS buyer pay for THIS variant in THIS context". Price lists and quantity breaks. Today price is `variant.priceOverride ?? product.basePrice`, resolved inline. |
| `accounts` | B2B, B2G, B2B2C | The buying organisation: several humans ordering on its behalf, with the price list and terms attached to the company. |
| `quotes` | B2B, B2G | Priced, snapshotted, non-committal document with validity and acceptance. A tender and an RFQ are one pipeline. |
| `agreements` | B2B, B2G | Negotiated terms governing a set of future orders: ceiling value, contracted rates, retention. |
| `credentials` | B2G, C2C, B2B2C, pharmacy | A document proving an entity may do something, with an issuer and an expiry. Tender eligibility, seller KYC and a pharmacy licence are one shape. |
| `approvals` | B2B, B2G, grocery | Generic "someone with authority must say yes before this proceeds", over any subject. |
| `receivables` | B2B, B2G | What a buyer owes, when due, what is collected and what is withheld. Net-60 against an inspected delivery. |
| `tax` | **all** | Rates, classes, exemptions, inclusive/exclusive. **Absent from the repository entirely.** |
| `sellers` | C2C, B2B2C | Who may sell, and which catalogue rows and money belong to them. Attribution, not a storefront. |
| `payouts` | C2C, C2B, B2B2C | Money owed to a party and how it leaves. Generic over payee so one ledger settles a marketplace seller, a reseller and a freelancer. |
| `commissions` | C2C, C2B, B2B2C | Who earns from a revenue row and at what rate, snapshotted onto the line at placement. |
| `submissions` | C2B | Intake and adjudication of what a person offers the business. |
| `moderation` | C2C, B2C | A queue of things a human approves before they go live, generic over subject. |
| `storefronts` | B2B2C | Branded front-ends and resolving an inbound request to one. |
| `locations` | O2O | The physical places a business operates from, plus the store locator. |
| `fulfilment` | O2O, C2C | Delivery or collection, per-line, with its own lifecycle and a courier provider seam. |

### D2C needs nothing

Not one module, column, setting, permission or event.

The decisive test: take the running boutique — a reseller — and make it a
manufacturer selling direct. Which line of transaction code changes? **None.**
`Cart`, `CartItem`, `Order`, `OrderItem`, `Payment` and `Shipment` gain and lose
nothing. Checkout runs the same `computeOrderTotals()`.

The only difference is the *provenance* of `ProductVariant.costPrice`: a
`GoodsReceipt` for a reseller, a `BomProductionRun` for a manufacturer. Both post
through `InventoryService.move()`, both feed `weightedAverageCost()`,
`OrderItem.unitCost` snapshots the result identically, and the margin report is
byte-identical between the two businesses.

D2C changes where cost comes from, not what the platform does with it — and the
module that changes where cost comes from is `bom`, already core, already
specified in Phase 10.

**Do not create a `d2c` module.** A module named after a transaction framework is
exactly the error this taxonomy exists to prevent.

## The blockers — read this before planning anything

These are not sector work. They are core gaps that every sector hits on day one,
and no amount of pack design routes around them.

### B1 — `ProductKind` has three apparel values and no neutral one

```prisma
enum ProductKind { STITCHED UNSTITCHED STITCHING_SERVICE }
```

`kind` is required with no default. **Six of nine sector agents flagged this
independently.** A chemist files paracetamol as `STITCHED`. Until there is a
neutral value, every non-apparel sector is filing goods under a garment noun.

Cheapest correct fix: add `GOODS`, `SERVICE`, `DIGITAL` and treat the three
apparel values as legacy. Additive, no data migration.

### B2 — a variant has exactly two option axes

**WO-3.1 done as of 2026-09-03** — the actual data-layer blocker, no more.
`ProductOption`/`ProductOptionValue`/`ProductVariantOptionValue` exist,
bilingual, with a verified backfill from `size`/`color`; an electronics
product can now have arbitrary axes (storage, RAM, band) at the schema
level. `size`/`color`/`colorHex` are untouched and still what every reader
uses — the rest of Phase 3 (WO-3.2's reader switch, which needs a real
production soak first; SKU templates; the sectioned editor; the SEO publish
gate; storefront JSON-LD/sitemap/hreflang; redirects) is unbuilt. See
[`03-variants-sku-seo.md`](./catalog-variants-pricing/03-variants-sku-seo.md) — do not read "B2 done"
as "Phase 3 done."

### B3 — there is no checkout veto hook

Age gating, prescription verification, credit limits and approval holds all need
the same thing: a way to refuse a basket. Four agents independently proposed it.
Build **one** `CheckoutValidator` seam in `src/core/checkout/` with `@Optional()`
multi-providers, and every one of them becomes a registration rather than an edit
to `orders.service.ts`.

### B4 — tax does not exist

**Done as of 2026-09-03.** Was surfaced by B2B ("tax exemption") but was not
a B2B-only feature — a Pakistani shop charging GST needed it regardless of
sectors, and this was arguably the largest single gap the exercise found.
See [`15-tax-module.md`](./tax-compliance/15-tax-module.md) — a `tax` module with a
selectable inclusive/exclusive pricing mode, `tax.enabled=false` the
ship-safe default, `/admin/tax` for classes and rates.

### B5 — PBAC has no notion of "my rows"

**WO-16.1/16.2 done as of 2026-09-03.** `RolePermission` is still
`@@unique([role, permissionId])` and the guard is still a pure
set-membership test — `catalog.manage` still grants *every* product, and no
actual marketplace feature exists. What's done is the generalization: the
`manage_own`/`manage_all` pattern that used to be hand-rolled once, inline,
for stitching jobs is now `assertCanManage()`
(`apps/api/src/core/auth/ownership.guard.ts`), a shared, unit-tested guard,
with `jobs.service.ts` migrated onto it as the reference call site. Multi-seller
(C2C, B2B2C) still cannot be built until a second call site (`Product.sellerId`,
list-endpoint row filtering) actually exists — that remains the real, structural
price of a marketplace. See [`16-pbac-row-scoping.md`](./access-control-identity/16-pbac-row-scoping.md).

### B6 — stock has no location dimension

**Done as of 2026-09-03 (WO-17.1–17.3).** `ProductVariant.stock` is now a
denormalized SUM over a new `VariantLocationStock` table, recomputed inside
the same transaction as every write — additive and concurrency-safe exactly
as scoped, with the one unavoidable invasive change (redefining what
`ProductVariant.stock` means) done as a byte-identical no-op for every
deployment today, which has exactly one `MAIN` location. Multi-location admin
UI, fulfilment routing and per-location pricing/reorder points remain
unbuilt, waiting on an actual second location or O2O plan. See
[`17-inventory-locations.md`](./inventory-purchasing/17-inventory-locations.md), including a note
on a real concurrency bug the doc's own reference snippet had (a two-step
aggregate-then-write race across two locations of one variant), caught only
by writing the concurrent-locations test the doc's acceptance criteria
demanded, and fixed as one atomic `UPDATE`.

### B7 — core does not compile without apparel

**Mostly paid down as of 2026-09-03.** `core.prisma`'s `User` model no longer
carries any apparel back-relations, the `cart` → `measurements` TypeScript
import is gone (`KNOWN_VIOLATIONS` in `check-module-boundaries.mjs` is
empty), and `OrderItem`/`Contact` (core) no longer type-reference
`StitchingJob`/`StitchingOrder` (apparel) — `StitchingJob.orderItemId` and
`StitchingOrder.contactId` are now plain scalar columns, joined in
application code (`StitchingJobsService.attachOrderContext()`) or via the new
`EntityEnrichmentRegistry` extension point
(`apps/api/src/core/extension-points/`) rather than a Prisma relation.

The checker that enforces this now scans `.prisma` files as well as `.ts`
imports — `checkPrismaBoundaries()` in `check-module-boundaries.mjs` — because
a relation *field* typed as another pack's model is exactly the same coupling
as a TypeScript import, and was invisible to the import-only checker (that is
how this class of violation went unnoticed the first time).

**One piece of the same debt remains, tracked in `KNOWN_SCHEMA_VIOLATIONS`:**
`cart.prisma`'s `CartItemStitchingOption.option` still types a field as
`StitchingOption` (apparel), and `cart.service.ts` reads it directly in price
computation — money-critical, not display-only, so it needs the same
extension-point treatment as the old `cart` → `measurements` coupling
(opaque per-line configuration, priced by the pack that owns it) rather than
a quick scalar-column swap. Do it together with that same cart-line
redesign — they are one work order.

**The pack seam is close to a fact, not fully one.** The remaining
`CartItemStitchingOption` coupling is the last confirmed gap; nothing
guarantees a subtler one isn't still hiding somewhere the checker doesn't
look (e.g. non-`@relation` business logic elsewhere that assumes apparel is
present). Treat this as substantially de-risked, not closed.

## What a deployment looks like

Same commit, different `MODULES`.

```bash
# The shop as it exists today — apparel, B2C
MODULES=catalog,cart,orders,payments,inventory,purchasing,crm,analytics,reports,tracking,measurements,stitching,finance,bom
```

```bash
# A grocery shop doing click-and-collect — no sector pack at all
MODULES=catalog,cart,orders,payments,inventory,purchasing,crm,analytics,reports,tracking,finance,lots,agegate,subscriptions,locations,fulfilment,tax
```

```bash
# An electronics retailer selling to businesses and consumers
MODULES=catalog,cart,orders,payments,inventory,purchasing,crm,analytics,reports,tracking,finance,serials,warranty,fitment,dimensions,tax,pricing,accounts,quotes,receivables,approvals
```

```bash
# A digital-goods maker selling direct — D2C adds nothing
MODULES=catalog,cart,orders,payments,crm,analytics,reports,tracking,finance,digital,subscriptions,tax
```

Note the third: B2B and B2C together, no toggle. A shop is not "a B2B shop" — it
enables the capabilities its trade needs.

## Commercial-tier module conventions

The sector examples above answer "what kind of business." Two commercial
licensing work orders ask a related but different question — "what tier did
this client buy" — and each names, without inventing a second enforcement
mechanism, which of the existing `MODULES` allowlist entries that tier maps
to. Both are documentation only: `MODULES` stays the same deployment-time env
allowlist an operator sets at provisioning, per "What a sector actually is"
above; no runtime, `PlatformPlan`-tier-based feature flag is introduced by
either.

**Basic vs. Standard capital-purchase licence**
([`commercial-licensing-agency/82-tiered-capex-licensing.md`](./commercial-licensing-agency/82-tiered-capex-licensing.md))
— a `PlatformPlan.pricingModel = ONE_TIME_LICENSE` client buys one of two
recommended module sets:

```bash
# Basic — offline node (licenseDeploymentMode = OFFLINE): "Basic Accounts"
# (finance) and "Basic Reports" (reports) only, no advanced analytics.
MODULES=catalog,orders,pos,finance,reports

# Standard — cloud-hosted (licenseDeploymentMode = ONLINE): adds inventory,
# purchasing, bill-of-materials, payroll, CRM, tracking and the full
# analytics surface (AnalyticsService's own existing breadth) on top of Basic.
MODULES=catalog,orders,pos,finance,reports,inventory,purchasing,bom,payroll,crm,tracking,analytics
```

**HR-only micro-SaaS**
([`commercial-licensing-agency/84-micro-saas-hr-per-user-pricing.md`](./commercial-licensing-agency/84-micro-saas-hr-per-user-pricing.md))
— a `PlatformPlan.pricingModel = PER_SEAT` client buys HR/leave/pay-run
capability with none of the retail-facing surface. **There is no module
named `hr` in `FEATURE_MODULES`**
(`apps/api/src/modules/modules.registry.ts`): compensation rates, leave
policy/balances and pay runs are all one module, `payroll`
(`apps/api/src/modules/payroll/`), so the recommended allowlist is just:

```bash
# HR-only — no catalog, no orders, no pos; payroll alone carries
# compensation, leave and pay runs. users/settings/addresses stay alwaysOn
# regardless (modules.registry.ts), so staff accounts still work.
MODULES=payroll
```

Neither mapping is enforced in code — an operator still sets `MODULES`
directly at provisioning time. Naming each once here means "what does Basic
include," "what does Standard add," and "what does the HR-only tier include"
each have one documented answer instead of being reconstructed per sale.

## Sequencing

**Status as of 2026-09-03: B1, B3, B4, B6 and B7 are done** (B7 mostly — one
debt entry remains, see above). B2's WO-3.1 (the option data model) is done;
the rest of Phase 3 is not. B5's WO-16.1/16.2 (the shared `assertCanManage()`
guard) are done; the rest of B5 (an actual marketplace) is scoped in doc 16
but not built. Updated sequencing:

1. ~~B1 `ProductKind`, B3 checkout hook.~~ **Done.**
2. ~~B4 `tax`~~ ([`15-tax-module.md`](./tax-compliance/15-tax-module.md)). **Done** —
   `tax.enabled=false` by default, `/admin/tax` for classes/rates and the
   inclusive/exclusive toggle. WO-15.5 (FBR-specific invoice fields) still
   waits on real compliance requirements.
2b. ~~B2 `ProductOption`/`ProductOptionValue`~~
   ([`03-variants-sku-seo.md`](./catalog-variants-pricing/03-variants-sku-seo.md) WO-3.1). **Done** —
   the actual hard-block on electronics is gone at the schema level.
   WO-3.2's reader switch (and everything after it in Phase 3) still needs
   a real production dual-write soak before it can move, per that doc.
3. **Phase 10** as already specified. Unaffected by any of this.
4. ~~B7 — pay down the apparel coupling in core.~~ **Mostly done;** the
   `CartItemStitchingOption` entry in `KNOWN_SCHEMA_VIOLATIONS` is what's
   left, bundled with the `cart` → `measurements` extension-point work.
5. **`lots` + `agegate` + `subscriptions`.** Three core capabilities that between
   them deliver the entire grocery vertical with no pack.
6. **`pricing` + `accounts` + `tax`.** B2B becomes possible. Highest commercial
   value of any capability group for an existing retailer.
7. **Everything else, on demand.** `quotes`/`agreements`/`receivables` when a
   tender is actually in play; `sellers`/`payouts`/`commissions` only if a
   marketplace is genuinely wanted — the `assertCanManage()` guard is ready
   ([`16-pbac-row-scoping.md`](./access-control-identity/16-pbac-row-scoping.md)), but `Product.sellerId`
   and row-filtered list endpoints remain the most expensive item here;
   `fulfilment` (routing an order to the nearest location with stock) when a
   physical second location or O2O is real — the location dimension itself
   ([`17-inventory-locations.md`](./inventory-purchasing/17-inventory-locations.md)) no longer
   blocks that, it's built and dormant behind the single `MAIN` location.

**May never be needed:** `submissions`, `storefronts`, `credentials`,
`moderation`. Real capabilities, but speculative until a stated requirement
arrives. Do not build them on the strength of this document.

## Open questions for the owner

1. **Is a second sector actually coming?** If not, B7 is not urgent and this
   taxonomy is a map rather than a plan. If yes, B7 is the first thing to fund.
2. **Is `tax` wanted now?** It is independently overdue for a Pakistani shop
   charging GST, regardless of sectors.
3. **Is a marketplace ever in scope?** B5 (permission scoping) is expensive and
   is only worth paying for C2C or B2B2C.
4. **`StitchingOrder` revenue is outside the order ledger.** Found in passing:
   `StitchingOrder` never creates an `Order`, and `Payment.orderId` is a required
   FK to `Order`, so `quotedFee` never reaches revenue. Not a taxonomy question —
   a live reporting gap, and worth its own work order.
