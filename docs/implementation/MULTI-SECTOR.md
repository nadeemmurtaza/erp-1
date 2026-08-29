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

Turning it on surfaced **one real violation, which is still outstanding**:

> **`cart` → `measurements`.** `CartItem` carries `measurementProfileId` and
> `measurementValues`, and `cart.service.ts` calls `MeasurementsService.validate()`
> when a line is added. Core cart knows what a garment is, so a grocery
> deployment with `measurements` switched off would not boot.
>
> The fix is an extension point rather than a smaller import: a cart line should
> carry opaque per-line configuration, validated by a validator the pack owning
> that product kind registers, so `cart` never names a garment concept. That is
> its own work order and **must land before a second sector ships.**

It is listed in `KNOWN_VIOLATIONS` in the checker — a burn-down list, not a
configuration knob. An entry that stops firing is reported as stale and fails the
build, so the list can only shrink. Adding to it needs a reason a reviewer
accepts; "the check was in my way" is not one.

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
branch; **never push to or merge into `main` or `production`.**

### Branches that ARE about time, and are fine

Release branches encode a point in time, which is exactly what a branch is for:

```
release/2026-09          cut from main, hotfixed, merged back
```

That is legitimate. `master_grocery` is not, because it encodes a shape.

## Deployment model

| Branch | Deploys to | `MODULES` |
|---|---|---|
| `main` | `test.yaseen.pk` | whatever staging is testing |
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
| What decides what a shop runs? | `MODULES` env + the `Setting` table. |
| One database or many? | **One per shop**, holding every pack's tables. Cross-pack foreign keys rule out a database per pack. |
| Does a grocery shop get apparel tables? | Yes, empty. The schema is the union; the runtime is the subset. |
| How does the API drop a disabled module? | `modules.registry.ts` never composes it — its routes 404 and its controllers never instantiate. |
| What are branches for? | Work in progress, and releases. Time, not shape. |
| Branch name? | `<pack>/<type>/<slug>` |
