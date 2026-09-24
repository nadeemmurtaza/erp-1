# 19 — Offices and departments: one org tree, not a third enum

> **Number collision:** this repository has two documents numbered 19 —
> this one and [`19-payroll.md`](./19-payroll.md). Neither is a duplicate
> or an error to merge; they predate a consistent numbering pass and were
> never renumbered. Cite this document by its full filename, never as bare
> "doc 19" — see `README.md`.

A corporate group asks for a head office, four regional offices, and departments
inside each of them — finance, HR, procurement, operations — with sub-teams
inside the larger ones. The obvious move is to add `OFFICE` and `DEPARTMENT` to
`AdminScopeLevel` (`organization.prisma:82`) and be done in an afternoon. Do not
do that. It is the decision this document exists to prevent.

## Two hierarchies that look like one

This repository already has a hierarchy: `Organization` → `RetailBrand` → `Node`
(`organization.prisma:15`, `:40`, `:142`). It is a **deployment topology**. A
`Node` is a separate running deployment with its own database (`RETAIL-ERP.md`
R2/R7), authoritative for its own facts, authenticated by
`inboundApiKeyHash`. Adding a tier to it means a migration, a replication
direction, and a credential — it is infrastructure.

An org chart is not infrastructure. It has arbitrary depth, it differs per
client, and it is re-drawn when somebody reorganises — which is a Tuesday, not a
deployment. A regional office may be its own `Node`, or four regional offices may
live inside one. A department has no deployment of its own at all.

> The deployment topology answers *where the data lives*.
> The org tree answers *who the work belongs to*.
> They are not the same question, and one table must not answer both.

Fusing them is the failure this document forbids. Put "Finance Department" into
`AdminScopeLevel` and every reorganisation becomes a schema migration, an enum
value nothing can delete because rows reference it, and a replication topology
that changes shape because somebody merged two teams.

## The design: `OrgUnit`, orthogonal to `Node`

One self-referencing tree, free to be any depth, with the type of each unit
stored as a **row and not an enum** — because "which kinds of unit exist" is a
per-client configuration and Law 1 puts configuration in data, not in code.

### Schema — a new `org-structure.prisma`

```prisma
/// What kinds of unit this client's org chart has. Rows, not an enum: one
/// client says Head Office / Region / Branch / Department, the next says
/// Division / Cluster / Store / Function. Seeded per deployment, never
/// compiled in. `isOffice` marks the types that can hold a posting address
/// and a cost centre; a department typically cannot.
model OrgUnitType {
  id             String  @id @default(cuid())
  /// Stable key for seeds and code that must name one — 'head_office',
  /// 'region', 'department'. Unique per organization, never global.
  key            String
  label          String
  /// Ordering hint for the picker only. NOT a depth constraint: the tree's
  /// shape is the tree's business, and a client will nest a department
  /// under a department the week after you forbid it.
  rank           Int     @default(0)
  isOffice       Boolean @default(false)
  organizationId String

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  units        OrgUnit[]

  @@unique([organizationId, key])
}

model OrgUnit {
  id       String  @id @default(cuid())
  /// Human key used on imports and in the URL — 'hq', 'north', 'hr'.
  code     String
  name     String
  typeId   String
  parentId String?

  /// Materialised ancestor path, root first, INCLUDING this unit's own id.
  /// Denormalised on purpose: every access check and every report filter is
  /// "this unit and everything under it", and an adjacency list alone cannot
  /// answer that without a recursive CTE per request. Maintained by
  /// `OrgUnitService.move()` and nothing else — see the single-writer rule.
  path     String[]
  /// Depth from the root, 0-based. Derived from `path.length - 1`, stored so
  /// a list screen can indent without loading ancestors.
  depth    Int     @default(0)

  /// Where this unit's data physically lives, when that is a separate
  /// deployment. NULL is the common case and means "the deployment reading
  /// this row" — a Solo shop, or a head-office department in the same
  /// database. Never assume one unit per node or one node per unit.
  nodeId   String?
  /// The brand this unit belongs to, when the group runs several. NULL means
  /// group-wide — a head office serving every brand.
  retailBrandId String?

  isActive Boolean @default(true)
  /// Closed, not deleted. An org unit is referenced by attendance rows,
  /// journal lines and completed tasks that must still explain themselves
  /// years later; deleting one rewrites history.
  closedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  type        OrgUnitType  @relation(fields: [typeId], references: [id])
  parent      OrgUnit?     @relation("OrgUnitTree", fields: [parentId], references: [id])
  children    OrgUnit[]    @relation("OrgUnitTree")
  node        Node?        @relation(fields: [nodeId], references: [id])
  retailBrand RetailBrand? @relation(fields: [retailBrandId], references: [id])

  @@unique([retailBrandId, code])
  @@index([parentId])
  @@index([path])
  @@index([nodeId])
}
```

`@@unique([retailBrandId, code])` carries the same NULL trap already documented
on `AdminScope` (`organization.prisma:106`) and `Location.code`: a NULL in any
column of a Postgres composite unique exempts the row, so two group-wide units
(`retailBrandId` null) can share a code. Unlike `AdminScope` — where a duplicate
grant confers nothing — a duplicate `code` here is read by imports and URLs, so
this one gets a real partial unique index in the migration:

```sql
CREATE UNIQUE INDEX org_unit_code_group_wide
  ON "OrgUnit" (code) WHERE "retailBrandId" IS NULL;
```

### One writer for the path

`path` and `depth` are derived. Two writers means a tree that disagrees with
itself, and the disagreement surfaces as an access-control bug — somebody sees a
region they were moved out of. Therefore: **`OrgUnitService.move()` is the only
code that writes `path`, `depth` or `parentId`**, it rewrites the whole affected
subtree in one transaction, and it refuses a move that would make a unit its own
ancestor. This is the same single-writer rule `InventoryService.move()` holds for
stock — see CLAUDE.md, "One writer per invariant."

### What this does *not* change

`AdminScopeLevel` keeps its three values. `Node` keeps its meaning. Replication
is untouched. A Solo deployment gets exactly one root `OrgUnit`, seeded, and
never sees a picker — Law 3: the product must look small to the shop that is one
shop.

## Scope lenses

*Required by CLAUDE.md "Feature scope". One line per lens, catalogue order.*

**The actor with three tables** — no new actor. `OrgUnit` is a place, not a
party; the person who works in it arrives in `20-people-positions-ranks.md`.
**The principal with no permission key** — n/a: introduces no non-`User`
principal and no new authentication path.
**The grant that ends itself** — n/a here; grants over units are
`21-access-over-the-org-tree.md`, which owns the expiry column.
**Whose rows, and which columns** — every `OrgUnit` read is filtered by the
caller's subtree via `scopeFilterFor()` (`apps/api/src/core/auth/scope.guard.ts`);
a regional manager sees their own `path` prefix and nothing above it.
**The threshold nobody approves alone** — creating or moving a unit is gated by
`org.structure.manage` (sensitivity `high`); moving a subtree that holds
employees additionally requires the second signature defined in doc 21.
**The toxic pair** — `org.structure.manage` with `org.access.grant` lets one
person invent a unit and grant themselves authority over it; refused together in
`RolesService.create`/`.update` (`roles.service.ts:60`, `:91`).
**Authority and blast radius** — a `move()` re-parents an entire subtree and
therefore silently re-scopes everyone under it; the audit row carries the old and
new `path`, not a field list.
**Request or record** — REQUEST. A unit move is a decision the system may refuse
(cycle, closed parent), never a record of something that already happened.
**The movement with no address** — n/a: writes no stock or cash.
**Four hours down** — n/a: org structure is not edited on the trading path; a
branch that cannot reach the head office keeps its cached tree read-only.
**The unwritten posting rule** — n/a: writes no journal line. The cost-centre
link a unit may carry is declared in doc 25, which does post.
**Every column or none** — n/a: writes no `JournalLine`.
**The period that already moved** — n/a: writes no dated financial fact.
**The second legal entity** — `retailBrandId` nullable is exactly the group-wide
case; a second brand needs no schema change, only rows.
**Dry run before live** — `OrgUnitService.previewMove()` returns the affected
unit ids and the resulting paths, holds no `prisma.` write and no `publish(`.
**Three silhouettes** — Solo: one seeded root, no picker. Chain: offices one
level, departments under them. Organization: full depth.
**The absent collaborator** — HR, attendance and tasks all read this tree; with
those modules off, the tree still renders and still scopes access.
**The second copy of the write** — a retried `create` is made a no-op by
`@@unique([retailBrandId, code])` plus the partial index above.
**The hundred-thousandth row** — an org tree is thousands of rows, not millions;
`@@index([path])` is a GIN index on the array, and every subtree read is one
indexed containment query, not a recursive CTE.
**The reversal document** — a unit is closed (`closedAt`), never deleted; the
reverse of a move is another move, recorded as its own audit row.
**The undo fan-out** — closing a unit that still holds active employees is
refused, not cascaded; doc 20 owns reassignment.
**The version stamp** — rows written under an old tree keep the `path` they were
written with, copied at write time, so a report of last quarter is not re-shaped
by this quarter's reorganisation.
**The erasure the ledger cannot obey** — `OrgUnit` holds no personal data; the
employee link is doc 20's to answer.
**The failure path** — a failed `move()` rolls back whole; there is no partial
subtree state to replay.

## Work orders

**WO-19.1 — `OrgUnitType` and `OrgUnit` schema.** Both models, the migration, the
partial unique index, and the seed that gives every existing deployment exactly
one root unit named from `brand.ts`. Forward-only, additive; no existing table
gains a required column.

**WO-19.2 — `OrgUnitService`.** `create`, `rename`, `close`, `move`,
`previewMove`, `subtree(unitId)`. `move()` and nothing else writes `path`/`depth`,
rewrites the subtree in one transaction, refuses cycles and closed parents.

**WO-19.3 — permissions.** `org.structure.view` (low) and `org.structure.manage`
(high) in `PERMISSION_CATALOG` (`packages/shared/src/permissions.ts`), seeded
through to a real grant in `ROLE_PERMISSION_SEED` — the `seedPermissions()` /
`seedRoles()` trap CLAUDE.md already tracks.

**WO-19.4 — admin UI.** One tree screen under a new `organization` nav group in
`nav-registry.ts`, gated by `org.structure.view`: the tree, a create/rename/move
drawer, and a closed-units disclosure. Not a page suite — one page.

## Acceptance

- Moving a subtree of 500 units rewrites every descendant `path` in one
  transaction, and a concurrent read during the move sees either the old tree or
  the new one, never a mix.
- A unit cannot become its own ancestor; the attempt is refused with a named
  error, and a spec proves it.
- A Solo deployment that never opens the screen behaves byte-identically to
  today: one seeded root, no picker, no extra query on any existing page.
- `scopeFilterFor()` over a mid-tree unit returns that unit and its descendants
  and nothing else, proven at three depths.
- Two group-wide units cannot share a `code` — the partial index rejects the
  second, and a spec proves the NULL trap is actually closed.

## Out of scope for this document

Who works in a unit (doc 20), who may see or act on one (doc 21), attendance
(22), tasks (23), notifications (24), advance salary (25), performance (26).
Cost-centre posting is named in doc 25 and defined nowhere else.

## Decision to record

This document's central choice — **the org tree is a separate structure from the
deployment topology, and `AdminScopeLevel` is not extended** — belongs in
`DECISIONS.md` before WO-19.1 is written, per `.claude/rules/decisions.md`.
