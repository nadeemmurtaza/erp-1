# 47 — Pre-configured category taxonomy per sector

`Category`/`CategoryTranslation` (`catalog.prisma`) already carry a full
parent/child tree with bilingual names — the schema this document needs
already exists, and correctly, per `MULTI-SECTOR.md`'s own ruling that a
sector rarely needs new tables, only different data. What does not exist
is the **onboarding shortcut**: today, a new deployment's category tree is
whatever `seed.ts`'s own hardcoded `seedCategories()` builds for the
current apparel client, or a blank tree a new client's admin builds
row-by-row. This document is the middle path — a library of starter trees,
one per vertical, an admin applies once and edits freely afterward.

**This is data, not a module.** `MULTI-SECTOR.md` already drew this exact
line for `apparel`/`grocery`/`pharmacy`: a category tree template contains
no new domain concept core cannot express, so it is not a pack, not a
schema addition, and not gated by `MODULES` — it is a seed-data offering
applied once through an admin action, exactly the way a starter chart of
accounts or a default role set is offered without being architecture.

## 1. A taxonomy preset is a named, versioned tree template

```prisma
// catalog.prisma — additive

model CategoryPreset {
  id          String @id @default(cuid())
  key         String @unique  /// "apparel", "pharmacy", "grocery", "paint-shop", "beverages"
  label       String
  /// The tree itself, as data — never compiled into application code, so
  /// adding a tenth vertical's preset is a seed-data change, not a release.
  /// { name, nameUr?, children: [...] } recursively.
  treeJson    Json
  description String?
}
```

Presets are seeded, not user-created through the admin UI — the five named
verticals (apparel, pharmacy/medicine, grocery, paint shops, beverages)
ship as `CategoryPreset` rows via the same seed-data mechanism
`seedExpenseCategories()`/`seedCategories()` already use, upserted on
`key` so re-seeding never duplicates or overwrites an already-applied,
already-edited tree.

## 2. Applying a preset is one action, and it is undoable the honest way

```ts
async applyPreset(presetKey: string): Promise<{ created: number }> {
  const preset = await this.prisma.categoryPreset.findUniqueOrThrow({ where: { key: presetKey } });
  return this.createTreeUnderRoot(preset.treeJson); // idempotent per node by slug
}
```

Applying a preset **creates** categories; it never deletes or renames an
existing one, even one with the same slug a preset would also create —
the existing row wins, and the admin screen names the collision rather
than silently overwriting a category a client may have already customised.
This is the same "additive, never destructive" discipline `MULTI-SECTOR.md`
already requires of a sector pack's own boot behaviour, applied here to a
one-time data action instead of module composition.

**Undoing a preset is deleting the categories it created, like any other
category deletion** — there is no special "un-apply" action, because a
preset's own categories are, the moment they are created, ordinary
`Category` rows with no memory of which preset made them. Inventing a
reversible-preset concept would be exactly the kind of speculative
infrastructure `CLAUDE.md` warns against for a one-time onboarding
convenience.

## Scope lenses

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — n/a: applied by an existing admin `User`
through the existing permission model, no new actor.
**Whose rows, and which columns** — n/a beyond `Category`'s own existing
visibility (public catalogue data, not scoped per branch or customer).
**The threshold nobody approves alone / The toxic pair** — n/a: creating
catalogue categories is not a money- or stock-committing act.
**Authority and blast radius** — who may apply a preset
(`catalog.categories.manage`, already exists); the worst value is applying
the wrong vertical's preset onto an established catalogue, mitigated by
§2's collision-naming behaviour rather than a confirmation dialog alone —
a dialog can be clicked through, a named list of what will and will not be
created cannot be missed.
**Audience is a capability, not an address** — n/a.
**Request or record** — applying a preset is a REQUEST: it can be refused
(unknown preset key) but never partially commits — either the whole
non-colliding subset creates, or the action fails cleanly with nothing
half-written.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved** — n/a: no stock or
money fact.
**The second legal entity** — n/a: `Category` is not scoped per legal
entity in this repository today (Br1's own "one deployment serves one
brand" already means one catalogue); a multi-brand deployment (doc 39's
platform tier) applies a preset per tenant's own isolated database,
unchanged by this document.
**Dry run before live** — the apply action's own preview ("this will
create 34 categories, skip 3 that already exist by slug") is the dry run,
computed by the identical pure diff the live action then executes — one
function, a preview caller and a commit caller.
**Three silhouettes** — Solo: applies one preset once, at setup. Chain:
the same tree shared across branches (categories are not branch-scoped).
Organization: potentially different presets per brand if brands sell
different verticals, applied independently per brand's own catalogue.
**The absent collaborator** — n/a: presets are pure seed data with no
module dependency; every deployment has `catalog` on by default.
**The second copy of the write** — re-applying the same preset twice
creates zero new categories the second time — every node's collision
check is by slug, the same idempotency `seedCategories()`'s own upsert-on-
key already relies on.
**The hundred-thousandth row** — n/a: a preset tree is at most a few
hundred nodes; this is a one-time onboarding action, never a hot path.
**The reversal document / The undo fan-out / The version stamp** — n/a
beyond §2's own stated position: a created category is an ordinary
category from the moment it exists, undone the same way any category is
ever removed.
**The erasure the ledger cannot obey** — n/a: no personal data.
**The failure path** — an apply action that fails partway (a database
error mid-tree) leaves no partial tree — the whole apply runs in one
transaction, exactly the "half-created deployment" failure shape doc 39's
provisioning already refuses to allow, applied here to a smaller action.

## Work orders

**WO-47.1 — schema**: `CategoryPreset`.
**WO-47.2 — seed data**: five starter trees — apparel, pharmacy/medicine,
grocery, paint shops, beverages — each a real, sensible starting taxonomy
for that vertical (not a placeholder single-level list), reviewed against
how each vertical's own module documents already describe its product
shape (`MULTI-SECTOR.md`'s own taxonomy table).
**WO-47.3 — `applyPreset()`** with the preview/commit pair, transactional,
collision-named rather than silently skipped or overwritten.
**WO-47.4 — UI**: a "start from a template" action on the (likely
first-run/empty) categories screen, showing the preview before commit.

## Acceptance

- Applying a preset to an empty catalogue creates its full tree in one
  transaction.
- Re-applying the same preset creates zero duplicate categories.
- Applying a preset that collides on some slugs with existing categories
  names every collision in the preview and creates only the
  non-colliding remainder, never overwriting the existing rows.
- A forced failure mid-apply leaves no partial tree.

## Out of scope

A visual drag-and-drop taxonomy editor — this document is about starting
from a sensible default, not building a general tree-editing UI (the
existing category admin screen already edits the tree node by node).
Per-region or per-language variant presets beyond the two locales this
repository already supports (`en`/`ur`) — named as a future need, not
assumed.
