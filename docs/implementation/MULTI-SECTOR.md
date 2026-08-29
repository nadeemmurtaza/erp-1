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

**`bom` is classified `core`, not `apparel`.** `README.md` currently lists it
under the apparel pack. That is wrong: a bakery, a pharmacy compounding lab and a
furniture workshop all turn raw materials into finished goods. Raw-material →
recipe → production run is universal manufacturing, and Phase 10 builds it as a
general module. Reclassify it when you next touch that README table.

## The rule that makes this safe

**A `core` module may never import a pack module. A pack module may never import
another pack's module. Cross-pack communication is domain events only, in one
direction: packs subscribe to core, never the reverse.**

This is the whole architecture. If `inventory` (core) ever imports
`stitching.service` (apparel), then a grocery deployment that switches
`stitching` off has a broken `inventory`, and the pack model is finished.

### This is not currently enforced — fix it first

`scripts/check-module-boundaries.mjs` enforces import **depth**: a module may only
reach another module's `<name>.module` or a top-level `<name>.service`, never a
deep file. It does **not** enforce **direction**, because it has no idea which
modules are core and which are apparel.

So today this passes lint:

```ts
// apps/api/src/modules/inventory/inventory.service.ts   (core)
import { StitchingService } from '../stitching/stitching.service';   // apparel — WRONG, but green
```

`README.md` claims `pnpm lint` enforces the import direction. Until the work
below lands, that claim is aspirational. **Treat closing this gap as the first
work order of any multi-sector effort** — it is roughly twenty lines, and every
day it is missing is a day a violation can land unnoticed.

**The fix.** Give the modules a declared pack, next to the registry that already
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
  catalog: 'core',   cart: 'core',      orders: 'core',     payments: 'core',
  inventory: 'core', purchasing: 'core', crm: 'core',       analytics: 'core',
  reports: 'core',   tracking: 'core',  settings: 'core',   users: 'core',
  addresses: 'core', finance: 'core',   bom: 'core',
  measurements: 'apparel', stitching: 'apparel',
};
```

Then extend the checker with one predicate:

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
| What are branches for? | Work in progress, and releases. Time, not shape. |
| Branch name? | `<pack>/<type>/<slug>` |
