# 79 — Employee assets: a genuine gap the HR nav list surfaced

Doc 78's own tab-by-tab check found no `Asset`, `EmployeeAsset`, or
equipment-issuance model anywhere in this repository. Nothing today
answers "which laptop, phone, or uniform did we hand to which employee,
and did they return it when they left." This is a real, previously-
unaddressed gap, narrow enough to scope directly.

## 1. An asset is a trackable item; an assignment is who has it and since when

```prisma
model Asset {
  id             String   @id @default(cuid())
  organizationId String
  assetTag       String   // the physical tag/serial a staff member reads off the item
  category       String   // "laptop", "phone", "uniform", "vehicle" — free text/data-driven,
                           // never a closed enum, the same reasoning TicketCategory (doc 64) rests on
  description    String
  purchaseCost   Int?     // paisa; optional — not every asset has a tracked purchase cost
  purchasedOn    DateTime?
  status         AssetStatus @default(AVAILABLE) // AVAILABLE | ASSIGNED | RETIRED | LOST
  createdAt      DateTime @default(now())

  assignments AssetAssignment[]

  @@unique([organizationId, assetTag])
  @@index([organizationId, status])
}

/// One row per issue/return cycle — an asset's full custody history, never
/// overwritten. The same "history table, not a mutable current-holder
/// column" discipline StockMovement already establishes for stock.
model AssetAssignment {
  id           String    @id @default(cuid())
  assetId      String
  employeeId   String
  issuedAt     DateTime  @default(now())
  issuedById   String    // who handed it over — doc 20's own actor
  returnedAt   DateTime?
  returnedById String?
  condition    String?   // free-text note at return ("scratched screen"), never a required field

  asset    Asset    @relation(fields: [assetId], references: [id])
  employee Employee @relation(fields: [employeeId], references: [id])

  @@index([assetId])
  @@index([employeeId, returnedAt])
}

enum AssetStatus { AVAILABLE  ASSIGNED  RETIRED  LOST }
```

`AssetAssignment.returnedAt IS NULL` is the one query answering "who
currently has this" — never a separate `currentHolderId` column on `Asset`
that could drift from the assignment history, the same
single-source-of-truth discipline `Lot`/`LotStock` (doc 32) already
applies to batch quantity.

## 2. An employee's exit is the one write path that must never be optional

```ts
// hr-offboarding — the existing (or, if not yet built, this document's
// own minimal) offboarding checklist gains one item: every AssetAssignment
// with returnedAt IS NULL for this employee must be resolved (returned or
// explicitly marked LOST) before offboarding can complete — surfaced
// through doc 44's own action hub as a blocking item, never silently
// skippable.
async unreturnedAssetsFor(employeeId: string): Promise<AssetAssignment[]> {
  // one indexed query — [employeeId, returnedAt] — the check every
  // offboarding flow calls before letting an exit complete.
}
```

## Scope lenses

**The actor with three tables** — `Asset`/`AssetAssignment.employeeId`
reuse doc 20's existing `Employee`; no new actor kind.
**The principal with no permission key** — n/a: every issuer/returner is
an authenticated `User` acting under `hr.assets.manage`.
**The grant that ends itself** — n/a: assets are not a permission grant;
an employee's own custody of an asset ends via `returnedAt`, not a
permission expiry.
**Whose rows, and which columns** — scoped to `organizationId`; a manager
sees only their own subtree's assigned assets, per the standing org-tree
visibility rule.
**The threshold nobody approves alone** — a `LOST` status carries a real
cost; writing off an asset above a configurable value threshold requires
`hr.assets.writeoff` distinct from `hr.assets.manage` (issue/return),
mirroring the amount-band-and-role pattern this repository's own money-
adjacent lenses already require elsewhere.
**The toxic pair** — n/a: no permission pair is toxic together for asset
custody.
**Authority and blast radius** — who may mark an asset `RETIRED`/`LOST` is
`hr.assets.writeoff`; the audit row is `AuditService`'s own state-change
log, old status → new status.
**Audience is a capability, not an address** — n/a: no notification of
its own beyond the offboarding-blocker surfaced through doc 44's existing
audience resolution.
**Request or record** — issuing/returning an asset is a REQUEST (can be
refused — an already-`ASSIGNED` asset cannot be issued again until
returned); once recorded, an `AssetAssignment` row is a RECORD of the
physical handover, never edited after the fact (a correction is a new
row, e.g., an immediate re-issue after a data-entry mistake).
**The movement with no address** — n/a: an asset is not a stock-ledger
item; its "location" is whichever employee currently holds it, recorded
by `employeeId`, not a `Location` row.
**Four hours down** — n/a: asset issuance is not a continuous-operations
process; a paper log during an outage is reconciled the same way any
manual fallback in this repository already is, by a subsequent
`AssetAssignment` entry once systems return.
**Click the number** — an asset's detail screen shows its full
`AssetAssignment` history, chronological, never a bare "currently
assigned" label with no drill-down.
**The unwritten posting rule** — `Asset.purchaseCost`, if tracked, does
not itself post to the GL by this document's own action; where a client
wants asset depreciation posted, that is `finance`'s own separately-scoped
fixed-asset capability, not invented here.
**Every column or none / The period that already moved / The second
legal entity** — n/a: this document introduces no GL posting.
**Dry run before live** — n/a: no computed rule to preview.
**Three silhouettes** — Solo: a handful of laptops and uniforms, tracked
almost as a courtesy. Chain: real equipment fleets across branches, where
`unreturnedAssetsFor()`'s offboarding gate first matters. Organization:
cross-brand asset pools, `organizationId`-scoped exactly as everything
else.
**The absent collaborator** — with `hr` off, no assets exist to track;
this module has no dependency on any other optional module.
**The second copy of the write** — `Asset.status = ASSIGNED` combined
with the unique nature of "no two open `AssetAssignment` rows for the same
asset" (enforced by checking `returnedAt IS NULL` before issuing) prevents
double-issuing the same physical item to two people at once.
**The hundred-thousandth row** — `AssetAssignment` indexed by both
`assetId` and `[employeeId, returnedAt]`; growth is bounded by asset count
× average reissue frequency, never unbounded.
**The reversal document** — a mistaken issue is corrected by an immediate
return + re-issue (two new rows), never an edit or delete of the mistaken
row — the same "a record is never erased, only superseded" discipline
this repository applies elsewhere.
**The undo fan-out** — marking an asset `LOST` does not automatically
create a `finance` write-off expense; that is a documented manual step
(create the corresponding `Expense` row) unless a real requirement for
automatic linkage emerges later.
**The version stamp** — n/a: an asset's own category/description can be
edited going forward; past `AssetAssignment` rows are untouched by a later
edit.
**The erasure the ledger cannot obey** — `AssetAssignment.employeeId`
holds a person; on user deletion, follows doc 20's own stated basis
(pseudonymise while retaining the custody record, since "who had this
laptop in 2026" is itself a legitimate audit fact).
**The failure path** — an issue/return call failing mid-write (e.g., a
concurrent double-issue attempt) is rejected by the "no two open
assignments" check above, never silently overwritten.

## Work orders

**WO-79.1 — schema**: `Asset`, `AssetAssignment`, `AssetStatus`,
forward-only migration.
**WO-79.2 — `AssetsService`**: `issue()`, `returnAsset()`, `writeOff()`,
`unreturnedAssetsFor(employeeId)`.
**WO-79.3 — permissions**: `hr.assets.manage`, `hr.assets.writeoff`,
seeded to real roles.
**WO-79.4 — offboarding gate**: wire `unreturnedAssetsFor()` into the
existing (or minimal, if none yet built) offboarding checklist as a
blocking item, surfaced through doc 44's action hub.
**WO-79.5 — UI**: an asset list/detail screen (`/admin/hr/assets`, per
doc 78's nav entry), issue/return forms, an employee's own asset-custody
history on their profile.

## Acceptance

- An already-`ASSIGNED` asset cannot be issued again until returned,
  proven by a spec.
- Offboarding an employee with an unreturned asset is blocked until it is
  returned or written off, proven by a spec.
- An asset's detail screen shows its complete assignment history in
  chronological order.

## Out of scope

Automatic depreciation/GL posting for asset value — a real, separately-
scoped fixed-asset accounting capability if ever requested; this document
tracks physical custody only, never books a depreciation entry.
