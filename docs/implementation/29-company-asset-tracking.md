# 29 — Company asset tracking and assignment

A laptop, a company phone, a POS terminal, a till float box — every one of
these is company property handed to a person, and every one of them needs an
answer to "who has this right now, and what did we hand them before that."
The trap this module exists to avoid: reusing `inventory`'s `ProductVariant`
for a laptop because "it's just a thing with a quantity." A laptop is not
sold, has no price list, is not discounted, and is tracked by serial number
one unit at a time forever — `inventory`'s whole model (stock levels, cost
rollup, reorder points) is built for the opposite case. This is a second,
smaller, deliberately separate ledger.

## 1. An asset is a serialized thing with one current holder and a full history

`CompanyAsset` is one physical item (by serial number, not a SKU with
quantity). `AssetAssignment` is history, not a current-holder column on the
asset — the same reasoning doc 20 gives for `Posting` over a
`currentPositionId` on `Employee`: "who had the laptop in March" must resolve
from history, not from whatever the row says today.

## 2. Damage, loss and write-off are asset *events*, not deletions

`AssetCondition` changes are logged as `AssetConditionEvent` rows, and a
lost or written-off asset is never deleted — it moves to a terminal
`AssetStatus` with the event that caused it attached, because "we wrote off
twelve laptops last year, here's why" is exactly the kind of finance/audit
question a deleted row cannot answer.

## Schema — new `assets.prisma`

```prisma
model AssetCategory {
  id             String @id @default(cuid())
  organizationId String
  key            String  /// "laptop", "phone", "pos-terminal", "till-float-box"
  label          String
  /// Whether losing one of these needs the finance write-off path (below)
  /// or is low-value enough that a manager can just log it.
  requiresFinanceWriteOff Boolean @default(false)

  assets CompanyAsset[]

  @@unique([organizationId, key])
}

model CompanyAsset {
  id             String  @id @default(cuid())
  organizationId String
  categoryId     String
  /// The manufacturer's serial, or an internal asset tag if none exists.
  /// This, not a generated id, is what a physical audit checks against.
  serialNumber   String
  label          String  /// "MacBook Air — Finance dept spare"
  purchaseCost   Int?    /// minor units; NULL for donated/pre-existing stock at go-live
  purchasedOn    DateTime?
  status         AssetStatus @default(AVAILABLE)
  currentLocationId String? /// A branch/Location the asset physically sits at when unassigned

  category    AssetCategory      @relation(fields: [categoryId], references: [id])
  assignments AssetAssignment[]
  conditionEvents AssetConditionEvent[]

  @@unique([organizationId, serialNumber])
  @@index([organizationId, status])
}

enum AssetStatus { AVAILABLE ASSIGNED IN_REPAIR LOST WRITTEN_OFF RETIRED }

/// History. Exactly one open row (endedOn NULL) per asset at a time —
/// enforced the same way doc 20 enforces one primary Posting.
model AssetAssignment {
  id         String   @id @default(cuid())
  assetId    String
  employeeId String
  assignedByUserId String
  startedOn  DateTime @default(now())
  endedOn    DateTime?
  returnCondition AssetCondition?
  note       String?

  asset    CompanyAsset @relation(fields: [assetId], references: [id])
  employee Employee     @relation(fields: [employeeId], references: [id])

  @@index([assetId, endedOn])
  @@index([employeeId, endedOn])
}

enum AssetCondition { GOOD MINOR_DAMAGE MAJOR_DAMAGE LOST }

model AssetConditionEvent {
  id         String   @id @default(cuid())
  assetId    String
  condition  AssetCondition
  reportedByUserId String
  note       String
  occurredAt DateTime @default(now())
  /// Set once finance has posted the write-off (doc 25's advance/posting
  /// pattern) — n/a until requiresFinanceWriteOff triggers it.
  financeReferenceId String?

  asset CompanyAsset @relation(fields: [assetId], references: [id])

  @@index([assetId, occurredAt])
}
```

`@@unique([organizationId, serialNumber])` is the real-world constraint: two
assets cannot share a serial in one organization, but two group companies
legitimately can both have bought the identical hardware model with a
manufacturer-reused serial range — organization-scoped, not global, the same
reasoning `Employee.employeeCode` uses in doc 20.

## Scope lenses

**The actor with three tables** — n/a: assigns to `Employee` from doc 20, no
new actor.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a: holding an asset confers no system
access; returning it ends the assignment, not a permission.
**Whose rows, and which columns** — an asset list is filtered to the
caller's subtree by the holding employee's org unit; `purchaseCost` is
visible only to `assets.manage`, never to the employee viewing their own
assigned items.
**The threshold nobody approves alone** — assigning an asset above a
configured value threshold (a policy setting, mirroring `finance`'s own
approval-threshold pattern) needs a second approver; the same threshold,
doubled, governs a `WRITTEN_OFF` status change, since write-off is the undo
of a purchase that already committed money.
**The toxic pair** — `assets.assign` with `assets.write_off`: the person who
issued an asset marking it lost/written-off unobserved is refused together
where `AssetCategory.requiresFinanceWriteOff` is true — a low-value category
(a keyboard) does not need this guard, a laptop does, which is exactly why
the flag lives on the category, not hardcoded to "all assets."
**Authority and blast radius** — who may create an `AssetCategory` (finance/
IT admin, org-wide) versus who may assign an existing asset (a branch
manager, their own subtree); the worst value is writing off a high-value
asset without the second approval, which the guard above refuses at the
service layer, not just hidden in the UI.
**Audience is a capability, not an address** — an asset approaching a policy-
defined age (out-of-warranty, say) notifies whoever holds `assets.manage` for
that branch, resolved by permission and scope, never a stored IT-team email.
**Request or record** — assignment is a REQUEST (an already-assigned asset
cannot be assigned again — refused until returned); a condition report is a
RECORD — the fact that an employee reported damage is never refused, even if
the asset is mid-transfer or the branch is offline; it queues the same way
doc 22's punch does, and is reconciled by `assets.manage`, not silently
dropped.
**The movement with no address** — every assignment and every unassigned
asset names a `Location`/branch; there is no "the branch it's probably at" —
an asset transferred between branches is a new `AssetAssignment` (or a
location change while unassigned) with the moving branch named, never
implicit.
**Four hours down, the counter stays open** — a branch offline still logs
condition events and assignments locally (same offline-outbox pattern POS
uses) and syncs on reconnect; a paper log is the fallback of last resort,
ingested through a named IMPORT-style source, same shape as doc 22's paper
sign-in.
**Click the number** — an "assets by category" or "overdue returns" tile
links to the exact `CompanyAsset`/`AssetAssignment` rows behind it.
**The unwritten posting rule** — `AssetConditionEvent.financeReferenceId`
names the seam: a `WRITTEN_OFF` transition on a
`requiresFinanceWriteOff` category raises a `CompanyAssetWrittenOff` domain
event; `accounting`'s posting-rules subscriber (the same extension point
`payroll` posts through) writes the Dr/Cr entry and stamps this field back —
this module never writes a `JournalLine` itself, preserving module
independence exactly as `payroll`'s posting subscriber does today.
**Every column or none** — the resulting `JournalLine` sets
`branchNodeId`/`costCentreId` from the asset's `currentLocationId` at
write-off time; `organizationId`/`retailBrandId` from the asset's own
scoping — every column the accounting module's chart requires, none left
blank by default.
**The period that already moved** — a write-off event dated inside a
`CLOSED` `FiscalPeriod` still records (it is evidence a loss happened) and
the posting resolves to the current open period, exactly as doc 22 states
for a late attendance punch against a closed payroll period.
**The second legal entity** — `AssetCategory`/`CompanyAsset` scoped per
`organizationId`; a second legal entity's fleet is its own rows, never
blended into one count.
**Dry run before live** — `canAssign(asset, employee)` and
`canWriteOff(asset)` are pure and are what the UI calls to disable the
button — the same shape as doc 23's `canTransition`.
**Three silhouettes** — Solo: a handful of assets, one implicit approver,
no threshold escalation in practice (the rule still exists, just never
triggers). Chain: assets per branch, branch managers assign within their
own stock. Organization: fleet-wide reporting, cross-brand transfers named
and logged as location changes.
**The absent collaborator** — with `accounting` off, a write-off still
changes `AssetStatus` and logs the event; `financeReferenceId` simply stays
NULL forever, exactly as `payroll`'s GL posting degrades when `accounting`
is absent.
**The second copy of the write** — `@@unique([organizationId, serialNumber])`
prevents the same physical item from being registered twice; the one-open-
assignment-per-asset invariant is enforced at `assign()` (predicate-on-write,
House Rule 10), not by a database constraint alone, since "one open row"
needs a conditional check a plain unique index cannot express.
**The hundred-thousandth row** — assignment history grows with fleet size ×
employee turnover over years; bounded by `[assetId, endedOn]` and
`[employeeId, endedOn]`, and a retired asset's history is never purged,
mirroring doc 20's "kept, never deleted" for `Posting`.
**The reversal document** — a wrongly-logged write-off is corrected by a
reversing `AssetConditionEvent` (`GOOD`, with a note explaining the
correction) plus, if it posted, the accounting module's own
`findPostedEntry`/reversal path — the original event and its posting are
never edited or deleted.
**The undo fan-out** — returning a `LOST` asset that later turns up
transitions it back to `AVAILABLE` (automatic) but does **not** automatically
reverse a posted write-off (needs a human holding `accounting`'s reversal
permission, since money already moved) — the fan-out is named so nobody
assumes finding the laptop un-does the ledger entry by itself.
**The version stamp** — an `AssetAssignment`'s `returnCondition` is fixed at
the moment of return and never recomputed if the category's write-off policy
changes later.
**The erasure the ledger cannot obey** — `AssetAssignment.employeeId` and
`AssetConditionEvent.reportedByUserId` survive an employee's erasure under
the audit/financial-record basis (an asset's chain of custody is exactly the
kind of record a later loss investigation needs); pseudonymised, not deleted.
**The failure path** — a domain-event delivery failure on write-off
(`accounting` module down or the outbox not yet drained) leaves
`financeReferenceId` NULL with the event still queued in the existing
outbox; the asset's own screen shows "posting pending," never silently
implies the loss went unrecorded financially.

## Work orders

**WO-29.1 — schema**: `AssetCategory`, `CompanyAsset`, `AssetAssignment`,
`AssetConditionEvent`.
**WO-29.2 — `AssetService`**: register, assign/return (one-open-assignment
guard), condition report, `canAssign`/`canWriteOff` pure.
**WO-29.3 — write-off posting**: `CompanyAssetWrittenOff` domain event +
`accounting` posting-rules subscriber entry, following `payroll`'s existing
pattern exactly (event in, `findPostedEntry(source, sourceRef)` idempotency,
`accounting` optional).
**WO-29.4 — permissions**: `assets.view` (subtree), `assets.assign`,
`assets.write_off` (with the value-threshold second approval), `assets.admin`
(categories).
**WO-29.5 — UI**: asset register, assign/return flow, employee's own
assigned-items screen, condition report + write-off flow with the finance
posting status visible. Nav entry under People/HR or Operations.

## Acceptance

- An asset cannot have two open assignments at once, proven under a
  concurrent-assignment race the same way `InventoryService.move()` is
  tested.
- Assigning above the value threshold without a second approver is refused.
- The same person cannot both issue and write off a
  `requiresFinanceWriteOff` asset.
- A write-off raises exactly one GL entry even if the domain event is
  redelivered twice.
- With `accounting` off, write-off still changes asset status and the pack-
  absence boot test still passes.

## Out of scope

Depreciation schedules and fixed-asset accounting beyond the single write-off
posting (a full depreciation ledger is a `finance`/`accounting` extension
with its own scope lenses — named, deferred, not stubbed), barcode/RFID
physical-audit scanning (the register supports a manual "confirm present"
sweep today; a scanner-driven audit workflow is a future work order once a
client actually asks for one, following doc 31's hardware-integration
pattern rather than inventing a second one here).
